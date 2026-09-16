# Recogida implícita sin toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Recogida en tienda" deja de ser un toggle/modalidad configurable — pasa a ser el comportamiento implícito, gratuito y no-editable de cualquier pedido de tienda que no elija una modalidad de envío a domicilio real. El único control de admin que queda es "Envío a domicilio habilitado".

**Architecture:** El backend infiere `modalidad_entrega_tipo = 'recogida'` (con `modalidad_entrega_id = null`) para todo pedido de tienda que no llegue con un `modalidad_entrega_id` real — el cliente nunca manda nada para recogida. El carrito pasa de "2 tabs" a "1 lista única" con "Recoger en local" fijo en código como primer ítem, preseleccionado.

**Tech Stack:** Next.js App Router, TypeScript, Zod, Supabase/Postgres, Tailwind, Vitest + Testing Library.

Spec de referencia: `docs/superpowers/specs/2026-09-15-recogida-implicita-sin-toggle-design.md`

---

### Task 1: Migración — borrar filas `recogida` y la columna del toggle

**Files:**
- New migration: `supabase/migrations/20260915000002_recogida_implicita_sin_toggle.sql`

- [ ] **Step 1: Verificar en vivo cuántas filas `recogida` existen (antes de borrarlas)**

```sql
SELECT id, empresa_id, nombre_es FROM public.modalidades_entrega WHERE tipo = 'recogida';
```

Anotar el resultado real en el mensaje de commit del Step 3.

- [ ] **Step 2: Escribir la migración**

```sql
-- Recogida en tienda pasa a ser implícita y no configurable — ver
-- docs/superpowers/specs/2026-09-15-recogida-implicita-sin-toggle-design.md

-- Las filas tipo='recogida' quedan huérfanas: TiendaFulfillmentSelector ya
-- no las lee (recogida es un ítem fijo en el código), y PedidoUseCase ya
-- no necesita un modalidad_entrega_id para persistir 'recogida'.
DELETE FROM public.modalidades_entrega WHERE tipo = 'recogida';

-- El único toggle que queda es envio_domicilio_habilitado.
ALTER TABLE public.empresas DROP COLUMN recogida_tienda_habilitada;
```

- [ ] **Step 3: Aplicar con `supabase db push --linked` (nunca MCP suelto) y verificar**

```bash
supabase db push --linked
supabase migration list --linked
```
Expected: la fila `20260915000002` con `Local == Remote`.

```bash
pnpm db:smoke
```
Expected: exit 0.

Confirmar en vivo (solo lectura):
```sql
SELECT count(*) FROM public.modalidades_entrega WHERE tipo = 'recogida';
SELECT column_name FROM information_schema.columns WHERE table_name = 'empresas' AND column_name = 'recogida_tienda_habilitada';
```
Expected: `0` filas en la primera consulta, ninguna fila en la segunda (columna ya no existe).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260915000002_recogida_implicita_sin_toggle.sql
git commit -m "feat(db): borrar modalidades de recogida y el toggle recogida_tienda_habilitada"
```

---

### Task 2: Zod — `createModalidadEntregaSchema` solo acepta domicilio

**Files:**
- Modify: `src/core/application/dtos/modalidad-entrega.dto.ts`
- Test: `tests/core/modalidad-entrega-dto.test.ts`

> Nota: no se puede aplicar esta task antes que la Task 1 en un ambiente
> real (rechazar `tipo: 'recogida'` en el schema mientras todavía existen
> filas `recogida` en la DB no las borra, pero deja el sistema en un estado
> raro donde existen pero no se pueden volver a crear). El orden de este
> plan ya las pone en la secuencia correcta.

- [ ] **Step 1: Reemplazar los 6 tests de `createModalidadEntregaSchema` que usan `tipo: 'recogida'`**

El archivo completo de tests para `createModalidadEntregaSchema` queda así (reemplazar el `describe('createModalidadEntregaSchema', ...)` completo, líneas 4-122 del archivo actual):

```typescript
describe('createModalidadEntregaSchema', () => {
  it('rechaza tipo recogida — ya no es una modalidad creable, es implícita en el backend', () => {
    const parsed = createModalidadEntregaSchema.safeParse({
      empresaId: '11111111-1111-1111-8111-111111111111',
      tipo: 'recogida',
      icono: 'store',
      nombre_es: 'Recogida rápida',
      precioCents: 0,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some(i => i.path[0] === 'tipo')).toBe(true);
    }
  });

  it('acepta domicilio con rango de tiempo', () => {
    const parsed = createModalidadEntregaSchema.safeParse({
      empresaId: '11111111-1111-1111-8111-111111111111',
      tipo: 'domicilio',
      icono: 'bike',
      nombre_es: 'Envío estándar',
      precioCents: 350,
      tiempoMinMinutos: 120,
      tiempoMaxMinutos: 180,
    });
    expect(parsed.success).toBe(true);
  });

  it('rechaza tiempoMinMinutos mayor que tiempoMaxMinutos', () => {
    const parsed = createModalidadEntregaSchema.safeParse({
      empresaId: '11111111-1111-1111-8111-111111111111',
      tipo: 'domicilio',
      icono: 'bike',
      nombre_es: 'Envío estándar',
      precioCents: 350,
      tiempoMinMinutos: 180,
      tiempoMaxMinutos: 120,
    });
    expect(parsed.success).toBe(false);
  });

  it('acepta tiempoMinMinutos igual a tiempoMaxMinutos', () => {
    const parsed = createModalidadEntregaSchema.safeParse({
      empresaId: '11111111-1111-1111-8111-111111111111',
      tipo: 'domicilio',
      icono: 'bike',
      nombre_es: 'Envío exprés',
      precioCents: 500,
      tiempoMinMinutos: 100,
      tiempoMaxMinutos: 100,
    });
    expect(parsed.success).toBe(true);
  });

  it('sigue aplicando orden=0 por defecto al crear si no se manda', () => {
    const parsed = createModalidadEntregaSchema.safeParse({
      empresaId: '11111111-1111-1111-8111-111111111111',
      tipo: 'domicilio',
      icono: 'bike',
      nombre_es: 'Envío estándar',
      precioCents: 350,
      tiempoMinMinutos: 30,
      tiempoMaxMinutos: 60,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.orden).toBe(0);
    }
  });
});
```

(Se eliminan los tests "acepta/rechaza recogida con tiempo..." y "acepta/rechaza precioCents ... cuando tipo es recogida" — ya no tiene sentido probar reglas de un `tipo` que el schema rechaza de entrada. El test de `orden=0` cambia su fixture de `recogida` a `domicilio` para no depender de un tipo que ya no es válido, preservando exactamente lo que verificaba: el default de `orden`.)

El `describe('updateModalidadEntregaSchema', ...)` (líneas 124-143 del archivo actual) no cambia — sigue igual.

- [ ] **Step 2: Ejecutar y verificar que el primer test falla (RED)**

Run: `npx vitest run tests/core/modalidad-entrega-dto.test.ts`
Expected: FAIL en `'rechaza tipo recogida...'` — el schema hoy todavía acepta `tipo: 'recogida'`.

- [ ] **Step 3: Restringir `tipo` a domicilio en `createModalidadEntregaSchema`**

En `src/core/application/dtos/modalidad-entrega.dto.ts`, reemplazar:
```typescript
export const createModalidadEntregaSchema = baseModalidadEntregaSchema
  .extend({ orden: z.number().int().min(0).default(0) })
  .superRefine((data, ctx) => {
    if (data.tipo === 'recogida') {
      if (data.tiempoMinMinutos !== undefined) {
        ctx.addIssue({ code: 'custom', message: 'Recogida no admite tiempo estimado (siempre es inmediata)', path: ['tiempoMinMinutos'] });
      }
      if (data.tiempoMaxMinutos !== undefined) {
        ctx.addIssue({ code: 'custom', message: 'Recogida no admite tiempo estimado (siempre es inmediata)', path: ['tiempoMaxMinutos'] });
      }
      if (data.precioCents !== 0) {
        ctx.addIssue({ code: 'custom', message: 'Recogida siempre es gratis (precio debe ser 0)', path: ['precioCents'] });
      }
    }
  })
  .refine(
    (data) => data.tiempoMinMinutos === undefined || data.tiempoMaxMinutos === undefined || data.tiempoMinMinutos <= data.tiempoMaxMinutos,
    { message: 'El tiempo mínimo no puede ser mayor que el máximo', path: ['tiempoMaxMinutos'] }
  );
