# Spec: Custom Split Bill (Pago Personalizado por Ítems)

**Date:** 2026-06-12
**Status:** Approved
**Branch:** feature/custom-split-bill

---

## Overview

Extends the existing "dividir cuenta" (split bill) feature for mesa sessions with a second mode: **pago personalizado**. Instead of splitting the total equally among N people, each person selects the specific items (and units) they want to pay for, one turn at a time. Any remaining items can be switched to equal-split at any point between turns.

---

## Goals

- Allow each diner to pay only what they ordered
- Prevent concurrent conflicts via atomic DB locking (one turn at a time)
- Survive Redsys payment redirects without losing state
- Give the waiter a real-time view of paid vs pending items
- Support both Redsys (card) and manual (cash) payment methods

---

## Non-Goals

- Real-time collaborative simultaneous selection (by design: sequential turns)
- Fractional item splitting (e.g. sharing one dish cost between two people)
- Partial payment of a single unit (each unit is atomic)

---

## Data Model

### New table: `mesa_pagos_personalizados`

Each row represents one custom payment turn.

```sql
CREATE TABLE public.mesa_pagos_personalizados (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id           UUID NOT NULL REFERENCES public.mesa_sesiones(id) ON DELETE CASCADE,
  empresa_id          UUID NOT NULL,
  seleccion           JSONB NOT NULL DEFAULT '[]',
  -- [{pedido_id: UUID, item_idx: int, unidades: int}]
  importe_cents       INTEGER NULL,
  payment_order_ref   TEXT NULL,
  status              TEXT NOT NULL DEFAULT 'en_seleccion',
  -- 'en_seleccion' | 'en_pago' | 'pagado' | 'cancelado'
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT now() + interval '10 minutes',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Status lifecycle:**
```
en_seleccion -> en_pago -> pagado
                        -> cancelado
(also: en_seleccion -> cancelado on timeout or user cancel)
```

Only `en_seleccion` status acts as a lock. `en_pago` does NOT block other turns — the webhook resolves it independently.

### New table: `mesa_item_pagos`

Accumulated paid item units — source of truth for "what's left to pay".

```sql
CREATE TABLE public.mesa_item_pagos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id             UUID NOT NULL REFERENCES public.mesa_sesiones(id) ON DELETE CASCADE,
  empresa_id            UUID NOT NULL,
  pedido_id             UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  item_idx              INTEGER NOT NULL,
  unidades_pagadas      INTEGER NOT NULL,
  importe_pagado_cents  INTEGER NOT NULL,
  turno_id              UUID NOT NULL REFERENCES public.mesa_pagos_personalizados(id)
);
```

### Changes to `mesa_sesiones`

```sql
ALTER TABLE public.mesa_sesiones
  ADD COLUMN IF NOT EXISTS division_tipo TEXT NULL,
  -- NULL | 'igual' | 'personalizado'
  ADD COLUMN IF NOT EXISTS custom_turno_id UUID NULL
    REFERENCES public.mesa_pagos_personalizados(id);
```

`custom_turno_id IS NOT NULL` + turno `en_seleccion` = lock held.
`custom_turno_id IS NULL` = between turns (free to claim).

---

## Atomic RPC Functions

All state mutations go through a single PostgreSQL function. No read-then-write at the application level.

### `claim_custom_turn(p_sesion_id, p_empresa_id)`

```
FOR UPDATE on mesa_sesiones
IF custom_turno_id IS NOT NULL AND turno.expires_at > now() -> RETURN (false, NULL)
IF expired turno exists -> cancel it first (status='cancelado', custom_turno_id=NULL), then claim
INSERT mesa_pagos_personalizados (status='en_seleccion', expires_at = now()+10min)
UPDATE mesa_sesiones SET custom_turno_id = new_id, division_tipo = 'personalizado'
RETURN (true, turno_id)
```

### `update_custom_selection(p_turno_id, p_seleccion JSONB, p_importe_cents INT)`

```
IF turno.status != 'en_seleccion' -> RETURN error
Validate each item: unidades <= (total_in_pedido - already paid in mesa_item_pagos)
UPDATE mesa_pagos_personalizados SET seleccion, importe_cents, updated_at,
  expires_at = now()+10min  -- refresh lock TTL on each save
