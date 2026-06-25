# Waiter Validation Flow

## Overview

When `validacion_pedidos_habilitada` is enabled for a restaurant, customer orders go through a two-stage flow before reaching the kitchen or bar:

1. **Customer orders** → pedido created with `estado = 'pendiente_validacion'`
2. **Waiter validates** at `/waiter/pendientes` → pedido moves to `estado = 'pendiente'` and becomes visible in kitchen/bar

Waiters can confirm food and drink items independently, in any order.

---

## The `from_validation` Flag

`pedido_item_estados` uses `from_validation: boolean` to distinguish two fundamentally different types of retained items:

| `from_validation` | Meaning | Where it appears |
|---|---|---|
| `false` | **Kitchen-retained** — waiter intentionally paused this item in the kitchen/bar panel | Kitchen "Retenidos" tab, retenidos badge |
| `true` | **Pendientes-retained** — item sent back to the pendientes queue (wrong type for current confirm, or not selected) | Pendientes queue only |

This distinction is enforced at every read path in the codebase. All four data sources that read `pedido_item_estados` skip `from_validation = true` entries for grid/kitchen/bar display:

- `supabase-mesa.repository.ts` → `retenidoBySesion` (waiter grid mesa cards)
- `supabase-pedido.repository.ts` → `fetchAllComidaItems` → `estadoMap` (kitchen page)
- `supabase-pedido.repository.ts` → `findBarOrders` → `estadoMap` (bar page)
- `supabase-pedido.repository.ts` → `countBebidasTotal` (bar badge count)

---

## Validation Flow Detail

### Happy path — validate all at once

```
Pedido: [comida(0), bebida(1)] → pendiente_validacion

Waiter selects ALL items, clicks combined ✓🍽🍷 button
  → handleConfirmBoth()
  → POST /api/waiter/pendientes/validate
       retainIndices: []     ← nothing to retain
       pausedIndices: []     ← nothing paused
  → pedido.estado = 'pendiente'
  → Kitchen receives comida(0) ✓
  → Bar receives bebida(1) ✓
```

### Partial confirm — comida first, bebida later

```
Pedido: [comida(0), bebida(1)] → pendiente_validacion

Waiter selects comida only, clicks ✓🍽 button
  → handleConfirm('comida', 'selected')
  → POST /api/waiter/pendientes/validate
       retainIndices: [1]           ← bebida goes back to pendientes queue
       pausedIndices: []
  → pedido_item_estados: bebida(1) → estado='retenido', from_validation=true
  → pedido.estado = 'pendiente'
  → Kitchen receives comida(0) ✓
  → Pendientes queue now shows bebida(1) as validated=true (waiting for bar confirm)

Waiter clicks ✓🍷 for bebida
  → handleConfirm('bebida', 'selected') on validated=true pedido
  → PATCH /api/waiter/kitchen/items/{pedidoId}/1/status  { estado: 'pendiente' }
       → from_validation set to false, estado = 'pendiente'
  → Bar receives bebida(1) ✓
```

### Paused comida item (kitchen retenido)

```
Waiter clicks ⏸ on a comida item before confirming
  → pausedIndices includes that item's idx

  → POST /api/waiter/pendientes/validate
       pausedIndices: [idx]
  → pedido_item_estados: item(idx) → estado='retenido', from_validation=false
  → Item appears in kitchen "Retenidos" tab ← intentional hold
  → Waiter releases it later from kitchen panel
```

> **Pause prevalece sobre selección**: en `handleConfirmBoth` (botón morado), un ítem puede estar a la vez seleccionado (✓) Y pausado (⏸). La pausa gana: el ítem va a `pausedIndices` → kitchen retenido. La condición `!selected.has(...)` fue eliminada del filtro porque el botón conjunto requiere todos los ítems seleccionados, lo que hacía imposible pausar con él.

---

## Pendientes Page (`/waiter/pendientes`)

Polls `GET /api/waiter/pendientes/orders` every 3 seconds.

`findPendientesValidacion` returns two types of entries merged into the same mesa list:

