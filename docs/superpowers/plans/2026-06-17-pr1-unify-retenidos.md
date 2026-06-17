# PR 1 — Unify Retenidos: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the `items_diferidos` / "retenido carrito" system. A single retenido concept exists: a proper `pedido` with `estado = 'retenido'`. Cart items the waiter marks as deferred are now sent as a real pedido at confirm time.

**Architecture:** Remove the `items_diferidos` JSONB column and all associated endpoints. When the waiter confirms a comanda with deferred items, two sequential `POST /api/pedidos` calls are made — one for normal items (`estado = 'pendiente'`) and one for deferred items (`estado = 'retenido'`). The kitchen page and repository drop all `isDiferido` / `sesionItemIdx` logic.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (service-role client), React 19, Tailwind v4 / oklch colors, Lucide icons, i18n via `t()` across ES/EN/FR/IT/DE.

---

## File Map

| Action | File |
|--------|------|
| Create | `supabase/migrations/YYYYMMDDHHMMSS_drop_items_diferidos.sql` |
| Delete | `src/app/api/waiter/mesas/[mesaId]/deferred/route.ts` |
| Delete | `src/app/api/waiter/kitchen/mesas/[mesaId]/release-deferred-item/route.ts` |
| Modify | `src/core/domain/repositories/IPedidoRepository.ts` |
| Modify | `src/core/infrastructure/database/supabase-pedido.repository.ts` |
| Modify | `src/app/api/pedidos/route.ts` |
| Modify | `src/lib/cart-context.tsx` |
| Modify | `src/components/cart-drawer.tsx` |
| Modify | `src/app/waiter/kitchen/page.tsx` |
| Modify | `src/components/waiter-banner.tsx` |
| Modify | `src/lib/translations.ts` |

---

## Task 1: DB Migration — Drop `items_diferidos`

**Files:**
- Create: `supabase/migrations/20260617000001_drop_items_diferidos.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Drop items_diferidos column from mesa_sesiones.
-- After this migration, deferred cart items are stored as real pedidos
-- with estado = 'retenido' instead of as JSONB in the session row.

ALTER TABLE public.mesa_sesiones DROP COLUMN IF EXISTS items_diferidos;
```

- [ ] **Step 2: Apply migration**

```bash
# Via Supabase MCP tool or CLI:
# supabase db push  (if using local dev)
# Or apply via Supabase dashboard SQL editor for production
```

Verify: `mesa_sesiones` no longer has an `items_diferidos` column in the Supabase table editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260617000001_drop_items_diferidos.sql
git commit -m "fix(db): drop mesa_sesiones.items_diferidos column"
```

---

## Task 2: Delete Obsolete API Routes

**Files:**
- Delete: `src/app/api/waiter/mesas/[mesaId]/deferred/route.ts`
- Delete: `src/app/api/waiter/kitchen/mesas/[mesaId]/release-deferred-item/route.ts`

- [ ] **Step 1: Delete the deferred route**

```bash
rm "src/app/api/waiter/mesas/[mesaId]/deferred/route.ts"
# If the [mesaId] directory becomes empty, remove it too — but check for sibling routes first:
ls "src/app/api/waiter/mesas/[mesaId]/"
```

- [ ] **Step 2: Delete the release-deferred-item route**

```bash
rm -r "src/app/api/waiter/kitchen/mesas/[mesaId]/release-deferred-item/"
```

- [ ] **Step 3: Check no other files import from these routes**

```bash
grep -r "release-deferred-item\|/deferred" src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules"
```

Expected: no matches (the only consumers are cart-drawer.tsx which we fix in Task 7).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(waiter): remove deferred API routes (items_diferidos system)"
```

---

## Task 3: Update Domain Types in `IPedidoRepository.ts`

**Files:**
- Modify: `src/core/domain/repositories/IPedidoRepository.ts`

- [ ] **Step 1: Remove `isDiferido` and `sesionItemIdx` from `KitchenItemRecord`**

Find the `KitchenItemRecord` interface and remove these two fields:

```typescript
// Remove these two lines:
/** true = item from mesa_sesiones.items_diferidos (deferred cart item, read-only in waiter kitchen) */
isDiferido?: boolean;
/** Index within the mesa_sesion.items_diferidos array — only set when isDiferido=true */
sesionItemIdx?: number;
```

- [ ] **Step 2: Remove `sesionItemIdx` from `RetenidoItem`**

Find the `RetenidoItem` interface and remove:

