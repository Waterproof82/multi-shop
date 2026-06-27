# Design: Waiter Validation + Unified Retenidos

**Date:** 2026-06-17
**Status:** Approved
**Scope:** Two sequential PRs — PR 1 unifies the retenido system, PR 2 adds the waiter validation feature on top.

---

## Context

Currently, "retenido" items exist in two separate forms:

- **Retenido pedidos** — a kitchen order item with `pedido_item_estados.estado = 'retenido'`, released via PATCH back to `pendiente`.
- **Retenido carrito** — a cart item saved to `mesa_sesiones.items_diferidos` (JSONB), released individually via `POST release-deferred-item` which creates a new pedido.

These two systems have different storage, different release mechanics, and different UI affordances (separate colors and buttons in kitchen). PR 1 eliminates the distinction. PR 2 then introduces a waiter validation gate for customer-placed QR orders.

---

## PR 1 — Unify Retenidos

### Goal

One retenido concept, one storage location (`pedido_item_estados`), one UI affordance (single amber color, single release button).

### Database

**Migration:** Remove `items_diferidos` column from `mesa_sesiones`.

```sql
ALTER TABLE mesa_sesiones DROP COLUMN IF EXISTS items_diferidos;
```

### Behavior change: waiter cart confirm

When the waiter marks items as "Añadir como retenido" in `QuantitySelectorDialog`, those items no longer persist to `items_diferidos`. Instead, on cart confirm:

- Items with `deferred = false` → `POST /api/pedidos` with `estado: 'pendiente'` (unchanged)
- Items with `deferred = true` → `POST /api/pedidos` with `estado: 'retenido'` (new)

The `deferred` flag on `CartItem` remains as a pure UI flag (drives the checkbox state). The difference is what happens at submit time.

### API removed

| Method | Route | Reason |
|--------|-------|--------|
| `GET` | `/api/waiter/mesas/{mesaId}/deferred` | No more items_diferidos |
| `PUT` | `/api/waiter/mesas/{mesaId}/deferred` | No more items_diferidos |
| `POST` | `/api/waiter/kitchen/mesas/{mesaId}/release-deferred-item` | Replaced by existing PATCH to pendiente |

### `POST /api/pedidos` — new `estado: 'retenido'` support

The pedidos endpoint must accept `estado: 'retenido'` as a valid initial state when called from waiter context (waiter JWT). It should reject `estado: 'retenido'` from anonymous/customer requests.

### Domain layer changes

**`IPedidoRepository`:**
- Remove `isDiferido?: boolean` from `KitchenItemRecord`
- Remove `sesionItemIdx?: number` from `KitchenItemRecord`
- Remove `sesionItemIdx: number` from `RetenidoItem`

**`SupabasePedidoRepository`:**
- Remove deferred-items fetching from `findKitchenItems` and `findRetenidoItems`
- Remove the `deferred.entries()` loop and `sesionItemIdx` tracking

### Cart / context changes

**`cart-context.tsx`:**
- Remove `loadDeferredItems` and `syncDeferredItems` functions
- Remove them from `CartContextType` interface and the context value

**`cart-drawer.tsx`:**
- Remove the `useEffect` that syncs deferred items on cart open
- Remove the auto-save `useEffect` (the one keyed by `deferredItems`)
- Remove the `deferredLoadedRef` and `deferredSaveKeyRef` refs
- Remove `saveDeferredToDb` and all 5 call sites within `cart-drawer.tsx` (toggle, remove, quantity change, clear, and the auto-save effect)

### Kitchen / Bar UI changes

**Single retenido type:**
- Color: `oklch(21% 0.10 65)` bg / `oklch(50% 0.22 65 / 0.55)` border (previous "carrito" amber)
- Label: single key `kitchenItemRetenido` — value: "Retenido" (no suffix)
- Remove `kitchenItemCarrito` translation key across all 5 languages