```
por:
```typescript
export const createModalidadEntregaSchema = baseModalidadEntregaSchema
  .extend({
    orden: z.number().int().min(0).default(0),
    // Recogida ya no es una modalidad creable — es implícita y gratuita en
    // el backend (ver PedidoUseCase.revalidarModalidadEntrega). Solo
    // domicilio se sigue configurando desde el admin.
    tipo: z.literal('domicilio'),
  })
  .refine(
    (data) => data.tiempoMinMinutos === undefined || data.tiempoMaxMinutos === undefined || data.tiempoMinMinutos <= data.tiempoMaxMinutos,
    { message: 'El tiempo mínimo no puede ser mayor que el máximo', path: ['tiempoMaxMinutos'] }
  );
```

> `baseModalidadEntregaSchema.tipo` (`z.enum(['recogida', 'domicilio'])`) no
> se toca — lo sigue usando `updateModalidadEntregaSchema` vía
> `.omit({ tipo: true })` (así que el enum ahí es irrelevante) y refleja el
> `CHECK` de la DB, que tampoco se toca (ver spec, sección DB).

- [ ] **Step 4: Ejecutar y verificar que pasa (GREEN)**

Run: `npx vitest run tests/core/modalidad-entrega-dto.test.ts`
Expected: PASS — 6 tests (`createModalidadEntregaSchema`) + 2 tests (`updateModalidadEntregaSchema`).

- [ ] **Step 5: `pnpm lint && pnpm typecheck`**

Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/core/application/dtos/modalidad-entrega.dto.ts tests/core/modalidad-entrega-dto.test.ts
git commit -m "feat(modalidad-entrega): createModalidadEntregaSchema solo acepta tipo domicilio"
```

---

### Task 3: Backend — persistir recogida implícita sin `modalidad_entrega_id`

**Files:**
- Modify: `src/core/application/use-cases/pedido.use-case.ts`
- Test: `tests/core/pedido-modalidad-revalidacion.test.ts`

- [ ] **Step 1: Escribir el test que falla primero**

Agregar a `tests/core/pedido-modalidad-revalidacion.test.ts`, dentro del
`describe('PedidoUseCase.create — revalidación server-side de la modalidad de entrega', ...)`
existente (usa los helpers `buildUseCase`/`baseDto` ya definidos en ese archivo):

```typescript
it('un pedido de tienda sin modalidad_entrega_id en el body persiste recogida implícita, gratis, sin id', async () => {
  const modalidadEntregaUseCase = {
    validarPrecioVigente: vi.fn(),
  } as unknown as ModalidadEntregaUseCase;
  const { useCase, pedidoRepoCreate } = buildUseCase(modalidadEntregaUseCase);

  const result = await useCase.create('empresa-1', baseDto(), 'tienda', null, false, false);

  expect(result.success).toBe(true);
  expect(modalidadEntregaUseCase.validarPrecioVigente).not.toHaveBeenCalled();
  const [, , , finalTotal, , , payload] = pedidoRepoCreate.mock.calls[0] as [
    string, string, unknown, number, unknown, unknown, Record<string, unknown>
  ];
  expect(finalTotal).toBeCloseTo(10); // solo el producto, recogida no suma nada
  expect(payload.modalidad_entrega_tipo).toBe('recogida');
  expect(payload.modalidad_entrega_id).toBeNull();
  expect(payload.modalidad_entrega_precio_cents).toBe(0);
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/core/pedido-modalidad-revalidacion.test.ts`
Expected: FAIL — hoy `payload` es `undefined` (no se persiste nada), así que `payload.modalidad_entrega_tipo` explota o el `toBe('recogida')` falla.

- [ ] **Step 3: Cambiar `revalidarModalidadEntrega` para devolver `'recogida'` implícito**

En `src/core/application/use-cases/pedido.use-case.ts`, reemplazar:
```typescript
  private async revalidarModalidadEntrega(
    data: CreatePedidoDTO,
    empresaId: string,
    empresaTipo: string
  ): Promise<Result<{ precioCents: number; tipo: 'recogida' | 'domicilio' | undefined }>> {
    if (empresaTipo !== 'tienda' || !data.modalidad_entrega_id) {
      return { success: true, data: { precioCents: 0, tipo: undefined } };
    }
```
por:
```typescript
  private async revalidarModalidadEntrega(
    data: CreatePedidoDTO,
    empresaId: string,
    empresaTipo: string
  ): Promise<Result<{ precioCents: number; tipo: 'recogida' | 'domicilio' | undefined }>> {
    // Sin modalidad_entrega_id, un pedido de tienda es recogida implícita —
    // el cliente nunca manda nada para recogida (no existe fila que
    // referenciar desde que se eliminó del admin). Restaurante/mesa siguen
    // sin marcar nada (`undefined`), es un concepto exclusivo de tienda.
    if (empresaTipo !== 'tienda') {
      return { success: true, data: { precioCents: 0, tipo: undefined } };
    }
    if (!data.modalidad_entrega_id) {
      return { success: true, data: { precioCents: 0, tipo: 'recogida' } };
    }
```

(El resto del método, desde `const modalidadResult = await this.modalidadEntregaUseCase.validarPrecioVigente(...)` en adelante, no cambia.)

- [ ] **Step 4: Cambiar `buildModalidadPayload` para no exigir `modalidad_entrega_id`**

Reemplazar:
```typescript
  private buildModalidadPayload(
    data: CreatePedidoDTO,
    modalidadTipoValidado: 'recogida' | 'domicilio' | undefined,
    modalidadPrecioCents: number
  ) {
    if (!data.modalidad_entrega_id || !modalidadTipoValidado) return undefined;
    return {
      modalidad_entrega_id: data.modalidad_entrega_id,
      modalidad_entrega_tipo: modalidadTipoValidado,
      modalidad_entrega_precio_cents: modalidadPrecioCents,
      ...(modalidadTipoValidado === 'domicilio' ? {
        direccion_entrega: data.direccion_entrega,
        codigo_postal: data.codigo_postal,
        latitude_entrega: data.latitude_entrega,
        longitude_entrega: data.longitude_entrega,
      } : {}),
    };
  }
```
por:
```typescript
  private buildModalidadPayload(
    data: CreatePedidoDTO,
    modalidadTipoValidado: 'recogida' | 'domicilio' | undefined,
    modalidadPrecioCents: number
  ) {
    // Ya no se exige `data.modalidad_entrega_id` — recogida implícita no
    // tiene id (no existe fila que referenciar), pero igual se persiste
    // `modalidad_entrega_tipo: 'recogida'` para que el panel admin siga
    // mostrando el badge correspondiente (ver getTiendaModalidadBadgeInfo).
    if (!modalidadTipoValidado) return undefined;
    return {
      modalidad_entrega_id: data.modalidad_entrega_id ?? null,
      modalidad_entrega_tipo: modalidadTipoValidado,
      modalidad_entrega_precio_cents: modalidadPrecioCents,
      ...(modalidadTipoValidado === 'domicilio' ? {
        direccion_entrega: data.direccion_entrega,
        codigo_postal: data.codigo_postal,
        latitude_entrega: data.latitude_entrega,
        longitude_entrega: data.longitude_entrega,
      } : {}),
    };
  }
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/core/pedido-modalidad-revalidacion.test.ts`
Expected: PASS — todos los tests del archivo (los ya existentes + el nuevo).

