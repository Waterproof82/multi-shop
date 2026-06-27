# Waiter Delete Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the waiter to remove specific items (with quantity selector) from a mesa's active ticket, propagating deletions to Telegram.

**Architecture:** New repo method fetches pedidos with Telegram context → use case applies greedy deletion across pedidos oldest-first, recalculates totals → Telegram messages edited or deleted → API route (waiter-JWT-protected) orchestrates → both ticket views (mesa-orders-client + waiter grid modal) show `−` buttons with a confirmation modal.

**Tech Stack:** Next.js 15 App Router, Supabase (service_role), Zod, Telegram Bot API, React state for modal.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/core/domain/repositories/IPedidoRepository.ts` | Modify | Add `findBySesionIdWithTelegram` + `updateOrderItems` signatures |
| `src/core/infrastructure/database/supabase-pedido.repository.ts` | Modify | Implement both new methods |
| `src/core/infrastructure/services/telegram.service.ts` | Modify | Export `editTelegramForMesa` |
| `src/core/application/use-cases/mesa/removeSessionItemUseCase.ts` | Create | Business logic: find pedidos, remove units, fire Telegram |
| `src/app/api/waiter/mesas/[mesaId]/orders/items/route.ts` | Create | `DELETE` handler, waiter-JWT protected via proxy |
| `src/components/mesa-orders-client.tsx` | Modify | `−` button per item + quantity-confirm modal (waiter mode only) |
| `src/components/waiter-login-form.tsx` | Modify | Same in ticket modal + x1 quantity display fix |

---

## Task 1 — Repository interface + implementation

**Files:**
- Modify: `src/core/domain/repositories/IPedidoRepository.ts`
- Modify: `src/core/infrastructure/database/supabase-pedido.repository.ts`

### What these methods do

**`findBySesionIdWithTelegram`** — same as `findBySesionId` but adds `telegram_message_id`, `telegram_chat_id` (from empresa), `mesa_numero`, `mesa_nombre`.

**`updateOrderItems`** — replaces `detalle_pedido` and `total` on a single pedido.

- [ ] **Step 1: Add signatures to IPedidoRepository**

Open `src/core/domain/repositories/IPedidoRepository.ts` and add after the `findBySesionId` line:

```typescript
  findBySesionIdWithTelegram(sesionId: string): Promise<Result<{
    id: string;
    numero_pedido: number;
    total: number;
    detalle_pedido: { nombre: string; cantidad: number; precio: number; complementos?: { nombre?: string; name?: string }[] }[];
    telegram_message_id: string | null;
    telegram_chat_id: string | null;
    mesa_numero: number | null;
    mesa_nombre: string | null;
  }[]>>;
  updateOrderItems(pedidoId: string, items: { nombre: string; cantidad: number; precio: number; complementos?: { nombre?: string; name?: string }[] }[], newTotal: number): Promise<Result<void>>;
