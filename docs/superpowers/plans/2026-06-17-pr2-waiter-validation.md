# PR 2 — Waiter Validation Feature: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customer QR orders wait in `estado = 'pendiente_validacion'` before reaching the kitchen. The waiter reviews them at `/waiter/pendientes`, sends checked items to kitchen, and retains unchecked ones. Feature is opt-in per empresa via a superadmin toggle.

**Architecture:** New DB column `empresas.validacion_pedidos_habilitada`. `POST /api/pedidos` sets `estado = 'pendiente_validacion'` for customer (non-waiter) mesa orders when the toggle is active. Two new API routes power the `/waiter/pendientes` page. WaiterBanner gains a badge+sound. MesaOrdersClient shows all pedidos regardless of validation state; waiter viewers see estado badges.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (service-role client), React 19, Tailwind v4 / oklch colors, Lucide icons, i18n via `t()` across ES/EN/FR/IT/DE.

**Pre-requisite:** PR 1 (unify retenidos) must be merged first.

---

## File Map

| Action | File |
|--------|------|
| Create | `supabase/migrations/20260617000002_add_validacion_pedidos.sql` |
| Modify | `src/core/domain/repositories/IPedidoRepository.ts` |
| Modify | `src/core/infrastructure/database/supabase-pedido.repository.ts` |
| Modify | `src/app/api/pedidos/route.ts` |
| Create | `src/app/api/waiter/pendientes/orders/route.ts` |
| Create | `src/app/api/waiter/pendientes/validate/route.ts` |
| Create | `src/app/waiter/pendientes/page.tsx` |
| Modify | `src/components/waiter-banner.tsx` |
| Modify | `src/components/mesa-orders-client.tsx` (or its parent page) |
| Modify | `src/app/api/superadmin/empresas/[id]/route.ts` |
| Modify | `src/lib/translations.ts` |

---

## Task 1: DB Migration — Add `validacion_pedidos_habilitada`

**Files:**
- Create: `supabase/migrations/20260617000002_add_validacion_pedidos.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add opt-in validation toggle to empresas.
-- When true, customer QR orders are created with estado = 'pendiente_validacion'
-- and must be validated by a waiter before reaching the kitchen.

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS validacion_pedidos_habilitada boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Apply the migration** via Supabase dashboard or CLI.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260617000002_add_validacion_pedidos.sql
git commit -m "fix(db): add empresas.validacion_pedidos_habilitada column"
```

---

## Task 2: Add `findPendientesValidacion` to the Repository Interface

**Files:**
- Modify: `src/core/domain/repositories/IPedidoRepository.ts`

- [ ] **Step 1: Add the new interface types and method signature**

After the existing interfaces, add:

```typescript
export interface PendienteValidacionItem {
  idx: number;
  nombre: string;
  cantidad: number;
  precio: number;
  tipo: 'comida' | 'bebida';
  complementos?: string;
}

export interface PendienteValidacionPedido {
  id: string;
  createdAt: string;
  items: PendienteValidacionItem[];
}

export interface PendienteValidacionMesa {
  mesaId: string;
  mesaNumero: number | null;
  mesaNombre: string | null;
  pedidos: PendienteValidacionPedido[];
}
```

In the `IPedidoRepository` interface, add:

```typescript
findPendientesValidacion(empresaId: string): Promise<Result<PendienteValidacionMesa[]>>;
validatePedido(empresaId: string, pedidoId: string, retainIndices: number[]): Promise<Result<void>>;
```

- [ ] **Step 2: Lint check**

```bash
pnpm lint
```

Expected: TypeScript error that `SupabasePedidoRepository` doesn't implement the new methods. That's expected — fixed in the next task.

---

## Task 3: Implement `findPendientesValidacion` and `validatePedido` in Repository

**Files:**
- Modify: `src/core/infrastructure/database/supabase-pedido.repository.ts`

- [ ] **Step 1: Add `findPendientesValidacion`**

Add this method to `SupabasePedidoRepository`:

