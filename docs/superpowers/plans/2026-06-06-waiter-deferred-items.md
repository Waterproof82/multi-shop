# Waiter Deferred Items — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow waiters to mark cart items as "send later", persist them to the active mesa session in Supabase, display them in the grid, and pre-load them into the cart when any waiter re-enters that mesa.

**Architecture:** Single JSONB column `items_diferidos` on `mesa_sesiones` stores the deferred array. Two new waiter API endpoints (GET/PUT) manage it. CartItem gains `deferred`/`fromPending` flags; cart-drawer handles splitting on confirm and pre-loading on mesa entry.

**Tech Stack:** Next.js 15, Supabase (service_role), Zod, TypeScript strict, Tailwind v4

---

## File Map

| File | Action | What changes |
|---|---|---|
| `supabase/migrations/20260606000002_mesa_items_diferidos.sql` | Create | Add column + update RPC |
| `src/core/domain/repositories/IMesaRepository.ts` | Modify | Add `itemsDiferidos` to `MesaWithSession` |
| `src/core/domain/repositories/IMesaSesionRepository.ts` | Modify | Add `DeferredItem` type + two new repo methods |
| `src/core/infrastructure/database/supabase-mesa-sesion.repository.ts` | Modify | Implement `getDeferredItems` / `setDeferredItems` |
| `src/core/infrastructure/database/supabase-mesa.repository.ts` | Modify | Include `items_diferidos` from RPC row |
| `src/core/application/use-cases/mesa-sesion.use-case.ts` | Modify | Add `getDeferredItems` / `setDeferredItems` methods |
| `src/app/api/waiter/mesas/[mesaId]/deferred/route.ts` | Create | GET + PUT handlers |
| `src/lib/cart-context.tsx` | Modify | `deferred`/`fromPending` flags + `toggleDeferred`/`loadDeferredItems` |
| `src/components/cart-drawer.tsx` | Modify | Defer toggle UI + split confirm logic + pre-load on mesa entry |
| `src/components/waiter-login-form.tsx` | Modify | `MesaCard` shows deferred items; pre-load on mesa select |

---

## Task 1: Migration — add column and update get_mesas_with_sessions RPC

**Files:**
- Create: `supabase/migrations/20260606000002_mesa_items_diferidos.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Add items_diferidos column to mesa_sesiones
ALTER TABLE public.mesa_sesiones
  ADD COLUMN IF NOT EXISTS items_diferidos JSONB NOT NULL DEFAULT '[]';

-- Update get_mesas_with_sessions RPC to include items_diferidos.
-- This replaces the existing RPC (which was applied directly to the DB).
-- The function returns one row per mesa, LEFT JOINed to its active session.
CREATE OR REPLACE FUNCTION get_mesas_with_sessions(p_empresa_id UUID)
RETURNS TABLE (
  id             UUID,
  empresa_id     UUID,
  numero         INT,
  nombre         TEXT,
  sesion_id      UUID,
  sesion_pagada  BOOLEAN,
  pago_en_curso  BOOLEAN,
  session_total  NUMERIC,
  items_diferidos JSONB
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    m.id,
    m.empresa_id,
    m.numero,
    m.nombre,
    ms.id                                         AS sesion_id,
    COALESCE(ms.sesion_pagada,   false)           AS sesion_pagada,
    COALESCE(ms.pago_en_curso,   false)           AS pago_en_curso,
    COALESCE(ms.pending_total,   0)               AS session_total,
    COALESCE(ms.items_diferidos, '[]'::jsonb)     AS items_diferidos
  FROM       mesas        m
  LEFT JOIN  mesa_sesiones ms ON ms.id = m.sesion_id
  WHERE m.empresa_id = p_empresa_id
  ORDER BY m.numero ASC;
$$;

GRANT EXECUTE ON FUNCTION get_mesas_with_sessions(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_mesas_with_sessions(UUID) TO authenticated;
```

- [ ] **Step 2: Apply migration to Supabase**

Open the Supabase dashboard → SQL Editor → paste the file contents → Run.

