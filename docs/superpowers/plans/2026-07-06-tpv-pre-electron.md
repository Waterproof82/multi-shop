# TPV Pre-Electron: Arqueo Ciego + Inventario Físico + Pases KDS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar las 3 funcionalidades operativas que faltan antes del empaquetado Electron/Capacitor.

**Architecture:** Tres features independientes que tocan capas distintas. (1) Arqueo ciego es un cambio de UX puro en un componente existente. (2) Inventario físico añade un nuevo flujo admin con migración + API + página. (3) Pases/Marchas añade un campo opcional al pedido y agrupa el KDS visualmente.

**Tech Stack:** Next.js 15 App Router, Supabase, TypeScript, Tailwind v4

---

## Feature 1: Arqueo Ciego

El formulario actual muestra el efectivo teórico ANTES de que el operador cuente. Un arqueo ciego real lo oculta hasta que se ha introducido la cifra contada.

**File:** `src/components/tpv/TurnoCerrarForm.tsx` (modify only)

---

### Task 1: Ocultar el teórico hasta que el operador haya introducido su conteo

**Files:**
- Modify: `src/components/tpv/TurnoCerrarForm.tsx`

- [ ] **Step 1: Leer el archivo**

```bash
cat src/components/tpv/TurnoCerrarForm.tsx
```

- [ ] **Step 2: Envolver el bloque de "Resumen del turno" en la misma condición que la diferencia**

Localizar el bloque `<div className="bg-[#22263a] border...">` que contiene "Resumen del turno". Cambiar para que el total de efectivo teórico solo sea visible cuando `hasContado` es `true`.

Cambiar esta parte del resumen:

```tsx
<div className="flex justify-between text-sm">
  <span className="text-[#6b7280]">Total efectivo (teórico)</span>
  <span className="font-semibold">{fmt(teoricoCents)}</span>
</div>
```

Por esto (solo muestra el teórico una vez que el operador ha introducido su cifra):

```tsx
<div className="flex justify-between text-sm">
  <span className="text-[#6b7280]">Total efectivo (teórico)</span>
  <span className="font-semibold">
    {hasContado ? fmt(teoricoCents) : '—'}
  </span>
</div>
```

- [ ] **Step 3: Actualizar la etiqueta del input para reforzar el flujo ciego**

Cambiar:
```tsx
<label className="text-xs font-bold text-[#6b7280] uppercase tracking-wider">
  Efectivo contado en caja
</label>
```
Por:
```tsx
<label className="text-xs font-bold text-[#6b7280] uppercase tracking-wider">
  Cuenta el efectivo sin mirar el sistema
</label>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/tpv/TurnoCerrarForm.tsx
git commit -m "fix(tpv/turno): ocultar efectivo teórico hasta que operador introduzca conteo"
```

---

## Feature 2: Inventario Físico

Nueva pantalla en el panel de stock para realizar el conteo mensual/semanal a ciegas. El operador introduce la cantidad real de cada ingrediente; el sistema calcula la desviación y registra el ajuste.

**Files:**
- Create: `supabase/migrations/20260706000005_stock_tipo_inventario.sql`
- Create: `src/app/api/admin/stock/inventario/route.ts`
- Create: `src/app/admin/(protected)/stock/inventario/page.tsx`
- Create: `src/components/admin/stock/InventarioFisicoClient.tsx`
- Modify: `src/core/infrastructure/database/supabase-stock.repository.ts` (add `registrarInventario`)
- Modify: `src/app/admin/(protected)/stock/page.tsx` or layout — add link to inventario

---

### Task 2: Migración — añadir tipo `inventario` a movimientos_stock

**Files:**
- Create: `supabase/migrations/20260706000005_stock_tipo_inventario.sql`

- [ ] **Step 1: Crear la migración**

```sql
-- Extend tipo_movimiento enum to include 'inventario'
-- Used when an operator performs a physical stock count and
-- the system registers the delta between real and theoretical.
ALTER TYPE public.tipo_movimiento ADD VALUE IF NOT EXISTS 'inventario';
```

- [ ] **Step 2: Aplicar la migración en Supabase**

