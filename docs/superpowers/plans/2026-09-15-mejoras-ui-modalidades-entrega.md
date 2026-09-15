# Mejoras de UI y simplificación de recogida — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recogida en tienda pasa a ser siempre gratis (server + admin + DB), el ícono de cada modalidad se pinta en el carrito del cliente, la lista de domicilio se rediseña para leerse mejor, y el panel admin de "Zona de entrega" usa el mismo tema oscuro fijo que el resto del panel.

**Architecture:** Cambios acotados a la feature `tienda-recogida-domicilio` ya mergeada — sin tocar el sistema Glovo/Redsys de restaurante. Se extrae un módulo compartido de iconos (hoy duplicado implícitamente entre admin y cliente) antes de arreglar el bug de renderizado.

**Tech Stack:** Next.js App Router, TypeScript, Zod, Supabase/Postgres, Tailwind, Vitest + Testing Library.

Spec de referencia: `docs/superpowers/specs/2026-09-15-mejoras-ui-modalidades-entrega-design.md`

---

### Task 1: Migración — recogida siempre a precio 0 en la DB

**Files:**
- New migration: `supabase/migrations/20260915000001_precio_cero_en_recogida.sql`

- [ ] **Step 1: Verificar en vivo si hay filas `recogida` con precio > 0 (antes de escribir el backfill)**

```sql
SELECT id, empresa_id, nombre_es, precio_cents FROM public.modalidades_entrega WHERE tipo = 'recogida' AND precio_cents > 0;
```

Anotar el resultado real en el mensaje de commit del Step 3 (aunque devuelva 0 filas — es la evidencia de que el backfill no rompió nada).

- [ ] **Step 2: Escribir la migración**

```sql
-- Task de mejoras UI (2026-09-15): recogida pasa a ser siempre gratis en
-- todo el sistema, no solo una preferencia de UI — ver
-- docs/superpowers/specs/2026-09-15-mejoras-ui-modalidades-entrega-design.md
-- decisión #1.

-- Backfill defensivo: cualquier fila recogida con precio > 0 queda en 0.
-- A la fecha de este diseño solo existían filas de prueba, pero no se asume
-- sin haber corrido el SELECT del Step 1 primero.
UPDATE public.modalidades_entrega SET precio_cents = 0 WHERE tipo = 'recogida' AND precio_cents > 0;

ALTER TABLE public.modalidades_entrega
  ADD CONSTRAINT precio_cero_en_recogida CHECK (
    (tipo = 'recogida' AND precio_cents = 0)
    OR tipo = 'domicilio'
  );
```

- [ ] **Step 3: Aplicar con `supabase db push --linked` (nunca MCP suelto) y verificar**

```bash
supabase db push --linked
supabase migration list --linked
```
Expected: la fila `20260915000001` con `Local == Remote`.

```bash
pnpm db:smoke
```
Expected: exit 0.

Verificar en vivo que el constraint quedó activo (vía `mcp__supabase__execute_sql`, solo lectura):
```sql
SELECT conname FROM pg_constraint WHERE conname = 'precio_cero_en_recogida';
```
Expected: 1 fila.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260915000001_precio_cero_en_recogida.sql
git commit -m "feat(db): recogida siempre a precio 0, con CHECK constraint"
```

---

### Task 2: Zod — rechazar precio distinto de 0 en modalidades de recogida

**Files:**
- Modify: `src/core/application/dtos/modalidad-entrega.dto.ts`
- Test: `tests/core/modalidad-entrega-dto.test.ts`

- [ ] **Step 1: Leer el archivo de test existente para ver el patrón de tests ya usado**

```bash
head -30 tests/core/modalidad-entrega-dto.test.ts
```

- [ ] **Step 2: Agregar el test que falla primero**

Agregar al final de `describe('createModalidadEntregaSchema', ...)` (o crear ese describe si no existe, siguiendo el patrón de imports ya presente en el archivo):

```typescript
it('rechaza precioCents distinto de 0 cuando tipo es recogida', () => {
  const result = createModalidadEntregaSchema.safeParse({
    empresaId: 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1',
    tipo: 'recogida',
    icono: 'store',
    nombre_es: 'Recogida express',
    precioCents: 150,
    orden: 0,
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues[0].path).toEqual(['precioCents']);
  }
});

it('acepta precioCents 0 cuando tipo es recogida', () => {
  const result = createModalidadEntregaSchema.safeParse({
    empresaId: 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1',
    tipo: 'recogida',
    icono: 'store',
    nombre_es: 'Recogida',
    precioCents: 0,
    orden: 0,
  });
  expect(result.success).toBe(true);
});
```

- [ ] **Step 3: Ejecutar y verificar que el primer test falla**

Run: `npx vitest run tests/core/modalidad-entrega-dto.test.ts`
Expected: FAIL — el schema hoy acepta `precioCents: 150` con `tipo: 'recogida'`.

- [ ] **Step 4: Extender el `.superRefine()` existente en `modalidad-entrega.dto.ts`**

Reemplazar:
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
    }
  })
```
por:
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
```

> Nota: `updateModalidadEntregaSchema` deriva de `baseModalidadEntregaSchema.omit({ tipo: true })` — no tiene el campo `tipo` en su forma, así que no se le puede agregar esta misma validación cruzada ahí (no hay `data.tipo` para leer). Eso está bien: la única forma de setear el precio hoy es en el CREATE (el admin no tiene UI de edición de precio, Task 4 de este plan además oculta el input para recogida), y el CHECK constraint de la Task 1 cierra el caso de un UPDATE directo por API/PostgREST.

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/core/modalidad-entrega-dto.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/application/dtos/modalidad-entrega.dto.ts tests/core/modalidad-entrega-dto.test.ts
git commit -m "feat(modalidad-entrega): rechazar precio distinto de 0 en recogida"
```