> El archivo ya tiene un test viejo (Task 15 de la sesión anterior) que
> queda duplicado por el del Step 1 de esta task — mismo setup exacto
> (`baseDto()`, sin `modalidad_entrega_id`, tienda), y su aserción
> `expect(payload?.modalidad_entrega_id).toBeUndefined()` ahora es
> directamente falsa (el campo pasa a ser `null`, no `undefined`). Borrar
> ese test completo antes de correr la suite:
> ```typescript
> it('no persiste campos de modalidad si el pedido no incluye modalidad_entrega_id', async () => {
>   const modalidadEntregaUseCase = {
>     validarPrecioVigente: vi.fn(),
>   } as unknown as ModalidadEntregaUseCase;
>   const { useCase, pedidoRepoCreate } = buildUseCase(modalidadEntregaUseCase);
>
>   const result = await useCase.create('empresa-1', baseDto(), 'tienda', null, false, false);
>
>   expect(result.success).toBe(true);
>   expect(modalidadEntregaUseCase.validarPrecioVigente).not.toHaveBeenCalled();
>   const [, , , finalTotal, , , payload] = pedidoRepoCreate.mock.calls[0] as [
>     string, string, unknown, number, unknown, unknown, Record<string, unknown> | undefined
>   ];
>   expect(finalTotal).toBeCloseTo(10);
>   expect(payload?.modalidad_entrega_id).toBeUndefined();
> });
> ```
> (Se borra entero — el test del Step 1 de esta misma task prueba
> exactamente el mismo escenario con la aserción correcta, no hace falta
> quedarse con los dos.)

- [ ] **Step 6: `pnpm lint && pnpm typecheck`**

Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/core/application/use-cases/pedido.use-case.ts tests/core/pedido-modalidad-revalidacion.test.ts
git commit -m "feat(pedidos): persistir recogida implicita sin modalidad_entrega_id"
```

---

### Task 4: Dominio y DTOs — retirar `recogidaTiendaHabilitada`

**Files:**
- Modify: `src/core/domain/entities/types.ts`
- Modify: `src/core/domain/repositories/IEmpresaRepository.ts`
- Modify: `src/core/application/dtos/empresa.dto.ts`
- Modify: `src/core/infrastructure/database/SupabaseAdminRepository.ts`
- Modify: `src/core/infrastructure/database/supabase-empresa.repository.ts`
- Modify: `src/app/admin/(protected)/admin-sidebar.tsx` (solo un comentario)

- [ ] **Step 1: `types.ts` — quitar el campo de `Empresa` y `EmpresaPublic`**

Quitar la línea `recogidaTiendaHabilitada: boolean;` de ambas interfaces
(aparece 2 veces en el archivo: una dentro de `Empresa`, cerca de
`deliveryHabilitado: boolean;`/`envioDomicilioHabilitado: boolean;`, y otra
igual dentro de `EmpresaPublic`).

- [ ] **Step 2: `IEmpresaRepository.ts` — quitar el campo de `UpdateEmpresaData`**

Quitar la línea `recogida_tienda_habilitada?: boolean;` de la interfaz
`UpdateEmpresaData` (queda entre `delivery_habilitado?: boolean;` y
`envio_domicilio_habilitado?: boolean;`).

- [ ] **Step 3: `empresa.dto.ts` — quitar el campo del schema Zod**

Quitar la línea `recogida_tienda_habilitada: z.boolean().optional(),` de
`updateEmpresaSchema`.

- [ ] **Step 4: `SupabaseAdminRepository.ts` — quitar el mapeo**

Quitar la línea `recogidaTiendaHabilitada: (row.recogida_tienda_habilitada as boolean) ?? false,`.

- [ ] **Step 5: `supabase-empresa.repository.ts` — quitar el campo de `CAMPOS_DIRECTOS`, el SELECT y los 2 mapeos**

Quitar `'recogida_tienda_habilitada'` del array `CAMPOS_DIRECTOS`.

Quitar `recogida_tienda_habilitada` del SELECT que arma
`getById`/`getByDominio` (la lista de columnas separadas por coma que
incluye `mesas_habilitadas, pagos_pickup_habilitados, delivery_habilitado,
recogida_tienda_habilitada, envio_domicilio_habilitado`).

Quitar la línea `recogidaTiendaHabilitada: (empresa.recogida_tienda_habilitada as boolean) ?? false,`
(mapper de `Empresa`) y la línea equivalente
`recogidaTiendaHabilitada: (data.recogida_tienda_habilitada as boolean) ?? false,`
(mapper de `EmpresaPublic`).

- [ ] **Step 6: `admin-sidebar.tsx` — actualizar el comentario (no hay código que tocar)**

Reemplazar:
```typescript
  // `deliveryHabilitado` es el flag viejo, exclusivo del sistema Glovo de
  // restaurante. Para tienda, "/admin/delivery" es la ÚNICA puerta a los
  // toggles recogida_tienda_habilitada/envio_domicilio_habilitado — sin este
  // OR, esos toggles nacen en false y no hay forma de llegar a la pantalla
  // que los prende, aunque el resto de la feature esté bien implementada.
```
por:
```typescript
  // `deliveryHabilitado` es el flag viejo, exclusivo del sistema Glovo de
  // restaurante. Para tienda, "/admin/delivery" es la ÚNICA puerta al
  // toggle envio_domicilio_habilitado — sin este OR, ese toggle nace en
  // false y no hay forma de llegar a la pantalla que lo prende, aunque el
  // resto de la feature esté bien implementada.