```typescript
async findPendientesValidacion(empresaId: string): Promise<Result<PendienteValidacionMesa[]>> {
  try {
    const { data: pedidos, error } = await this.supabase
      .from('pedidos')
      .select(`id, created_at, detalle_pedido, mesa_id, mesas!inner(numero, nombre)`)
      .eq('empresa_id', empresaId)
      .eq('estado', 'pendiente_validacion')
      .order('created_at', { ascending: true });

    if (error) {
      await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabasePedidoRepository.findPendientesValidacion', { details: { code: error.code, empresaId } });
      return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener pendientes de validación', module: 'repository', method: 'findPendientesValidacion' } };
    }

    const mesaMap = new Map<string, PendienteValidacionMesa>();

    for (const row of pedidos ?? []) {
      const r = row as Record<string, unknown>;
      const mesaData = r['mesas'] as Record<string, unknown> ?? {};
      const mesaId = r['mesa_id'] as string;
      const detalle = (r['detalle_pedido'] as Array<Record<string, unknown>>) ?? [];

      if (!mesaMap.has(mesaId)) {
        mesaMap.set(mesaId, {
          mesaId,
          mesaNumero: (mesaData['numero'] as number) ?? null,
          mesaNombre: (mesaData['nombre'] as string | null) ?? null,
          pedidos: [],
        });
      }

      const items: PendienteValidacionItem[] = detalle.map((item, idx) => ({
        idx,
        nombre: item['nombre'] as string,
        cantidad: item['cantidad'] as number,
        precio: item['precio'] as number,
        tipo: ((item['tipo_producto'] as string | undefined) ?? 'comida') as 'comida' | 'bebida',
        complementos: (item['complementos'] as Array<{ nombre?: string }> | undefined)
          ?.map(c => c.nombre ?? '').filter(Boolean).join(', '),
      }));

      mesaMap.get(mesaId)!.pedidos.push({
        id: r['id'] as string,
        createdAt: r['created_at'] as string,
        items,
      });
    }

    return { success: true, data: Array.from(mesaMap.values()) };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.findPendientesValidacion', { empresaId });
    return { success: false, error: appError };
  }
}
```

- [ ] **Step 2: Add `validatePedido`**

```typescript
async validatePedido(empresaId: string, pedidoId: string, retainIndices: number[]): Promise<Result<void>> {
  try {
    // Verify ownership and current state
    const { data: pedido, error: fetchError } = await this.supabase
      .from('pedidos')
      .select('id, estado, detalle_pedido')
      .eq('id', pedidoId)
      .eq('empresa_id', empresaId)
      .single();

    if (fetchError || !pedido) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Pedido no encontrado', module: 'repository', method: 'validatePedido' } };
    }

    const p = pedido as Record<string, unknown>;
    if (p['estado'] !== 'pendiente_validacion') {
      return { success: false, error: { code: 'CONFLICT', message: 'El pedido no está pendiente de validación', module: 'repository', method: 'validatePedido' } };
    }

    const detalle = (p['detalle_pedido'] as Array<Record<string, unknown>>) ?? [];
    const maxIdx = detalle.length - 1;
    const validRetain = retainIndices.filter(i => i >= 0 && i <= maxIdx);

    // Create pedido_item_estados rows for retained items
    if (validRetain.length > 0) {
      const upserts = validRetain.map(idx => ({
        pedido_id: pedidoId,
        item_idx: idx,
        empresa_id: empresaId,
        estado: 'retenido' as const,
        updated_at: new Date().toISOString(),
      }));
      const { error: upsertError } = await this.supabase
        .from('pedido_item_estados')
        .upsert(upserts, { onConflict: 'pedido_id,item_idx' });
      if (upsertError) {
        await logger.logAndReturnError('DB_INSERT_ERROR', upsertError.message, 'repository', 'SupabasePedidoRepository.validatePedido', { details: { code: upsertError.code, pedidoId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al retener ítems', module: 'repository', method: 'validatePedido' } };
      }
    }

    // Move pedido to pendiente — now visible in kitchen/bar
    const { error: updateError } = await this.supabase
      .from('pedidos')
      .update({ estado: 'pendiente' })
      .eq('id', pedidoId)
      .eq('empresa_id', empresaId);

    if (updateError) {
      await logger.logAndReturnError('DB_UPDATE_ERROR', updateError.message, 'repository', 'SupabasePedidoRepository.validatePedido', { details: { code: updateError.code, pedidoId } });
      return { success: false, error: { code: 'DB_ERROR', message: 'Error al validar pedido', module: 'repository', method: 'validatePedido' } };
    }

    return { success: true, data: undefined };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'repository', 'SupabasePedidoRepository.validatePedido', { details: { pedidoId } });
    return { success: false, error: appError };
  }
}
```