```

- [ ] **Step 2: Implement `findBySesionIdWithTelegram` in SupabasePedidoRepository**

Add after the `findBySesionId` method (around line 780):

```typescript
  async findBySesionIdWithTelegram(sesionId: string): Promise<Result<{
    id: string;
    numero_pedido: number;
    total: number;
    detalle_pedido: { nombre: string; cantidad: number; precio: number; complementos?: { nombre?: string; name?: string }[] }[];
    telegram_message_id: string | null;
    telegram_chat_id: string | null;
    mesa_numero: number | null;
    mesa_nombre: string | null;
  }[]>> {
    try {
      const { data, error } = await this.supabase
        .from('pedidos')
        .select('id, numero_pedido, total, detalle_pedido, telegram_message_id, mesas(numero, nombre), empresas(telegram_mesa_chat_id, telegram_chat_id)')
        .eq('sesion_id', sesionId)
        .order('created_at', { ascending: true });

      if (error) {
        return { success: false, error: { code: 'DB_ERROR', message: error.message, module: 'repository', method: 'findBySesionIdWithTelegram' } };
      }

      const rows = (data ?? []) as Record<string, unknown>[];
      return {
        success: true,
        data: rows.map(row => {
          const mesaRaw = Array.isArray(row['mesas'])
            ? (row['mesas'][0] as Record<string, unknown> | undefined) ?? null
            : (row['mesas'] as Record<string, unknown> | null);
          const empRaw = Array.isArray(row['empresas'])
            ? (row['empresas'][0] as Record<string, unknown> | undefined) ?? null
            : (row['empresas'] as Record<string, unknown> | null);
          const chatId = (empRaw?.['telegram_mesa_chat_id'] as string | null)
            ?? (empRaw?.['telegram_chat_id'] as string | null)
            ?? null;
          return {
            id: row['id'] as string,
            numero_pedido: row['numero_pedido'] as number,
            total: row['total'] as number,
            detalle_pedido: (row['detalle_pedido'] as { nombre: string; cantidad: number; precio: number; complementos?: { nombre?: string; name?: string }[] }[]) ?? [],
            telegram_message_id: (row['telegram_message_id'] as string | null) ?? null,
            telegram_chat_id: chatId,
            mesa_numero: (mesaRaw?.['numero'] as number | null) ?? null,
            mesa_nombre: (mesaRaw?.['nombre'] as string | null) ?? null,
          };
        }),
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.findBySesionIdWithTelegram', { details: { sesionId } });
      return { success: false, error: appError };
    }
  }
```

- [ ] **Step 3: Implement `updateOrderItems`**

Add right after the previous method:

```typescript
  async updateOrderItems(
    pedidoId: string,
    items: { nombre: string; cantidad: number; precio: number; complementos?: { nombre?: string; name?: string }[] }[],
    newTotal: number
  ): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('pedidos')
        .update({ detalle_pedido: items, total: Math.round(newTotal * 100) / 100 })
        .eq('id', pedidoId);

      if (error) {
        return { success: false, error: { code: 'DB_ERROR', message: error.message, module: 'repository', method: 'updateOrderItems' } };
      }
      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.updateOrderItems', { details: { pedidoId } });
      return { success: false, error: appError };
    }
  }
```

- [ ] **Step 4: Lint check**

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/core/domain/repositories/IPedidoRepository.ts src/core/infrastructure/database/supabase-pedido.repository.ts
git commit -m "feat: add findBySesionIdWithTelegram + updateOrderItems to pedido repo"
```

---

## Task 2 — Export `editTelegramForMesa` from telegram service

**Files:**
- Modify: `src/core/infrastructure/services/telegram.service.ts`

This new exported function rebuilds the mesa order message and edits an existing Telegram message in-place. The kitchen sees the updated item list with the same Anotado/Preparado buttons.

- [ ] **Step 1: Add the export after `sendTelegramForMesa`**

Find `sendTelegramForMesa` (around line 248) and add this new function right after its closing brace:

```typescript
/**
 * Edit an existing mesa order Telegram message with updated items.
 * Used when a waiter removes items from an order that was already sent.
 */
export const editTelegramForMesa = async (
  pedidoId: string,
  numeroPedido: number,
  items: { nombre: string; cantidad: number; complementos?: { nombre?: string; name?: string }[] }[],
  mesaNumero: number,
  mesaNombre: string | null,
  chatId: string,
  messageId: number
): Promise<void> => {
  const text = buildMesaOrderMessage(pedidoId, numeroPedido, items, mesaNumero, mesaNombre);
  const inlineKeyboard = [
    [
      { text: '✅ Anotado', callback_data: `anotado:${pedidoId}` },
      { text: '🍳 Preparado', callback_data: `preparado:${pedidoId}` },
    ],
  ];
  await editMessageText(chatId, messageId, text, inlineKeyboard);
};
```

- [ ] **Step 2: Lint check**

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/infrastructure/services/telegram.service.ts
git commit -m "feat: export editTelegramForMesa for in-place message updates"
```

---

## Task 3 — Use case: removeSessionItemUseCase

**Files:**
- Create: `src/core/application/use-cases/mesa/removeSessionItemUseCase.ts`

**Logic:**
1. Load all pedidos for the session via `findBySesionIdWithTelegram`
2. Iterate oldest-first; for each pedido, remove up to `cantidadRestante` matching units
3. If a pedido becomes empty → delete it + delete its Telegram message
4. If items remain in a pedido → update it + edit its Telegram message
5. Stop once `cantidadAEliminar` units have been removed (prevents over-deletion)

- [ ] **Step 1: Create the use case file**

Create `src/core/application/use-cases/mesa/removeSessionItemUseCase.ts`:

```typescript
import { Result, AppError } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { SupabasePedidoRepository } from '@/core/infrastructure/database/supabase-pedido.repository';
import { logger } from '@/core/infrastructure/logging/logger';
import {
  editTelegramForMesa,
  deleteMessage,
} from '@/core/infrastructure/services/telegram.service';