Verify in Table Editor that `mesa_sesiones` now has the `items_diferidos` column (type `jsonb`, default `[]`).

---

## Task 2: Domain types

**Files:**
- Modify: `src/core/domain/repositories/IMesaSesionRepository.ts`
- Modify: `src/core/domain/repositories/IMesaRepository.ts`

- [ ] **Step 1: Add `DeferredItem` type and new repo methods to `IMesaSesionRepository.ts`**

Replace the full file content:

```typescript
import { Result } from '@/core/domain/entities/types';

export interface PendingItem {
  nombre: string;
  precio: number;
  cantidad: number;
  translations?: Record<string, { name?: string } | undefined>;
}

export interface DeferredItem {
  itemId: string;
  itemName: string;
  price: number;
  quantity: number;
  translations?: Record<string, { name: string }>;
  selectedComplements?: Array<{ id: string; name: string; price: number }>;
}

export interface MesaSesion {
  id: string;
  mesaId: string;
  empresaId: string;
  total: number;
  pendingItems: PendingItem[];
  pendingTotal: number;
  cerradaAt: string | null;
  createdAt: string;
  sesionPagada: boolean;
  pagoEnCurso: boolean;
}

export interface IMesaSesionRepository {
  openSesion(mesaId: string, empresaId: string): Promise<Result<string>>;
  closeSesion(sesionId: string): Promise<Result<void>>;
  findActiveSesionByMesa(mesaId: string): Promise<Result<MesaSesion | null>>;
  findSesionWithOrders(sesionId: string): Promise<Result<MesaSesion | null>>;
  appendItems(sesionId: string, items: PendingItem[], itemsTotal: number): Promise<Result<void>>;
  getDeferredItems(mesaId: string): Promise<Result<DeferredItem[]>>;
  setDeferredItems(mesaId: string, items: DeferredItem[]): Promise<Result<void>>;
}
```

- [ ] **Step 2: Add `itemsDiferidos` to `MesaWithSession` in `IMesaRepository.ts`**

Replace the `MesaWithSession` interface:

```typescript
import { Result } from '@/core/domain/entities/types';
import type { DeferredItem } from './IMesaSesionRepository';

export interface Mesa {
  id: string;
  empresaId: string;
  numero: number;
  nombre: string | null;
  createdAt: string;
}

export interface MesaWithSession {
  id: string;
  empresaId: string;
  numero: number;
  nombre: string | null;
  sesionId: string | null;
  activeOrderCount: number;
  sessionTotal: number;
  sesionPagada: boolean;
  pagoEnCurso: boolean;
  itemsDiferidos: DeferredItem[];
}

export interface IMesaRepository {
  findById(mesaId: string): Promise<Result<Mesa | null>>;
  findByEmpresa(empresaId: string): Promise<Result<Mesa[]>>;
  create(empresaId: string, numero: number, nombre?: string): Promise<Result<Mesa>>;
  update(mesaId: string, empresaId: string, numero: number, nombre?: string): Promise<Result<Mesa>>;
  delete(mesaId: string, empresaId: string): Promise<Result<void>>;
  findAllWithSession(empresaId: string): Promise<Result<MesaWithSession[]>>;
}
```

- [ ] **Step 3: Verify — `pnpm lint`**

Expected: TypeScript errors about missing `itemsDiferidos` in the repository implementations. That is correct — we fix them in the next task.

---

## Task 3: Repository implementations

**Files:**
- Modify: `src/core/infrastructure/database/supabase-mesa-sesion.repository.ts`
- Modify: `src/core/infrastructure/database/supabase-mesa.repository.ts`

- [ ] **Step 1: Add `getDeferredItems` and `setDeferredItems` to `supabase-mesa-sesion.repository.ts`**

Add these two methods inside the class, after `findSesionWithOrders`. Also add `DeferredItem` to the import:

```typescript
// At top of file, update import:
import { IMesaSesionRepository, MesaSesion, PendingItem, DeferredItem } from '@/core/domain/repositories/IMesaSesionRepository';
```

Add these methods to the class body:

```typescript
  async getDeferredItems(mesaId: string): Promise<Result<DeferredItem[]>> {
    try {
      const { data, error } = await this.supabase
        .from('mesa_sesiones')
        .select('items_diferidos')
        .eq('mesa_id', mesaId)
        .is('cerrada_at', null)
        .maybeSingle();

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabaseMesaSesionRepository.getDeferredItems',
          { details: { code: error.code, mesaId } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener ítems diferidos', module: 'repository', method: 'getDeferredItems' } };
      }

      if (!data) return { success: true, data: [] };

      const row = data as Record<string, unknown>;
      return { success: true, data: (row['items_diferidos'] as DeferredItem[]) ?? [] };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaSesionRepository.getDeferredItems', { details: { mesaId } });
      return { success: false, error: appError };
    }
  }

  async setDeferredItems(mesaId: string, items: DeferredItem[]): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('mesa_sesiones')
        .update({ items_diferidos: items })
        .eq('mesa_id', mesaId)
        .is('cerrada_at', null);

      if (error) {
        await logger.logAndReturnError(
          'DB_UPDATE_ERROR',
          error.message,
          'repository',
          'SupabaseMesaSesionRepository.setDeferredItems',
          { details: { code: error.code, mesaId } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al guardar ítems diferidos', module: 'repository', method: 'setDeferredItems' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMesaSesionRepository.setDeferredItems', { details: { mesaId } });
      return { success: false, error: appError };
    }
  }
```

- [ ] **Step 2: Update `supabase-mesa.repository.ts` — include `items_diferidos` from RPC**

In `findAllWithSession`, update the `RpcRow` type and the mapping:

```typescript
// Replace the RpcRow type definition inside findAllWithSession:
type RpcRow = {
  id: string; empresa_id: string; numero: number; nombre: string | null;
  sesion_id: string | null; sesion_pagada: boolean; pago_en_curso: boolean;
  session_total: number; items_diferidos: unknown[] | null;
};
```

Also add the import at the top of the file:

```typescript
import type { DeferredItem } from '@/core/domain/repositories/IMesaSesionRepository';
```

Update the `data` mapping in `findAllWithSession` (the `return { success: true, data: rows.map(...) }` block):

```typescript
      return {
        success: true,
        data: rows.map(row => ({
          id: row.id,
          empresaId: row.empresa_id,
          numero: row.numero,
          nombre: row.nombre ?? null,
          sesionId: row.sesion_id ?? null,
          activeOrderCount: row.sesion_id ? (countBySesion[row.sesion_id] ?? 0) : 0,
          sessionTotal: Number(row.session_total),
          sesionPagada: row.sesion_pagada ?? false,
          pagoEnCurso: row.pago_en_curso ?? false,
          itemsDiferidos: (row.items_diferidos ?? []) as DeferredItem[],
        })),
      };
```

- [ ] **Step 3: Verify — `pnpm lint`**

Expected: no errors related to repository implementations.

---

## Task 4: Use case — add deferred methods

**Files:**
- Modify: `src/core/application/use-cases/mesa-sesion.use-case.ts`

- [ ] **Step 1: Add `getDeferredItems` and `setDeferredItems` to `MesaSesionUseCase`**

Add the import at the top:

```typescript
import { IMesaSesionRepository, MesaSesion, DeferredItem } from '@/core/domain/repositories/IMesaSesionRepository';
```

Add these methods to the class body after `getMesasWithSessions`:

```typescript
  async getDeferredItems(mesaId: string): Promise<Result<DeferredItem[]>> {
    try {
      const result = await this.mesaSesionRepo.getDeferredItems(mesaId);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'MesaSesionUseCase.getDeferredItems' } };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'MesaSesionUseCase.getDeferredItems', { details: { mesaId } });
      return { success: false, error: appError };
    }
  }

  async setDeferredItems(mesaId: string, items: DeferredItem[]): Promise<Result<void>> {
    try {
      const result = await this.mesaSesionRepo.setDeferredItems(mesaId, items);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'MesaSesionUseCase.setDeferredItems' } };
      }
      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'MesaSesionUseCase.setDeferredItems', { details: { mesaId } });
      return { success: false, error: appError };
    }
  }
```