```typescript
// Remove this line:
/** Position of this item within its mesa_sesion.items_diferidos array */
sesionItemIdx: number;
```

- [ ] **Step 3: Verify with lint**

```bash
pnpm lint
```

Expected: no new errors. If `sesionItemIdx` is referenced elsewhere, those references will be caught here.

---

## Task 4: Update `supabase-pedido.repository.ts` — Remove Deferred Fetching

**Files:**
- Modify: `src/core/infrastructure/database/supabase-pedido.repository.ts`

- [ ] **Step 1: Simplify `findAllRetenidos` — remove items_diferidos fetching**

The method currently fetches `mesa_sesiones.items_diferidos` and iterates over it. Replace the entire method body with a query that only fetches real `pedido_item_estados` with `estado = 'retenido'`:

```typescript
async findAllRetenidos(empresaId: string, tipo: 'comida' | 'bebida'): Promise<Result<RetenidoItem[]>> {
  try {
    const { data: estados, error } = await this.supabase
      .from('pedido_item_estados')
      .select(`
        item_idx,
        pedidos!inner(
          id, created_at, sesion_id, detalle_pedido, empresa_id,
          mesas!inner(id, numero, nombre)
        )
      `)
      .eq('estado', 'retenido')
      .eq('pedidos.empresa_id', empresaId);

    if (error) {
      await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabasePedidoRepository.findAllRetenidos', { details: { code: error.code, empresaId } });
      return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener retenidos', module: 'repository', method: 'findAllRetenidos' } };
    }

    const result: RetenidoItem[] = [];
    for (const row of estados ?? []) {
      const r = row as Record<string, unknown>;
      const pedido = r['pedidos'] as Record<string, unknown>;
      const mesa = pedido['mesas'] as Record<string, unknown>;
      const detalle = (pedido['detalle_pedido'] as Array<Record<string, unknown>>) ?? [];
      const idx = r['item_idx'] as number;
      const item = detalle[idx];
      if (!item) continue;
      const itemTipo = (item['tipo_producto'] as string | undefined) ?? 'comida';
      if (itemTipo !== tipo) continue;
      const complements = (item['complementos'] as Array<{ nombre?: string }> | undefined);
      result.push({
        itemId: pedido['id'] as string,
        nombre: item['nombre'] as string,
        cantidad: item['cantidad'] as number,
        complementos: complements?.map(c => c.nombre ?? '').filter(Boolean).join(', '),
        mesaId: (mesa['id'] as string | null) ?? null,
        mesaNumero: (mesa['numero'] as number) ?? null,
        mesaNombre: (mesa['nombre'] as string | null) ?? null,
        sesionCreatedAt: pedido['created_at'] as string ?? '',
      });
    }

    return { success: true, data: result };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.findAllRetenidos', { empresaId });
    return { success: false, error: appError };
  }
}
```

- [ ] **Step 2: Simplify `findWaiterKitchenItems` — remove diferidoItems section**

Find `findWaiterKitchenItems` (around line 1214). Remove the `diferidosResult` and the `diferidoItems` block. The simplified version:

```typescript
async findWaiterKitchenItems(empresaId: string): Promise<Result<KitchenItemRecord[]>> {
  const orderItemsResult = await this.fetchAllComidaItems(empresaId);
  if (!orderItemsResult.success) return orderItemsResult;

  const visible: ItemEstado[] = ['pendiente', 'en_preparacion', 'listo', 'retenido'];
  return { success: true, data: orderItemsResult.data.filter(i => visible.includes(i.estado)) };
}
```

- [ ] **Step 3: Check lint**

```bash
pnpm lint
```

Fix any TypeScript errors (likely from `sesionItemIdx` references that are now gone).

---

## Task 5: Support `estado: 'retenido'` in `POST /api/pedidos`

**Files:**
- Modify: `src/app/api/pedidos/route.ts`
- Modify: `src/core/infrastructure/database/supabase-pedido.repository.ts` (createMesaOrder)

- [ ] **Step 1: Add optional `initialEstado` to `mesaPedidoSchema`**

In `src/app/api/pedidos/route.ts`, extend `mesaPedidoSchema`:

```typescript
const mesaPedidoSchema = z.object({
  tipo: z.literal('mesa'),
  mesa_id: z.string().uuid('El mesa_id debe ser un UUID válido'),
  items: itemsSchema,
  idioma: z.enum(['es', 'en', 'fr', 'it', 'de']).optional(),
  initialEstado: z.enum(['pendiente', 'retenido']).optional(), // waiter-only field
});
```