export interface RemoveSessionItemInput {
  sesionId: string;
  empresaId: string;
  nombre: string;
  precio: number;
  cantidadAEliminar: number;
}

export interface RemoveSessionItemResult {
  totalRemoved: number;
}

export async function removeSessionItemUseCase(
  input: RemoveSessionItemInput
): Promise<Result<RemoveSessionItemResult, AppError>> {
  try {
    const supabase = getSupabaseClient();
    const pedidoRepo = new SupabasePedidoRepository(supabase);

    const ordersResult = await pedidoRepo.findBySesionIdWithTelegram(input.sesionId);
    if (!ordersResult.success) return { success: false, error: ordersResult.error };

    let cantidadRestante = input.cantidadAEliminar;
    let totalRemoved = 0;

    for (const pedido of ordersResult.data) {
      if (cantidadRestante <= 0) break;

      // Find matching items (by nombre + precio)
      const matching = pedido.detalle_pedido.filter(
        i => i.nombre === input.nombre && Math.abs(i.precio - input.precio) < 0.001
      );
      if (matching.length === 0) continue;

      const unitsInPedido = matching.reduce((s, i) => s + i.cantidad, 0);
      const unitsToRemove = Math.min(unitsInPedido, cantidadRestante);

      // Rebuild detalle_pedido: keep non-matching + reduce matching
      let toRemove = unitsToRemove;
      const newItems: typeof pedido.detalle_pedido = [];
      for (const item of pedido.detalle_pedido) {
        const isMatch = item.nombre === input.nombre && Math.abs(item.precio - input.precio) < 0.001;
        if (!isMatch || toRemove === 0) {
          newItems.push(item);
        } else if (item.cantidad > toRemove) {
          newItems.push({ ...item, cantidad: item.cantidad - toRemove });
          toRemove = 0;
        } else {
          toRemove -= item.cantidad;
          // item fully removed — don't push
        }
      }

      const mesaNumero = pedido.mesa_numero ?? 0;
      const mesaNombre = pedido.mesa_nombre ?? null;
      const messageId = pedido.telegram_message_id ? Number(pedido.telegram_message_id) : null;
      const chatId = pedido.telegram_chat_id;

      if (newItems.length === 0) {
        // Delete the entire pedido and its Telegram message
        if (messageId && chatId) {
          await deleteMessage(chatId, messageId);
        }
        await supabase.from('pedidos').delete().eq('id', pedido.id);
      } else {
        // Update items + recalculate total
        const newTotal = newItems.reduce((s, i) => {
          const compExtra = (i.complementos ?? []).reduce((cs, c) => cs + ((c as { precio?: number }).precio ?? 0), 0);
          return s + (i.precio + compExtra) * i.cantidad;
        }, 0);
        const updateResult = await pedidoRepo.updateOrderItems(pedido.id, newItems, newTotal);
        if (!updateResult.success) {
          await logger.logAndReturnError('DB_UPDATE_ERROR', 'Failed to update order items', 'use-case', 'removeSessionItemUseCase', { details: { pedidoId: pedido.id } });
        }
        // Edit Telegram message if one exists
        if (messageId && chatId) {
          await editTelegramForMesa(
            pedido.id,
            pedido.numero_pedido,
            newItems,
            mesaNumero,
            mesaNombre,
            chatId,
            messageId
          );
        }
      }

      cantidadRestante -= unitsToRemove;
      totalRemoved += unitsToRemove;
    }

    return { success: true, data: { totalRemoved } };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'use-case', 'removeSessionItemUseCase', {
      details: { sesionId: input.sesionId },
    });
    return { success: false, error: appError };
  }
}
```

- [ ] **Step 2: Lint check**

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/application/use-cases/mesa/removeSessionItemUseCase.ts
git commit -m "feat: removeSessionItemUseCase — greedy item deletion with Telegram sync"
```

---

## Task 4 — API route

**Files:**
- Create: `src/app/api/waiter/mesas/[mesaId]/orders/items/route.ts`