```bash
# Via MCP supabase apply_migration tool, o manualmente en el dashboard SQL editor.
# Verificar que el enum ahora incluye: entrada, deduccion, ajuste, merma, sin_receta, inventario
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000005_stock_tipo_inventario.sql
git commit -m "feat(db): añadir tipo inventario a enum tipo_movimiento"
```

---

### Task 3: API POST /api/admin/stock/inventario

Recibe la lista `{ ingredienteId, cantidadReal }[]`, compara con `cantidad_actual`, genera un movimiento `inventario` por cada ingrediente con delta ≠ 0, y actualiza `cantidad_actual`.

**Files:**
- Create: `src/app/api/admin/stock/inventario/route.ts`

- [ ] **Step 1: Crear la ruta**

```typescript
// src/app/api/admin/stock/inventario/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const itemSchema = z.object({
  ingredienteId: z.string().uuid(),
  cantidadReal: z.number().min(0),
});

const bodySchema = z.object({
  items: z.array(itemSchema).min(1).max(500),
  operadorNombre: z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(req);
  if (authError) return authError;
  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { items, operadorNombre } = parsed.data;
  const supabase = getSupabaseClient();

  // Fetch current quantities for the provided ingredient IDs
  const ids = items.map(i => i.ingredienteId);
  const { data: ingredientes, error: fetchErr } = await supabase
    .from('ingredientes')
    .select('id, cantidad_actual')
    .eq('empresa_id', empresaId)
    .in('id', ids);

  if (fetchErr || !ingredientes) {
    return NextResponse.json({ error: 'Error al leer ingredientes' }, { status: 500 });
  }

  const actualMap = new Map(
    (ingredientes as { id: string; cantidad_actual: number }[]).map(i => [i.id, Number(i.cantidad_actual)])
  );

  // Build deltas — only process items with a real change
  const deltas = items
    .map(item => ({
      ingredienteId: item.ingredienteId,
      cantidadReal: item.cantidadReal,
      cantidadTeorica: actualMap.get(item.ingredienteId) ?? 0,
      delta: item.cantidadReal - (actualMap.get(item.ingredienteId) ?? 0),
    }))
    .filter(d => Math.abs(d.delta) > 0.0001);

  if (deltas.length === 0) {
    return NextResponse.json({ ok: true, ajustados: 0 });
  }

  // Insert movimientos_stock for each delta
  const movimientos = deltas.map(d => ({
    empresa_id: empresaId,
    ingrediente_id: d.ingredienteId,
    tipo: 'inventario' as const,
    cantidad: d.delta, // positive = surplus, negative = deficit
  }));

  const { error: movErr } = await supabase
    .from('movimientos_stock')
    .insert(movimientos);

  if (movErr) {
    return NextResponse.json({ error: 'Error al registrar movimientos' }, { status: 500 });
  }

  // Update cantidad_actual for each affected ingredient
  await Promise.all(
    deltas.map(d =>
      supabase
        .from('ingredientes')
        .update({ cantidad_actual: d.cantidadReal })
        .eq('id', d.ingredienteId)
        .eq('empresa_id', empresaId)
    )
  );

  return NextResponse.json({ ok: true, ajustados: deltas.length });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/admin/stock/inventario/route.ts
git commit -m "feat(api): POST /api/admin/stock/inventario para conteo físico"
```

---

### Task 4: Componente cliente InventarioFisicoClient

Muestra todos los ingredientes con inputs para la cantidad real. El operador rellena, confirma, y ve el resumen de desviaciones.

**Files:**
- Create: `src/components/admin/stock/InventarioFisicoClient.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// src/components/admin/stock/InventarioFisicoClient.tsx
'use client';

import { useState } from 'react';
import { getCsrfToken } from '@/lib/csrf-client';

interface Ingrediente {
  id: string;
  nombre: string;
  unidad: string;
  cantidadActual: number;
}

interface Props {
  readonly ingredientes: Ingrediente[];
  readonly operadorNombre: string;
}

interface Delta {
  nombre: string;
  teorico: number;
  real: number;
  delta: number;
  unidad: string;
}

type Step = 'conteo' | 'confirmacion' | 'completado';

function fmt(n: number, unidad: string) {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${unidad}`;
}