**Query 1 — unvalidated pedidos:**
```sql
SELECT ... FROM pedidos WHERE estado = 'pendiente_validacion'
```
Returns with `validated: false`. Items include both comida and bebida.

**Query 2 — validated pedidos with retained items:**
```sql
SELECT pedido_id, item_idx FROM pedido_item_estados
  WHERE estado = 'retenido' AND from_validation = true
```
Finds pedidos in `estado = 'pendiente'` that match. Returns with `validated: true`. Items are filtered to only those with `from_validation = true`.

### Confirm buttons (per mesa)

| Button | Condition | Action |
|---|---|---|
| `✓🍽🍷` (purple) | All items selected AND both comida + bebida present | `handleConfirmBoth` — sends both types in one call |
| `✓🍽` (green) | At least one comida selected | `handleConfirm('comida', 'selected')` |
| `✓🍷` (blue) | At least one bebida selected | `handleConfirm('bebida', 'selected')` |

The combined button appears **first** (leftmost) when all items are selected. Individual buttons are always shown when items of that type are selected.

### Row interaction

- **Click anywhere on an item row** → toggles selection checkbox
- **Click ⏸ pause button** (comida only) → toggles kitchen-pause without affecting selection
- Both use `stopPropagation` to prevent double-firing

### Deferred items (bebidas) in validation context

Bebidas cannot be manually deferred/retained in the pendientes page (no pause button for bebidas). Only comida items have the pause button. Bebidas always go directly to bar when confirmed.

---

## Timer de Cocina y Bar

El timer que aparece en `/waiter/kitchen` y `/waiter/bar` usa el campo `createdAt` de cada ítem.

Desde la migración `pedidos_add_validated_at`, el repositorio expone:

```
createdAt = pedidos.validated_at ?? pedidos.created_at
```

- **Pedidos con validación** (`pendiente_validacion` → validado por camarero): el timer arranca desde `validated_at` (momento en que el camarero lanzó el pedido), NO desde cuando el cliente lo hizo.
- **Pedidos directos** (sin cola de validación): `validated_at` es NULL, se usa `created_at` como antes.

Esto evita que el timer cuente el tiempo en sala de espera de validación como tiempo de preparación en cocina.

---

## Retenidos in the Waiter Grid

Mesa cards in the waiter grid (`/waiter`) show a count of retained items via `itemsDiferidos` (computed from `retenidoBySesion`). Clicking the orange retained-items chip opens a popup with two options:

1. **Abrir retenidos** — navigates to `/waiter/kitchen?groupBy=retenidos&mesa=<mesaName>` (auto-scrolls to that mesa's section)
2. **Lanzar ítems retenidos de esta mesa** — calls `POST /api/waiter/kitchen/mesas/{mesaId}/release-retenidos` directly, without navigating

Only **kitchen-retained** items (`from_validation = false`) appear in this count. Items back in the pendientes queue (`from_validation = true`) are invisible on the grid.

---

## Cart Deferred Items (Waiter Mode)

In waiter mode, the cart's Pause button lets waiters mark **comida** items to send later as kitchen-retained pedidos. **Bebida items cannot be deferred** — they always go to bar immediately.

- The Pause button is hidden for `tipoProducto === 'bebida'` in both the quantity dialog and the cart drawer.
- If a cart contains **only** deferred items (all comida, all paused), "Enviar" creates a pedido directly with `initialEstado = 'retenido'`.
- If a cart contains a mix of regular + deferred items, two pedidos are created: one normal, one with `initialEstado = 'retenido'`.

---

## New Endpoints (PR3)

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/waiter/kitchen/mesas/{mesaId}/release-retenidos` | Release all kitchen-retained (`from_validation=false`) items for a mesa back to `pendiente` |

### Removed Endpoints

| Route | Reason |
|---|---|
| `POST /api/waiter/kitchen/mesas/{mesaId}/release-deferred` | Dead — relied on `items_diferidos` JSONB column (dropped in migration 20260617000001). Replaced by `release-retenidos`. |