- [ ] **Step 2: Verify — `pnpm lint`**

Expected: no errors.

---

## Task 5: API endpoint — GET + PUT /api/waiter/mesas/[mesaId]/deferred

**Files:**
- Create: `src/app/api/waiter/mesas/[mesaId]/deferred/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { mesaSesionUseCase } from '@/core/infrastructure/database';
import type { DeferredItem } from '@/core/domain/repositories/IMesaSesionRepository';

const mesaIdSchema = z.string().uuid('El mesaId debe ser un UUID válido');

const deferredItemSchema = z.object({
  itemId: z.string().max(100),
  itemName: z.string().max(200),
  price: z.number().min(0),
  quantity: z.number().int().min(1),
  translations: z.record(z.object({ name: z.string().max(200) })).optional(),
  selectedComplements: z.array(z.object({
    id: z.string().max(100),
    name: z.string().max(200),
    price: z.number().min(0),
  })).optional(),
});

const putBodySchema = z.object({
  items: z.array(deferredItemSchema).max(50),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { mesaId } = await params;
  const parsed = mesaIdSchema.safeParse(mesaId);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const result = await mesaSesionUseCase.getDeferredItems(parsed.data);
  if (!result.success) {
    return NextResponse.json({ error: 'Error al obtener ítems diferidos' }, { status: 500 });
  }

  return NextResponse.json({ items: result.data });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { mesaId } = await params;
  const parsedId = mesaIdSchema.safeParse(mesaId);
  if (!parsedId.success) {
    return NextResponse.json({ error: parsedId.error.errors[0].message }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const parsedBody = putBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.errors[0].message }, { status: 400 });
  }

  const result = await mesaSesionUseCase.setDeferredItems(parsedId.data, parsedBody.data.items as DeferredItem[]);
  if (!result.success) {
    return NextResponse.json({ error: 'Error al guardar ítems diferidos' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify — `pnpm lint`**

Expected: no errors.

---

## Task 6: Cart context — deferred flags and actions

**Files:**
- Modify: `src/lib/cart-context.tsx`

- [ ] **Step 1: Add `deferred` and `fromPending` to `CartItem`**

Replace the `CartItem` interface:

```typescript
export interface CartItem {
  item: MenuItemVM
  quantity: number
  selectedComplements?: Complement[]
  justAdded?: boolean
  justRemoved?: boolean
  deferred?: boolean      // waiter marked this item to send later
  fromPending?: boolean   // pre-loaded from DB (will be released on next confirm)
}
```

- [ ] **Step 2: Add `toggleDeferred` and `loadDeferredItems` to the context type**

Replace the `CartContextType` interface:

```typescript
interface CartContextType {
  items: CartItem[]
  addItem: (item: MenuItemVM, quantity?: number, selectedComplements?: Complement[]) => void
  removeItem: (itemKey: string) => void
  updateQuantity: (itemKey: string, quantity: number) => void
  clearCart: () => void
  clearNonDeferred: () => void
  toggleDeferred: (itemKey: string) => void
  loadDeferredItems: (items: Array<{
    itemId: string;
    itemName: string;
    price: number;
    quantity: number;
    translations?: Record<string, { name: string }>;
    selectedComplements?: Array<{ id: string; name: string; price: number }>;
  }>) => void
  totalItems: number
  totalPrice: number
  isCartOpen: boolean
  openCart: () => void
  closeCart: () => void
  lastAddedItem: AddedItemInfo | null
}
```

- [ ] **Step 3: Implement the new actions inside `CartProvider`**

Add after the `clearCart` callback:

```typescript
  const clearNonDeferred = useCallback(() => {
    setLastAddedItem(null);
    // Keep only items explicitly marked deferred. fromPending items were included
    // in the order (toOrder), so they should be cleared too.
    setItems(prev => prev.filter(ci => ci.deferred));
  }, [])

  const toggleDeferred = useCallback((itemKey: string) => {
    setItems(prev =>
      prev.map(ci =>
        getItemKey(ci.item, ci.selectedComplements) === itemKey
          ? { ...ci, deferred: !ci.deferred }
          : ci
      )
    );
  }, [])

  const loadDeferredItems = useCallback((deferredItems: Array<{
    itemId: string;
    itemName: string;
    price: number;
    quantity: number;
    translations?: Record<string, { name: string }>;
    selectedComplements?: Array<{ id: string; name: string; price: number }>;
  }>) => {
    if (deferredItems.length === 0) return;
    setItems(prev => {
      const toAdd = deferredItems
        .filter(d => !prev.some(ci => ci.item.id === d.itemId && ci.fromPending))
        .map(d => ({
          item: {
            id: d.itemId,
            name: d.itemName,
            price: d.price,
            translations: d.translations,
          } as MenuItemVM,
          quantity: d.quantity,
          selectedComplements: d.selectedComplements?.map(c => ({
            id: c.id,
            name: c.name,
            price: c.price,
          })),
          fromPending: true as const,
        }));
      return [...prev, ...toAdd];
    });
  }, [])