- [ ] **Step 3: Export the new types**

Add to the import in `supabase-pedido.repository.ts`:
```typescript
import type { ..., PendienteValidacionMesa } from '@/core/domain/repositories/IPedidoRepository';
```

- [ ] **Step 4: Lint check**

```bash
pnpm lint
```

---

## Task 4: Update `POST /api/pedidos` — Set `pendiente_validacion` When Toggle Active

**Files:**
- Modify: `src/app/api/pedidos/route.ts`

- [ ] **Step 1: Add `validacion_pedidos_habilitada` to the empresa query**

The `empresaPublicRepository.findByDomain` must return this field. Find the select in `IEmpresaPublicRepository` / its implementation and add `validacion_pedidos_habilitada` to the selected columns.

In the empresa public repository implementation, add the field to the SELECT query:
```typescript
.select('id, dominio, tipo, mesas_habilitadas, validacion_pedidos_habilitada, ...')
```

Then extend the return type to include `validacion_pedidos_habilitada: boolean`.

- [ ] **Step 2: Use the toggle in `handleMesaOrder`**

In `handleMesaOrder` (after checking `isWaiter`), set the initial estado based on the toggle:

```typescript
// Replace the initialEstado line from PR 1 with:
let initialEstado: 'pendiente' | 'retenido' | 'pendiente_validacion' = 'pendiente';
if (isWaiter && data.initialEstado === 'retenido') {
  initialEstado = 'retenido';
} else if (!isWaiter && empresa.validacion_pedidos_habilitada) {
  initialEstado = 'pendiente_validacion';
}
```

- [ ] **Step 3: Update `createMesaOrder` params type** in both `IPedidoRepository` and the repository implementation to accept `'pendiente_validacion'` as a valid `initialEstado` value:

```typescript
initialEstado?: 'pendiente' | 'retenido' | 'pendiente_validacion';
```

- [ ] **Step 4: Lint check**

```bash
pnpm lint
```

---

## Task 5: New `GET /api/waiter/pendientes/orders`

**Files:**
- Create: `src/app/api/waiter/pendientes/orders/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { pedidoRepository } from '@/core/infrastructure/database';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const result = await pedidoRepository.findPendientesValidacion(empresaId);
  if (!result.success) {
    return NextResponse.json({ error: 'Error al obtener pedidos pendientes' }, { status: 500 });
  }

  return NextResponse.json({ mesas: result.data });
}
```

- [ ] **Step 2: Verify route is reachable**

```bash
pnpm lint
```

Then start dev server (`pnpm dev`) and test:
```bash
curl -H "x-empresa-id: <valid-uuid>" http://localhost:3000/api/waiter/pendientes/orders
```

Expected: `{ mesas: [] }` (or populated if there are pending pedidos).

---

## Task 6: New `POST /api/waiter/pendientes/validate`