RETURN success
```

### `commit_custom_payment(p_turno_id, p_payment_order_ref, p_importe_cents)`

```
FOR UPDATE on mesa_pagos_personalizados
IF status != 'en_seleccion' -> RETURN error
UPDATE status = 'en_pago', payment_order_ref, importe_cents
INSERT INTO mesa_item_pagos for each item in seleccion
-- custom_turno_id stays set; en_pago is non-blocking for claim_custom_turn
RETURN success
```

### `complete_custom_payment(p_turno_id)`

```
UPDATE mesa_pagos_personalizados SET status = 'pagado'
UPDATE mesa_sesiones SET custom_turno_id = NULL
Check if SUM(unidades_pagadas) covers all items across all pedidos of this sesion
IF all paid -> UPDATE mesa_sesiones SET sesion_pagada = true
RETURN (sesion_completa BOOL)
```

### `cancel_custom_turn(p_turno_id)`

```
FOR UPDATE on mesa_pagos_personalizados
IF status = 'en_pago' -> RETURN error (cannot cancel mid-payment)
DELETE FROM mesa_item_pagos WHERE turno_id = p_turno_id  -- undo any inserts
UPDATE status = 'cancelado'
UPDATE mesa_sesiones SET custom_turno_id = NULL
RETURN success
```

### `switch_to_equal_split_remaining(p_sesion_id, p_num_personas INT)`

```
FOR UPDATE on mesa_sesiones
IF custom_turno_id IS NOT NULL AND turno.status = 'en_seleccion' -> RETURN (false)
remaining_cents = total_sesion_cents - SUM(importe_pagado_cents) FROM mesa_item_pagos
importe_por_persona = ROUND(remaining_cents / p_num_personas)
UPDATE mesa_sesiones SET
  division_tipo = 'igual',
  division_personas = p_num_personas,
  custom_turno_id = NULL
RETURN (true, importe_por_persona)
```

---

## API Routes

All routes under `/api/mesas/[mesaId]/`:

| Method | Path | Use Case |
|--------|------|----------|
| `POST` | `custom-turn` | `initiateCustomTurnUseCase` — returns `turno_id` or 409 |
| `PATCH` | `custom-turn/[turnoId]/selection` | `updateCustomSelectionUseCase` |
| `POST` | `custom-turn/[turnoId]/commit` | `commitCustomPaymentUseCase` |
| `POST` | `custom-turn/[turnoId]/complete` | `completeCustomPaymentUseCase` |
| `DELETE` | `custom-turn/[turnoId]` | `cancelCustomTurnUseCase` |
| `POST` | `equal-split-remaining` | `switchToEqualSplitRemainingUseCase` |

### Extended session payload

```ts
interface MesaSessionData {
  // ... existing fields ...
  divisionTipo: 'igual' | 'personalizado' | null;
  customTurno: {
    id: string;
    status: 'en_seleccion' | 'en_pago' | 'pagado' | 'cancelado';
    importeCents: number | null;
  } | null;
  itemsPagados: {
    pedido_id: string;
    item_idx: number;
    unidades_pagadas: number;
    importe_pagado_cents: number;
  }[];
}
```

---

## Components

### `DivisionTypeModal` (new)

First screen after clicking "Dividir cuenta". Replaces the direct open of `DivisionModal`.

```
+----------------------------------+
|  Como quereis dividir?           |
|                                  |
|  [ Dividir el total            ] | -> opens existing DivisionModal
|  [ Elegis el numero de personas] |
|                                  |
|  [ Personalizar el pago        ] | -> POST /custom-turn
|  [ Cada uno elige lo suyo      ] |
+----------------------------------+
```

### `CustomSelectionView` (new)

Full-screen view when the user holds the lock.

- Paid items (from `itemsPagados`): greyed out, labelled "Pagado", stepper disabled
- Available items: stepper `[-] n [+]`, max = unidades_totales - unidades_pagadas
- Running subtotal in footer
- PATCH to `/selection` debounced 500ms after each stepper change
- `turnoId` saved to `sessionStorage` key `mesa-custom-turno-{mesaId}` before Redsys redirect
- "Pagar X€" button: disabled if nothing selected; triggers POST `/commit`
- "Cancelar mi turno": triggers DELETE `/custom-turn/[id]`

### `CustomItemRow` (new)

Single item row inside `CustomSelectionView`.

Props: `nombre`, `precio`, `totalUnidades`, `unidadesPagadas`, `unidadesSeleccionadas`, `onChangeUnidades`.

### `CustomWaitingView` (new)

Shown to all other clients when `customTurno?.status === 'en_seleccion'`.

```
  Alguien esta eligiendo sus items.
  Espera un momento...