- [ ] **Step 2: Use `initialEstado` in `handleMesaOrder`**

In `handleMesaOrder`, after the `isWaiter` check, pass `initialEstado` to `createMesaOrder`. Only waiter requests may use `retenido`:

```typescript
async function handleMesaOrder(empresa: EmpresaOrderData, data: MesaData, request: Request): Promise<NextResponse> {
  const isWaiter = await isWaiterRequest(request);

  if (!empresa.mesas_habilitadas && !isWaiter) {
    return NextResponse.json({ error: 'El servicio de mesas no está disponible.' }, { status: 403 });
  }

  const tokenError = isWaiter ? null : await validateMesaClientToken(request);
  if (tokenError) return tokenError;

  const mesaResult = await mesaUseCase.getMesa(data.mesa_id);
  if (!mesaResult.success) {
    return NextResponse.json({ error: 'Error al verificar la mesa' }, { status: 500 });
  }
  if (!mesaResult.data) {
    return NextResponse.json({ error: 'Mesa no encontrada' }, { status: 404 });
  }

  const lockResponse = await checkMesaPaymentLock(data.mesa_id);
  if (lockResponse) return lockResponse;

  // Only authenticated waiters may set initialEstado; customer requests always use 'pendiente'
  const initialEstado = isWaiter && data.initialEstado === 'retenido' ? 'retenido' : 'pendiente';

  const pedidoResult = await pedidoUseCase.createMesaOrder(
    empresa.id,
    { items: data.items, mesa_id: data.mesa_id, idioma: data.idioma, initialEstado },
    mesaResult.data.numero,
    mesaResult.data.nombre
  );

  if (!pedidoResult.success) {
    const errorCode = pedidoResult.error.code;
    if (['PRODUCT_NOT_FOUND', 'INVALID_UUID'].includes(errorCode)) {
      return NextResponse.json({ error: pedidoResult.error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Error al crear el pedido de mesa' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    numeroPedido: pedidoResult.data.numero_pedido,
    pedidoId: pedidoResult.data.id,
    tipo: 'mesa',
    trackingToken: pedidoResult.data.trackingToken,
  });
}
```

- [ ] **Step 3: Thread `initialEstado` through the use case to the repository**

In the use case (`pedidoUseCase.createMesaOrder`), add `initialEstado` to the params and pass it to the repository. Then in `SupabasePedidoRepository.createMesaOrder`, use it:

```typescript
// In repository params type — add:
initialEstado?: 'pendiente' | 'retenido';

// In the insertPayload (line ~560), replace:
estado: 'pendiente',
// With:
estado: params.initialEstado ?? 'pendiente',
```

Find the `createMesaOrder` signature in `IPedidoRepository.ts` and add `initialEstado?: 'pendiente' | 'retenido'` to the params object.

- [ ] **Step 4: Lint check**

```bash
pnpm lint
```

---

## Task 6: Remove Deferred DB Sync from `cart-context.tsx`

**Files:**
- Modify: `src/lib/cart-context.tsx`

- [ ] **Step 1: Remove `loadDeferredItems` and `syncDeferredItems` from the context**

Delete the `loadDeferredItems` function body and the `syncDeferredItems` function body. Remove them from:
- The `CartContextType` interface
- The `contextValue` useMemo
- The useMemo dependency array

The `deferred` flag on `CartItem` and the `toggleDeferred` / `releaseAllDeferred` functions remain — they're still used for UI state.

- [ ] **Step 2: Lint check**

```bash
pnpm lint
```

Expected: errors about `loadDeferredItems` and `syncDeferredItems` being used in `cart-drawer.tsx` — those get fixed in the next task.

---

## Task 7: Update `cart-drawer.tsx` — New Confirm Flow

**Files:**
- Modify: `src/components/cart-drawer.tsx`

- [ ] **Step 1: Remove the deferred-sync `useEffect` and `deferredLoadedRef`**