**Files:**
- Create: `src/app/api/waiter/pendientes/validate/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { pedidoRepository } from '@/core/infrastructure/database';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  pedidoId: z.string().uuid(),
  retainIndices: z.array(z.number().int().min(0)).max(50).default([]),
});

export async function POST(request: NextRequest) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { pedidoId, retainIndices } = parsed.data;
  const result = await pedidoRepository.validatePedido(empresaId, pedidoId, retainIndices);

  if (!result.success) {
    if (result.error.code === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }
    if (result.error.code === 'CONFLICT') {
      return NextResponse.json({ error: result.error.message }, { status: 409 });
    }
    return NextResponse.json({ error: 'Error al validar pedido' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Lint check**

```bash
pnpm lint
```

---

## Task 7: New Page `/waiter/pendientes/page.tsx`

**Files:**
- Create: `src/app/waiter/pendientes/page.tsx`

- [ ] **Step 1: Create the page component**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, Table2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface PendienteItem {
  idx: number;
  nombre: string;
  cantidad: number;
  precio: number;
  tipo: 'comida' | 'bebida';
}

interface PendientePedido {
  id: string;
  createdAt: string;
  items: PendienteItem[];
}

interface PendienteMesa {
  mesaId: string;
  mesaNumero: number | null;
  mesaNombre: string | null;
  pedidos: PendientePedido[];
}

const BG        = 'oklch(13% 0.02 252)';
const TEXT_MAIN = 'oklch(92% 0.02 252)';
const TEXT_DIM  = 'oklch(55% 0.04 252)';

function getMesaLabel(m: PendienteMesa) {
  return m.mesaNombre ?? `Mesa ${m.mesaNumero ?? '—'}`;
}

function getElapsedMinutes(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function formatTimer(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function WaiterPendientesPage() {
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];
  const [mesas, setMesas] = useState<PendienteMesa[]>([]);
  // retainMap: pedidoId → Set of item indices the waiter wants to retain
  const [retainMap, setRetainMap] = useState<Record<string, Set<number>>>({});
  const [confirming, setConfirming] = useState<Set<string>>(new Set());

  const fetchPendientes = useCallback(async () => {
    try {
      const r = await fetch('/api/waiter/pendientes/orders');
      if (r.ok) {
        const json = await r.json() as { mesas: PendienteMesa[] };
        setMesas(json.mesas ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void fetchPendientes();
    const poll = setInterval(fetchPendientes, 3000);
    return () => clearInterval(poll);
  }, [fetchPendientes]);

  // Tick every second to update timers
  useEffect(() => {
    const tick = setInterval(() => setMesas(p => [...p]), 1000);
    return () => clearInterval(tick);
  }, []);

  const toggleRetain = useCallback((pedidoId: string, idx: number) => {
    setRetainMap(prev => {
      const set = new Set(prev[pedidoId] ?? []);
      if (set.has(idx)) set.delete(idx); else set.add(idx);
      return { ...prev, [pedidoId]: set };
    });
  }, []);

  const handleConfirm = useCallback(async (pedidoId: string) => {
    setConfirming(prev => new Set(prev).add(pedidoId));
    try {
      const retainIndices = Array.from(retainMap[pedidoId] ?? []);
      const r = await fetch('/api/waiter/pendientes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedidoId, retainIndices }),
      });
      if (r.ok) {
        // Remove the pedido from local state optimistically
        setMesas(prev =>
          prev.map(m => ({
            ...m,
            pedidos: m.pedidos.filter(p => p.id !== pedidoId),
          })).filter(m => m.pedidos.length > 0)
        );
        setRetainMap(prev => { const n = { ...prev }; delete n[pedidoId]; return n; });
      }
    } finally {
      setConfirming(prev => { const n = new Set(prev); n.delete(pedidoId); return n; });
    }
  }, [retainMap]);

  const totalItems = mesas.reduce((s, m) => s + m.pedidos.reduce((sp, p) => sp + p.items.length, 0), 0);

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-10 shadow-lg"
        style={{ background: 'oklch(17% 0.025 252)', borderBottom: '1px solid oklch(42% 0.10 252 / 0.35)' }}>
        <div className="flex h-11 items-center gap-3 px-4">
          <a href="/waiter" className="flex items-center gap-1 text-xs font-medium" style={{ color: TEXT_DIM }}>
            <ChevronLeft className="w-4 h-4" />
            {t('waiterLogout', lang)}
          </a>
          <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>
            {t('pendientesTitle', lang)}
          </span>
          <span className="text-[10px]" style={{ color: TEXT_DIM }}>({totalItems})</span>
        </div>
      </div>

      <div className="pt-[44px] px-3 pb-6">
        {mesas.length === 0 && (
          <div className="text-center py-10 text-sm" style={{ color: TEXT_DIM }}>
            {t('pendientesEmpty', lang)}
          </div>
        )}

        <div className="flex flex-col gap-4 pt-3">
          {mesas.map(mesa => (
            <div key={mesa.mesaId}>
              {/* Mesa label */}
              <div className="flex items-center gap-2 px-1 mb-2">
                <Table2 className="w-3.5 h-3.5" style={{ color: 'oklch(62% 0.14 62)' }} />
                <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{getMesaLabel(mesa)}</span>
              </div>

              {/* Pedidos in this mesa */}
              <div className="flex flex-col gap-3">
                {mesa.pedidos.map(pedido => {
                  const retained = retainMap[pedido.id] ?? new Set<number>();
                  const sendCount = pedido.items.length - retained.size;
                  const isConfirming = confirming.has(pedido.id);
                  const elapsed = getElapsedMinutes(pedido.createdAt);

                  return (
                    <div key={pedido.id} className="rounded-xl overflow-hidden"
                      style={{ border: '1px solid oklch(35% 0.08 252 / 0.5)' }}>
                      {/* Pedido header */}
                      <div className="flex items-center gap-2 px-3 py-2"
                        style={{ background: 'oklch(18% 0.03 252)', borderBottom: '1px solid oklch(35% 0.08 252 / 0.4)' }}>
                        <span className="text-[10px] font-mono" style={{ color: TEXT_DIM }}>{formatTimer(elapsed)}</span>
                      </div>

                      {/* Items */}
                      <div className="flex flex-col gap-1.5 p-2">
                        {pedido.items.map(item => {
                          const isRetained = retained.has(item.idx);
                          return (
                            <button
                              key={item.idx}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left"
                              style={{
                                background: isRetained ? 'oklch(21% 0.10 65)' : 'oklch(15% 0.04 148)',
                                border: `1px solid ${isRetained ? 'oklch(50% 0.22 65 / 0.55)' : 'oklch(40% 0.14 148 / 0.4)'}`,
                              }}
                              onClick={() => toggleRetain(pedido.id, item.idx)}>
                              {/* Checkbox */}
                              <div className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center"
                                style={{
                                  background: isRetained ? 'transparent' : 'oklch(50% 0.22 148)',
                                  border: `2px solid ${isRetained ? 'oklch(55% 0.04 252)' : 'oklch(50% 0.22 148)'}`,
                                }}>
                                {!isRetained && <span style={{ color: '#fff', fontSize: 9, fontWeight: 'bold' }}>✓</span>}
                              </div>
                              <span className="flex-1 text-xs" style={{ color: isRetained ? 'oklch(65% 0.14 65)' : TEXT_MAIN }}>
                                {item.cantidad}× {item.nombre}
                              </span>
                              <span className="text-[10px] shrink-0"
                                style={{ color: isRetained ? 'oklch(65% 0.14 65)' : TEXT_DIM }}>
                                {item.tipo}
                              </span>
                              {isRetained && (
                                <span className="text-[10px] shrink-0 font-medium"
                                  style={{ color: 'oklch(72% 0.18 65)' }}>
                                  {t('kitchenItemRetenido', lang)}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Footer */}
                      <div className="px-2 pb-2" style={{ borderTop: '1px solid oklch(35% 0.08 252 / 0.4)', paddingTop: '0.5rem' }}>
                        <button
                          className="w-full rounded-lg py-2 text-xs font-semibold"
                          disabled={isConfirming}
                          style={{
                            background: sendCount > 0 ? 'oklch(22% 0.14 148)' : 'oklch(21% 0.10 65)',
                            color: sendCount > 0 ? 'oklch(74% 0.20 148)' : 'oklch(72% 0.18 65)',
                            border: `1px solid ${sendCount > 0 ? 'oklch(46% 0.22 148 / 0.6)' : 'oklch(50% 0.22 65 / 0.5)'}`,
                            opacity: isConfirming ? 0.6 : 1,
                          }}
                          onClick={() => { void handleConfirm(pedido.id); }}>
                          {isConfirming
                            ? '...'
                            : sendCount > 0
                              ? t('pendientesConfirmar', lang).replace('{n}', String(sendCount))
                              : t('pendientesRetenerTodos', lang)
                          }
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint check**

```bash
pnpm lint
```

Fix any TypeScript errors (missing translation keys are fine at this stage — fixed in Task 10).

---

## Task 8: Update `waiter-banner.tsx` — Add Pendientes Button + Badge

**Files:**
- Modify: `src/components/waiter-banner.tsx`

- [ ] **Step 1: Add color constants for the Pendientes button**

After the existing `BTN_BAR_*` constants, add:

```typescript
// Pendientes — amber-red
const BTN_PENDIENTES_BG    = "oklch(22% 0.12 35)";
const BTN_PENDIENTES_HOVER = "oklch(28% 0.16 35)";
const BTN_PENDIENTES_TEXT  = "oklch(75% 0.22 35)";
```

- [ ] **Step 2: Add `pendientesCount` state and polling**

Add a new state for pendientes count (a separate endpoint call, or extend the existing `/api/waiter/orders/counts` endpoint). The simpler approach is to fetch counts from the existing poll or add to the counts endpoint.

Add to the `counts` state shape:
```typescript
const [counts, setCounts] = useState<{
  cocina: { total: number; listos: number; retenidos: number };
  bebidas: { total: number; listos: number; retenidos: number };
  pendientes: number; // NEW
} | null>(null);
```

Update the fetch in the polling `useEffect` to also parse `pendientes` from the counts endpoint:
```typescript
const json = await r.json() as {
  cocina: { total: number; listos: number; retenidos: number };
  bebidas: { total: number; listos: number; retenidos: number };
  pendientes: number;
};
// Add to the "did count increase?" check:
const pendientesUp = json.pendientes > (prev?.pendientes ?? 0);
if (totalUp || listosUp || pendientesUp) { /* play sound */ }
```

- [ ] **Step 3: Extend `/api/waiter/orders/counts` to include `pendientes`**

Find `src/app/api/waiter/orders/counts/route.ts`. Add a call to the repository:

```typescript
const [ordersResult, retenidosResult, pendientesResult] = await Promise.all([
  pedidoRepository.findKitchenItems(empresaId),       // existing
  pedidoRepository.findAllRetenidos(empresaId, 'comida'), // existing (or already included)
  pedidoRepository.findPendientesValidacion(empresaId),   // NEW
]);

