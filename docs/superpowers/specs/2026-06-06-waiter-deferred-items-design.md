# Waiter Deferred Items — Design Spec
Date: 2026-06-06

## Problem

A waiter taking orders at a mesa may want to hold back certain items (e.g. desserts) and send them to the kitchen later, without losing them from the order. Currently there is no way to mark an item as "send later" — the only options are include it now or remove it.

## Goal

Allow a waiter to mark one or more cart items as "deferred" before confirming a comanda. Deferred items are excluded from the current order but persisted to the DB so any waiter can see and release them later.

---

## Data Model

### Migration — `mesa_sesiones`

```sql
ALTER TABLE public.mesa_sesiones
  ADD COLUMN items_diferidos JSONB NOT NULL DEFAULT '[]';
```

No new table. The column is overwritten atomically on every deferred-items update.

### TypeScript type

```typescript
// shared — used in domain, repo, API response, and cart
interface DeferredItem {
  itemId: string;
  itemName: string;
  price: number;
  quantity: number;
  translations?: Record<string, { name: string }>;
  selectedComplements?: Array<{ id: string; name: string; price: number }>;
}
```

Stored as a JSONB array in `items_diferidos`. Empty array = no pending items.

---

## Cart Changes

### `CartItem` (cart-context.tsx)

Two new optional flags:

| Flag | Meaning |
|---|---|
| `deferred?: boolean` | Waiter explicitly marked this item to send later. Excluded from the next order confirm. |
| `fromPending?: boolean` | Item pre-loaded from DB when entering a mesa. Sent normally on next confirm. |

### New cart actions

| Action | Description |
|---|---|
| `toggleDeferred(itemKey: string)` | Flip the `deferred` flag on a cart item. |
| `loadDeferredItems(items: DeferredItem[])` | Add items to cart with `fromPending: true`. Called once when a mesa is entered. |

### `totalItems` / `totalPrice`

Count ALL items — deferred, fromPending, and normal. The badge on the waiter banner reflects reality.

---

## Confirm Order Logic (cart-drawer.tsx — mesa mode)

On confirm:

1. **Split cart:** `toOrder = items.filter(i => !i.deferred)`, `toDefer = items.filter(i => i.deferred)`.
2. **Guard:** if `toOrder` is empty → disable confirm button, show "Todos los ítems están diferidos".
3. **Send order:** `POST /api/pedidos` with `toOrder` only (existing flow, unchanged).
4. **Save deferred:** `PUT /api/waiter/mesas/[mesaId]/deferred` with `toDefer` mapped to `DeferredItem[]`. If `toDefer` is empty, send `[]` to clear.
5. **Cart update:** remove `toOrder` items from cart. `toDefer` items remain.
6. On 401 / error: existing error handling unchanged.

Note: `fromPending` items carry no `deferred` flag — they behave as normal items and are included in `toOrder`.

---

## Pre-loading Deferred Items

When a waiter enters a mesa (cart-drawer detects `mesaToken`), after fetching mesa info, also fetch `/api/waiter/mesas/[mesaId]/deferred`. If the response contains items, call `loadDeferredItems(items)` once. Guard against duplicate loads with a `deferredLoaded` ref.

---

## API

### New endpoint — `PUT /api/waiter/mesas/[mesaId]/deferred`

- Protected by waiter JWT (same pattern as existing waiter routes — `x-empresa-id` header).
- Body: `{ items: DeferredItem[] }` — array of items to persist. Empty array clears.
- Action: calls use case → updates `mesa_sesiones.items_diferidos` for the active session of the given mesa.
- Response: `{ ok: true }`.

### New endpoint — `GET /api/waiter/mesas/[mesaId]/deferred`

- Protected by waiter JWT.
- Response: `{ items: DeferredItem[] }`.

### Extended — `GET /api/waiter/mesas`

- `MesaWithSession` gains `itemsDiferidos: DeferredItem[]`.
- Repository query includes `items_diferidos` from the active session join.

---

## Domain & Infrastructure

### `IMesaRepository` / `MesaWithSession`

```typescript
interface MesaWithSession {
  // ... existing fields
  itemsDiferidos: DeferredItem[];
}
```

### `IMesaSesionRepository`

New methods:

```typescript
getDeferredItems(mesaId: string): Promise<Result<DeferredItem[], AppError>>;
setDeferredItems(mesaId: string, items: DeferredItem[]): Promise<Result<void, AppError>>;
```

Both operate on the active session for the given `mesaId`.

### Use case — `manageDeferredItemsUseCase`

Wraps get/set with empresa isolation check (ensures the mesa belongs to the calling empresa).

---

## Grid (waiter-login-form.tsx)

`MesaCard` receives `itemsDiferidos` via `MesaWithSession`. If the array is non-empty, render below the existing status row:

```
[clock icon]  Tiramisú x1, Café x2
```

Small text, muted color. No interaction — display only.

---

## Cart UI (cart-drawer.tsx — mesa mode only)

### Item row
- Each item shows a clock button (⏱) on the right, aligned with the quantity controls.
- `deferred` state: row has a subtle amber tint, clock icon is "active" (filled/amber).
- `fromPending` state: small badge "pendiente" shown next to the item name. No clock toggle.

### Confirm button
- If all non-fromPending items are deferred: button disabled, label "Todos los ítems están diferidos".
- Otherwise: normal "Confirmar comanda" label.

---

## Lifecycle Summary

```
Waiter marks item deferred
  → deferred flag on CartItem (client only)

Waiter confirms comanda
  → non-deferred items → POST /api/pedidos
  → deferred items → PUT /api/waiter/mesas/[id]/deferred (save to DB)
  → non-deferred cleared from cart; deferred remain

Grid refresh
  → MesaCard shows deferred items list

Waiter (any) enters mesa
  → GET /api/waiter/mesas/[id]/deferred
  → loadDeferredItems() → items appear in cart with fromPending flag

Waiter confirms (releasing deferred)
  → all cart items → POST /api/pedidos
  → PUT /api/waiter/mesas/[id]/deferred with [] (clear DB)
  → cart cleared
```

---

## Files to Create / Modify

| File | Action |
|---|---|
| `supabase/migrations/YYYYMMDD_mesa_items_diferidos.sql` | Create — add column |
| `src/core/domain/repositories/IMesaRepository.ts` | Modify — add `itemsDiferidos` to `MesaWithSession` |
| `src/core/domain/repositories/IMesaSesionRepository.ts` | Modify — add `getDeferredItems` / `setDeferredItems` |
| `src/core/infrastructure/database/supabase-mesa-sesion.repository.ts` | Modify — implement new methods |
| `src/core/infrastructure/database/supabase-mesa.repository.ts` | Modify — include `items_diferidos` in session join |
| `src/core/application/use-cases/mesa/manageDeferredItemsUseCase.ts` | Create — get/set with empresa isolation |
| `src/app/api/waiter/mesas/[mesaId]/deferred/route.ts` | Create — GET + PUT |
| `src/lib/cart-context.tsx` | Modify — new flags + actions |
| `src/components/cart-drawer.tsx` | Modify — defer toggle UI + confirm logic |
| `src/components/waiter-login-form.tsx` | Modify — grid card deferred display + pre-load on mesa entry |

---

## Out of Scope

- Notifications / alerts when deferred items exist (future)
- Per-item waiter attribution (who deferred it)
- Deferred items surviving session close (they're tied to the session — intentional)