export function InventarioFisicoClient({ ingredientes, operadorNombre }: Props) {
  const [step, setStep] = useState<Step>('conteo');
  const [conteos, setConteos] = useState<Record<string, string>>({});
  const [deltas, setDeltas] = useState<Delta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(id: string, value: string) {
    setConteos(prev => ({ ...prev, [id]: value }));
  }

  function calcDeltas(): Delta[] {
    return ingredientes
      .filter(ing => conteos[ing.id] !== undefined && conteos[ing.id].trim() !== '')
      .map(ing => {
        const real = parseFloat(conteos[ing.id] ?? '0');
        return {
          nombre: ing.nombre,
          teorico: ing.cantidadActual,
          real,
          delta: real - ing.cantidadActual,
          unidad: ing.unidad,
        };
      })
      .filter(d => Math.abs(d.delta) > 0.0001);
  }

  function handleRevisar() {
    const computed = calcDeltas();
    setDeltas(computed);
    setStep('confirmacion');
  }

  async function handleConfirmar() {
    setLoading(true);
    setError(null);

    const items = ingredientes
      .filter(ing => conteos[ing.id] !== undefined && conteos[ing.id].trim() !== '')
      .map(ing => ({
        ingredienteId: ing.id,
        cantidadReal: parseFloat(conteos[ing.id] ?? '0'),
      }));

    try {
      const csrfToken = getCsrfToken();
      const res = await fetch('/api/admin/stock/inventario', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ items, operadorNombre }),
      });

      if (res.ok) {
        setStep('completado');
      } else {
        const json = await res.json() as { error?: string };
        setError(json.error ?? 'Error al registrar inventario');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'completado') {
    return (
      <div className="flex flex-col items-center gap-6 py-16">
        <div className="w-16 h-16 rounded-full bg-[#22c55e22] border-2 border-[#22c55e] flex items-center justify-center text-2xl">✓</div>
        <h2 className="text-xl font-bold">Inventario registrado</h2>
        <p className="text-sm text-[#6b7280] text-center max-w-xs">
          Se han ajustado {deltas.length} ingrediente{deltas.length !== 1 ? 's' : ''} y los movimientos han quedado registrados.
        </p>
        <button
          type="button"
          onClick={() => { setStep('conteo'); setConteos({}); setDeltas([]); }}
          className="px-6 py-2.5 rounded-xl bg-[#4f72ff] text-white text-sm font-bold hover:brightness-110"
        >
          Nuevo inventario
        </button>
      </div>
    );
  }

  if (step === 'confirmacion') {
    return (
      <div className="flex flex-col gap-6 max-w-2xl mx-auto">
        <div>
          <h2 className="text-lg font-bold">Revisar desviaciones</h2>
          <p className="text-sm text-[#6b7280] mt-1">
            {deltas.length === 0
              ? 'No hay desviaciones. El inventario físico coincide con el teórico.'
              : `${deltas.length} ingrediente${deltas.length !== 1 ? 's' : ''} con desviación.`}
          </p>
        </div>

        {deltas.length > 0 && (
          <div className="flex flex-col gap-2">
            {deltas.map(d => (
              <div key={d.nombre} className="bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3 flex items-center gap-4">
                <span className="flex-1 text-sm font-medium">{d.nombre}</span>
                <span className="text-xs text-[#6b7280]">Teórico: {fmt(d.teorico, d.unidad)}</span>
                <span className="text-xs text-[#6b7280]">Real: {fmt(d.real, d.unidad)}</span>
                <span className={`text-sm font-bold w-24 text-right ${d.delta > 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                  {d.delta > 0 ? '+' : ''}{fmt(d.delta, d.unidad)}
                </span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-[#ef4444] bg-[#ef444415] border border-[#ef444430] rounded-xl px-4 py-3">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setStep('conteo')}
            className="flex-1 py-3 rounded-xl border border-[#2e3347] text-[#6b7280] text-sm font-semibold hover:text-white transition-colors"
          >
            Corregir
          </button>
          <button
            type="button"
            onClick={() => void handleConfirmar()}
            disabled={loading}
            className="flex-[2] py-3 rounded-xl bg-[#4f72ff] text-white text-sm font-bold hover:brightness-110 disabled:opacity-50"
          >
            {loading ? 'Registrando...' : 'Confirmar y registrar'}
          </button>
        </div>
      </div>
    );
  }

  // step === 'conteo'
  const filled = Object.values(conteos).filter(v => v.trim() !== '').length;

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <div>
        <h2 className="text-lg font-bold">Conteo físico</h2>
        <p className="text-sm text-[#6b7280] mt-1">
          Introduce la cantidad real que hay en almacén. Deja en blanco los ingredientes que no vayas a contar.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {ingredientes.map(ing => (
          <div key={ing.id} className="bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3 flex items-center gap-4">
            <span className="flex-1 text-sm font-medium">{ing.nombre}</span>
            <span className="text-xs text-[#6b7280] shrink-0">{ing.unidad}</span>
            <input
              type="number"
              min="0"
              step="0.001"
              value={conteos[ing.id] ?? ''}
              onChange={e => handleChange(ing.id, e.target.value)}
              placeholder="—"
              className="w-28 bg-[#22263a] border border-[#2e3347] rounded-lg px-3 py-1.5 text-sm text-right outline-none focus:border-[#4f72ff] transition-colors"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-[#6b7280]">{filled} de {ingredientes.length} contados</span>
        <button
          type="button"
          onClick={handleRevisar}
          disabled={filled === 0}
          className="px-6 py-3 rounded-xl bg-[#4f72ff] text-white text-sm font-bold hover:brightness-110 disabled:opacity-40"
        >
          Revisar desviaciones →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/stock/InventarioFisicoClient.tsx
git commit -m "feat(ui): componente InventarioFisicoClient para conteo físico a ciegas"
```

---

### Task 5: Página /admin/stock/inventario

**Files:**
- Create: `src/app/admin/(protected)/stock/inventario/page.tsx`

- [ ] **Step 1: Crear la página server**

```tsx
// src/app/admin/(protected)/stock/inventario/page.tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { InventarioFisicoClient } from '@/components/admin/stock/InventarioFisicoClient';

export const dynamic = 'force-dynamic';

export default async function InventarioFisicoPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) redirect('/admin/login');

  const admin = await authAdminUseCase.verifyToken(token);
  if (!admin || !admin.empresaId) redirect('/admin/login');

  const supabase = getSupabaseClient();
  const { data: ingredientes } = await supabase
    .from('ingredientes')
    .select('id, nombre, unidad, cantidad_actual')
    .eq('empresa_id', admin.empresaId)
    .order('nombre');

  type Row = { id: string; nombre: string; unidad: string; cantidad_actual: number };

  const items = ((ingredientes ?? []) as Row[]).map(r => ({
    id: r.id,
    nombre: r.nombre,
    unidad: r.unidad,
    cantidadActual: Number(r.cantidad_actual),
  }));

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Inventario Físico</h1>
        <p className="text-sm text-[#6b7280] mt-1">
          Conteo real de almacén. El sistema calculará la desviación respecto al teórico.
        </p>
      </div>
      <InventarioFisicoClient
        ingredientes={items}
        operadorNombre={admin.nombreCompleto ?? 'Operador'}
      />
    </div>
  );
}
```

- [ ] **Step 2: Añadir enlace en el sidebar de stock**

Buscar el archivo que define el sidebar o el nav del área de stock (probablemente `src/components/admin/` o el layout de stock). Añadir el ítem:

```tsx
{ href: '/admin/stock/inventario', label: 'Inventario físico', requiresRestaurant: true }
```

Si el sidebar usa una lista de rutas hardcodeada, añadirlo junto a los otros ítems de stock (ingredientes, recetas, movimientos).

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/(protected)/stock/inventario/
git commit -m "feat(admin/stock): página de inventario físico a ciegas"
```

---

## Feature 3: Pases / Marchas en KDS

Añade un campo `pase` opcional al pedido (sin migración de schema — se almacena en la columna `nota` del pedido como prefijo estructurado `[PASE:primer]`, o se añade una columna `pase` a `pedidos`). Optamos por **columna limpia**: más semántico y sin parsing de texto.

**Files:**
- Create: `supabase/migrations/20260706000006_pedidos_pase.sql`
- Modify: `src/app/api/tpv/pedidos/route.ts` — aceptar y guardar `pase`
- Modify: `src/hooks/tpv/useMesaActiva.ts` — añadir `pase` a `PendingItem`
- Modify: `src/components/tpv/TicketPanel.tsx` — selector de pase al enviar pedido
- Modify: `src/app/waiter/kitchen/page.tsx` — agrupar items por pase

---

### Task 6: Migración — columna pase en pedidos

**Files:**
- Create: `supabase/migrations/20260706000006_pedidos_pase.sql`

- [ ] **Step 1: Crear la migración**

```sql
-- Add optional 'pase' column to pedidos for kitchen course grouping.
-- Values: 'primer' | 'segundo' | 'postre' | 'bebida' | NULL (= sin asignar)
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS pase TEXT
    CHECK (pase IS NULL OR pase IN ('primer', 'segundo', 'postre', 'bebida'));
```

- [ ] **Step 2: Aplicar migración**

Via MCP supabase apply_migration o dashboard.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260706000006_pedidos_pase.sql
git commit -m "feat(db): columna pase opcional en pedidos para agrupación en KDS"
```

---

### Task 7: API — aceptar pase en POST /api/tpv/pedidos

**Files:**
- Modify: `src/app/api/tpv/pedidos/route.ts`

- [ ] **Step 1: Añadir `pase` al bodySchema**

```typescript
const bodySchema = z.object({
  mesaId: z.string().uuid(),
  items: z.array(itemSchema).min(1).max(50),
  nota: z.string().max(500).optional(),
  pase: z.enum(['primer', 'segundo', 'postre', 'bebida']).optional(),
});
```

- [ ] **Step 2: Pasar `pase` al use case de createMesaOrder**

En el `POST`, después de extraer `{ mesaId, items, nota, pase }`, pasar `pase` al call del use case o directamente al insert del pedido. Buscar cómo `createMesaOrder` persiste el pedido y añadir el campo:

```typescript
const pedidoResult = await pedidoUseCase.createMesaOrder(
  empresaId,
  { mesa_id: mesaId, items: ..., nota, pase },  // añadir pase
  mesa.numero,
  mesa.nombre ?? null,
  'pendiente'
);
```

Si `createMesaOrder` no acepta `pase`, añadirlo al insert directo en el use case o al repo.

- [ ] **Step 3: Actualizar la lectura del pase en GET /api/tpv/pedidos**

En la query de pedidos, añadir `pase` al select:

```typescript
supabase
  .from('pedidos')
  .select('id, numero_pedido, detalle_pedido, total, estado, nota, pase, created_at')
```

Y exponerlo en el objeto de respuesta:
```typescript
const orders = rawPedidos.map(p => ({
  ...
  pase: (p as { pase?: string | null }).pase ?? null,
}));
```

Añadir `pase: string | null` a `ExistingOrder` en `MostradorClient.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/tpv/pedidos/route.ts
git commit -m "feat(api): campo pase en POST/GET /api/tpv/pedidos"
```

---

### Task 8: Mostrador — selector de pase al enviar pedido

**Files:**
- Modify: `src/components/tpv/TicketPanel.tsx`

- [ ] **Step 1: Añadir estado `pase` al TicketPanel**

Junto a `pendingNota`, añadir:

```typescript
const [pendingPase, setPendingPase] = useState<'primer' | 'segundo' | 'postre' | 'bebida' | ''>('');
```

- [ ] **Step 2: Añadir selector de pase en el formulario de envío**

Justo antes del `<textarea>` de nota del pedido, añadir:

```tsx
{pendingItems.length > 0 && (
  <div className="flex gap-1 flex-wrap">
    {(['primer', 'segundo', 'postre', 'bebida'] as const).map(p => (
      <button
        key={p}
        type="button"
        onClick={() => setPendingPase(prev => prev === p ? '' : p)}
        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
          pendingPase === p
            ? 'bg-[#4f72ff] border-[#4f72ff] text-white'
            : 'border-[#2e3347] text-[#6b7280] hover:text-white hover:border-[#4f72ff]'
        }`}
      >
        {p === 'primer' ? '1er pase' : p === 'segundo' ? '2º pase' : p === 'postre' ? 'Postre' : 'Bebida'}
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 3: Incluir pase en el body del POST**

En el fetch a `/api/tpv/pedidos`, añadir `pase` al body:

```typescript
body: JSON.stringify({
  mesaId,
  items: pendingItems.map(i => ({ ... })),
  nota: pendingNota || undefined,
  pase: pendingPase || undefined,
}),
```

- [ ] **Step 4: Limpiar pase al enviar**

En el bloque `onSuccess` del fetch:
```typescript
onPendingSent();
setPendingNota('');
setPendingPase('');
```

- [ ] **Step 5: Mostrar el pase en la cabecera del pedido en el ticket**

En la lista de `existingOrders`, el pase está disponible como `order.pase`. Mostrarlo como badge junto al número de pedido:

```tsx
<span className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider">
  Pedido #{order.numeroPedido}
  {order.pase && (
    <span className="ml-2 text-[#4f72ff]">
      {order.pase === 'primer' ? '1er' : order.pase === 'segundo' ? '2º' : order.pase === 'postre' ? 'Postre' : 'Bebida'}
    </span>
  )}
</span>
```

- [ ] **Step 6: Commit**

```bash
git add src/components/tpv/TicketPanel.tsx
git commit -m "feat(tpv/mostrador): selector de pase al enviar pedido a cocina"
```

---

### Task 9: KDS — agrupar items por pase

**Files:**
- Modify: `src/app/api/waiter/kitchen/orders/route.ts` (o el endpoint que usa la kitchen page) — exponer `pase`
- Modify: `src/app/waiter/kitchen/page.tsx` — añadir `pase` a `KitchenItem`, agrupar secciones

- [ ] **Step 1: Exponer `pase` en la API de items de cocina**

Buscar el endpoint que alimenta la kitchen page (`/api/waiter/kitchen/items`). En la query de pedidos, añadir `pase` al select. En el mapeo de items, incluirlo:

```typescript
// En el join pedidos → items, añadir:
pase: (pedido.pase as string | null) ?? null,
```

- [ ] **Step 2: Añadir `pase` a `KitchenItem`**

En `src/app/waiter/kitchen/page.tsx`, ampliar la interfaz:

```typescript
interface KitchenItem {
  // ... campos existentes ...
  pase: string | null;
}
```

- [ ] **Step 3: Agrupar items por pase en la sección "Nuevos"**

Actualmente `nuevosItems` es un array plano. Agruparlos por pase:

```typescript
const PASE_ORDER = ['primer', 'segundo', 'postre', 'bebida', null];
const PASE_LABEL: Record<string, string> = {
  primer: '1er Pase',
  segundo: '2º Pase',
  postre: 'Postre',
  bebida: 'Bebidas',
};

const nuevosByPase = PASE_ORDER.map(pase => ({
  pase,
  label: pase ? PASE_LABEL[pase] : 'Sin pase',
  items: nuevosItems.filter(i => (i.pase ?? null) === pase),
})).filter(g => g.items.length > 0);
```

- [ ] **Step 4: Renderizar secciones de pase en la UI de cocina**

Dentro del render de "Nuevos", envolver los items en grupos con cabecera:

```tsx
{nuevosByPase.map(grupo => (
  <div key={grupo.pase ?? 'null'}>
    {nuevosByPase.length > 1 && (
      <div className="px-4 py-2 text-[10px] font-bold text-[#6b7280] uppercase tracking-wider border-b border-[#2e3347] sticky top-0 bg-[inherit]">
        {grupo.label}
      </div>
    )}
    {/* render items del grupo con la lógica existente */}
  </div>
))}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/waiter/kitchen/page.tsx src/app/api/waiter/kitchen/
git commit -m "feat(kitchen): agrupar items por pase (marchas) en el KDS"
```

---

## Verification

- [ ] Turno cerrar: el teórico de efectivo aparece como `—` hasta que el operador introduce su cifra
- [ ] Inventario físico: `/admin/stock/inventario` accesible, permite conteo parcial, muestra desviaciones, registra movimientos tipo `inventario` en DB
- [ ] Pases: en el mostrador el selector de pase aparece al añadir items; al enviar, el pedido se guarda con el pase; en kitchen los items se agrupan por sección de pase

## Final commit tag

```bash
git tag pre-electron-tpv-v1
```