const pendientesCount = pendientesResult.success
  ? pendientesResult.data.reduce((s, m) => s + m.pedidos.reduce((sp, p) => sp + p.items.length, 0), 0)
  : 0;

return NextResponse.json({
  cocina: { ... }, // existing
  bebidas: { ... }, // existing
  pendientes: pendientesCount, // NEW
});
```

- [ ] **Step 4: Add the Pendientes button to the banner JSX**

Add the button before the Kitchen button (so order is: Pendientes → Cocina → Bar):

```tsx
{/* Pendientes — only visible when validacion is enabled for this empresa */}
{counts && counts.pendientes > 0 && (
  <button
    onClick={() => { window.location.href = '/waiter/pendientes'; }}
    className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 min-h-[32px]"
    style={{ color: BTN_PENDIENTES_TEXT, backgroundColor: BTN_PENDIENTES_BG }}
    onMouseEnter={e => (e.currentTarget.style.backgroundColor = BTN_PENDIENTES_HOVER)}
    onMouseLeave={e => (e.currentTarget.style.backgroundColor = BTN_PENDIENTES_BG)}
    aria-label={t('pendientesTitle', lang)}
  >
    <span className="text-[10px] font-bold" style={{
      background: 'oklch(55% 0.30 25)', color: '#fff',
      borderRadius: '9999px', padding: '1px 6px', minWidth: 16, textAlign: 'center',
    }}>
      {counts.pendientes}
    </span>
    <span className="hidden sm:inline">{t('pendientesTitle', lang)}</span>
  </button>
)}
```

Note: the button is only shown when `counts.pendientes > 0` — this implicitly hides it when validation is disabled (no pending pedidos). No need to fetch the toggle flag separately.

- [ ] **Step 5: Lint check**

```bash
pnpm lint
```

---

## Task 9: Update `MesaOrdersClient` — Show All Pedidos, Waiter Badge

**Files:**
- Modify: `src/components/mesa-orders-client.tsx`
- Modify: `src/app/mesa/[mesaId]/orders/page.tsx` (pass isWaiter prop)

- [ ] **Step 1: Pass `isWaiter` to `MesaOrdersClient` from the page**

In `src/app/mesa/[mesaId]/orders/page.tsx`:

```tsx
import { cookies } from 'next/headers';
import { verifyWaiterToken } from '@/lib/waiter-auth';
import { MesaOrdersClient } from '@/components/mesa-orders-client';