```

- [ ] **Step 7: `pnpm lint && pnpm typecheck`**

Expected: van a aparecer errores de TypeScript en los archivos que todavía
usan `recogidaTiendaHabilitada`/`recogida_tienda_habilitada` (Tasks 5-7 de
este plan) — es esperado, esos archivos se corrigen en las tasks
siguientes. Confirmar que los errores son EXACTAMENTE en esos archivos y
no en otro lado inesperado.

- [ ] **Step 8: Commit**

```bash
git add src/core/domain/entities/types.ts src/core/domain/repositories/IEmpresaRepository.ts src/core/application/dtos/empresa.dto.ts src/core/infrastructure/database/SupabaseAdminRepository.ts src/core/infrastructure/database/supabase-empresa.repository.ts "src/app/admin/(protected)/admin-sidebar.tsx"
git commit -m "feat(empresa): retirar el campo recogidaTiendaHabilitada del dominio"
```

---

### Task 5: Admin UI — sin toggle ni formulario de recogida

**Files:**
- Modify: `src/components/admin/TiendaDeliverySettings.tsx`
- Modify: `src/components/admin/ModalidadesEntregaForm.tsx`
- Modify: `src/app/admin/(protected)/delivery/page.tsx`
- Test: `tests/ui/tienda-delivery-settings.test.tsx`
- Test: `tests/ui/modalidades-entrega-form.test.tsx`

- [ ] **Step 1: `ModalidadesEntregaForm.tsx` — quitar la prop `tipo`, asumir domicilio siempre**

Reemplazar el archivo completo:

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { ICONOS_MODALIDAD_ENTREGA, emojiDeIcono } from '@/lib/modalidad-entrega-iconos';

export interface ModalidadEntregaRow {
  id: string;
  tipo: 'recogida' | 'domicilio';
  icono: string;
  nombre: string;
  precioCents: number;
  tiempoMinMinutos: number | null;
  tiempoMaxMinutos: number | null;
  activo: boolean;
  orden: number;
}

interface ModalidadesEntregaFormProps {
  modalidades: ModalidadEntregaRow[];
  onCreate: (data: {
    tipo: 'domicilio';
    icono: string;
    nombre_es: string;
    precioCents: number;
    tiempoMinMinutos: number;
    tiempoMaxMinutos: number;
  }) => void;
  onUpdate: (id: string, data: Partial<ModalidadEntregaRow>) => void;
  onDelete: (id: string) => void;
}

export function ModalidadesEntregaForm({
  modalidades,
  onCreate,
  onUpdate,
  onDelete,
}: Readonly<ModalidadesEntregaFormProps>) {
  const { language } = useLanguage();
  const [icono, setIcono] = useState<string>(ICONOS_MODALIDAD_ENTREGA[0].value);
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('0');
  const [tiempoMin, setTiempoMin] = useState('');
  const [tiempoMax, setTiempoMax] = useState('');

  const handleSubmit = () => {
    onCreate({
      tipo: 'domicilio',
      icono,
      nombre_es: nombre,
      precioCents: Math.round(Number(precio) * 100),
      tiempoMinMinutos: Number(tiempoMin) || 0,
      tiempoMaxMinutos: Number(tiempoMax) || 0,
    });
    setNombre('');
    setPrecio('0');
    setTiempoMin('');
    setTiempoMax('');
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {modalidades.map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
            <span className="text-lg">{emojiDeIcono(m.icono)}</span>
            <span className="flex-1 font-medium text-white">{m.nombre}</span>
            <span className="text-sm text-slate-400">{(m.precioCents / 100).toFixed(2)}€</span>
            {m.tiempoMinMinutos !== null && (
              <span className="text-sm text-slate-400">
                {m.tiempoMinMinutos}-{m.tiempoMaxMinutos} {t('deliveryModalityMinutesUnit', language)}
              </span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onUpdate(m.id, { activo: !m.activo })}
              aria-label={m.activo ? t('deliveryModalityDeactivate', language) : t('deliveryModalityActivate', language)}
            >
              {m.activo ? '✓' : '○'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onDelete(m.id)}
              aria-label={t('deliveryModalityDelete', language)}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-white/20 p-3">
        <div>
          <label htmlFor="icono-domicilio" className="text-xs font-medium text-slate-400 block mb-1">
            {t('deliveryModalityIcon', language)}
          </label>
          <Select value={icono} onValueChange={setIcono}>
            <SelectTrigger id="icono-domicilio">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ICONOS_MODALIDAD_ENTREGA.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.emoji} {t(i.labelKey, language)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor="nombre-domicilio" className="text-xs font-medium text-slate-400 block mb-1">
            {t('deliveryModalityName', language)}
          </label>
          <Input
            id="nombre-domicilio"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={100}
          />
        </div>
        <div>
          <label htmlFor="precio-domicilio" className="text-xs font-medium text-slate-400 block mb-1">
            {t('deliveryModalityPrice', language)}
          </label>
          <Input
            id="precio-domicilio"
            type="number"
            min="0"
            step="0.10"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="tiempo-min-domicilio" className="text-xs font-medium text-slate-400 block mb-1">
            {t('deliveryModalityMinTime', language)}
          </label>
          <Input
            id="tiempo-min-domicilio"
            type="number"
            min="0"
            value={tiempoMin}
            onChange={(e) => setTiempoMin(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="tiempo-max-domicilio" className="text-xs font-medium text-slate-400 block mb-1">
            {t('deliveryModalityMaxTime', language)}
          </label>
          <Input
            id="tiempo-max-domicilio"
            type="number"
            min="0"
            value={tiempoMax}
            onChange={(e) => setTiempoMax(e.target.value)}
          />
        </div>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!nombre.trim()}
          className="col-span-2"
        >
          {t('deliveryModalityAddButton', language)}
        </Button>
      </div>
    </div>
  );
}
```

(Se simplificó: sin `tipo` como prop, sin ramas condicionadas a
`tipo === 'domicilio'`/`'recogida'` — todo el formulario asume domicilio.
El campo `id`s de los inputs quedan fijos como `-domicilio` en vez de
`-${tipo}` porque ya no hay otro `tipo` posible en este componente.)

- [ ] **Step 2: Reemplazar `tests/ui/modalidades-entrega-form.test.tsx` completo**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { ModalidadesEntregaForm, type ModalidadEntregaRow } from '@/components/admin/ModalidadesEntregaForm';

const modalidadDomicilio: ModalidadEntregaRow = {
  id: 'm1',
  tipo: 'domicilio',
  icono: 'bike',
  nombre: 'Envío estándar',
  precioCents: 350,
  tiempoMinMinutos: 30,
  tiempoMaxMinutos: 60,
  activo: true,
  orden: 0,
};

function renderForm(
  modalidades: ModalidadEntregaRow[] = [],
  onCreate = vi.fn(),
  onUpdate = vi.fn(),
  onDelete = vi.fn()
) {
  return render(
    <LanguageProvider>
      <ModalidadesEntregaForm
        modalidades={modalidades}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    </LanguageProvider>
  );
}

describe('ModalidadesEntregaForm', () => {
  it('muestra los campos de precio, tiempo mínimo y tiempo máximo', () => {
    renderForm([]);
    expect(screen.getByLabelText(/precio/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tiempo mínimo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tiempo máximo/i)).toBeInTheDocument();
  });

  it('llama a onCreate con precioCents, tiempoMinMinutos y tiempoMaxMinutos', () => {
    const onCreate = vi.fn();
    renderForm([], onCreate);
    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: 'Envío estándar' },
    });
    fireEvent.change(screen.getByLabelText(/precio/i), {
      target: { value: '3.50' },
    });
    fireEvent.change(screen.getByLabelText(/tiempo mínimo/i), {
      target: { value: '120' },
    });
    fireEvent.change(screen.getByLabelText(/tiempo máximo/i), {
      target: { value: '180' },
    });
    fireEvent.click(screen.getByRole('button', { name: /añadir modalidad/i }));
    expect(onCreate).toHaveBeenCalledWith({
      tipo: 'domicilio',
      icono: 'store',
      nombre_es: 'Envío estándar',
      precioCents: 350,
      tiempoMinMinutos: 120,
      tiempoMaxMinutos: 180,
    });
  });

  it('llama a onUpdate para alternar activo al hacer click en el botón de activar/desactivar', () => {
    const onUpdate = vi.fn();
    renderForm([modalidadDomicilio], vi.fn(), onUpdate);
    fireEvent.click(screen.getByRole('button', { name: /desactivar/i }));
    expect(onUpdate).toHaveBeenCalledWith('m1', { activo: false });
  });

  it('llama a onDelete al hacer click en el botón de borrar', () => {
    const onDelete = vi.fn();
    renderForm([modalidadDomicilio], vi.fn(), vi.fn(), onDelete);
    fireEvent.click(screen.getByRole('button', { name: /borrar modalidad/i }));
    expect(onDelete).toHaveBeenCalledWith('m1');
  });
});
```

(`icono: 'store'` en la aserción de `onCreate` porque `ICONOS_MODALIDAD_ENTREGA[0].value` — el default del `useState` — es `'store'`; el test no cambia el selector de ícono, así que viaja tal cual.)

- [ ] **Step 3: `TiendaDeliverySettings.tsx` — quitar el toggle y el bloque de recogida**

Reemplazar el archivo completo:

```tsx
'use client';