```

- [ ] **Step 4: Add the new actions to `contextValue`**

In the `useMemo` for `contextValue`, add `clearNonDeferred`, `toggleDeferred`, and `loadDeferredItems`:

```typescript
  const contextValue = useMemo(() => ({
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    clearNonDeferred,
    toggleDeferred,
    loadDeferredItems,
    totalItems,
    totalPrice,
    isCartOpen,
    openCart,
    closeCart,
    lastAddedItem,
  }), [items, addItem, removeItem, updateQuantity, clearCart, clearNonDeferred, toggleDeferred, loadDeferredItems, totalItems, totalPrice, isCartOpen, openCart, closeCart, lastAddedItem]);
```

- [ ] **Step 5: Verify — `pnpm lint`**

Expected: no errors (TypeScript will error in cart-drawer until Task 7 is done — that is expected).

---

## Task 7: Cart drawer — defer toggle UI, confirm logic, pre-load

**Files:**
- Modify: `src/components/cart-drawer.tsx`

- [ ] **Step 1: Import `Clock` icon and destructure new cart actions**

At the top of the file, add `Clock` to the lucide import:

```typescript
import { Minus, Plus, Trash2, ShoppingBag, User, Phone, Mail, Check, Gift, UtensilsCrossed, Clock } from "lucide-react"
```

In the `useCart()` destructure inside `CartDrawer`, add the new actions:

```typescript
  const {
    items,
    updateQuantity,
    removeItem,
    clearCart,
    clearNonDeferred,
    toggleDeferred,
    loadDeferredItems,
    totalPrice,
    isCartOpen,
    closeCart
  } = useCart()
```

- [ ] **Step 2: Add deferred pre-load on mesa entry**

Add a `deferredLoadedRef` ref and a `useEffect` that fires once when `mesaInfo` is resolved. Place it after the existing `mesaToken/mesaInfo` useEffect (around line 150):

```typescript
  // Keyed to mesaId so a mesa-switch via dropdown also triggers a reload
  const deferredLoadedRef = useRef<string | null>(null);

  useEffect(() => {
    const mesaId = mesaInfo?.id ?? mesaToken;
    if (!mesaId || deferredLoadedRef.current === mesaId) return;
    deferredLoadedRef.current = mesaId;

    fetch(`/api/waiter/mesas/${encodeURIComponent(mesaId)}/deferred`)
      .then(async r => {
        if (!r.ok) return;
        const data = await r.json() as { items: Array<{ itemId: string; itemName: string; price: number; quantity: number; translations?: Record<string, { name: string }>; selectedComplements?: Array<{ id: string; name: string; price: number }> }> };
        if (data.items?.length > 0) {
          loadDeferredItems(data.items);
        }
      })
      .catch(() => null);
  }, [mesaInfo, mesaToken, loadDeferredItems]);