export default async function MesaOrdersPage({ params }: Props) {
  const { mesaId } = await params;
  const cookieStore = await cookies();
  const waiterTokenRaw = cookieStore.get('waiter_token')?.value ?? null;
  const isWaiter = waiterTokenRaw ? (await verifyWaiterToken(waiterTokenRaw)) !== null : false;
  return <MesaOrdersClient mesaId={mesaId} isWaiter={isWaiter} />;
}
```

- [ ] **Step 2: Accept `isWaiter` prop in `MesaOrdersClient`**

Add `isWaiter?: boolean` to the component props.

- [ ] **Step 3: Include `pendiente_validacion` and `retenido` pedidos in the orders fetch**

The `GET /api/mesas/{mesaId}/orders` endpoint probably filters by `estado`. Find that filter and ensure it includes `pendiente_validacion` and `retenido` (or simply doesn't exclude them). Check the endpoint:

```bash
cat "src/app/api/mesas/[mesaId]/orders/route.ts" | grep -A5 "estado"
```

If there's a filter like `.in('estado', ['pendiente', 'preparado', 'servido'])`, extend it to include the new states. If there's no filter (all non-cerrado orders included), no change needed.

- [ ] **Step 4: Add estado badge for waiter viewers**

In `MesaOrdersClient`, where individual orders/pedidos are rendered, add a conditional badge when `isWaiter`:

```tsx
{isWaiter && order.estado && (
  <span className="text-[10px] rounded px-1.5 py-0.5 font-medium"
    style={{
      background: ['pendiente_validacion', 'retenido'].includes(order.estado)
        ? 'oklch(21% 0.10 65)' : 'oklch(18% 0.05 148)',
      color: ['pendiente_validacion', 'retenido'].includes(order.estado)
        ? 'oklch(72% 0.18 65)' : 'oklch(65% 0.18 148)',
    }}>
    {order.estado === 'pendiente_validacion' ? t('pendientesValidacionLabel', lang)
      : order.estado === 'retenido' ? t('kitchenItemRetenido', lang)
      : order.estado === 'preparado' ? t('orderStatusPreparado', lang)
      : order.estado === 'servido' ? t('orderStatusServido', lang)
      : t('orderStatusPendiente', lang)}
  </span>
)}
```

- [ ] **Step 5: Lint check**

```bash
pnpm lint
```

---

## Task 10: Add Translations

**Files:**
- Modify: `src/lib/translations.ts`

- [ ] **Step 1: Add new keys to all 5 languages (ES/EN/FR/IT/DE)**

```typescript
// ES:
pendientesTitle: "Pendientes",
pendientesEmpty: "No hay pedidos pendientes de validación",
pendientesConfirmar: "Confirmar ({n} ítems → cocina)",
pendientesRetenerTodos: "Retener todos",
pendientesValidacionLabel: "Pendiente validación",