---

### Task 3: Extraer el mapeo de iconos a un módulo compartido

**Files:**
- Create: `src/lib/modalidad-entrega-iconos.ts`
- Modify: `src/components/admin/ModalidadesEntregaForm.tsx`
- Test: `tests/core/modalidad-entrega-iconos.test.ts`

> Por qué esta task existe: `TiendaFulfillmentSelector.tsx` (carrito del cliente) declara el campo `icono: string` pero nunca lo pinta — es el bug reportado. El valor guardado en DB es una CLAVE (`'store'`, `'package'`, confirmado con `SELECT icono FROM modalidades_entrega` — no es el emoji), y hoy la única tabla clave→emoji vive privada dentro de `ModalidadesEntregaForm.tsx` (`ICONOS_DISPONIBLES`). Si el selector del cliente necesita la misma conversión, tiene que venir de un solo lugar — no duplicar el array de 5 iconos en dos archivos.

- [ ] **Step 1: Escribir el test que falla primero**

```typescript
// tests/core/modalidad-entrega-iconos.test.ts
import { describe, it, expect } from 'vitest';
import { emojiDeIcono, ICONOS_MODALIDAD_ENTREGA } from '@/lib/modalidad-entrega-iconos';

describe('emojiDeIcono', () => {
  it('devuelve el emoji correspondiente a una clave conocida', () => {
    expect(emojiDeIcono('store')).toBe('🏪');
    expect(emojiDeIcono('bike')).toBe('🚲');
    expect(emojiDeIcono('package')).toBe('📦');
  });

  it('devuelve cadena vacía para una clave desconocida, no undefined', () => {
    expect(emojiDeIcono('algo-que-no-existe')).toBe('');
  });
});

describe('ICONOS_MODALIDAD_ENTREGA', () => {
  it('tiene 5 iconos disponibles, cada uno con value/emoji/labelKey', () => {
    expect(ICONOS_MODALIDAD_ENTREGA).toHaveLength(5);
    for (const icono of ICONOS_MODALIDAD_ENTREGA) {
      expect(icono.value).toBeTruthy();
      expect(icono.emoji).toBeTruthy();
      expect(icono.labelKey).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/core/modalidad-entrega-iconos.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Crear el módulo compartido**

```typescript
// src/lib/modalidad-entrega-iconos.ts

/**
 * Iconos disponibles para una modalidad de entrega (recogida/domicilio).
 * Única fuente de verdad — la usan tanto el formulario de admin
 * (ModalidadesEntregaForm) como el selector del carrito
 * (TiendaFulfillmentSelector). El valor guardado en DB (columna `icono`) es
 * el `value` de este array, nunca el emoji directo.
 */
export const ICONOS_MODALIDAD_ENTREGA = [
  { value: 'store', emoji: '🏪', labelKey: 'deliveryModalityIconStore' },
  { value: 'bike', emoji: '🚲', labelKey: 'deliveryModalityIconBike' },
  { value: 'car', emoji: '🚗', labelKey: 'deliveryModalityIconCar' },
  { value: 'package', emoji: '📦', labelKey: 'deliveryModalityIconPackage' },
  { value: 'clock', emoji: '⏱️', labelKey: 'deliveryModalityIconClock' },
] as const;