import { useCallback, useState } from 'react';
import { PillSwitch } from '@/components/ui/pill-switch';
import { ModalidadesEntregaForm, type ModalidadEntregaRow } from '@/components/admin/ModalidadesEntregaForm';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface TiendaDeliverySettingsProps {
  empresaId: string;
  envioHabilitado: boolean;
  modalidadesIniciales: ModalidadEntregaRow[];
}

interface CreateModalidadInput {
  tipo: 'domicilio';
  icono: string;
  nombre_es: string;
  precioCents: number;
  tiempoMinMinutos: number;
  tiempoMaxMinutos: number;
}

type Lang = Parameters<typeof t>[1];

interface ErrorPayload {
  error?: string;
}

async function extraerMensajeError(res: Response, language: Lang): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as ErrorPayload;
  return data.error ?? t('errorSaving', language);
}

export function TiendaDeliverySettings({
  empresaId,
  envioHabilitado: envioInicial,
  modalidadesIniciales,
}: Readonly<TiendaDeliverySettingsProps>) {
  const { language } = useLanguage();
  const [envioHabilitado, setEnvioHabilitado] = useState(envioInicial);
  const [savingEnvio, setSavingEnvio] = useState(false);
  const [modalidades, setModalidades] = useState<ModalidadEntregaRow[]>(modalidadesIniciales);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const toggleEnvio = useCallback(async () => {
    const nuevoValor = !envioHabilitado;
    setEnvioHabilitado(nuevoValor);
    setSavingEnvio(true);
    setFeedback(null);
    try {
      const res = await fetchWithCsrf('/api/admin/empresa', {
        method: 'PUT',
        body: JSON.stringify({ envio_domicilio_habilitado: nuevoValor }),
      });
      if (!res.ok) {
        setEnvioHabilitado(!nuevoValor);
        setFeedback({ ok: false, message: await extraerMensajeError(res, language) });
      }
    } catch {
      setEnvioHabilitado(!nuevoValor);
      setFeedback({ ok: false, message: t('connectionError', language) });
    } finally {
      setSavingEnvio(false);
    }
  }, [envioHabilitado, language]);

  const handleCreate = useCallback(
    async (data: CreateModalidadInput) => {
      setFeedback(null);
      try {
        const res = await fetchWithCsrf('/api/admin/modalidades-entrega', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          setFeedback({ ok: false, message: await extraerMensajeError(res, language) });
          return;
        }
        const creada = (await res.json()) as ModalidadEntregaRow;
        setModalidades((prev) => [...prev, creada]);
      } catch {
        setFeedback({ ok: false, message: t('connectionError', language) });
      }
    },
    [language]
  );

  const handleUpdate = useCallback(
    async (id: string, data: Partial<ModalidadEntregaRow>) => {
      setFeedback(null);
      try {
        const res = await fetchWithCsrf(`/api/admin/modalidades-entrega?id=${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          setFeedback({ ok: false, message: await extraerMensajeError(res, language) });
          return;
        }
        const actualizada = (await res.json()) as ModalidadEntregaRow;
        setModalidades((prev) => prev.map((m) => (m.id === id ? actualizada : m)));
      } catch {
        setFeedback({ ok: false, message: t('connectionError', language) });
      }
    },
    [language]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setFeedback(null);
      try {
        const res = await fetchWithCsrf(`/api/admin/modalidades-entrega?id=${id}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          setFeedback({ ok: false, message: await extraerMensajeError(res, language) });
          return;
        }
        setModalidades((prev) => prev.filter((m) => m.id !== id));
      } catch {
        setFeedback({ ok: false, message: t('connectionError', language) });
      }
    },
    [language]
  );

  return (
    <div className="space-y-10" data-empresa-id={empresaId}>
      <section>
        <h2 className="text-2xl font-bold text-white mb-6">{t('deliveryMethodTitle', language)}</h2>
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-white">{t('tiendaEnvioLabel', language)}</span>
            <PillSwitch
              checked={envioHabilitado}
              disabled={savingEnvio}
              onChange={toggleEnvio}
              ariaLabel={t('tiendaEnvioLabel', language)}
            />
          </div>
        </div>
      </section>

      {feedback && (
        <p
          role={feedback.ok ? 'status' : 'alert'}
          className={`text-sm ${feedback.ok ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}
        >
          {feedback.message}
        </p>
      )}

      {envioHabilitado && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            {t('tiendaEnvioLabel', language)}
          </h3>
          <ModalidadesEntregaForm
            modalidades={modalidades}
            onCreate={handleCreate}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Reemplazar `tests/ui/tienda-delivery-settings.test.tsx` completo**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { TiendaDeliverySettings } from '@/components/admin/TiendaDeliverySettings';
import type { ModalidadEntregaRow } from '@/components/admin/ModalidadesEntregaForm';

const fetchWithCsrf = vi.fn();
vi.mock('@/lib/csrf-client', () => ({
  fetchWithCsrf: (...args: unknown[]) => fetchWithCsrf(...args),
}));

const modalidadDomicilio: ModalidadEntregaRow = {
  id: 'm2',
  tipo: 'domicilio',
  icono: 'bike',
  nombre: 'Envío estándar',
  precioCents: 350,
  tiempoMinMinutos: 30,
  tiempoMaxMinutos: 60,
  activo: true,
  orden: 0,
};

function renderComponent(
  envioHabilitado: boolean,
  modalidadesIniciales: ModalidadEntregaRow[] = []
) {
  return render(
    <LanguageProvider>
      <TiendaDeliverySettings
        empresaId="empresa-1"
        envioHabilitado={envioHabilitado}
        modalidadesIniciales={modalidadesIniciales}
      />
    </LanguageProvider>
  );
}

beforeEach(() => {
  fetchWithCsrf.mockReset();
});

describe('TiendaDeliverySettings', () => {
  it('no renderiza el ModalidadesEntregaForm si envío está deshabilitado', () => {
    renderComponent(false, [modalidadDomicilio]);

    expect(screen.queryByRole('button', { name: /añadir modalidad/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Envío estándar')).not.toBeInTheDocument();
  });

  it('renderiza el ModalidadesEntregaForm cuando envioHabilitado es true', () => {
    renderComponent(true, [modalidadDomicilio]);

    expect(screen.getByText('Envío estándar')).toBeInTheDocument();
  });

  it('togglear envío llama a fetchWithCsrf con el PUT correcto', async () => {
    fetchWithCsrf.mockResolvedValue({ ok: true } as Response);
    renderComponent(false);

    const switchEnvio = screen.getByRole('switch', { name: /envío a domicilio/i });
    fireEvent.click(switchEnvio);

    await waitFor(() => {
      expect(fetchWithCsrf).toHaveBeenCalledWith('/api/admin/empresa', {
        method: 'PUT',
        body: JSON.stringify({ envio_domicilio_habilitado: true }),
      });
    });
  });

  it('revierte el switch y muestra error si el PUT falla', async () => {
    fetchWithCsrf.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'No se pudo guardar' }),
    } as Response);
    renderComponent(false);

    const switchEnvio = screen.getByRole('switch', { name: /envío a domicilio/i });
    fireEvent.click(switchEnvio);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar');
    });
    expect(switchEnvio).toHaveAttribute('aria-checked', 'false');
  });
});
```

- [ ] **Step 5: `src/app/admin/(protected)/delivery/page.tsx` — dejar de pasar `recogidaHabilitada`**

Reemplazar:
```tsx
      {empresa?.tipo === 'tienda' && (
        <TiendaDeliverySettings
          empresaId={empresaId!}
          recogidaHabilitada={empresa.recogidaTiendaHabilitada ?? false}
          envioHabilitado={empresa.envioDomicilioHabilitado ?? false}
          modalidadesIniciales={modalidadesIniciales}
        />
      )}
```
por:
```tsx
      {empresa?.tipo === 'tienda' && (
        <TiendaDeliverySettings
          empresaId={empresaId!}
          envioHabilitado={empresa.envioDomicilioHabilitado ?? false}
          modalidadesIniciales={modalidadesIniciales}
        />
      )}
```

- [ ] **Step 6: Ejecutar los tests de ambos componentes**

```bash
npx vitest run tests/ui/tienda-delivery-settings.test.tsx tests/ui/modalidades-entrega-form.test.tsx
```
Expected: PASS.

- [ ] **Step 7: `pnpm lint && pnpm typecheck`**

Expected: sin errores en estos 3 archivos (pueden quedar errores en
`cart-drawer.tsx`/`client-menu-page.tsx`/`TiendaFulfillmentSelector.tsx` —
se corrigen en las Tasks 6-7).

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/TiendaDeliverySettings.tsx src/components/admin/ModalidadesEntregaForm.tsx "src/app/admin/(protected)/delivery/page.tsx" tests/ui/tienda-delivery-settings.test.tsx tests/ui/modalidades-entrega-form.test.tsx
git commit -m "feat(admin): quitar el toggle y formulario de recogida en tienda"
```

---

### Task 6: `TiendaFulfillmentSelector` — lista única, recogida fija primero

**Files:**
- Modify: `src/components/TiendaFulfillmentSelector.tsx`
- Test: `tests/ui/tienda-fulfillment-selector.test.tsx`

- [ ] **Step 1: Reescribir el test completo (falla primero)**

Reemplazar `tests/ui/tienda-fulfillment-selector.test.tsx` completo:

```tsx
import { useState, type ReactElement } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { TiendaFulfillmentSelector, debeMostrarSelector, type ModalidadEntregaPublica } from '@/components/TiendaFulfillmentSelector';

const domicilio: ModalidadEntregaPublica = {
  id: 'd1',
  tipo: 'domicilio',
  icono: 'bike',
  nombre: 'Envío',
  precioCents: 350,
  tiempoMinMinutos: 120,
  tiempoMaxMinutos: 180,
  activo: true,
  orden: 0,
};
const domicilioExpres: ModalidadEntregaPublica = {
  id: 'd2',
  tipo: 'domicilio',
  icono: 'car',
  nombre: 'Envío exprés',
  precioCents: 500,
  tiempoMinMinutos: 30,
  tiempoMaxMinutos: 45,
  activo: true,
  orden: 1,
};

function renderSelector(
  propsOrNode: Readonly<Parameters<typeof TiendaFulfillmentSelector>[0]> | ReactElement,
  isNode = false
) {
  const children = isNode
    ? (propsOrNode as ReactElement)
    : <TiendaFulfillmentSelector {...(propsOrNode as Readonly<Parameters<typeof TiendaFulfillmentSelector>[0]>)} />;
  return render(<LanguageProvider>{children}</LanguageProvider>);
}

describe('debeMostrarSelector', () => {
  it('false si envioHabilitado está apagado', () => {
    expect(debeMostrarSelector(false, [domicilio])).toBe(false);
  });

  it('false si envioHabilitado está prendido pero no hay ninguna modalidad de domicilio activa', () => {
    expect(debeMostrarSelector(true, [{ ...domicilio, activo: false }])).toBe(false);
  });

  it('true si envioHabilitado está prendido y hay al menos una modalidad activa', () => {
    expect(debeMostrarSelector(true, [domicilio])).toBe(true);
  });
});

describe('TiendaFulfillmentSelector', () => {
  it('no renderiza nada si envioHabilitado es false', () => {
    renderSelector({
      envioHabilitado: false,
      modalidades: [domicilio],
      value: null,
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('no renderiza nada si envioHabilitado es true pero no hay modalidades de domicilio activas', () => {
    renderSelector({
      envioHabilitado: true,
      modalidades: [{ ...domicilio, activo: false }],
      value: null,
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('con domicilio habilitado, "Recoger en local" aparece primero en la lista', () => {
    renderSelector({
      envioHabilitado: true,
      modalidades: [domicilio],
      value: null,
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    const lista = screen.getByRole('list');
    const botones = within(lista).getAllByRole('button');
    expect(botones).toHaveLength(2);
    expect(within(botones[0]).getByText(/recoger en local/i)).toBeInTheDocument();
    expect(within(botones[1]).getByText('Envío')).toBeInTheDocument();
  });

  it('"Recoger en local" está preseleccionada por defecto (value null)', () => {
    renderSelector({
      envioHabilitado: true,
      modalidades: [domicilio],
      value: null,
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    const lista = screen.getByRole('list');
    const botones = within(lista).getAllByRole('button');
    expect(botones[0].className).toContain('border-primary');
    expect(botones[1].className).not.toContain('border-primary');
  });

  it('"Recoger en local" no muestra precio, dice Gratis', () => {
    renderSelector({
      envioHabilitado: true,
      modalidades: [domicilio],
      value: null,
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    const lista = screen.getByRole('list');
    const botones = within(lista).getAllByRole('button');
    expect(within(botones[0]).getByText('Gratis')).toBeInTheDocument();
  });

  it('elegir una modalidad de domicilio la selecciona, dispara onChange y muestra el input de dirección', () => {
    const onChange = vi.fn();
    renderSelector({
      envioHabilitado: true,
      modalidades: [domicilio],
      value: null,
      onChange,
      onAddressSelect: vi.fn(),
    });
    const lista = screen.getByRole('list');
    const botones = within(lista).getAllByRole('button');
    fireEvent.click(botones[1]);
    expect(onChange).toHaveBeenCalledWith('domicilio', 'd1', 350);
    expect(screen.getByPlaceholderText(/dirección/i)).toBeInTheDocument();
  });

  it('volver a click en "Recoger en local" dispara onChange con id null y precio 0', () => {
    const onChange = vi.fn();
    function Wrapper() {
      const [value, setValue] = useState<'recogida' | 'domicilio' | null>('domicilio');
      return (
        <TiendaFulfillmentSelector
          envioHabilitado
          modalidades={[domicilio]}
          value={value}
          onChange={(tipo, id, precioCents) => {
            onChange(tipo, id, precioCents);
            setValue(tipo);
          }}
          onAddressSelect={vi.fn()}
        />
      );
    }
    renderSelector(<Wrapper />, true);

    const lista = screen.getByRole('list');
    fireEvent.click(within(lista).getAllByRole('button')[0]);

    expect(onChange).toHaveBeenCalledWith('recogida', null, 0);
    expect(screen.queryByPlaceholderText(/dirección/i)).not.toBeInTheDocument();
  });

  it('muestra el ícono de cada modalidad de domicilio', () => {
    renderSelector({
      envioHabilitado: true,
      modalidades: [domicilio],
      value: null,
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    expect(screen.getByText('🚲')).toBeInTheDocument();
  });

  it('muestra el precio y el rango de tiempo de cada modalidad de domicilio', () => {
    renderSelector({
      envioHabilitado: true,
      modalidades: [domicilio],
      value: null,
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    expect(screen.getByText(/3,50/)).toBeInTheDocument();
    expect(screen.getByText(/120-180/)).toBeInTheDocument();
  });

  it('con varias modalidades de domicilio, elegir la segunda la resalta y no a la primera', () => {
    renderSelector({
      envioHabilitado: true,
      modalidades: [domicilio, domicilioExpres],
      value: 'domicilio',
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    const lista = screen.getByRole('list');
    const botones = within(lista).getAllByRole('button');
    // botones[0] = "Recoger en local", botones[1] = domicilio, botones[2] = domicilioExpres
    fireEvent.click(botones[2]);
    expect(botones[2].className).toContain('border-primary');
    expect(botones[1].className).not.toContain('border-primary');
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/ui/tienda-fulfillment-selector.test.tsx`
Expected: FAIL — el componente actual todavía tiene tabs y la prop
`recogidaHabilitada`, no compila contra los nuevos props.

- [ ] **Step 3: Reescribir el componente completo**

Reemplazar `src/components/TiendaFulfillmentSelector.tsx` completo:

```tsx
'use client';

import { useCallback, useState } from 'react';
import { formatPrice } from '@/lib/format-price';
import { t } from '@/lib/translations';
import { useLanguage, type Language } from '@/lib/language-context';
import { emojiDeIcono } from '@/lib/modalidad-entrega-iconos';
import { MapboxAddressInput, type SelectedAddress } from './MapboxAddressInput';

type Lang = Parameters<typeof t>[1];

export interface ModalidadEntregaPublica {
  id: string;
  tipo: 'recogida' | 'domicilio';
  icono: string;
  nombre: string;
  precioCents: number;
  tiempoMinMinutos: number | null;
  tiempoMaxMinutos: number | null;
  activo: boolean;
  orden: number;
}

/** Recoger en local: fijo en el código, gratis, sin fila en la DB. */
const RECOGIDA_FIJA = {
  id: null as string | null,
  icono: 'store',
  precioCents: 0,
  tiempoMinMinutos: null as number | null,
  tiempoMaxMinutos: null as number | null,
};

export function debeMostrarSelector(
  envioHabilitado: boolean,
  modalidades: ModalidadEntregaPublica[]
): boolean {
  return envioHabilitado && modalidades.some((m) => m.tipo === 'domicilio' && m.activo);
}

function columnaDerecha(precioCents: number, language: Lang): string {
  if (precioCents === 0) return t('tiendaGratisLabel', language);
  return formatPrice(precioCents / 100, 'EUR', language);
}

interface TiendaFulfillmentSelectorProps {
  envioHabilitado: boolean;
  modalidades: ModalidadEntregaPublica[];
  value: 'recogida' | 'domicilio' | null;
  onChange: (tipo: 'recogida' | 'domicilio', modalidadId: string | null, precioCents: number) => void;
  onAddressSelect: (address: SelectedAddress) => void;
  disabled?: boolean;
}

export function TiendaFulfillmentSelector({
  envioHabilitado,
  modalidades,
  value,
  onChange,
  onAddressSelect,
  disabled,
}: Readonly<TiendaFulfillmentSelectorProps>) {
  const { language } = useLanguage();
  const [modalidadSeleccionada, setModalidadSeleccionada] = useState<string | null>(null);

  const handleAddressSelect = useCallback(
    (address: SelectedAddress) => onAddressSelect(address),
    [onAddressSelect]
  );

  const modalidadesDomicilio = modalidades.filter((m) => m.tipo === 'domicilio' && m.activo);
  if (!envioHabilitado || modalidadesDomicilio.length === 0) return null;

  // "Recoger en local" está preseleccionado mientras no se haya tocado
  // manualmente ninguna fila (`modalidadSeleccionada === null`) — mismo
  // patrón de fallback que ya usaba este componente para domicilio.
  const idSeleccionado = modalidadSeleccionada ?? null;

  const handleClickRecogida = () => {
    setModalidadSeleccionada(RECOGIDA_FIJA.id);
    onChange('recogida', null, 0);
  };

  const handleClickDomicilio = (m: ModalidadEntregaPublica) => {
    setModalidadSeleccionada(m.id);
    onChange('domicilio', m.id, m.precioCents);
  };

  return (
    <div className="space-y-3 mb-3">
      <ul className="space-y-1.5">
        <li>
          <button
            type="button"
            onClick={handleClickRecogida}
            className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-sm text-left ${idSeleccionado === RECOGIDA_FIJA.id ? 'border-primary bg-primary/5' : 'border-border'}`}
          >
            <span className="text-lg leading-none">{emojiDeIcono(RECOGIDA_FIJA.icono)}</span>
            <span className="flex-1 font-semibold">{t('tiendaPickupTab', language)}</span>
            <span className="text-xs text-muted-foreground text-right shrink-0">
              {t('tiendaGratisLabel', language)}
            </span>
          </button>
        </li>
        {modalidadesDomicilio.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => handleClickDomicilio(m)}
              className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-sm text-left ${idSeleccionado === m.id ? 'border-primary bg-primary/5' : 'border-border'}`}
            >
              <span className="text-lg leading-none">{emojiDeIcono(m.icono)}</span>
              <span className="flex-1 font-semibold">{m.nombre}</span>
              <span className="text-xs text-muted-foreground text-right shrink-0">
                {columnaDerecha(m.precioCents, language)}
                {m.tiempoMinMinutos !== null && (
                  <> · {m.tiempoMinMinutos}-{m.tiempoMaxMinutos} min</>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {value === 'domicilio' && (
        <MapboxAddressInput disabled={disabled} onSelect={handleAddressSelect} />
      )}
    </div>
  );
}
```

> Nota de accesibilidad/interacción: `disabled` ya no se pasa a los
> `<button>` de la lista (el componente viejo lo hacía para los tabs). Si
> `pnpm lint`/la revisión de calidad señala que hace falta deshabilitar la
> lista completa mientras `sending` está activo en `cart-drawer.tsx`,
> agregar `disabled={disabled}` a ambos botones — evaluarlo ahí, no asumir
> de antemano si hace falta.

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/ui/tienda-fulfillment-selector.test.tsx`
Expected: PASS — 11 tests.

- [ ] **Step 5: `pnpm lint && pnpm typecheck`**

Expected: sin errores en este archivo (van a seguir los de `cart-drawer.tsx`,
se corrigen en la Task 7).

- [ ] **Step 6: Commit**

```bash
git add src/components/TiendaFulfillmentSelector.tsx tests/ui/tienda-fulfillment-selector.test.tsx
git commit -m "feat(carrito): lista unica de modalidades con recogida fija preseleccionada"
```

---

### Task 7: `cart-drawer.tsx` — wizard gateado solo por envío a domicilio

**Files:**
- Modify: `src/components/cart-drawer.tsx`
- Modify: `src/components/client-menu-page.tsx`
- Test: `tests/ui/cart-drawer-wizard-tienda.test.tsx`

- [ ] **Step 1: Actualizar `usaWizardTienda` y sus tests (falla primero)**

En `tests/ui/cart-drawer-wizard-tienda.test.tsx`, reemplazar el
`describe('usaWizardTienda', ...)` (líneas 27-43 del archivo actual):

```typescript
describe('usaWizardTienda', () => {
  it('false para restaurante, aunque envioHabilitado sea true', () => {
    expect(usaWizardTienda(true, null, true)).toBe(false);
  });

  it('false en modo mesa', () => {
    expect(usaWizardTienda(false, 'mesa-token', true)).toBe(false);
  });

  it('false para tienda con envioHabilitado apagado', () => {
    expect(usaWizardTienda(false, null, false)).toBe(false);
  });

  it('true para tienda con envioHabilitado prendido, sin mesa', () => {
    expect(usaWizardTienda(false, null, true)).toBe(true);
  });
});
```

Y el helper `pintarCartDrawerConItem` (línea ~64-74 del archivo actual)
cambia su default: donde dice
`<CartDrawer isRestaurant={false} recogidaTiendaHabilitada={true} {...props} />`
pasa a
`<CartDrawer isRestaurant={false} envioDomicilioHabilitado={true} {...props} />`
— sin esto, TODOS los tests que siguen en el archivo (que dependen de que
el wizard esté activo) dejan de activarse, porque ya no existe
`recogidaTiendaHabilitada` para disparar `usaWizardTienda` por sí solo.

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/ui/cart-drawer-wizard-tienda.test.tsx`
Expected: FAIL — `usaWizardTienda` real todavía toma 4 parámetros.

- [ ] **Step 3: Cambiar `usaWizardTienda` en `cart-drawer.tsx`**

Reemplazar:
```typescript
export function usaWizardTienda(
  isRestaurant: boolean,
  mesaToken: string | null,
  recogidaHabilitada: boolean,
  envioHabilitado: boolean
): boolean {
  return !isRestaurant && !mesaToken && (recogidaHabilitada || envioHabilitado);
}
```
por:
```typescript
export function usaWizardTienda(
  isRestaurant: boolean,
  mesaToken: string | null,
  envioHabilitado: boolean
): boolean {
  return !isRestaurant && !mesaToken && envioHabilitado;
}
```

- [ ] **Step 4: Quitar `recogidaTiendaHabilitada` de `CartDrawerProps` y sus defaults**

Reemplazar:
```typescript
interface CartDrawerProps {
  isRestaurant?: boolean;
  pagosPickupHabilitados?: boolean;
  deliveryHabilitado?: boolean;
  recogidaTiendaHabilitada?: boolean;
  envioDomicilioHabilitado?: boolean;
  modalidadesEntrega?: ModalidadEntregaPublica[];
}
```
por:
```typescript
interface CartDrawerProps {
  isRestaurant?: boolean;
  pagosPickupHabilitados?: boolean;
  deliveryHabilitado?: boolean;
  envioDomicilioHabilitado?: boolean;
  modalidadesEntrega?: ModalidadEntregaPublica[];
}
```

Reemplazar:
```typescript
export function CartDrawer({
  isRestaurant = false,
  pagosPickupHabilitados = false,
  deliveryHabilitado = false,
  recogidaTiendaHabilitada = false,
  envioDomicilioHabilitado = false,
  modalidadesEntrega = [],
}: Readonly<CartDrawerProps>) {
```
por:
```typescript
export function CartDrawer({
  isRestaurant = false,
  pagosPickupHabilitados = false,
  deliveryHabilitado = false,
  envioDomicilioHabilitado = false,
  modalidadesEntrega = [],
}: Readonly<CartDrawerProps>) {
```

Reemplazar:
```typescript
  const usaWizard = usaWizardTienda(isRestaurant, mesaToken, recogidaTiendaHabilitada, envioDomicilioHabilitado);
```
por:
```typescript
  const usaWizard = usaWizardTienda(isRestaurant, mesaToken, envioDomicilioHabilitado);
```

- [ ] **Step 5: Actualizar el call site de `TiendaFulfillmentSelector`**

Reemplazar:
```tsx
              {usaWizard && (
                <TiendaFulfillmentSelector
                  recogidaHabilitada={recogidaTiendaHabilitada}
                  envioHabilitado={envioDomicilioHabilitado}
                  modalidades={modalidadesEntrega}
                  value={modalidadEntregaTipo}
                  onChange={(tipo, id, precioCents) => {
                    setModalidadEntregaTipo(tipo);
                    setModalidadEntregaId(id);
                    setModalidadEntregaPrecioCents(precioCents);
                  }}
                  onAddressSelect={({ address, latitude, longitude, postalCode }) => {
                    setDeliveryAddress(address);
                    setDeliveryLatitude(latitude);
                    setDeliveryLongitude(longitude);
                    setDeliveryPostalCode(postalCode);
                  }}
```
por:
```tsx
              {usaWizard && (
                <TiendaFulfillmentSelector
                  envioHabilitado={envioDomicilioHabilitado}
                  modalidades={modalidadesEntrega}
                  value={modalidadEntregaTipo}
                  onChange={(tipo, id, precioCents) => {
                    setModalidadEntregaTipo(tipo);
                    setModalidadEntregaId(id);
                    setModalidadEntregaPrecioCents(precioCents);
                  }}
                  onAddressSelect={({ address, latitude, longitude, postalCode }) => {
                    setDeliveryAddress(address);
                    setDeliveryLatitude(latitude);
                    setDeliveryLongitude(longitude);
                    setDeliveryPostalCode(postalCode);
                  }}
```

(El resto del bloque, incluyendo el `disabled={sending}`/`/>` de cierre, no
cambia.)

- [ ] **Step 6: `client-menu-page.tsx` — dejar de pasar `recogidaTiendaHabilitada`**

Reemplazar:
```tsx
<CartDrawer isRestaurant={empresa?.tipo === 'restaurante'} pagosPickupHabilitados={empresa?.pagosPickupHabilitados} deliveryHabilitado={empresa?.deliveryHabilitado} recogidaTiendaHabilitada={empresa?.recogidaTiendaHabilitada} envioDomicilioHabilitado={empresa?.envioDomicilioHabilitado} modalidadesEntrega={modalidadesEntrega ?? []} />
```
por:
```tsx
<CartDrawer isRestaurant={empresa?.tipo === 'restaurante'} pagosPickupHabilitados={empresa?.pagosPickupHabilitados} deliveryHabilitado={empresa?.deliveryHabilitado} envioDomicilioHabilitado={empresa?.envioDomicilioHabilitado} modalidadesEntrega={modalidadesEntrega ?? []} />
```

- [ ] **Step 7: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/ui/cart-drawer-wizard-tienda.test.tsx`
Expected: PASS.

- [ ] **Step 8: `pnpm lint && pnpm typecheck`**

Expected: sin errores en ningún archivo del proyecto — esta es la última
task que tocaba `recogidaTiendaHabilitada`/`recogida_tienda_habilitada`, no
debería quedar ninguna referencia.

```bash
grep -rn "recogidaTiendaHabilitada\|recogida_tienda_habilitada" src/ tests/
```
Expected: sin resultados (0 coincidencias).

- [ ] **Step 9: Commit**

```bash
git add src/components/cart-drawer.tsx src/components/client-menu-page.tsx tests/ui/cart-drawer-wizard-tienda.test.tsx
git commit -m "feat(carrito): wizard de tienda gateado solo por envio a domicilio"
```

---

### Task 8: Verificación final

- [ ] **Step 1: Suite completa**

```bash
pnpm lint
pnpm typecheck
pnpm build
npx vitest run
```
Expected: todo en verde.

- [ ] **Step 2: `pnpm db:smoke`**

Expected: exit 0.

- [ ] **Step 3: Verificación en vivo en el navegador**

Con una empresa tipo tienda con envío a domicilio habilitado y al menos una
modalidad configurada:
1. Admin → Zona de entrega: solo aparece el toggle "Envío a domicilio", sin
   ningún rastro de "Recogida en tienda" ni su formulario.
2. Carrito → aparece UNA lista: "Recoger en local" primero y ya
   seleccionado (borde resaltado), las modalidades de domicilio reales
   debajo.
3. Click en una modalidad de domicilio: se selecciona, aparece el campo de
   dirección.
4. Click de vuelta en "Recoger en local": se deselecciona domicilio, se
   oculta el campo de dirección.
5. Con envío a domicilio DESHABILITADO: no aparece nada en el carrito — el
   flujo de checkout se ve igual que antes de que existiera esta feature.
6. Confirmar un pedido sin tocar nada del selector (envío deshabilitado) y
   verificar en el panel de Pedidos que el badge dice "Recogida en tienda".

- [ ] **Step 4: Commit final si quedó algo pendiente de las verificaciones**

```bash
git add -A
git commit -m "docs(plan): checkpoint final de recogida implicita sin toggle"
```