// EN:
pendientesTitle: "Pending",
pendientesEmpty: "No orders pending validation",
pendientesConfirmar: "Confirm ({n} items → kitchen)",
pendientesRetenerTodos: "Retain all",
pendientesValidacionLabel: "Pending validation",

// FR:
pendientesTitle: "En attente",
pendientesEmpty: "Aucune commande en attente de validation",
pendientesConfirmar: "Confirmer ({n} articles → cuisine)",
pendientesRetenerTodos: "Tout retenir",
pendientesValidacionLabel: "En attente de validation",

// IT:
pendientesTitle: "In attesa",
pendientesEmpty: "Nessun ordine in attesa di validazione",
pendientesConfirmar: "Conferma ({n} articoli → cucina)",
pendientesRetenerTodos: "Trattieni tutti",
pendientesValidacionLabel: "In attesa di validazione",

// DE:
pendientesTitle: "Ausstehend",
pendientesEmpty: "Keine Bestellungen warten auf Validierung",
pendientesConfirmar: "Bestätigen ({n} Artikel → Küche)",
pendientesRetenerTodos: "Alle zurückstellen",
pendientesValidacionLabel: "Warte auf Validierung",
```

- [ ] **Step 2: Lint check**

```bash
pnpm lint
```

---

## Task 11: Superadmin Toggle

**Files:**
- Modify: `src/app/api/superadmin/empresas/[id]/route.ts`

- [ ] **Step 1: Extend the PATCH body schema**

Find the Zod schema that validates the PATCH body for empresa updates. Add the new field:

```typescript
validacion_pedidos_habilitada: z.boolean().optional(),
```

- [ ] **Step 2: Include it in the UPDATE query**

In the Supabase UPDATE call, conditionally include the field:

```typescript
if (parsed.data.validacion_pedidos_habilitada !== undefined) {
  updatePayload.validacion_pedidos_habilitada = parsed.data.validacion_pedidos_habilitada;
}
```

- [ ] **Step 3: Add the toggle to the superadmin UI**

Find the empresa edit form in the superadmin frontend (likely at `src/app/superadmin/...`). Add a toggle/checkbox:

```tsx
<label className="flex items-center gap-2 text-sm">
  <input
    type="checkbox"
    checked={form.validacion_pedidos_habilitada ?? false}
    onChange={e => setForm(f => ({ ...f, validacion_pedidos_habilitada: e.target.checked }))}
  />
  Validación de pedidos por camarero