The proxy already injects `x-empresa-id` and validates the waiter JWT for `/api/waiter/*` routes. The route validates input with Zod, checks the session isn't paid, then delegates to the use case.

- [ ] **Step 1: Verify proxy protection applies**

Confirm `src/core/infrastructure/api/proxy.ts` has a rule that protects `/api/waiter/mesas/*/orders/items`. If it covers `/api/waiter/**` broadly, no change needed. Just check visually — no code change required if already covered.

- [ ] **Step 2: Create the route**

Create `src/app/api/waiter/mesas/[mesaId]/orders/items/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { mesaSesionRepository } from '@/core/infrastructure/database';
import { removeSessionItemUseCase } from '@/core/application/use-cases/mesa/removeSessionItemUseCase';

const mesaIdSchema = z.string().uuid();

const bodySchema = z.object({
  nombre: z.string().min(1).max(200),
  precio: z.number().nonnegative(),
  cantidadAEliminar: z.number().int().min(1).max(100),
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { mesaId } = await params;
  const mesaParsed = mesaIdSchema.safeParse(mesaId);
  if (!mesaParsed.success) {
    return NextResponse.json({ error: 'mesaId inválido' }, { status: 400 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  // Find active session
  const sesionResult = await mesaSesionRepository.findActiveSesionByMesa(mesaParsed.data);
  if (!sesionResult.success) {
    return NextResponse.json({ error: 'Error al buscar sesión activa' }, { status: 500 });
  }
  if (!sesionResult.data) {
    return NextResponse.json({ error: 'Sin sesión activa' }, { status: 404 });
  }

  const sesion = sesionResult.data;

  // Guard: don't allow deletion on paid or in-progress sessions
  if (sesion.sesionPagada || sesion.pagoEnCurso) {
    return NextResponse.json({ error: 'La sesión ya está en proceso de pago' }, { status: 409 });
  }

  const result = await removeSessionItemUseCase({
    sesionId: sesion.id,
    empresaId,
    nombre: parsed.data.nombre,
    precio: parsed.data.precio,
    cantidadAEliminar: parsed.data.cantidadAEliminar,
  });

  if (!result.success) {
    return NextResponse.json({ error: 'Error al eliminar el producto' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, totalRemoved: result.data.totalRemoved });
}
```

- [ ] **Step 3: Lint check**

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/waiter/mesas/[mesaId]/orders/items/route.ts
git commit -m "feat: DELETE /api/waiter/mesas/[mesaId]/orders/items — waiter item removal"
```

---

## Task 5 — mesa-orders-client.tsx: delete button + modal

**Files:**
- Modify: `src/components/mesa-orders-client.tsx`

Only visible when `isWaiterMode === true`. The `−` button opens a modal where the waiter picks how many units to remove (default: 1, max: merged quantity for that item). On confirm, calls the API then refreshes.

- [ ] **Step 1: Add state for the pending delete modal**

Find the component's state declarations (around line 340) and add after `const [manualPaying, setManualPaying] = useState(false);`:

```tsx
const [pendingDelete, setPendingDelete] = useState<{ nombre: string; precio: number; maxCantidad: number } | null>(null);
const [deleteQty, setDeleteQty] = useState(1);
const [deleting, setDeleting] = useState(false);
```

- [ ] **Step 2: Add the `handleDeleteItem` function**

Add this function after `handleManualPay` (or near the end of the hook section, before the `return`):

```tsx
const handleDeleteItem = useCallback(async () => {
  if (!pendingDelete || deleting) return;
  setDeleting(true);
  try {
    await fetch(`/api/waiter/mesas/${encodeURIComponent(mesaId)}/orders/items`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: pendingDelete.nombre,
        precio: pendingDelete.precio,
        cantidadAEliminar: deleteQty,
      }),
    });
    setPendingDelete(null);
    await refresh();
  } finally {
    setDeleting(false);
  }
}, [pendingDelete, deleteQty, deleting, mesaId, refresh]);
```

- [ ] **Step 3: Add `−` button to each item row**

Find the item render block (around line 708). The `<li>` currently ends with `</li>`. Change it so each item has a `−` button visible only to the waiter. Replace the `<li>` block:

```tsx
<li
  key={`${item.nombre}||${item.precio}`}
  className="flex items-center gap-2 text-sm"
  style={{ color: "#1a1612", fontFamily: "monospace" }}