Delete:
```typescript
// Delete these refs:
const deferredLoadedRef = useRef<string | null>(null);
const deferredSaveKeyRef = useRef('');

// Delete this useEffect (the one that calls syncDeferredItems on cart open):
useEffect(() => {
  if (!isWaiterMode) return;
  const mesaId = mesaInfo?.id ?? mesaToken;
  if (!mesaId) return;
  if (isCartOpen) deferredLoadedRef.current = null;
  if (deferredLoadedRef.current === mesaId) return;
  deferredLoadedRef.current = mesaId;
  fetch(...)
  ...
}, [mesaInfo, mesaToken, syncDeferredItems, isWaiterMode, isCartOpen]);

// Delete the auto-save useEffect:
useEffect(() => {
  if (!isWaiterMode || !mesaToken) return;
  if (!deferredLoadedRef.current) return;
  const deferredItems = items.filter(ci => ci.deferred);
  const key = deferredItems.map(ci => `${ci.item.id}:${ci.quantity}`).join(',');
  if (key === deferredSaveKeyRef.current) return;
  deferredSaveKeyRef.current = key;
  saveDeferredToDb(deferredItems);
}, [items, isWaiterMode, mesaToken, saveDeferredToDb]);
```

- [ ] **Step 2: Remove `saveDeferredToDb` function and all 5 call sites**

Delete the entire `saveDeferredToDb` useCallback. Then remove calls to it from:
- toggle deferred handler (line ~752-806)
- remove item handler
- quantity change handlers (2 locations, lines ~754-805)

These handlers still work fine — they just no longer need to persist to DB since the DB write now happens only at confirm time.

- [ ] **Step 3: Remove `loadDeferredItems` / `syncDeferredItems` from the destructured cart context**

```typescript
// Remove from the destructuring at the top of CartDrawer:
loadDeferredItems,
syncDeferredItems,
```

- [ ] **Step 4: Replace the deferred save in `handleConfirmOrder` with a second pedido POST**

In `handleConfirmOrder`, inside the mesa branch, after the successful first POST, replace the deferred PUT call with a second POST for deferred items:

```typescript
// BEFORE (lines ~327-341) — remove this block:
await fetch(`/api/waiter/mesas/${encodeURIComponent(mesaId)}/deferred`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ items: toDefer.map(ci => ({ ... })) }),
}).catch(() => null);

clearNonDeferred();

// AFTER — replace with:
if (toDefer.length > 0) {
  await fetch('/api/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tipo: 'mesa',
      mesa_id: mesaId,
      initialEstado: 'retenido',
      items: toDefer.map((ci: CartItem) => ({
        item: { id: ci.item.id, name: ci.item.name, price: ci.item.price, translations: ci.item.translations },
        quantity: ci.quantity,
        selectedComplements: ci.selectedComplements?.map(c => ({ id: c.id, name: c.name, price: c.price })),
      })),
      idioma: language,
    }),
  }).catch(() => null); // fire-and-forget — failure is non-critical
}

clearCart(); // all items sent (normal + retenido); clear the whole cart
```

Note: `clearNonDeferred()` is replaced with `clearCart()` because deferred items now leave the cart entirely (they became a real pedido).

- [ ] **Step 5: Lint check**

```bash
pnpm lint
```

---

## Task 8: Update Kitchen Page — Remove `isDiferido` Branching

**Files:**
- Modify: `src/app/waiter/kitchen/page.tsx`

- [ ] **Step 1: Remove `isDiferido` and `sesionItemIdx` from the `KitchenItem` interface**

```typescript
// Remove these two fields from KitchenItem:
isDiferido?: boolean;
sesionItemIdx?: number;
```

- [ ] **Step 2: Remove `liberatingPedidosMesas` state and `handleLiberarRetenidosPedidos`**

```typescript
// Remove:
const [liberatingPedidosMesas, setLiberatingPedidosMesas] = useState<Set<string>>(new Set());

// Remove the handleLiberarRetenidosPedidos callback entirely.
```

- [ ] **Step 3: Remove ShoppingCart from imports**

```typescript
// In the lucide-react import, remove ShoppingCart:
import { UtensilsCrossed, ChevronLeft, ChevronDown, ChevronsUpDown, TimerOff, CheckCheck, PlayCircle, Pause, Utensils, Table2 } from 'lucide-react';
```

- [ ] **Step 4: Remove `isDiferido`-specific card color and swipe logic**

In card rendering: delete the `DIFERIDO_CART_COLOR` constant and any `isDiferido ? DIFERIDO_CART_COLOR : RETENIDO_COLOR` branches. All retenido items use `RETENIDO_COLOR` (update the color value to the old cart amber):