```

Also add `useRef` to the React import at the top:

```typescript
import { useState, useCallback, useEffect, useRef } from "react"
```

- [ ] **Step 3: Update mesa-mode confirm logic to split deferred/non-deferred**

Inside `handleConfirmOrder`, in the `if (mesaToken)` branch, replace the items mapping for the POST body and add the deferred save. The current `items.map(...)` becomes `toOrder`, and deferred items are saved separately.

Replace the section from `setSending(true)` to the closing `return;` of the mesa branch with:

```typescript
      const toOrder = items.filter(ci => !ci.deferred);
      const toDefer = items.filter(ci => ci.deferred);

      if (toOrder.length === 0) return; // guard: button should already be disabled

      setSending(true);
      try {
        const res = await fetch('/api/pedidos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
          body: JSON.stringify({
            tipo: 'mesa',
            mesa_id: mesaId,
            items: toOrder.map((ci: CartItem) => ({
              item: { id: ci.item.id, name: ci.item.name, price: ci.item.price, translations: ci.item.translations },
              quantity: ci.quantity,
              selectedComplements: ci.selectedComplements?.map(c => ({ id: c.id, name: c.name, price: c.price })),
            })),
            idioma: language,
          }),
        });
        if (res.status === 401) {
          const body = await res.json() as { code?: string };
          closeCart();
          if (body.code === 'SESSION_CLOSED') {
            setQrGateState('SESSION_CLOSED');
          } else {
            setQrGateState('TOKEN_EXPIRED');
          }
          return;
        }
        const data = await res.json();
        if (res.ok && data.trackingToken) {
          addTrackingToken(data.trackingToken);
          try {
            const storageKey = `mesa_orders_${mesaId}`;
            const existing = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown[];
            existing.push({
              pedidoId: data.pedidoId ?? data.id,
              trackingToken: data.trackingToken,
              items: toOrder.map((ci: CartItem) => ({
                name: ci.item.name,
                quantity: ci.quantity,
                price: ci.item.price,
              })),
              total: toOrder.reduce((s, ci) => {
                const compPrice = ci.selectedComplements?.reduce((sc, c) => sc + c.price, 0) ?? 0;
                return s + (ci.item.price + compPrice) * ci.quantity;
              }, 0),
              timestamp: Date.now(),
            });
            localStorage.setItem(storageKey, JSON.stringify(existing));
          } catch {
            // localStorage may be unavailable
          }

          // Save deferred items to DB (empty array clears if none)
          await fetch(`/api/waiter/mesas/${encodeURIComponent(mesaId)}/deferred`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: toDefer.map(ci => ({
                itemId: ci.item.id,
                itemName: ci.item.name,
                price: ci.item.price,
                quantity: ci.quantity,
                translations: ci.item.translations,
                selectedComplements: ci.selectedComplements,
              })),
            }),
          }).catch(() => null);

          clearNonDeferred();
          closeCart();
          setShowOrderToast(true);
          setTimeout(() => setShowOrderToast(false), 2000);
          window.dispatchEvent(new CustomEvent('mesa-order-placed'));
        } else {
          setErrors({ general: data.error || t('validationOrderError', language) });
        }
      } catch {
        setErrors({ general: t('connectionError', language) });
      } finally {
        setSending(false);
      }
      return;