>
  {isWaiterMode && (
    <button
      type="button"
      onClick={() => { setPendingDelete({ nombre: item.nombre, precio: item.precio, maxCantidad: item.cantidad }); setDeleteQty(1); }}
      className="flex items-center justify-center shrink-0 w-5 h-5 rounded-full text-xs font-bold"
      style={{ background: "oklch(35% 0.14 25 / 0.8)", color: "oklch(80% 0.10 25)" }}
      aria-label={`Eliminar ${item.nombre}`}
    >
      −
    </button>
  )}
  <span className="tabular-nums w-4 text-right shrink-0" style={{ color: "#8a7560" }}>
    {item.cantidad}
  </span>
  <span className="flex flex-col flex-1 min-w-0">
    <span>{(language !== "es" && item.translations?.[language]?.name) || item.nombre}</span>
    {item.complementos && item.complementos.length > 0 && (
      <span className="text-xs" style={{ color: "#b0a090" }}>
        + {item.complementos.map(c => c.nombre).join(", ")}
      </span>
    )}
  </span>
  <span className="text-sm font-bold shrink-0 tabular-nums ml-auto" style={{ color: "#8a7560" }}>
    {formatPrice(lineTotal, "EUR", lang)}
  </span>
</li>
```

Note: check the existing `<li>` for the exact `formatPrice` call currently used, and match it.

- [ ] **Step 4: Add the confirmation modal**

Find the closing `</>` of the component's return. Before it, add the delete confirmation modal:

```tsx
{/* Delete item confirmation modal */}
{pendingDelete && (
  <div
    className="fixed inset-0 z-[300] flex items-center justify-center p-6"
    style={{ backgroundColor: "rgba(10, 8, 6, 0.85)" }}
    onClick={() => { if (!deleting) setPendingDelete(null); }}
  >
    <div
      className="w-full max-w-xs rounded-2xl p-5 flex flex-col gap-4"
      style={{ backgroundColor: "#fffcf7", fontFamily: "monospace" }}
      onClick={e => e.stopPropagation()}
    >
      <p className="text-sm font-bold text-center" style={{ color: "#1a1612" }}>
        Eliminar: {pendingDelete.nombre}
      </p>
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => setDeleteQty(q => Math.max(1, q - 1))}
          disabled={deleteQty <= 1}
          className="w-9 h-9 rounded-full text-lg font-bold flex items-center justify-center disabled:opacity-30"
          style={{ background: "oklch(22% 0.03 252 / 0.15)", color: "#1a1612" }}
        >
          −
        </button>
        <span className="text-2xl font-black w-8 text-center tabular-nums" style={{ color: "#1a1612" }}>
          {deleteQty}
        </span>
        <button
          type="button"
          onClick={() => setDeleteQty(q => Math.min(pendingDelete.maxCantidad, q + 1))}
          disabled={deleteQty >= pendingDelete.maxCantidad}
          className="w-9 h-9 rounded-full text-lg font-bold flex items-center justify-center disabled:opacity-30"
          style={{ background: "oklch(22% 0.03 252 / 0.15)", color: "#1a1612" }}
        >
          +
        </button>
      </div>
      <p className="text-xs text-center" style={{ color: "#8a7560" }}>
        de {pendingDelete.maxCantidad} unidades
      </p>
      <div className="flex gap-2 mt-1">
        <button
          type="button"
          onClick={() => setPendingDelete(null)}
          disabled={deleting}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: "oklch(22% 0.03 252 / 0.12)", color: "#8a7560" }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => { void handleDeleteItem(); }}
          disabled={deleting}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold"
          style={{ background: "oklch(35% 0.14 25 / 0.9)", color: "oklch(85% 0.08 25)" }}
        >
          {deleting ? "…" : "Confirmar"}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Lint check**

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/mesa-orders-client.tsx
git commit -m "feat: waiter delete item button + quantity confirm modal in ticket view"
```

---

## Task 6 — waiter-login-form.tsx: grid ticket modal + x1 fix

**Files:**
- Modify: `src/components/waiter-login-form.tsx`

Two changes: (1) items with quantity 1 now show `×1`; (2) same `−` button + modal as Task 5 but inside the grid's ticket modal. The grid ticket modal is always in waiter context (no `isWaiterMode` check needed).

- [ ] **Step 1: Fix x1 quantity display**

Find the line (around 654):

```tsx
{item.cantidad > 1 && <span className="font-bold mr-1" style={{ color: "oklch(65% 0.08 252)" }}>×{item.cantidad}</span>}
```

Replace with:

```tsx
<span className="font-bold mr-1" style={{ color: "oklch(65% 0.08 252)" }}>×{item.cantidad}</span>
```

- [ ] **Step 2: Add state for pending delete to the outer component**

Find the state declarations in the main waiter component (the one that renders `ticketMesa`). Add near the other ticket-related state:

```tsx
const [ticketPendingDelete, setTicketPendingDelete] = useState<{ mesaId: string; nombre: string; precio: number; maxCantidad: number } | null>(null);
const [ticketDeleteQty, setTicketDeleteQty] = useState(1);
const [ticketDeleting, setTicketDeleting] = useState(false);
```

- [ ] **Step 3: Add `handleTicketDeleteItem` function**

Add before the component's `return`:

```tsx
const handleTicketDeleteItem = useCallback(async () => {
  if (!ticketPendingDelete || ticketDeleting) return;
  setTicketDeleting(true);
  try {
    await fetch(`/api/waiter/mesas/${encodeURIComponent(ticketPendingDelete.mesaId)}/orders/items`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: ticketPendingDelete.nombre,
        precio: ticketPendingDelete.precio,
        cantidadAEliminar: ticketDeleteQty,
      }),
    });
    setTicketPendingDelete(null);
    // Reload ticket orders
    if (ticketMesa) {
      setTicketLoading(true);
      const res = await fetch(`/api/waiter/mesas/${encodeURIComponent(ticketPendingDelete.mesaId)}/orders`);
      if (res.ok) setTicketOrders((await res.json() as { orders: TicketOrder[] }).orders);
      setTicketLoading(false);
    }
  } finally {
    setTicketDeleting(false);
  }
}, [ticketPendingDelete, ticketDeleteQty, ticketDeleting, ticketMesa]);
```

Note: check that `TicketOrder` matches the existing type used for `ticketOrders` state in the component. If the state uses a different name, use that.

- [ ] **Step 4: Add `−` button to each item row in the ticket modal**

Find the item row block in the ticket modal (around line 651):

```tsx
<div key={`${item.nombre}||${item.precio}`} className="flex items-baseline justify-between gap-3 py-2" style={{ borderBottom: "1px solid oklch(22% 0.03 252 / 0.6)" }}>
```

Replace the entire `<div>` item block with:

```tsx
<div key={`${item.nombre}||${item.precio}`} className="flex items-center gap-2 py-2" style={{ borderBottom: "1px solid oklch(22% 0.03 252 / 0.6)" }}>
  <button
    type="button"
    onClick={() => {
      setTicketPendingDelete({ mesaId: ticketMesa!.id, nombre: item.nombre, precio: item.precio, maxCantidad: item.cantidad });
      setTicketDeleteQty(1);
    }}
    className="flex items-center justify-center shrink-0 w-5 h-5 rounded-full text-xs font-bold"
    style={{ background: "oklch(35% 0.14 25 / 0.8)", color: "oklch(80% 0.10 25)" }}
    aria-label={`Eliminar ${item.nombre}`}
  >
    −
  </button>
  <div className="flex flex-col min-w-0 flex-1">
    <span className="text-sm font-medium leading-snug" style={{ color: "oklch(82% 0.04 252)" }}>
      <span className="font-bold mr-1" style={{ color: "oklch(65% 0.08 252)" }}>×{item.cantidad}</span>
      {item.nombre}
    </span>
    {item.complementos && item.complementos.length > 0 && (
      <span className="text-[10px] mt-0.5" style={{ color: "oklch(48% 0.05 252)" }}>
        {item.complementos.map((c) => c.nombre).join(", ")}
      </span>
    )}
  </div>
  <span className="text-sm font-bold shrink-0 tabular-nums" style={{ color: "oklch(72% 0.08 252)" }}>
    {formatPrice(lineTotal)}
  </span>