</label>
```

Wire it to the PATCH call as any other empresa field.

- [ ] **Step 4: Lint check**

```bash
pnpm lint
```

---

## Task 12: Final Verification + Commit

- [ ] **Step 1: Run lint and build**

```bash
pnpm lint && pnpm build
```

Expected: zero errors.

- [ ] **Step 2: Manual smoke test — happy path**

1. Enable `validacion_pedidos_habilitada` for a test empresa via superadmin
2. Open the menu as a customer at a QR mesa, add items, confirm order
3. Verify: no items appear in `/waiter/kitchen` immediately
4. Open `/waiter/pendientes` as waiter — the order should appear
5. Uncheck one item, click "Confirmar"
6. Verify: checked items now appear in `/waiter/kitchen` as `pendiente`
7. Verify: unchecked item appears in `/waiter/kitchen` under "Retenidos"
8. Verify: WaiterBanner shows Pendientes badge when there are pending orders, badge disappears after validation
9. Verify: customer ticket at `/mesa/{mesaId}/orders` shows all items (no estado labels)
10. Open same ticket as waiter — estado badges visible

- [ ] **Step 3: Manual smoke test — toggle off**

1. Disable `validacion_pedidos_habilitada` for the empresa
2. Place a customer order — verify it goes directly to `/waiter/kitchen` as before
3. Verify `/waiter/pendientes` shows empty state

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(waiter): add validation queue for customer orders

- New /waiter/pendientes page: waiter reviews orders before kitchen
- POST /api/pedidos sets pendiente_validacion when toggle active
- POST /api/waiter/pendientes/validate: checked items → pendiente, unchecked → retenido
- WaiterBanner: Pendientes badge + audio ping when count increases
- MesaOrdersClient: includes all pedido estados; waiter viewers see estado badges
- Superadmin toggle: validacion_pedidos_habilitada per empresa"
```