```typescript
// Replace:
const RETENIDO_COLOR      = { bg: 'oklch(20% 0.05 252)', border: 'oklch(38% 0.08 252 / 0.35)' };
const DIFERIDO_CART_COLOR = { bg: 'oklch(21% 0.10 65)',  border: 'oklch(50% 0.22 65  / 0.55)' };

// With a single color using the old cart amber:
const RETENIDO_COLOR = { bg: 'oklch(21% 0.10 65)', border: 'oklch(50% 0.22 65 / 0.55)' };
```

- [ ] **Step 5: Remove `isDiferido` swipe branch from `handlePointerUp`**

Delete the branch:
```typescript
} else if (item.isDiferido && delta < 0 && item.sesionItemIdx !== undefined && item.mesaId) {
  // Left swipe on diferido cart item → release to kitchen as a new order
  ...
}
```

Remove `fetchItems` from the `handlePointerUp` useCallback deps if it was only there for the diferido branch (verify first).

- [ ] **Step 6: Remove the Pause icon distinction for cart items in card badge**

The badge for retenido items currently showed `Pause` icon + different label per type. Simplify to a single label using `t('kitchenItemRetenido', lang)` for all retenido items.

- [ ] **Step 7: In "Por mesa" and "Retenidos" card footers, remove ShoppingCart button**

Only the Utensils (blue) button remains per mesa card. Remove:
```typescript
{diferidoMesaId && (
  <button style={{ background: 'oklch(24% 0.12 65)', ... }}>
    <ShoppingCart ... />{t('kitchenLiberarCarrito', lang)}
  </button>
)}
```

And remove `diferidoMesaId` computation from the card render.

- [ ] **Step 8: Lint check**

```bash
pnpm lint
```

---

## Task 9: Update `waiter-banner.tsx` — Remove Deferred Chip

**Files:**
- Modify: `src/components/waiter-banner.tsx`

- [ ] **Step 1: Remove deferred items chip from mesa cards in the table grid**

Search for any JSX that renders a deferred items count or chip (e.g. `items_diferidos`, `deferredCount`, clock icon chip). Delete it.

- [ ] **Step 2: Lint check**

```bash
pnpm lint
```

---

## Task 10: Update Translations

**Files:**
- Modify: `src/lib/translations.ts`

- [ ] **Step 1: Remove these keys from all 5 languages (ES/EN/FR/IT/DE)**

```
kitchenItemCarrito
kitchenLiberarCarrito
```

- [ ] **Step 2: Update `kitchenItemRetenido` in all 5 languages** — remove " pedidos" suffix

```typescript
// ES:
kitchenItemRetenido: "Retenido",
// EN:
kitchenItemRetenido: "Retained",
// FR:
kitchenItemRetenido: "Retenu",
// IT:
kitchenItemRetenido: "Trattenuto",
// DE:
kitchenItemRetenido: "Zurückgestellt",
```

- [ ] **Step 3: Rename/update `kitchenLiberarPedidos` in all 5 languages** — it's now the only release button

```typescript
// ES: kitchenLiberarPedidos → "Liberar"
// EN: → "Release"
// FR: → "Libérer"
// IT: → "Rilascia"
// DE: → "Freigeben"
```

Update any references in kitchen page from `kitchenLiberarPedidos` to the same key (just the value changes, key name stays).

- [ ] **Step 4: Lint check**

```bash
pnpm lint
```

---

## Task 11: Final Verification + Commit

- [ ] **Step 1: Run lint and build**

```bash
pnpm lint && pnpm build
```

Expected: zero errors. Fix any TypeScript issues before proceeding.

- [ ] **Step 2: Manual smoke test**

1. Open the app as a waiter on a mesa
2. Add items — some normal, some marked "Añadir como retenido" via QuantitySelectorDialog
3. Confirm the comanda
4. Verify: both a normal pedido and a "retenido" pedido appear in `/waiter/kitchen`
5. Verify: only one type of "Retenido" card exists (amber color), single release button (Utensils)
6. Release a retenido item — verify it moves to pendiente in kitchen
7. Verify: `/waiter/bar` still works for bebida items

- [ ] **Step 3: Commit everything**

```bash
git add -A
git commit -m "feat(waiter): unify retenido system — remove items_diferidos

- Drop mesa_sesiones.items_diferidos column
- Cart deferred items now create a real pedido with estado=retenido at confirm
- Remove GET/PUT /deferred and release-deferred-item endpoints
- Single amber retenido color + single Utensils release button in kitchen
- Remove isDiferido, sesionItemIdx from domain types and repository"
```