</div>
```

Note: `ticketMesa` carries `id`, `numero`, `nombre`. Confirm `ticketMesa` has `.id` — if the state uses a different shape (e.g. only `numero`), also store the mesa `id` when `setTicketMesa` is called (find where `onViewTicket` calls `setTicketMesa` and update the stored object to include `id`).

- [ ] **Step 5: Add the confirmation modal for the grid ticket**

After the ticket modal's closing `</div>` (around line 681), add:

```tsx
{/* Delete item confirmation modal — grid ticket */}
{ticketPendingDelete && (
  <div
    className="fixed inset-0 z-[100] flex items-center justify-center p-6"
    style={{ background: "oklch(0% 0 0 / 0.75)" }}
    onClick={() => { if (!ticketDeleting) setTicketPendingDelete(null); }}
  >
    <div
      className="w-full max-w-xs rounded-2xl p-5 flex flex-col gap-4"
      style={{ background: "oklch(14% 0.02 252)", border: "1px solid oklch(28% 0.04 252 / 0.8)" }}
      onClick={e => e.stopPropagation()}
    >
      <p className="text-sm font-bold text-center" style={{ color: "oklch(85% 0.04 252)" }}>
        Eliminar: {ticketPendingDelete.nombre}
      </p>
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => setTicketDeleteQty(q => Math.max(1, q - 1))}
          disabled={ticketDeleteQty <= 1}
          className="w-9 h-9 rounded-full text-lg font-bold flex items-center justify-center disabled:opacity-30"
          style={{ background: "oklch(22% 0.04 252 / 0.6)", color: "oklch(82% 0.04 252)" }}
        >
          −
        </button>
        <span className="text-2xl font-black w-8 text-center tabular-nums" style={{ color: "oklch(88% 0.04 252)" }}>
          {ticketDeleteQty}
        </span>
        <button
          type="button"
          onClick={() => setTicketDeleteQty(q => Math.min(ticketPendingDelete.maxCantidad, q + 1))}
          disabled={ticketDeleteQty >= ticketPendingDelete.maxCantidad}
          className="w-9 h-9 rounded-full text-lg font-bold flex items-center justify-center disabled:opacity-30"
          style={{ background: "oklch(22% 0.04 252 / 0.6)", color: "oklch(82% 0.04 252)" }}
        >
          +
        </button>
      </div>
      <p className="text-xs text-center" style={{ color: "oklch(50% 0.05 252)" }}>
        de {ticketPendingDelete.maxCantidad} unidades
      </p>
      <div className="flex gap-2 mt-1">
        <button
          type="button"
          onClick={() => setTicketPendingDelete(null)}
          disabled={ticketDeleting}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: "oklch(22% 0.04 252 / 0.5)", color: "oklch(60% 0.06 252)" }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => { void handleTicketDeleteItem(); }}
          disabled={ticketDeleting}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold"
          style={{ background: "oklch(35% 0.14 25 / 0.9)", color: "oklch(85% 0.08 25)" }}
        >
          {ticketDeleting ? "…" : "Confirmar"}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 6: Lint check**

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/waiter-login-form.tsx
git commit -m "feat: waiter grid ticket — delete button + quantity modal + show x1 quantity"
```

---

## Self-Review

**Spec coverage:**
- ✅ Delete items from ticket (mesa-orders-client) — Task 5
- ✅ Delete items from grid ticket modal (waiter-login-form) — Task 6
- ✅ Telegram sync (edit if items remain, delete if empty) — Tasks 2 + 3
- ✅ Quantity selector modal with confirm — Tasks 5 + 6
- ✅ x1 display fix — Task 6 Step 1
- ✅ Waiter-only visibility — `isWaiterMode` check in Task 5; grid modal is always waiter context

**Potential gotcha — ticketMesa.id:**
The current `ticketMesa` state in `waiter-login-form.tsx` may only store `{ numero, nombre }` (check `setTicketMesa` calls). Task 6 Step 4 requires `ticketMesa.id` for the API call. If the state object doesn't include `id`, update the `setTicketMesa` call sites to also store the mesa `id`, and update the state type accordingly.

**Potential gotcha — `SupabasePedidoRepository` constructor:**
Task 3 instantiates `new SupabasePedidoRepository(supabase)`. Verify the constructor signature matches (check top of `supabase-pedido.repository.ts`). If it's a singleton exported from `@/core/infrastructure/database`, use `pedidoRepository` from that import instead.