```

Realtime subscription on `mesa_sesiones` — when `custom_turno_id` becomes `NULL`,
auto-transitions to `RemainingItemsActions`.

### `RemainingItemsActions` (new)

Shown after a turn completes, or on initial load when `divisionTipo === 'personalizado'`
and no active turn.

```
+----------------------------------+
|  Quedan 34,00 EUR por pagar      |
|  [list of unpaid items]          |
|                                  |
|  [ Es mi turno - elegir items ]  | -> POST /custom-turn
|                                  |
|  [ Dividir lo que queda        ] | -> input num personas
|    entre N personas (X EUR c/u)  | -> POST /equal-split-remaining
+----------------------------------+
```

---

## Waiter View Extension

The waiter mesa detail panel shows a per-item breakdown when `divisionTipo = 'personalizado'`:

```
Mesa 4  -  Pago personalizado en curso
------------------------------------------
  [v] 2x Paella           12,00 EUR  pagado
  [v] 1x Vino tinto        6,00 EUR  pagado
  [ ] 1x Tiramisu          4,50 EUR  pendiente
  [ ] 2x Cafe              3,00 EUR  pendiente
------------------------------------------
  Pagado: 18,00 EUR  -  Pendiente: 7,50 EUR
```

Realtime: existing `mesa_sesiones` subscription + new subscription to `mesa_item_pagos`
for this `sesion_id`.

---

## Edge Cases

| Scenario | Resolution |
|----------|------------|
| User closes browser mid-selection | `expires_at` TTL (10 min). `claim_custom_turn` cancels expired turns atomically before claiming |
| Redsys redirect — user doesn't return | Webhook calls `complete_custom_payment` independently. `en_pago` is non-blocking |
| Webhook fails | Turno stays `en_pago`. Waiter force-completes from admin panel |
| Double-tap on "Personalizar" | Button disabled client-side on first 200; `FOR UPDATE` handles race at DB level |
| Selected units > available units | `update_custom_selection` validates and returns `ITEM_UNAVAILABLE`; client refreshes |
| `switch_to_equal_split` while turn active | RPC returns `TURN_ACTIVE` (409); client shows "Espera que termine el turno actual" |
| Waiter closes session mid-turn (en_seleccion) | Session close calls `cancel_custom_turn` first; if `en_pago`, blocked until webhook resolves |
| Rounding remainder | Last `complete_custom_payment` uses `total_sesion - SUM(ya_pagado)` as final amount |

---

## i18n Keys (new)

```
mesaDivisionTypeTitle        "Como quereis dividir?"
mesaDivisionTypeEqual        "Dividir el total"
mesaDivisionTypeEqualDesc    "Elegis el numero de personas"
mesaDivisionTypeCustom       "Personalizar el pago"
mesaDivisionTypeCustomDesc   "Cada uno elige lo suyo"
mesaCustomWaiting            "Alguien esta eligiendo sus items. Espera un momento."
mesaCustomSelectTitle        "Selecciona lo que vas a pagar"
mesaCustomItemPaid           "Pagado"
mesaCustomSubtotal           "Mi parte"
mesaCustomPay                "Pagar {amount}"
mesaCustomCancel             "Cancelar mi turno"
mesaRemainingAmount          "Quedan {amount} por pagar"
mesaRemainingMyTurn          "Es mi turno - elegir items"
mesaRemainingEqualSplit      "Dividir lo que queda"
mesaCustomTurnExpired        "Tu turno expiro. Podes volver a empezar."
```

---

## Implementation Order

1. DB migrations — `mesa_pagos_personalizados`, `mesa_item_pagos`, alter `mesa_sesiones`
2. RPC functions — all 6 atomic functions
3. Use Cases + API Routes — one per RPC
4. Session endpoint extension — add `divisionTipo`, `customTurno`, `itemsPagados`
5. `DivisionTypeModal` — entry point
6. `CustomSelectionView` + `CustomItemRow` — the picker
7. `CustomWaitingView` — lock state for others
8. `RemainingItemsActions` — post-turn choices
9. Waiter view extension — paid/pending breakdown
10. Realtime subscriptions — extend `mesa_sesiones` sub + add `mesa_item_pagos`
11. i18n — all 5 language files