**Kitchen page (`/waiter/kitchen`):**
- Remove `isDiferido` branching from card rendering
- Remove `liberatingPedidosMesas` state and `handleLiberarRetenidosPedidos` callback
- Remove ShoppingCart button from mesa card footers
- Remove `sesionItemIdx` from swipe handler logic
- Single Utensils button (blue) per mesa for releasing all retenidos via PATCH to `pendiente`
- Label on Utensils button: reuse `kitchenLiberarPedidos` (rename to `kitchenLiberar` since there's now only one type)

**WaiterBanner:**
- Remove the deferred items chip from mesa cards in the waiter table grid

### Translations

Remove from all 5 languages (ES/EN/FR/IT/DE):
- `kitchenItemCarrito`

Rename/update:
- `kitchenItemRetenido` → value: "Retenido" (no "pedidos" suffix)
- `kitchenLiberarPedidos` → rename to `kitchenLiberar` or update value to "Liberar"
- Remove `kitchenLiberarCarrito`

---

## PR 2 — Waiter Validation Feature

### Goal

Customer QR orders wait in a validation queue (`pendiente_validacion`) before reaching the kitchen. The waiter reviews them in a dedicated page, sends checked items to kitchen, and retains unchecked ones. Configurable per empresa via superadmin toggle.

### Database

**`empresas` table:**
```sql
ALTER TABLE empresas
  ADD COLUMN validacion_pedidos_habilitada boolean NOT NULL DEFAULT false;
```

**`pedidos.estado`** — add `'pendiente_validacion'` as a valid value (the column is `text`, so no enum change needed). Update any Zod schemas or type definitions that enumerate valid estados.

### Order creation flow

`POST /api/pedidos` — modified behavior:

```
If empresa.validacion_pedidos_habilitada = true
  AND request is from a customer (no waiter JWT)
  → create pedido with estado = 'pendiente_validacion'
Else
  → create pedido with estado = 'pendiente' (unchanged)
```

Waiter-placed orders (via waiter JWT) always bypass validation.

### New API endpoints

#### `GET /api/waiter/pendientes/orders`

Returns all pedidos with `estado = 'pendiente_validacion'` for the authenticated empresa, grouped by mesa.

**Response:**
```json
{
  "mesas": [
    {
      "mesaId": "uuid",
      "mesaNumero": 3,
      "mesaNombre": null,
      "pedidos": [
        {
          "id": "uuid",
          "createdAt": "2026-06-17T14:00:00Z",
          "items": [
            { "idx": 0, "nombre": "Spaghetti Carbonara", "cantidad": 2, "precio": 12.5, "tipo": "comida" },
            { "idx": 1, "nombre": "Agua con gas", "cantidad": 1, "precio": 2.5, "tipo": "bebida" }
          ]
        }
      ]
    }
  ]
}
```

#### `POST /api/waiter/pendientes/validate`

Validates a single pedido. Items in `retainIndices` are retained; all others go to kitchen.

**Request body:**
```json
{
  "pedidoId": "uuid",
  "retainIndices": [1]
}
```

**What happens server-side (atomic):**
1. Verify pedido exists, belongs to empresa, has `estado = 'pendiente_validacion'`
2. For each index in `retainIndices`: insert row in `pedido_item_estados` with `estado = 'retenido'`
3. Update `pedidos.estado = 'pendiente'` — the pedido now appears in kitchen/bar for non-retained items
4. Items not in `retainIndices` have no `pedido_item_estados` entry → implicitly `pendiente` in kitchen

**Response:** `{ ok: true }`

**Error codes:** `404` pedido not found, `409` pedido not in `pendiente_validacion`, `403` wrong empresa.

### Superadmin toggle

New field in the empresa edit form in `/superadmin`: toggle `validacion_pedidos_habilitada`. Endpoint: `PATCH /api/superadmin/empresas/[id]/route.ts` — the file already exists; extend the Zod schema and UPDATE query to include the new field.

### New page: `/waiter/pendientes`

**Structure:** same shell as `/waiter/kitchen` — fixed header, scrollable content, 3s polling.

**Header:**
- Row 1: back link + title "Pendientes de validación" + item count
- No time legend (items are time-stamped but no color coding — state is binary: send or retain)

**Content — grouped by mesa:**
- Each mesa is a card (same collapsible pattern as kitchen: Table2 icon + ChevronDown)
- Items listed with checkbox (all checked by default)
- Unchecking an item marks it as "retenido" — shows amber tint and "Retenido" label
- "Confirmar (N ítems → cocina)" button in card footer — calls `POST validate` and removes the pedido from the list optimistically
- If all items are unchecked: button reads "Retener todos"

**No swipe gestures** — this is a deliberate checkbox-based confirmation flow.

**Empty state:** "No hay pedidos pendientes de validación"

### WaiterBanner changes

- New "Pendientes" button, shown **only** when `validacion_pedidos_habilitada = true` for the empresa
- Positioned between the back/logout area and the Cocina button
- Badge: count of total items across all `pendiente_validacion` pedidos
- Sound: same audio ping as kitchen/bar, fires when count increases

### Customer ticket (`/mesa/{mesaId}/orders`)

- Include `pendiente_validacion` pedidos in the session order list
- Include `retenido` pedidos (already in the session, now visible)
- **No estado labels** for customers — items appear as a plain list with name, quantity, and price

### Waiter impersonation ticket

The page `/mesa/{mesaId}/orders` renders `MesaOrdersClient`. This component currently has no waiter-awareness. PR 2 adds waiter detection: the component reads the `waiter_token` cookie (server-side in the page, passed as a prop) to determine if the viewer is a waiter.

When viewed as waiter, each pedido shows a small estado badge:
- `pendiente_validacion` → "Pendiente de validación" (amber)
- `retenido` → "Retenido" (amber)
- `pendiente` → "En preparación"
- `preparado` → "Listo"
- `servido` → "Servido"

When viewed as customer, no estado badges are shown.

### Admin panel

`pendiente_validacion` pedidos are excluded from `/admin/pedidos` (same filter that excludes open session pedidos). They only become visible after session consolidation.

### Kitchen / Bar

No changes needed. The `findKitchenItems` query already filters by `pedidos.estado = 'pendiente'` — `pendiente_validacion` pedidos are invisible until validated.

---

## Key Invariants

1. A pedido with `estado = 'pendiente_validacion'` never appears in kitchen or bar.
2. A pedido with `estado = 'retenido'` is a whole-pedido retention (waiter added it deferred via cart). Individual item retentions within a customer pedido use `pedido_item_estados.estado = 'retenido'` — the parent pedido has `estado = 'pendiente'`.
3. Waiter-placed orders never enter `pendiente_validacion` regardless of the empresa toggle.
4. The `retainIndices` in `/validate` must be subset of valid indices in `detalle_pedido`. Invalid indices return 400.

---

## Files Affected

### PR 1
- `src/app/waiter/kitchen/page.tsx` — remove isDiferido branching, ShoppingCart button, liberatingPedidosMesas
- `src/app/waiter/bar/page.tsx` — minor: remove any residual deferred references
- `src/lib/cart-context.tsx` — remove loadDeferredItems, syncDeferredItems
- `src/components/cart-drawer.tsx` — remove deferred sync effects
- `src/core/domain/repositories/IPedidoRepository.ts` — remove isDiferido, sesionItemIdx fields
- `src/core/infrastructure/database/supabase-pedido.repository.ts` — remove deferred fetching
- `src/app/api/waiter/mesas/[mesaId]/deferred/route.ts` — delete file
- `src/app/api/waiter/kitchen/mesas/[mesaId]/release-deferred-item/route.ts` — delete file
- `src/lib/translations.ts` — remove kitchenItemCarrito, kitchenLiberarCarrito; update retenido labels
- `supabase/migrations/` — new migration: drop items_diferidos

### PR 2
- `src/app/waiter/pendientes/page.tsx` — new file
- `src/app/api/waiter/pendientes/orders/route.ts` — new file
- `src/app/api/waiter/pendientes/validate/route.ts` — new file
- `src/components/waiter-banner.tsx` — add Pendientes button + badge
- `src/app/mesa/[mesaId]/orders/page.tsx` — include pendiente_validacion; no estado labels for customers; waiter badge
- `src/app/api/pedidos/route.ts` — check validacion_pedidos_habilitada on POST
- `src/core/domain/repositories/IPedidoRepository.ts` — add `findPendientesValidacion` method
- `src/core/infrastructure/database/supabase-pedido.repository.ts` — implement findPendientesValidacion
- `src/lib/translations.ts` — add pendientesValidacion keys (title, empty state, confirm button, waiter badge) across 5 languages
- `supabase/migrations/` — new migration: add validacion_pedidos_habilitada to empresas
