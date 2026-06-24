# Waiter Ticket & Payment UX

## Overview

This document covers the UX features in `/mesa/{mesaId}/orders` (`mesa-orders-client.tsx`) and the waiter grid (`waiter-login-form.tsx`) added in PR4. These features affect both the client-facing ticket view and the waiter-impersonating view.

---

## Ticket Item Ordering

Both the ticket view and the custom payment selection always display items in the same order:

1. **Bebidas** — sorted alphabetically by name
2. Visual dashed separator line
3. **Comidas** — sorted alphabetically by name

The `tipo_producto` field comes from `detalle_pedido` JSON (set when the product is ordered). The sort helper `sortItemsByTypeAndName(a, b)` in `mesa-orders-client.tsx` handles this:

```ts
function sortItemsByTypeAndName(a: OrderItem, b: OrderItem): number {
  const aTipo = (a.tipo_producto ?? 'comida') === 'bebida' ? 0 : 1;
  const bTipo = (b.tipo_producto ?? 'comida') === 'bebida' ? 0 : 1;
  if (aTipo !== bTipo) return aTipo - bTipo;
  return a.nombre.localeCompare(b.nombre);
}
```

The separator is injected inline during the `.map()` render when `tipo_producto` changes from `bebida` to `comida`.

---

## Custom Payment Selection (CustomSelectionView)

When a session uses `division_tipo = 'personalizado'`, clients and waiters can select exactly which items they're paying for.

### Item Grouping

Items with the **same nombre + complementos** are grouped into a single row (`GroupedSelectorItem`). The stepper shows the total available units across all matching sub-items. On payment, units are distributed greedily across the underlying `{orderId, idx}` pairs.

```ts
type GroupedSelectorItem = {
  groupKey: string;         // `${nombre}||${precio}||${complementosStr}`
  nombre: string;
  precio: number;
  tipo_producto: 'comida' | 'bebida';
  complementos?: { nombre: string; precio: number }[];
  totalDisponibles: number;
  subitems: { orderId: string; idx: number; disponibles: number }[];
};
```

The `selection` Map is keyed by `groupKey`, not by `orderId:idx`.

### Complementos display

Each group row shows its complementos list below the product name, so the customer can distinguish identical products with different extras (e.g., "Burger" with vs. without cheese).

### Cancel button

Cancelling a custom payment turn skips `RemainingItemsActions` and returns directly to the main ticket. Implemented by setting `hidingRemainingActions(true)` inside `onCancelled`.

---

## Waiter-Only: Paid Items Section

In the waiter impersonating view (`isWaiterMode`), the custom payment section at the bottom of the ticket shows **only already-paid items** (items covered by confirmed `pagado` turns), grouped by nombre+complementos with a quantity badge. The "pending" items are already visible at the top of the ticket, so they are not repeated here.

Footer shows:
- **Pagado:** sum of `pagadoCents`
- **Pendiente:** `total - pagadoCents`

---

## Unserved Orders Block (`hasPlatosPoServir`)

Payment (client and waiter) and mesa closure are **blocked** while any order in the session is in an unserved state.

### How it works

`hasPlatosPoServir` is computed in `mesa-orders-client.tsx` after loading `sessionData`:

```ts
const hasPlatosPoServir = !fullyPaid && (sessionData?.orders ?? []).some(
  o => ['pendiente_validacion', 'pendiente', 'en_preparacion', 'preparado'].includes(o.estado)
);
```

When `true`:
- A warning banner is shown to both the client and the waiter impersonating.
- All payment buttons are `disabled`.
- The waiter "Marcar pago completo" button is `disabled`.

Translation key: `mesaPlatosPoServir` (all 5 locales: es/en/fr/it/de).

### Critical: order estados are synthesized

`pedidos.estado` at the DB level is **never updated** by the cook kitchen or bar when items are individually processed. The real per-item state lives in `pedido_item_estados`.

The `/api/mesas/[mesaId]/orders` route synthesizes the effective `estado` for each order:

```
For each pedido:
  activeIndices = all item indices NOT in cancelledByPedido
  servidoIndices = item indices with estado IN ('listo', 'servido') in pedido_item_estados

  allItemsDone = (activeIndices.length === 0)   // all cancelled → done
               || activeIndices.every(idx => servidoIndices.has(idx))  // all served/ready

  if (allItemsDone) → synthesize estado = 'servido'
```

Both `listo` (kitchen ready) and `servido` (waiter delivered) count as "done" for payment purposes — the block only applies while food is actively being cooked.

**Fully-cancelled orders** (`activeIndices.length === 0`) are also synthesized as `servido` — there is nothing left to serve.

---

## Cerrar Mesa Guard (Waiter Grid)

`handleCloseMesa` in `waiter-login-form.tsx` enforces two sequential guards before allowing a close:

1. **Unserved check** — fetches `GET /api/mesas/{mesaId}/orders` and checks if any order's synthesized `estado` is in `['pendiente_validacion', 'pendiente', 'en_preparacion', 'preparado']`. Shows: "Quedan platos por servir. Sirve todos los platos antes de cerrar la mesa."

2. **Unpaid check** — if `pagosHabilitados && !sesionPagada && orders.length > 0`. Shows: "Hay pedidos sin pagar. Registra el pago antes de cerrar la mesa."

Both checks only apply when `!sesionPagada`. A fully-paid session can always be closed.

Errors display via `closeBlockedError` state, auto-cleared after 5 seconds.

---

## Platos Listos Badge (Waiter Grid)

Each mesa card shows a "Platos listos" green button when `mesa.preparadoPedidoNumbers.length > 0`. Clicking it navigates to:

```
/waiter/kitchen?groupBy=listos&mesa=<mesaKey>
```

Where `mesaKey = mesa.nombre ?? \`Mesa ${mesa.numero}\``.

---

## Kitchen Page — Auto-Collapse on Arrival

When `/waiter/kitchen` is opened with a `?mesa=<mesaKey>` URL param (e.g., from the "Platos listos" badge), the page auto-collapses all mesa sections **except** the target one, and smooth-scrolls to it.

Implementation in `page.tsx` (one-time effect via `scrolledRef`):

```ts
useEffect(() => {
  if (!targetMesa || scrolledRef.current || items.length === 0) return;
  scrolledRef.current = true;
  const allKeys = Array.from(groupByMesa(sourceItems).keys());
  const toCollapse = new Set(allKeys.filter(k => k !== targetMesa));
  if (toCollapse.size > 0) setCollapsedMesas(toCollapse);
  document.getElementById(`mesa-section-${targetMesa}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}, [items, targetMesa, groupBy]);
```

---

## Manual Payment Bug Fix (Personalizado + No Active Turn)

When `division_tipo = 'personalizado'` and there is no active `custom_turno_id` (all turns have been completed), calling "Marcar pago completo" from the waiter ticket was silently returning `NOT_FOUND`.

**Fix** in `registerManualMesaPaymentUseCase.ts`: when `!effectiveTurnoId`, skip the RPC calls and set `fullyPaid = true` directly — treating the waiter override as a full manual close.