/** Emoji para una clave de icono. Cadena vacía si la clave no es conocida. */
export function emojiDeIcono(icono: string): string {
  return ICONOS_MODALIDAD_ENTREGA.find((i) => i.value === icono)?.emoji ?? '';
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/core/modalidad-entrega-iconos.test.ts`
Expected: PASS.

- [ ] **Step 5: `ModalidadesEntregaForm.tsx` usa el módulo compartido en vez de su copia local**

Reemplazar (cerca de la línea 23):
```typescript
const ICONOS_DISPONIBLES = [
  { value: 'store', emoji: '🏪', labelKey: 'deliveryModalityIconStore' },
  { value: 'bike', emoji: '🚲', labelKey: 'deliveryModalityIconBike' },
  { value: 'car', emoji: '🚗', labelKey: 'deliveryModalityIconCar' },
  { value: 'package', emoji: '📦', labelKey: 'deliveryModalityIconPackage' },
  { value: 'clock', emoji: '⏱️', labelKey: 'deliveryModalityIconClock' },
] as const;
```
por (agregar el import junto a los demás, arriba del archivo):
```typescript
import { ICONOS_MODALIDAD_ENTREGA, emojiDeIcono } from '@/lib/modalidad-entrega-iconos';
```
(y borrar la constante local `ICONOS_DISPONIBLES`).

Reemplazar los 3 usos de `ICONOS_DISPONIBLES` en el resto del archivo por `ICONOS_MODALIDAD_ENTREGA`:
- Línea ~54: `useState<string>(ICONOS_DISPONIBLES[0].value)` → `useState<string>(ICONOS_MODALIDAD_ENTREGA[0].value)`
- Línea ~88: `{ICONOS_DISPONIBLES.find((i) => i.value === m.icono)?.emoji}` → `{emojiDeIcono(m.icono)}`
- Línea ~129: `{ICONOS_DISPONIBLES.map((i) => (` → `{ICONOS_MODALIDAD_ENTREGA.map((i) => (`

- [ ] **Step 6: Ejecutar la suite de ese componente y confirmar que sigue verde**

Run: `npx vitest run tests/ui/modalidades-entrega-form.test.tsx`
Expected: PASS (sin cambios de comportamiento, solo de origen del array).

- [ ] **Step 7: `pnpm lint && pnpm typecheck`**

Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add src/lib/modalidad-entrega-iconos.ts src/components/admin/ModalidadesEntregaForm.tsx tests/core/modalidad-entrega-iconos.test.ts
git commit -m "refactor(modalidad-entrega): extraer mapeo de iconos a modulo compartido"
```

---

### Task 4: Admin — ocultar el precio para modalidades de recogida

**Files:**
- Modify: `src/components/admin/ModalidadesEntregaForm.tsx`
- Test: `tests/ui/modalidades-entrega-form.test.tsx`

- [ ] **Step 1: Actualizar el test existente que llenaba el campo de precio para recogida**

El test `'llama a onCreate con los datos del formulario al enviar'` (línea ~51) hoy hace `fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: '0' } })` para un formulario de tipo recogida — con el input oculto, ese `getByLabelText` no lo va a encontrar. Reemplazar el test completo por:

```typescript
it('llama a onCreate con los datos del formulario al enviar (recogida, sin input de precio)', () => {
  const onCreate = vi.fn();
  renderForm('recogida', [], onCreate);
  fireEvent.change(screen.getByLabelText(/nombre/i), {
    target: { value: 'Recogida express' },
  });
  fireEvent.click(screen.getByRole('button', { name: /añadir modalidad/i }));
  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      nombre_es: 'Recogida express',
      precioCents: 0,
    })
  );
});

it('el formulario de tipo recogida NO muestra el input de precio', () => {
  renderForm('recogida', []);
  expect(screen.queryByLabelText(/precio/i)).not.toBeInTheDocument();
});

it('el formulario de tipo domicilio SÍ muestra el input de precio', () => {
  renderForm('domicilio', []);
  expect(screen.getByLabelText(/precio/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan las 2 nuevas (la primera ya pasaba antes del cambio, ahora falla distinto)**

Run: `npx vitest run tests/ui/modalidades-entrega-form.test.tsx`
Expected: FAIL en `'el formulario de tipo recogida NO muestra el input de precio'` (el input hoy siempre se renderiza).

- [ ] **Step 3: Ocultar el input de precio para tipo recogida en `ModalidadesEntregaForm.tsx`**

Reemplazar el bloque del input de precio (dentro del `<div className="grid grid-cols-2 gap-3...">`, después del bloque de "Nombre"):
```tsx
        <div>
          <label htmlFor={`precio-${tipo}`} className="text-xs font-medium text-muted-foreground block mb-1">
            {t('deliveryModalityPrice', language)}
          </label>
          <Input
            id={`precio-${tipo}`}
            type="number"
            min="0"
            step="0.10"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
          />
        </div>
```
por:
```tsx
        {tipo === 'domicilio' && (
          <div>
            <label htmlFor={`precio-${tipo}`} className="text-xs font-medium text-muted-foreground block mb-1">
              {t('deliveryModalityPrice', language)}
            </label>
            <Input
              id={`precio-${tipo}`}
              type="number"
              min="0"
              step="0.10"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
            />
          </div>
        )}
```

Y en `handleSubmit`, forzar el precio a 0 cuando es recogida (reemplazar la primera línea del método):
```typescript
  const handleSubmit = () => {
    const precioCents = Math.round(Number(precio) * 100);
```
por:
```typescript
  const handleSubmit = () => {
    const precioCents = tipo === 'recogida' ? 0 : Math.round(Number(precio) * 100);
```

- [ ] **Step 4: Ejecutar y verificar que toda la suite pasa**

Run: `npx vitest run tests/ui/modalidades-entrega-form.test.tsx`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/ModalidadesEntregaForm.tsx tests/ui/modalidades-entrega-form.test.tsx
git commit -m "feat(admin): ocultar input de precio para modalidades de recogida"
```

---

### Task 5: `TiendaFulfillmentSelector` — icono visible, lista de domicilio rediseñada, recogida como línea fija

**Files:**
- Modify: `src/components/TiendaFulfillmentSelector.tsx`
- Modify: `src/lib/translations.ts` (1 clave nueva × 5 idiomas)
- Test: `tests/ui/tienda-fulfillment-selector.test.tsx`

**Diseño (spec, decisiones #2):**
- Domicilio: siempre lista clickeable (sin cambios de comportamiento), con el icono ahora visible y jerarquía tipográfica ajustada (nombre en negrita, precio/tiempo en gris chico a la derecha).
- Recogida con **1 sola** modalidad activa: línea fija, sin `<button>`, columna derecha dice el texto de "Gratis" en vez de un precio (ya no aplica mostrar `0,00€` porque Task 1-2 garantizan que siempre es 0).
- Recogida con **2+** modalidades activas: mismo patrón de lista que domicilio, columna derecha también dice "Gratis" en cada fila (nunca un precio).

- [ ] **Step 1: Agregar la clave de traducción `tiendaGratisLabel` en los 5 idiomas de `src/lib/translations.ts`**

Junto a `tiendaPickupTab`/`tiendaDeliveryTab` (buscar esas 2 claves en cada uno de los 5 bloques), agregar:

```typescript
// es
tiendaGratisLabel: "Gratis",
```
```typescript
// en
tiendaGratisLabel: "Free",
```
```typescript
// fr
tiendaGratisLabel: "Gratuit",
```
```typescript
// it
tiendaGratisLabel: "Gratis",
```
```typescript
// de
tiendaGratisLabel: "Kostenlos",
```

- [ ] **Step 2: Escribir los tests que fallan primero**

Agregar a `tests/ui/tienda-fulfillment-selector.test.tsx`, dentro del `describe('TiendaFulfillmentSelector', ...)` existente:

```typescript
it('muestra el ícono de cada modalidad de domicilio', () => {
  renderSelector({
    recogidaHabilitada: false,
    envioHabilitado: true,
    modalidades: [domicilio],
    value: 'domicilio',
    onChange: vi.fn(),
    onAddressSelect: vi.fn(),
  });
  expect(screen.getByText('🚲')).toBeInTheDocument();
});

it('recogida con una sola modalidad activa: línea fija sin botón, sin precio', () => {
  renderSelector({
    recogidaHabilitada: true,
    envioHabilitado: false,
    modalidades: [recogida],
    value: 'recogida',
    onChange: vi.fn(),
    onAddressSelect: vi.fn(),
  });
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  expect(screen.getByText('Gratis')).toBeInTheDocument();
  expect(screen.queryByText('0,00 €')).not.toBeInTheDocument();
});

it('recogida con dos o más modalidades activas: lista clickeable, cada fila dice Gratis', () => {
  const recogidaProgramada2 = { ...recogidaProgramada, precioCents: 0 };
  renderSelector({
    recogidaHabilitada: true,
    envioHabilitado: false,
    modalidades: [recogida, recogidaProgramada2],
    value: 'recogida',
    onChange: vi.fn(),
    onAddressSelect: vi.fn(),
  });
  const lista = screen.getByRole('list');
  const botones = within(lista).getAllByRole('button');
  expect(botones).toHaveLength(2);
  expect(within(lista).getAllByText('Gratis')).toHaveLength(2);
});
```

También actualizar el fixture `recogidaProgramada` (línea ~18-28) que hoy tiene `precioCents: 100` — ya no es un estado válido tras la Task 2:
```typescript
const recogidaProgramada: ModalidadEntregaPublica = {
  id: 'r2',
  tipo: 'recogida',
  icono: 'clock',
  nombre: 'Recogida programada',
  precioCents: 100,
  tiempoMinMinutos: null,
  tiempoMaxMinutos: null,
  activo: true,
  orden: 1,
};
```
por:
```typescript
const recogidaProgramada: ModalidadEntregaPublica = {
  id: 'r2',
  tipo: 'recogida',
  icono: 'clock',
  nombre: 'Recogida programada',
  precioCents: 0,
  tiempoMinMinutos: null,
  tiempoMaxMinutos: null,
  activo: true,
  orden: 1,
};
```
(el test del final del archivo, "resalta la primera modalidad del tab nuevo...", usa este fixture para verificar resaltado, no precio — el cambio no afecta esa aserción).

- [ ] **Step 3: Ejecutar y verificar que los 3 tests nuevos fallan**

Run: `npx vitest run tests/ui/tienda-fulfillment-selector.test.tsx`
Expected: FAIL en los 3 tests nuevos (icono no se pinta hoy; recogida con 1 modalidad hoy SÍ es una lista clickeable con precio).

- [ ] **Step 4: Reescribir `TiendaFulfillmentSelector.tsx`**

Reemplazar el archivo completo:

```tsx
'use client';

import { useCallback, useState } from 'react';
import { formatPrice } from '@/lib/format-price';
import { t } from '@/lib/translations';
import { useLanguage, type Language } from '@/lib/language-context';
import { emojiDeIcono } from '@/lib/modalidad-entrega-iconos';
import { MapboxAddressInput, type SelectedAddress } from './MapboxAddressInput';

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

/**
 * Un tipo se muestra solo si su toggle está encendido Y tiene al menos una
 * modalidad activa — evita un tab vacío si el admin prendió el toggle pero
 * todavía no cargó ninguna modalidad.
 */
export function debeMostrarSelector(
  recogidaHabilitada: boolean,
  envioHabilitado: boolean,
  modalidades: ModalidadEntregaPublica[]
): boolean {
  const hayRecogida = recogidaHabilitada && modalidades.some((m) => m.tipo === 'recogida' && m.activo);
  const hayDomicilio = envioHabilitado && modalidades.some((m) => m.tipo === 'domicilio' && m.activo);
  return hayRecogida || hayDomicilio;
}

/**
 * Modalidades del tab activo, acotadas a los flags de visibilidad reales
 * (no solo a `value`): si el padre alguna vez pasa un `value` para un tab
 * que no está visible (drift de estado), no hay que mostrar ni su lista de
 * precios ni el input de dirección — el botón de ese tab ni siquiera existe.
 */
function modalidadesParaTab(
  value: 'recogida' | 'domicilio' | null,
  mostrarRecogida: boolean,
  mostrarDomicilio: boolean,
  modalidadesRecogida: ModalidadEntregaPublica[],
  modalidadesDomicilio: ModalidadEntregaPublica[]
): ModalidadEntregaPublica[] {
  if (value === 'domicilio' && mostrarDomicilio) return modalidadesDomicilio;
  if (mostrarRecogida) return modalidadesRecogida;
  return [];
}

/**
 * Recogida es siempre gratis (Task 1-2 de este plan lo garantizan server-side
 * y en la DB) — por eso su columna derecha nunca es un precio, es un texto
 * fijo. Domicilio sí muestra su precio real.
 */
function columnaDerecha(m: ModalidadEntregaPublica, language: Language): string {
  if (m.tipo === 'recogida') return t('tiendaGratisLabel', language);
  return formatPrice(m.precioCents / 100, 'EUR', language);
}

interface TiendaFulfillmentSelectorProps {
  recogidaHabilitada: boolean;
  envioHabilitado: boolean;
  modalidades: ModalidadEntregaPublica[];
  value: 'recogida' | 'domicilio' | null;
  onChange: (tipo: 'recogida' | 'domicilio', modalidadId: string, precioCents: number) => void;
  onAddressSelect: (address: SelectedAddress) => void;
  disabled?: boolean;
}

export function TiendaFulfillmentSelector({
  recogidaHabilitada,
  envioHabilitado,
  modalidades,
  value,
  onChange,
  onAddressSelect,
  disabled,
}: Readonly<TiendaFulfillmentSelectorProps>) {
  const { language } = useLanguage();
  const [modalidadSeleccionada, setModalidadSeleccionada] = useState<string | null>(null);

  // A diferencia de DeliveryMethodSelector (que cotiza una tarifa Glovo que
  // puede quedar obsoleta al teclear una nueva dirección), este selector no
  // tiene ningún estado derivado del texto del input: el precio de cada
  // modalidad ya es fijo (viene de `modalidades`). Por eso no usa
  // `onInputChange`.
  const handleAddressSelect = useCallback(
    (address: SelectedAddress) => onAddressSelect(address),
    [onAddressSelect]
  );

  const modalidadesRecogida = modalidades.filter((m) => m.tipo === 'recogida' && m.activo);
  const modalidadesDomicilio = modalidades.filter((m) => m.tipo === 'domicilio' && m.activo);
  const mostrarRecogida = recogidaHabilitada && modalidadesRecogida.length > 0;
  const mostrarDomicilio = envioHabilitado && modalidadesDomicilio.length > 0;

  if (!mostrarRecogida && !mostrarDomicilio) return null;

  const modalidadesDelTab = modalidadesParaTab(value, mostrarRecogida, mostrarDomicilio, modalidadesRecogida, modalidadesDomicilio);

  // Fallback a la primera modalidad de la lista: al hacer click en un tab,
  // `onChange` ya se dispara con `modalidadesXxx[0]`, pero `setModalidadSeleccionada`
  // solo lo actualizan los botones de la lista — sin este fallback la fila
  // "efectiva" (la que ya recibió el padre) no se ve resaltada hasta el
  // próximo click, y al cambiar de tab puede quedar resaltada una modalidad
  // de OTRO tab.
  const idSeleccionado = modalidadSeleccionada ?? modalidadesDelTab[0]?.id ?? null;

  // Recogida con una sola opción no necesita lista clickeable — ya no hay
  // nada para elegir, y desde Task 1-2 de este plan el precio de recogida
  // siempre es 0, así que tampoco hay un precio que comparar entre filas.
  const recogidaEsListaClickeable = modalidadesRecogida.length > 1;
  const mostrarComoLista = value === 'domicilio' || recogidaEsListaClickeable;

  return (
    <div className="space-y-3 mb-3">
      <div className={`grid gap-2 ${mostrarRecogida && mostrarDomicilio ? 'grid-cols-2' : 'grid-cols-1'}`} role="tablist">
        {mostrarRecogida && (
          <button
            type="button"
            role="tab"
            aria-selected={value === 'recogida'}
            onClick={() => {
              // Limpiar la selección manual del tab anterior: sin esto,
              // `idSeleccionado` seguía apuntando a un id que no existe en
              // este tab (el fallback a modalidadesDelTab[0] solo actúa
              // mientras modalidadSeleccionada sea null).
              setModalidadSeleccionada(null);
              onChange('recogida', modalidadesRecogida[0].id, modalidadesRecogida[0].precioCents);
            }}
            disabled={disabled}
            className={`rounded-xl border-2 px-3 py-3 text-sm font-medium ${value === 'recogida' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background'}`}
          >
            {t('tiendaPickupTab', language)}
          </button>
        )}
        {mostrarDomicilio && (
          <button
            type="button"
            role="tab"
            aria-selected={value === 'domicilio'}
            onClick={() => {
              setModalidadSeleccionada(null);
              onChange('domicilio', modalidadesDomicilio[0].id, modalidadesDomicilio[0].precioCents);
            }}
            disabled={disabled}
            className={`rounded-xl border-2 px-3 py-3 text-sm font-medium ${value === 'domicilio' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background'}`}
          >
            {t('tiendaDeliveryTab', language)}
          </button>
        )}
      </div>

      {value && modalidadesDelTab.length > 0 && mostrarComoLista && (
        <ul className="space-y-1.5">
          {modalidadesDelTab.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => { setModalidadSeleccionada(m.id); onChange(value, m.id, m.precioCents); }}
                className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-sm text-left ${idSeleccionado === m.id ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <span className="text-lg leading-none">{emojiDeIcono(m.icono)}</span>
                <span className="flex-1 font-semibold">{m.nombre}</span>
                <span className="text-xs text-muted-foreground text-right shrink-0">
                  {columnaDerecha(m, language)}
                  {m.tiempoMinMinutos !== null && (
                    <> · {m.tiempoMinMinutos}-{m.tiempoMaxMinutos} min</>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {value === 'recogida' && !mostrarComoLista && modalidadesDelTab[0] && (
        <div className="w-full flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
          <span className="text-lg leading-none">{emojiDeIcono(modalidadesDelTab[0].icono)}</span>
          <span className="flex-1 font-semibold">{modalidadesDelTab[0].nombre}</span>
          <span className="text-xs text-muted-foreground shrink-0">{t('tiendaGratisLabel', language)}</span>
        </div>
      )}

      {value === 'domicilio' && mostrarDomicilio && (
        <MapboxAddressInput disabled={disabled} onSelect={handleAddressSelect} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Ejecutar y verificar que toda la suite pasa**

Run: `npx vitest run tests/ui/tienda-fulfillment-selector.test.tsx`
Expected: PASS — 11 tests (8 existentes + 3 nuevos).

- [ ] **Step 6: Correr también la suite del carrito completo, por si algún test ahí dependía del layout viejo de recogida**

Run: `npx vitest run tests/ui/cart-drawer-wizard-tienda.test.tsx`
Expected: puede fallar — se corrige en la Task 7 de este plan (los fixtures de esos tests usan recogida con precio > 0, que ya no es válido). Si falla acá, **no arreglarlo todavía** — está cubierto en la Task 7. Anotar cuáles fallan para confirmarlo ahí.

- [ ] **Step 7: `pnpm lint && pnpm typecheck`**

Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add src/components/TiendaFulfillmentSelector.tsx src/lib/translations.ts tests/ui/tienda-fulfillment-selector.test.tsx
git commit -m "feat(carrito): icono visible, lista de domicilio mejorada, recogida como linea fija sin precio"
```

---

### Task 6: Corregir los tests existentes que quedaron inválidos tras la Task 2 y la Task 5

**Files:**
- Modify: `tests/ui/cart-drawer-wizard-tienda.test.tsx`
- Modify: `tests/core/pedido-modalidad-revalidacion.test.ts`

- [ ] **Step 1: `cart-drawer-wizard-tienda.test.tsx` — cambiar los 2 fixtures de recogida-con-precio a domicilio**

El test `'el total mostrado incluye el precio de la modalidad de entrega elegida'` (línea ~94) y el test `'desglosa el precio de la modalidad en su propia fila...'` (línea ~117) usan un fixture `tipo: 'recogida', precioCents: 150` — ya no es un estado válido (Task 1-2). El propósito real de ambos tests es "el total incluye el precio de la modalidad elegida", que no depende de si el tipo es recogida o domicilio — cambiar el tipo a domicilio preserva exactamente lo que cada test verifica.

En el primer test, reemplazar:
```typescript
    const modalidades: ModalidadEntregaPublica[] = [
      {
        id: 'm1',
        tipo: 'recogida',
        icono: '🏬',
        nombre: 'Recogida rápida',
        precioCents: 150,
        tiempoMinMinutos: null,
        tiempoMaxMinutos: null,
        activo: true,
        orden: 0,
      },
    ];
    pintarCartDrawerConItem({ modalidadesEntrega: modalidades });

    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    fireEvent.click(screen.getByRole('tab', { name: /recoger en tienda/i }));

    expect(screen.getByText('11,50 €')).toBeInTheDocument();
  });

  it('desglosa el precio de la modalidad en su propia fila, no solo sumado al total', () => {
```
por:
```typescript
    const modalidades: ModalidadEntregaPublica[] = [
      {
        id: 'm1',
        tipo: 'domicilio',
        icono: '🚲',
        nombre: 'Envío exprés',
        precioCents: 150,
        tiempoMinMinutos: 30,
        tiempoMaxMinutos: 45,
        activo: true,
        orden: 0,
      },
    ];
    pintarCartDrawerConItem({ envioDomicilioHabilitado: true, modalidadesEntrega: modalidades });

    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    fireEvent.click(screen.getByRole('tab', { name: /envío a domicilio/i }));

    expect(screen.getByText('11,50 €')).toBeInTheDocument();
  });

  it('desglosa el precio de la modalidad en su propia fila, no solo sumado al total', () => {
```

En el segundo test, reemplazar:
```typescript
    const modalidades: ModalidadEntregaPublica[] = [
      {
        id: 'm1',
        tipo: 'recogida',
        icono: '🏬',
        nombre: 'Recogida rápida',
        precioCents: 150,
        tiempoMinMinutos: null,
        tiempoMaxMinutos: null,
        activo: true,
        orden: 0,
      },
    ];
    pintarCartDrawerConItem({ modalidadesEntrega: modalidades });

    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    fireEvent.click(screen.getByRole('tab', { name: /recoger en tienda/i }));

    // Aparece dos veces: una en la fila de la lista de TiendaFulfillmentSelector
    // (la que ya existía) y otra nueva en el desglose de TotalsSection — si
    // solo apareciera una vez, la fila de desglose no se estaría pintando.
    expect(screen.getAllByText('Recogida rápida')).toHaveLength(2);
    expect(screen.getAllByText('1,50 €')).toHaveLength(2);
    expect(screen.getByText('11,50 €')).toBeInTheDocument();
  });
```
por:
```typescript
    const modalidades: ModalidadEntregaPublica[] = [
      {
        id: 'm1',
        tipo: 'domicilio',
        icono: '🚲',
        nombre: 'Envío exprés',
        precioCents: 150,
        tiempoMinMinutos: 30,
        tiempoMaxMinutos: 45,
        activo: true,
        orden: 0,
      },
    ];
    pintarCartDrawerConItem({ envioDomicilioHabilitado: true, modalidadesEntrega: modalidades });

    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    fireEvent.click(screen.getByRole('tab', { name: /envío a domicilio/i }));

    // Aparece dos veces: una en la fila de la lista de TiendaFulfillmentSelector
    // (la que ya existía) y otra nueva en el desglose de TotalsSection — si
    // solo apareciera una vez, la fila de desglose no se estaría pintando.
    expect(screen.getAllByText('Envío exprés')).toHaveLength(2);
    expect(screen.getAllByText('1,50 €')).toHaveLength(2);
    expect(screen.getByText('11,50 €')).toBeInTheDocument();
  });
```

- [ ] **Step 2: `pedido-modalidad-revalidacion.test.ts` — fixture de recogida con precio 150**

El test `'NO exige dirección si el tipo validado es recogida, aunque falte todo'` (línea ~380) mockea `validarPrecioVigente` devolviendo `{ precioCents: 150, tipo: 'recogida' }`. Es un mock de lo que devolvería la DB — no rompe con el Zod de la Task 2 (ese mock nunca pasa por el schema), pero documenta un estado que ya no puede existir. Cambiar por consistencia:

Reemplazar:
```typescript
        data: { precioCents: 150, tipo: 'recogida' },
```
por:
```typescript
        data: { precioCents: 0, tipo: 'recogida' },
```
(en ese mismo test, línea ~384).

- [ ] **Step 3: Ejecutar ambos archivos y verificar que pasan**

```bash
npx vitest run tests/ui/cart-drawer-wizard-tienda.test.tsx tests/core/pedido-modalidad-revalidacion.test.ts
```
Expected: PASS, todos los tests de ambos archivos.

- [ ] **Step 4: Commit**

```bash
git add tests/ui/cart-drawer-wizard-tienda.test.tsx tests/core/pedido-modalidad-revalidacion.test.ts
git commit -m "test(modalidad-entrega): actualizar fixtures que asumian recogida con precio > 0"
```

---

### Task 7: Colores del panel admin — tema oscuro fijo, igual que la sección de Glovo

**Files:**
- Modify: `src/components/admin/TiendaDeliverySettings.tsx`
- Modify: `src/components/admin/ModalidadesEntregaForm.tsx`

> No hay test de color/contraste automatizado en este repo — este task se valida visualmente. Antes de escribir el diff, confirmar leyendo `src/app/admin/(protected)/delivery/page.tsx` (ya visto en este plan, sección `DeliveryCredentialsForm`) que las clases hardcodeadas `text-white` / `text-slate-400` / `bg-white/5` / `border-white/10` son en efecto las que usa esa sección hermana — no asumir sin mirar.

- [ ] **Step 1: `TiendaDeliverySettings.tsx` — labels de los toggles y encabezados**

Reemplazar:
```tsx
      <section>
        <h2 className="text-2xl font-bold text-white mb-6">{t('deliveryMethodTitle', language)}</h2>
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-foreground">{t('tiendaRecogidaLabel', language)}</span>
            <PillSwitch
              checked={recogidaHabilitada}
              disabled={savingCampos.has('recogida_tienda_habilitada')}
              onChange={() =>
                toggleHabilitado('recogida_tienda_habilitada', recogidaHabilitada, setRecogidaHabilitada)
              }
              ariaLabel={t('tiendaRecogidaLabel', language)}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-foreground">{t('tiendaEnvioLabel', language)}</span>
            <PillSwitch
              checked={envioHabilitado}
              disabled={savingCampos.has('envio_domicilio_habilitado')}
              onChange={() =>
                toggleHabilitado('envio_domicilio_habilitado', envioHabilitado, setEnvioHabilitado)
              }
              ariaLabel={t('tiendaEnvioLabel', language)}
            />
          </div>
        </div>
      </section>
```
por:
```tsx
      <section>
        <h2 className="text-2xl font-bold text-white mb-6">{t('deliveryMethodTitle', language)}</h2>
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-white">{t('tiendaRecogidaLabel', language)}</span>
            <PillSwitch
              checked={recogidaHabilitada}
              disabled={savingCampos.has('recogida_tienda_habilitada')}
              onChange={() =>
                toggleHabilitado('recogida_tienda_habilitada', recogidaHabilitada, setRecogidaHabilitada)
              }
              ariaLabel={t('tiendaRecogidaLabel', language)}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-white">{t('tiendaEnvioLabel', language)}</span>
            <PillSwitch
              checked={envioHabilitado}
              disabled={savingCampos.has('envio_domicilio_habilitado')}
              onChange={() =>
                toggleHabilitado('envio_domicilio_habilitado', envioHabilitado, setEnvioHabilitado)
              }
              ariaLabel={t('tiendaEnvioLabel', language)}
            />
          </div>
        </div>
      </section>
```

Y los 2 subtítulos de sección (`RECOGIDA EN TIENDA` / `ENVÍO A DOMICILIO`), reemplazar ambas ocurrencias de:
```tsx
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
```
(ya usan `text-slate-300`, que es parte del mismo tema oscuro fijo — no requieren cambio; confirmar al leer el archivo que efectivamente ya están así y no hace falta tocarlas).

- [ ] **Step 2: `ModalidadesEntregaForm.tsx` — nombre de la modalidad sin color de texto**

Reemplazar:
```tsx
          <li key={m.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
            <span className="text-lg">
              {emojiDeIcono(m.icono)}
            </span>
            <span className="flex-1 font-medium">{m.nombre}</span>
            <span className="text-sm text-muted-foreground">{(m.precioCents / 100).toFixed(2)}€</span>
```
por:
```tsx
          <li key={m.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
            <span className="text-lg">
              {emojiDeIcono(m.icono)}
            </span>
            <span className="flex-1 font-medium text-white">{m.nombre}</span>
            <span className="text-sm text-slate-400">{(m.precioCents / 100).toFixed(2)}€</span>
```

Y las etiquetas de los inputs del formulario de alta (4 ocurrencias de `text-xs font-medium text-muted-foreground block mb-1`), reemplazar todas por:
```tsx
          <label htmlFor={`icono-${tipo}`} className="text-xs font-medium text-slate-400 block mb-1">
```
(mismo patrón para `nombre-${tipo}`, `precio-${tipo}`, `tiempo-min-${tipo}`, `tiempo-max-${tipo}` — cambiar `text-muted-foreground` → `text-slate-400` en cada una).

Y el contenedor del formulario de alta:
```tsx
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-border p-3">
```
por:
```tsx
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-white/20 p-3">
```

- [ ] **Step 3: Correr la suite de ambos componentes**

```bash
npx vitest run tests/ui/tienda-delivery-settings.test.tsx tests/ui/modalidades-entrega-form.test.tsx
```
Expected: PASS — estos tests verifican comportamiento (qué se renderiza, qué se llama), no colores, así que no deberían romperse por este cambio. Si algún test usa `getByText`/`getByRole` con selectores que dependían de una clase específica, ajustarlo — no se esperan casos así según los tests actuales.

- [ ] **Step 4: Verificación visual manual**

Abrir `/admin/delivery` en el navegador (empresa tipo tienda) y confirmar que "Recogida en tienda"/"Envío a domicilio" y el nombre de cada modalidad se leen en blanco/gris claro sobre el fondo oscuro, igual que la sección de Glovo (si la empresa es tipo tienda, esa sección no se renderiza — comparar contra una captura previa o contra `DeliveryCredentialsForm` en una empresa restaurante).

- [ ] **Step 5: `pnpm lint && pnpm typecheck`**

Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/TiendaDeliverySettings.tsx src/components/admin/ModalidadesEntregaForm.tsx
git commit -m "fix(admin): usar el tema oscuro fijo del panel en Zona de entrega, no tokens de tenant"
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
Expected: todo en verde. Anotar el número total de tests (debería ser 617 + los nuevos de este plan: 2 de modalidad-entrega-dto + 4 de modalidad-entrega-iconos + 2 de modalidades-entrega-form + 3 de tienda-fulfillment-selector ≈ 628).

- [ ] **Step 2: `pnpm db:smoke`**

Expected: exit 0.

- [ ] **Step 3: Verificación en vivo en el navegador**

Con la empresa de prueba ("Mermelada de Tomate" u otra tipo tienda):
1. Admin → Zona de entrega: colores legibles, input de precio ausente al crear una modalidad de recogida.
2. Carrito → tab "Recoger en tienda" con una sola modalidad: línea fija, sin click, dice "Gratis".
3. Carrito → tab "Envío a domicilio": icono visible en cada fila, nombre en negrita, precio+tiempo a la derecha en gris.

- [ ] **Step 4: Actualizar el plan original con una nota de seguimiento**

Agregar al final de `docs/superpowers/plans/2026-09-13-tienda-recogida-domicilio.md` (Fase 6) una línea que referencie este plan nuevo, para que quede trazado desde el plan original.

- [ ] **Step 5: Commit final si quedó algo pendiente de las verificaciones**

```bash
git add -A
git commit -m "docs(plan): referenciar plan de mejoras UI desde el plan original"
```