```

- [ ] **Step 4: Disable confirm button when all items are deferred**

Find the confirm button (it calls `handleConfirmOrder` and has `disabled={sending}`). Add to its `disabled` condition:

```typescript
const allDeferred = items.length > 0 && items.every(ci => ci.deferred);
```

Define this constant near the top of the component body, after `const { language } = useLanguage()`.

Then on the confirm button add `|| allDeferred` to the disabled prop, and conditionally change the label. Example — find the button and update:

```typescript
disabled={sending || allDeferred}
```

And wrap the button label text so it shows a hint when all are deferred:

```typescript
{sending ? t('sending', language) : allDeferred ? 'Todos los ítems están diferidos' : t('confirmOrder', language)}
```

(Find all three confirm button occurrences in cart-drawer.tsx and apply the same change to each.)

- [ ] **Step 5: Add defer toggle to each cart item row in mesa mode**

Find the JSX that renders each cart item (look for `{items.map((cartItem)` or similar). Inside the item row, in mesa mode only, add a clock toggle button after the quantity controls.

In the section where item controls are rendered, add:

```typescript
{mesaToken && !cartItem.fromPending && (
  <button
    type="button"
    onClick={() => toggleDeferred(getItemKey(cartItem.item, cartItem.selectedComplements))}
    className="flex items-center justify-center rounded-md p-1.5 transition-colors duration-150"
    style={{
      backgroundColor: cartItem.deferred ? 'oklch(28% 0.08 62 / 0.8)' : 'transparent',
      color: cartItem.deferred ? 'oklch(75% 0.18 62)' : 'oklch(45% 0.04 252)',
    }}
    aria-label={cartItem.deferred ? 'Quitar diferido' : 'Diferir ítem'}
    title={cartItem.deferred ? 'Quitar diferido' : 'Diferir para más tarde'}
  >
    <Clock className="w-3.5 h-3.5" />
  </button>
)}
```

- [ ] **Step 6: Add "pendiente" badge to `fromPending` items**

In the item name/label area of the cart item row, add after the item name:

```typescript
{cartItem.fromPending && (
  <span
    className="ml-1.5 inline-flex items-center rounded px-1 py-0.5 text-[9px] font-semibold tracking-wide uppercase"
    style={{ backgroundColor: 'oklch(22% 0.04 255 / 0.7)', color: 'oklch(65% 0.14 255)' }}
  >
    pendiente
  </span>
)}
```

- [ ] **Step 7: Verify — `pnpm lint && pnpm build`**

Expected: clean build.

---

## Task 8: Grid — show deferred items in MesaCard

**Files:**
- Modify: `src/components/waiter-login-form.tsx`

- [ ] **Step 1: Import `Clock` icon**

Add `Clock` to the lucide import at the top of the file:

```typescript
import { UtensilsCrossed, KeyRound, Clock } from "lucide-react";
```

- [ ] **Step 2: Add deferred items display to `MesaCard`**

Inside `MesaCard`, the `mesa: MesaWithSession` prop already has `itemsDiferidos`. Add a deferred section after the `MesaFooter` block.

Replace the closing div of the footer section:

```typescript
      <div className="w-full mt-2 min-h-[24px] flex flex-col items-center gap-0.5">
        <MesaFooter
          isPaid={isPaid}
          isPaymentInProgress={isPaymentInProgress}
          isOpen={isOpen}
          sessionTotal={mesa.sessionTotal}
          activeOrderCount={mesa.activeOrderCount}
        />
        {mesa.itemsDiferidos.length > 0 && (
          <div className="w-full flex items-start gap-1 mt-1">
            <Clock className="w-2.5 h-2.5 shrink-0 mt-0.5" style={{ color: "oklch(65% 0.14 62)" }} />
            <span
              className="text-[9px] leading-tight break-words"
              style={{ color: "oklch(65% 0.14 62)" }}
            >
              {mesa.itemsDiferidos
                .map(d => `${d.itemName} x${d.quantity}`)
                .join(', ')}
            </span>
          </div>
        )}
      </div>
```

- [ ] **Step 3: Verify — `pnpm lint && pnpm build`**

Expected: clean build. If TypeScript complains about `itemsDiferidos` being missing on older `MesaWithSession` usages, it means a call site wasn't updated — trace it and add `itemsDiferidos: []` as default.

---

## Task 9: Final verification

- [ ] **Step 1: Run full lint + build**

```bash
pnpm lint && pnpm build
```

Expected: zero errors, zero warnings on project files.

- [ ] **Step 2: Manual smoke test**

1. Log in as waiter, enter a mesa.
2. Add 3 items to cart. Mark one with the clock icon (⏱).
3. Confirm comanda. Verify only 2 items were submitted (check Supabase pedidos table).
4. Verify the deferred item stays in cart.
5. In Supabase Table Editor, verify `mesa_sesiones.items_diferidos` has the deferred item.
6. Open grid at `/waiter` — verify the mesa card shows the deferred item name with clock icon.
7. Open a new browser tab (simulating a second waiter), log in as waiter, enter same mesa.
8. Open cart — verify the deferred item appears with "pendiente" badge.
9. Confirm order. Verify item is submitted to pedidos and `items_diferidos` is now `[]`.
