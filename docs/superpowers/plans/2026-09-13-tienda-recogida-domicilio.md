# Recogida y Envío a Domicilio para Tiendas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a `tipo === 'tienda'` un sistema de recogida/envío a domicilio configurado a mano por el admin (icono, nombre, precio, y en domicilio un rango de tiempo), totalmente independiente del Glovo+Redsys que ya usa `tipo === 'restaurante'`, con el carrito reorganizado en un wizard de 2 pasos para no saturarse.

**Architecture:** Clean Architecture del proyecto (Domain → Application → Infrastructure). Tabla nueva `modalidades_entrega` + 2 toggles en `empresas`, CRUD admin en `/api/admin/modalidades-entrega`, componentes nuevos `TiendaFulfillmentSelector` y `MapboxAddressInput` (extraído de `DeliveryMethodSelector`), wizard de 2 pasos en `cart-drawer.tsx` acotado a tienda con algún toggle activo. Cero cambios de comportamiento para restaurante/mesa/waiter.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), Zod, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-13-tienda-recogida-domicilio-design.md`

**Corrección sobre el spec** (descubierta al leer el código real antes de planificar): `pedidos` ya tiene `direccion_entrega` / `latitude_entrega` / `longitude_entrega` / `codigo_postal` (usadas hoy por restaurante). Se reutilizan para la dirección de "domicilio" de tienda en vez de crear columnas nuevas — son genéricas ("dirección de entrega de este pedido"), no específicas de Glovo. Solo se agregan 3 columnas nuevas: `modalidad_entrega_id`, `modalidad_entrega_tipo`, `modalidad_entrega_precio_cents`.

---

## Fase 1 — Backend: CRUD de modalidades de entrega

### Task 1: Migración SQL

**Files:**
- Create: `supabase/migrations/20260913000001_modalidades_entrega.sql`

- [ ] **Step 1: Escribir la migración completa**

```sql
-- Modalidades de entrega configurables a mano (tipo='tienda').
-- Independiente del sistema Glovo/Redsys que usa tipo='restaurante'.

CREATE TABLE public.modalidades_entrega (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('recogida', 'domicilio')),
  icono TEXT NOT NULL,
  nombre_es TEXT NOT NULL,
  nombre_en TEXT,
  nombre_fr TEXT,
  nombre_it TEXT,
  nombre_de TEXT,
  precio_cents INT NOT NULL DEFAULT 0,
  tiempo_min_minutos INT,
  tiempo_max_minutos INT,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tiempo_solo_domicilio CHECK (
    (tipo = 'recogida' AND tiempo_min_minutos IS NULL AND tiempo_max_minutos IS NULL)
    OR tipo = 'domicilio'
  )
);

CREATE INDEX idx_modalidades_entrega_empresa ON public.modalidades_entrega(empresa_id, tipo, activo);

ALTER TABLE public.modalidades_entrega ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to modalidades_entrega"
  ON public.modalidades_entrega AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve modalidades_entrega"
  ON public.modalidades_entrega FOR SELECT TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin inserta modalidades_entrega"
  ON public.modalidades_entrega FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin actualiza modalidades_entrega"
  ON public.modalidades_entrega FOR UPDATE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin borra modalidades_entrega"
  ON public.modalidades_entrega FOR DELETE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.modalidades_entrega TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modalidades_entrega TO authenticated;

-- Toggles de empresa (autoservicio del admin, no superadmin — sin credencial sensible)
ALTER TABLE public.empresas
  ADD COLUMN recogida_tienda_habilitada BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN envio_domicilio_habilitado BOOLEAN NOT NULL DEFAULT false;

-- Campos nuevos en pedidos (la dirección reutiliza columnas existentes de restaurante)
ALTER TABLE public.pedidos
  ADD COLUMN modalidad_entrega_id UUID REFERENCES public.modalidades_entrega(id),
  ADD COLUMN modalidad_entrega_tipo TEXT CHECK (modalidad_entrega_tipo IN ('recogida', 'domicilio')),
  ADD COLUMN modalidad_entrega_precio_cents INT;
```

- [ ] **Step 2: Aplicar la migración**

Run: `supabase db push --linked`
Expected: `Applying migration 20260913000001_modalidades_entrega.sql...` seguido de éxito.

- [ ] **Step 3: Smoke test**

Run: `pnpm db:smoke`
Expected: todas las verificaciones en verde (esta migración no toca `digest()` ni funciones `SECURITY DEFINER`, así que no debería romper nada existente).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260913000001_modalidades_entrega.sql
git commit -m "feat(db): tabla modalidades_entrega y toggles de tienda en empresas"
```

---

### Task 2: Dominio — tipo `ModalidadEntrega` e interfaz de repositorio

**Files:**
- Modify: `src/core/domain/entities/types.ts` (agregar al final del archivo)
- Create: `src/core/domain/repositories/IModalidadEntregaRepository.ts`

- [ ] **Step 1: Agregar el tipo de dominio**

En `src/core/domain/entities/types.ts`, agregar:

```typescript
export interface ModalidadEntrega {
  id: string;
  empresaId: string;
  tipo: 'recogida' | 'domicilio';
  icono: string;
  nombre: string;
  translations?: {
    en?: string;
    fr?: string;
    it?: string;
    de?: string;
  };
  precioCents: number;
  tiempoMinMinutos: number | null;
  tiempoMaxMinutos: number | null;
  activo: boolean;
  orden: number;
}
```

- [ ] **Step 2: Crear la interfaz del repositorio**

```typescript
// src/core/domain/repositories/IModalidadEntregaRepository.ts
import { ModalidadEntrega, Result } from "../entities/types";

export interface CreateModalidadEntregaData {
  empresaId: string;
  tipo: 'recogida' | 'domicilio';
  icono: string;
  nombre_es: string;
  nombre_en?: string;
  nombre_fr?: string;
  nombre_it?: string;
  nombre_de?: string;
  precioCents: number;
  tiempoMinMinutos?: number | null;
  tiempoMaxMinutos?: number | null;
  orden?: number;
}

export interface UpdateModalidadEntregaData extends Partial<CreateModalidadEntregaData> {
  activo?: boolean;
}

export interface IModalidadEntregaRepository {
  findAllByTenant(empresaId: string): Promise<Result<ModalidadEntrega[]>>;
  findActivasPublicas(empresaId: string): Promise<Result<ModalidadEntrega[]>>;
  findById(id: string, empresaId: string): Promise<Result<ModalidadEntrega | null>>;
  create(data: CreateModalidadEntregaData): Promise<Result<ModalidadEntrega>>;
  update(id: string, empresaId: string, data: UpdateModalidadEntregaData): Promise<Result<ModalidadEntrega>>;
  delete(id: string, empresaId: string): Promise<Result<void>>;
}
```

> `findActivasPublicas` existe separado de `findAllByTenant` porque el catálogo público (Fase 3, Task 12) solo debe ver `activo=true`, mientras el admin (Fase 1, Task 7) necesita ver todas para poder reactivarlas.

- [ ] **Step 3: Commit**

```bash
git add src/core/domain/entities/types.ts src/core/domain/repositories/IModalidadEntregaRepository.ts
git commit -m "feat(domain): tipo ModalidadEntrega e IModalidadEntregaRepository"
```

---

### Task 3: DTOs Zod

**Files:**
- Create: `src/core/application/dtos/modalidad-entrega.dto.ts`
- Test: `tests/core/modalidad-entrega-dto.test.ts`

- [ ] **Step 1: Escribir el test de validación (falla primero)**

```typescript
// tests/core/modalidad-entrega-dto.test.ts
import { describe, it, expect } from 'vitest';
import { createModalidadEntregaSchema } from '@/core/application/dtos/modalidad-entrega.dto';

describe('createModalidadEntregaSchema', () => {
  it('acepta recogida sin tiempoMinMinutos/tiempoMaxMinutos', () => {
    const parsed = createModalidadEntregaSchema.safeParse({
      empresaId: '11111111-1111-1111-1111-111111111111',
      tipo: 'recogida',
      icono: 'store',
      nombre_es: 'Recogida rápida',
      precioCents: 0,
    });
    expect(parsed.success).toBe(true);
  });

  it('rechaza recogida con tiempoMinMinutos presente', () => {
    const parsed = createModalidadEntregaSchema.safeParse({
      empresaId: '11111111-1111-1111-1111-111111111111',
      tipo: 'recogida',
      icono: 'store',
      nombre_es: 'Recogida rápida',
      precioCents: 0,
      tiempoMinMinutos: 10,
    });
    expect(parsed.success).toBe(false);
  });

  it('acepta domicilio con rango de tiempo', () => {
    const parsed = createModalidadEntregaSchema.safeParse({
      empresaId: '11111111-1111-1111-1111-111111111111',
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
      empresaId: '11111111-1111-1111-1111-111111111111',
      tipo: 'domicilio',
      icono: 'bike',
      nombre_es: 'Envío estándar',
      precioCents: 350,
      tiempoMinMinutos: 180,
      tiempoMaxMinutos: 120,
    });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/core/modalidad-entrega-dto.test.ts`
Expected: FAIL — `Cannot find module '@/core/application/dtos/modalidad-entrega.dto'`

- [ ] **Step 3: Implementar el DTO**

```typescript
// src/core/application/dtos/modalidad-entrega.dto.ts
import { z } from "zod";

const baseModalidadEntregaSchema = z.object({
  empresaId: z.uuid(),
  tipo: z.enum(['recogida', 'domicilio']),
  icono: z.string().min(1).max(50),
  nombre_es: z.string().min(1, "El nombre en español es requerido").max(100),
  nombre_en: z.string().max(100).optional(),
  nombre_fr: z.string().max(100).optional(),
  nombre_it: z.string().max(100).optional(),
  nombre_de: z.string().max(100).optional(),
  precioCents: z.number().int().min(0).max(100_000),
  tiempoMinMinutos: z.number().int().min(0).max(10_080).optional(),
  tiempoMaxMinutos: z.number().int().min(0).max(10_080).optional(),
  orden: z.number().int().min(0).default(0),
});

export const createModalidadEntregaSchema = baseModalidadEntregaSchema
  .refine(
    (data) => data.tipo !== 'recogida' || (data.tiempoMinMinutos === undefined && data.tiempoMaxMinutos === undefined),
    { message: 'Recogida no admite tiempo estimado (siempre es inmediata)', path: ['tiempoMinMinutos'] }
  )
  .refine(
    (data) => data.tiempoMinMinutos === undefined || data.tiempoMaxMinutos === undefined || data.tiempoMinMinutos <= data.tiempoMaxMinutos,
    { message: 'El tiempo mínimo no puede ser mayor que el máximo', path: ['tiempoMaxMinutos'] }
  );

export const updateModalidadEntregaSchema = baseModalidadEntregaSchema.partial().extend({
  activo: z.boolean().optional(),
});

export const modalidadEntregaIdSchema = z.object({
  id: z.uuid(),
});

export type CreateModalidadEntregaDTO = z.infer<typeof createModalidadEntregaSchema>;
export type UpdateModalidadEntregaDTO = z.infer<typeof updateModalidadEntregaSchema>;
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/core/modalidad-entrega-dto.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/application/dtos/modalidad-entrega.dto.ts tests/core/modalidad-entrega-dto.test.ts
git commit -m "feat(dto): validacion Zod de modalidades de entrega"
```

---

### Task 4: Repositorio Supabase

**Files:**
- Create: `src/core/infrastructure/database/SupabaseModalidadEntregaRepository.ts`

> Sin test unitario dedicado — sigue la convención existente del proyecto
> (`SupabaseCategoryRepository` tampoco tiene uno; la corrección de esta capa
> la cubre `pnpm db:smoke` + el test de compliance del Task 12 que verifica
> que `activo=false` no aparece en el catálogo público).

- [ ] **Step 1: Implementar el repositorio, mismo patrón que `SupabaseCategoryRepository`**

```typescript
// src/core/infrastructure/database/SupabaseModalidadEntregaRepository.ts
import { SupabaseClient } from "@supabase/supabase-js";
import {
  IModalidadEntregaRepository,
  CreateModalidadEntregaData,
  UpdateModalidadEntregaData,
} from "@/core/domain/repositories/IModalidadEntregaRepository";
import { ModalidadEntrega, Result } from "@/core/domain/entities/types";
import { logger } from "../logging/logger";
import { camposPresentes } from "./update-payload";

const CAMPOS_MODALIDAD = [
  'icono', 'nombre_es', 'nombre_en', 'nombre_fr', 'nombre_it', 'nombre_de',
  'precioCents', 'tiempoMinMinutos', 'tiempoMaxMinutos', 'orden', 'activo',
] as const satisfies ReadonlyArray<keyof UpdateModalidadEntregaData>;

function mapToDomain(row: Record<string, unknown>): ModalidadEntrega {
  return {
    id: row.id as string,
    empresaId: row.empresa_id as string,
    tipo: row.tipo as 'recogida' | 'domicilio',
    icono: row.icono as string,
    nombre: row.nombre_es as string,
    translations: {
      en: (row.nombre_en as string | undefined) || undefined,
      fr: (row.nombre_fr as string | undefined) || undefined,
      it: (row.nombre_it as string | undefined) || undefined,
      de: (row.nombre_de as string | undefined) || undefined,
    },
    precioCents: row.precio_cents as number,
    tiempoMinMinutos: (row.tiempo_min_minutos as number | null) ?? null,
    tiempoMaxMinutos: (row.tiempo_max_minutos as number | null) ?? null,
    activo: row.activo as boolean,
    orden: (row.orden as number) ?? 0,
  };
}

export class SupabaseModalidadEntregaRepository implements IModalidadEntregaRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findAllByTenant(empresaId: string): Promise<Result<ModalidadEntrega[]>> {
    try {
      const { data, error } = await this.supabase
        .from("modalidades_entrega")
        .select("*")
        .eq("empresa_id", empresaId)
        .order("tipo", { ascending: true })
        .order("orden", { ascending: true });

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR', error.message, 'repository',
          'SupabaseModalidadEntregaRepository.findAllByTenant',
          { empresaId, details: { code: error.code, hint: error.hint } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener modalidades de entrega', module: 'repository', method: 'findAllByTenant' } };
      }
      return { success: true, data: data.map(mapToDomain) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseModalidadEntregaRepository.findAllByTenant', { empresaId });
      return { success: false, error: appError };
    }
  }

  async findActivasPublicas(empresaId: string): Promise<Result<ModalidadEntrega[]>> {
    try {
      const { data, error } = await this.supabase
        .from("modalidades_entrega")
        .select("*")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .order("tipo", { ascending: true })
        .order("orden", { ascending: true });

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR', error.message, 'repository',
          'SupabaseModalidadEntregaRepository.findActivasPublicas',
          { empresaId, details: { code: error.code, hint: error.hint } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener modalidades de entrega', module: 'repository', method: 'findActivasPublicas' } };
      }
      return { success: true, data: data.map(mapToDomain) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseModalidadEntregaRepository.findActivasPublicas', { empresaId });
      return { success: false, error: appError };
    }
  }

  async findById(id: string, empresaId: string): Promise<Result<ModalidadEntrega | null>> {
    try {
      const { data, error } = await this.supabase
        .from("modalidades_entrega")
        .select("*")
        .eq("id", id)
        .eq("empresa_id", empresaId)
        .maybeSingle();

      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR', error.message, 'repository',
          'SupabaseModalidadEntregaRepository.findById',
          { empresaId, details: { code: error.code, hint: error.hint, modalidadId: id } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener la modalidad de entrega', module: 'repository', method: 'findById' } };
      }
      return { success: true, data: data ? mapToDomain(data) : null };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseModalidadEntregaRepository.findById', { empresaId });
      return { success: false, error: appError };
    }
  }

  async create(data: CreateModalidadEntregaData): Promise<Result<ModalidadEntrega>> {
    try {
      const { data: created, error } = await this.supabase
        .from("modalidades_entrega")
        .insert({
          empresa_id: data.empresaId,
          tipo: data.tipo,
          icono: data.icono,
          nombre_es: data.nombre_es,
          nombre_en: data.nombre_en || null,
          nombre_fr: data.nombre_fr || null,
          nombre_it: data.nombre_it || null,
          nombre_de: data.nombre_de || null,
          precio_cents: data.precioCents,
          tiempo_min_minutos: data.tipo === 'domicilio' ? (data.tiempoMinMinutos ?? null) : null,
          tiempo_max_minutos: data.tipo === 'domicilio' ? (data.tiempoMaxMinutos ?? null) : null,
          orden: data.orden ?? 0,
        })
        .select()
        .single();

      if (error) {
        await logger.logAndReturnError(
          'DB_INSERT_ERROR', error.message, 'repository',
          'SupabaseModalidadEntregaRepository.create',
          { empresaId: data.empresaId, details: { code: error.code, hint: error.hint } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al crear la modalidad de entrega', module: 'repository', method: 'create' } };
      }
      return { success: true, data: mapToDomain(created) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseModalidadEntregaRepository.create', { empresaId: data.empresaId });
      return { success: false, error: appError };
    }
  }

  async update(id: string, empresaId: string, data: UpdateModalidadEntregaData): Promise<Result<ModalidadEntrega>> {
    try {
      const updatePayload: Record<string, unknown> = camposPresentes(
        { ...data, precio_cents: data.precioCents, tiempo_min_minutos: data.tiempoMinMinutos, tiempo_max_minutos: data.tiempoMaxMinutos } as unknown as UpdateModalidadEntregaData,
        CAMPOS_MODALIDAD
      );
      // camposPresentes usa las claves camelCase del DTO; remapeamos a snake_case de columna.
      if ('precioCents' in updatePayload) { updatePayload.precio_cents = updatePayload.precioCents; delete updatePayload.precioCents; }
      if ('tiempoMinMinutos' in updatePayload) { updatePayload.tiempo_min_minutos = updatePayload.tiempoMinMinutos; delete updatePayload.tiempoMinMinutos; }
      if ('tiempoMaxMinutos' in updatePayload) { updatePayload.tiempo_max_minutos = updatePayload.tiempoMaxMinutos; delete updatePayload.tiempoMaxMinutos; }

      const { data: updated, error } = await this.supabase
        .from("modalidades_entrega")
        .update(updatePayload)
        .eq("id", id)
        .eq("empresa_id", empresaId)
        .select()
        .single();

      if (error) {
        await logger.logAndReturnError(
          'DB_UPDATE_ERROR', error.message, 'repository',
          'SupabaseModalidadEntregaRepository.update',
          { empresaId, details: { code: error.code, hint: error.hint, modalidadId: id } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar la modalidad de entrega', module: 'repository', method: 'update' } };
      }
      return { success: true, data: mapToDomain(updated) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseModalidadEntregaRepository.update', { empresaId });
      return { success: false, error: appError };
    }
  }

  async delete(id: string, empresaId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from("modalidades_entrega")
        .delete()
        .eq("id", id)
        .eq("empresa_id", empresaId);

      if (error) {
        await logger.logAndReturnError(
          'DB_DELETE_ERROR', error.message, 'repository',
          'SupabaseModalidadEntregaRepository.delete',
          { empresaId, details: { code: error.code, hint: error.hint, modalidadId: id } }
        );
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al borrar la modalidad de entrega', module: 'repository', method: 'delete' } };
      }
      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseModalidadEntregaRepository.delete', { empresaId });
      return { success: false, error: appError };
    }
  }
}
```

> **Nota para quien ejecute este paso:** el remapeo camelCase→snake_case en
> `update()` es torpe a propósito explícito de mantenerlo simple — si
> `camposPresentes` del proyecto ya soporta un mapa de nombres de columna,
> usar ese mecanismo en su lugar y borrar el remapeo manual.

- [ ] **Step 2: `pnpm typecheck` y `pnpm lint`**

Run: `pnpm typecheck && pnpm lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/core/infrastructure/database/SupabaseModalidadEntregaRepository.ts
git commit -m "feat(infra): SupabaseModalidadEntregaRepository"
```

---

### Task 5: Use case con tests

**Files:**
- Create: `src/core/application/use-cases/modalidad-entrega.use-case.ts`
- Test: `tests/core/modalidad-entrega-use-case.test.ts`

- [ ] **Step 1: Escribir los tests (fallan primero)**

```typescript
// tests/core/modalidad-entrega-use-case.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ModalidadEntregaUseCase } from '@/core/application/use-cases/modalidad-entrega.use-case';
import type { IModalidadEntregaRepository } from '@/core/domain/repositories/IModalidadEntregaRepository';
import type { ModalidadEntrega } from '@/core/domain/entities/types';

const modalidadEjemplo: ModalidadEntrega = {
  id: 'm1', empresaId: 'e1', tipo: 'domicilio', icono: 'bike',
  nombre: 'Envío estándar', precioCents: 350,
  tiempoMinMinutos: 120, tiempoMaxMinutos: 180, activo: true, orden: 0,
};

function repoMock(overrides: Partial<IModalidadEntregaRepository> = {}): IModalidadEntregaRepository {
  return {
    findAllByTenant: vi.fn().mockResolvedValue({ success: true, data: [modalidadEjemplo] }),
    findActivasPublicas: vi.fn().mockResolvedValue({ success: true, data: [modalidadEjemplo] }),
    findById: vi.fn().mockResolvedValue({ success: true, data: modalidadEjemplo }),
    create: vi.fn().mockResolvedValue({ success: true, data: modalidadEjemplo }),
    update: vi.fn().mockResolvedValue({ success: true, data: modalidadEjemplo }),
    delete: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    ...overrides,
  };
}

describe('ModalidadEntregaUseCase', () => {
  it('getAll delega al repositorio y propaga el resultado', async () => {
    const repo = repoMock();
    const useCase = new ModalidadEntregaUseCase(repo);
    const result = await useCase.getAll('e1');
    expect(result).toEqual({ success: true, data: [modalidadEjemplo] });
  });

  it('validarPrecioVigente devuelve el precio actual cuando la modalidad existe, es de la empresa y está activa', async () => {
    const repo = repoMock();
    const useCase = new ModalidadEntregaUseCase(repo);
    const result = await useCase.validarPrecioVigente('m1', 'e1');
    expect(result).toEqual({ success: true, data: { precioCents: 350, tipo: 'domicilio' } });
  });

  it('validarPrecioVigente falla si la modalidad no existe', async () => {
    const repo = repoMock({ findById: vi.fn().mockResolvedValue({ success: true, data: null }) });
    const useCase = new ModalidadEntregaUseCase(repo);
    const result = await useCase.validarPrecioVigente('inexistente', 'e1');
    expect(result.success).toBe(false);
  });

  it('validarPrecioVigente falla si la modalidad está inactiva', async () => {
    const repo = repoMock({
      findById: vi.fn().mockResolvedValue({ success: true, data: { ...modalidadEjemplo, activo: false } }),
    });
    const useCase = new ModalidadEntregaUseCase(repo);
    const result = await useCase.validarPrecioVigente('m1', 'e1');
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/core/modalidad-entrega-use-case.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar el use case**

```typescript
// src/core/application/use-cases/modalidad-entrega.use-case.ts
import { IModalidadEntregaRepository } from "@/core/domain/repositories/IModalidadEntregaRepository";
import { ModalidadEntrega, Result } from "@/core/domain/entities/types";
import { CreateModalidadEntregaDTO, UpdateModalidadEntregaDTO } from "@/core/application/dtos/modalidad-entrega.dto";
import { logger } from "@/core/infrastructure/logging/logger";

function propagarError<T>(result: { success: false; error: { code: string; message: string; details?: unknown } }, method: string): Result<T> {
  return {
    success: false,
    error: { code: result.error.code, message: result.error.message, module: 'use-case', method, details: result.error.details },
  };
}

export class ModalidadEntregaUseCase {
  constructor(private readonly repo: IModalidadEntregaRepository) {}

  async getAll(empresaId: string): Promise<Result<ModalidadEntrega[]>> {
    try {
      const result = await this.repo.findAllByTenant(empresaId);
      if (!result.success) return propagarError(result, 'ModalidadEntregaUseCase.getAll');
      return { success: true, data: result.data };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'ModalidadEntregaUseCase.getAll', { empresaId }) };
    }
  }

  async getActivasPublicas(empresaId: string): Promise<Result<ModalidadEntrega[]>> {
    try {
      const result = await this.repo.findActivasPublicas(empresaId);
      if (!result.success) return propagarError(result, 'ModalidadEntregaUseCase.getActivasPublicas');
      return { success: true, data: result.data };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'ModalidadEntregaUseCase.getActivasPublicas', { empresaId }) };
    }
  }

  async create(data: CreateModalidadEntregaDTO): Promise<Result<ModalidadEntrega>> {
    try {
      const result = await this.repo.create(data);
      if (!result.success) return propagarError(result, 'ModalidadEntregaUseCase.create');
      return { success: true, data: result.data };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'ModalidadEntregaUseCase.create', { empresaId: data.empresaId }) };
    }
  }

  async update(id: string, empresaId: string, data: Partial<UpdateModalidadEntregaDTO>): Promise<Result<ModalidadEntrega>> {
    try {
      const result = await this.repo.update(id, empresaId, data);
      if (!result.success) return propagarError(result, 'ModalidadEntregaUseCase.update');
      return { success: true, data: result.data };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'ModalidadEntregaUseCase.update', { empresaId }) };
    }
  }

  async delete(id: string, empresaId: string): Promise<Result<void>> {
    try {
      const result = await this.repo.delete(id, empresaId);
      if (!result.success) return propagarError(result, 'ModalidadEntregaUseCase.delete');
      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'ModalidadEntregaUseCase.delete', { empresaId }) };
    }
  }

  /**
   * Revalida servidor-side el precio de una modalidad antes de crear un
   * pedido — nunca confiar en el precio que manda el cliente. Falla si la
   * modalidad no existe, no es de esta empresa, o está `activo=false`.
   */
  async validarPrecioVigente(modalidadId: string, empresaId: string): Promise<Result<{ precioCents: number; tipo: 'recogida' | 'domicilio' }>> {
    try {
      const result = await this.repo.findById(modalidadId, empresaId);
      if (!result.success) return propagarError(result, 'ModalidadEntregaUseCase.validarPrecioVigente');
      if (!result.data || !result.data.activo) {
        return {
          success: false,
          error: { code: 'MODALIDAD_ENTREGA_INVALIDA', message: 'La modalidad de entrega seleccionada ya no está disponible', module: 'use-case', method: 'ModalidadEntregaUseCase.validarPrecioVigente' },
        };
      }
      return { success: true, data: { precioCents: result.data.precioCents, tipo: result.data.tipo } };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'ModalidadEntregaUseCase.validarPrecioVigente', { empresaId }) };
    }
  }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/core/modalidad-entrega-use-case.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/application/use-cases/modalidad-entrega.use-case.ts tests/core/modalidad-entrega-use-case.test.ts
git commit -m "feat(use-case): ModalidadEntregaUseCase con revalidacion de precio"
```

---

### Task 6: Wiring en `index.ts`

**Files:**
- Modify: `src/core/infrastructure/database/index.ts`

- [ ] **Step 1: Agregar los imports y el singleton lazy, mismo patrón que `getCategoryUseCase`**

```typescript
import { SupabaseModalidadEntregaRepository } from "./SupabaseModalidadEntregaRepository";
import { ModalidadEntregaUseCase } from "@/core/application/use-cases/modalidad-entrega.use-case";

let _modalidadEntregaUseCase: ModalidadEntregaUseCase | undefined;
export function getModalidadEntregaUseCase(): ModalidadEntregaUseCase {
  _modalidadEntregaUseCase ??= new ModalidadEntregaUseCase(new SupabaseModalidadEntregaRepository(getSupabaseClient()));
  return _modalidadEntregaUseCase;
}
```

(Insertar junto a `getCategoryUseCase` en `src/core/infrastructure/database/index.ts:128-131` — mismo bloque, mismo estilo.)

- [ ] **Step 2: `pnpm typecheck`**

Run: `pnpm typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/core/infrastructure/database/index.ts
git commit -m "feat(infra): wiring de getModalidadEntregaUseCase"
```

---

### Task 7: API route `/api/admin/modalidades-entrega`

**Files:**
- Create: `src/app/api/admin/modalidades-entrega/route.ts`

- [ ] **Step 1: Implementar GET/POST/PUT/DELETE, mismo patrón que `/api/admin/categorias/route.ts`**

```typescript
// src/app/api/admin/modalidades-entrega/route.ts
import { NextRequest } from 'next/server';
import { getModalidadEntregaUseCase } from '@/core/infrastructure/database';
import { createModalidadEntregaSchema, updateModalidadEntregaSchema, modalidadEntregaIdSchema } from '@/core/application/dtos/modalidad-entrega.dto';
import { resolveAdminContextWithEmpresa, handleResult, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';

export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;

  const result = await getModalidadEntregaUseCase().getAll(ctx.empresaId);
  return handleResult(result);
}

export async function POST(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }
  const parsed = createModalidadEntregaSchema.safeParse({ ...(body as Record<string, unknown>), empresaId: ctx.empresaId });
  if (!parsed.success) return validationErrorResponse(parsed.error.issues[0].message);

  const result = await getModalidadEntregaUseCase().create(parsed.data);
  if (!result.success) return handleResult(result);
  return handleResultWithStatus({ success: true, data: result.data }, 201);
}

export async function PUT(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;

  const { searchParams } = new URL(request.url);
  const idParsed = modalidadEntregaIdSchema.safeParse({ id: searchParams.get('id') });
  if (!idParsed.success) return validationErrorResponse('ID inválido');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }
  const { id: _bodyId, ...updateData } = body as Record<string, unknown>;
  const parsed = updateModalidadEntregaSchema.safeParse(updateData);
  if (!parsed.success) return validationErrorResponse(parsed.error.issues[0].message);

  const result = await getModalidadEntregaUseCase().update(idParsed.data.id, ctx.empresaId, parsed.data);
  return handleResult(result);
}

export async function DELETE(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;

  const { searchParams } = new URL(request.url);
  const idParsed = modalidadEntregaIdSchema.safeParse({ id: searchParams.get('id') });
  if (!idParsed.success) return validationErrorResponse('ID inválido');

  const result = await getModalidadEntregaUseCase().delete(idParsed.data.id, ctx.empresaId);
  if (!result.success) return handleResult(result);
  return handleResult({ success: true, data: { success: true } });
}
```

> A diferencia de `/api/admin/categorias`, esta ruta **no** llama
> `revalidateTag(catalogTag(empresaId))` — las modalidades no viajan
> precargadas en `getCachedMenu` (Task 12 las expone en un fetch propio,
> sin cache de 1h, porque cambian con menos frecuencia que el catálogo pero
> el admin necesita ver el cambio reflejado al instante en su propia tienda
> al probarlo).

- [ ] **Step 2: `pnpm lint && pnpm typecheck`**

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/modalidades-entrega/route.ts
git commit -m "feat(api): CRUD /api/admin/modalidades-entrega"
```

---

### Task 8: Toggles en `empresas`

**Files:**
- Modify: `src/core/infrastructure/database/supabase-empresa.repository.ts:30-34` (agregar a `CAMPOS_DIRECTOS`)
- Modify: `src/core/infrastructure/database/supabase-empresa.repository.ts:56` (agregar al `SELECT` de `getById`)
- Modify: `src/core/domain/entities/types.ts` (agregar a `Empresa`, `UpdateEmpresaData`, `EmpresaPublic`)

- [ ] **Step 1: Extender `CAMPOS_DIRECTOS`**

En `src/core/infrastructure/database/supabase-empresa.repository.ts:30-34`:

```typescript
const CAMPOS_DIRECTOS = [
  'tipo_impuesto', 'porcentaje_impuesto', 'mostrar_logo', 'validacion_pedidos_habilitada',
  'mostrar_promociones', 'mostrar_tgtg', 'descuento_bienvenida_activo',
  'descuento_bienvenida_porcentaje', 'descuento_bienvenida_duracion', 'tipo',
  'recogida_tienda_habilitada', 'envio_domicilio_habilitado',
] as const satisfies ReadonlyArray<keyof UpdateEmpresaData>;
```

(Van en `CAMPOS_DIRECTOS`, no en `CAMPOS_TEXTO` — son booleanos y `false` es un
valor legítimo, mismo motivo documentado ahí mismo para `mostrar_promociones`.)

- [ ] **Step 2: Extender el `SELECT` de `getById`**

En la línea 56 (mismo archivo), agregar `recogida_tienda_habilitada, envio_domicilio_habilitado` a la lista de columnas del `.select(...)`.

- [ ] **Step 3: Extender los tipos de dominio**

En `src/core/domain/entities/types.ts`, agregar a `Empresa`, `UpdateEmpresaData` y `EmpresaPublic` (buscar donde está `deliveryHabilitado` en cada uno y agregar junto):

```typescript
recogidaTiendaHabilitada?: boolean;
envioDomicilioHabilitado?: boolean;
```

Y en el mapeo de `getById` (donde se lee `deliveryHabilitado: empresa.delivery_habilitado ?? false` en la línea ~87 del repositorio), agregar:

```typescript
recogidaTiendaHabilitada: empresa.recogida_tienda_habilitada ?? false,
envioDomicilioHabilitado: empresa.envio_domicilio_habilitado ?? false,
```

- [ ] **Step 4: Extender el DTO Zod de `PUT /api/admin/empresa`**

Localizar el schema de actualización de empresa (buscar `mostrar_promociones` en `src/core/application/dtos/`) y agregar:

```typescript
recogida_tienda_habilitada: z.boolean().optional(),
envio_domicilio_habilitado: z.boolean().optional(),
```

- [ ] **Step 5: `pnpm typecheck`**

Run: `pnpm typecheck`
Expected: sin errores — si algún otro lugar construye `Empresa`/`EmpresaPublic` a mano con literal de objeto, TypeScript lo señala aquí.

- [ ] **Step 6: Commit**

```bash
git add src/core/infrastructure/database/supabase-empresa.repository.ts src/core/domain/entities/types.ts src/core/application/dtos/*.ts
git commit -m "feat(empresa): toggles recogida_tienda_habilitada y envio_domicilio_habilitado"
```

**Checkpoint Fase 1:** `pnpm lint && pnpm typecheck && pnpm build && npx vitest run tests/core/modalidad-entrega-dto.test.ts tests/core/modalidad-entrega-use-case.test.ts` — todo en verde antes de pasar a la Fase 2.

---

## Fase 2 — Admin UI

### Task 9: `ModalidadesEntregaForm`

**Files:**
- Create: `src/components/admin/ModalidadesEntregaForm.tsx`
- Test: `tests/ui/modalidades-entrega-form.test.tsx`

> **Nota de forma lectura/escritura (encontrada en la review de Task 7):**
> a diferencia de `/api/admin/categorias`, la ruta `/api/admin/modalidades-entrega`
> NO tiene un `toAdminModalidad()`/transform de respuesta. El `GET`/`POST`/`PUT`
> devuelven el objeto de dominio `ModalidadEntrega` tal cual (`nombre` plano +
> `translations: { en, fr, it, de }` anidado), mientras que el payload de
> escritura que acepta el `POST`/`PUT` espera `nombre_es`/`nombre_en`/etc. planos.
> Si este formulario prellena campos de edición a partir de una respuesta `GET`,
> tiene que mapear `translations.en` → `nombre_en` a mano — no asumir que la
> forma de lectura y escritura coinciden como sí pasa en el form de categorías.

- [ ] **Step 1: Escribir el test de comportamiento (falla primero)**

```typescript
// tests/ui/modalidades-entrega-form.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModalidadesEntregaForm } from '@/components/admin/ModalidadesEntregaForm';

const modalidadRecogida = {
  id: 'm1', tipo: 'recogida' as const, icono: 'store', nombre: 'Recogida rápida',
  precioCents: 0, tiempoMinMinutos: null, tiempoMaxMinutos: null, activo: true, orden: 0,
};

describe('ModalidadesEntregaForm', () => {
  it('el formulario de tipo recogida NO muestra campos de tiempo mínimo/máximo', () => {
    render(
      <ModalidadesEntregaForm
        tipo="recogida"
        modalidades={[modalidadRecogida]}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    // OJO: los campos se llaman "Tiempo mínimo (min)"/"Tiempo máximo (min)"
    // (ver Step 3 más abajo) — NINGÚN campo se llama "tiempo estimado". Un
    // queryByLabelText(/tiempo estimado/i) sería un placebo: pasaría siempre,
    // incluso con el componente roto, porque ese string no existe en ningún
    // lado. Verificado contra el código real durante la review de Task 9.
    expect(screen.queryByLabelText(/tiempo mínimo/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/tiempo máximo/i)).not.toBeInTheDocument();
  });

  it('el formulario de tipo domicilio SÍ muestra campos de tiempo mínimo y máximo', () => {
    render(
      <ModalidadesEntregaForm
        tipo="domicilio"
        modalidades={[]}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/tiempo mínimo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tiempo máximo/i)).toBeInTheDocument();
  });

  it('llama a onCreate con los datos del formulario al enviar', () => {
    const onCreate = vi.fn();
    render(
      <ModalidadesEntregaForm
        tipo="recogida"
        modalidades={[]}
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Recogida express' } });
    fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /añadir modalidad/i }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ nombre_es: 'Recogida express', precioCents: 0 }));
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/ui/modalidades-entrega-form.test.tsx`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar el componente**

```tsx
// src/components/admin/ModalidadesEntregaForm.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';

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

const ICONOS_DISPONIBLES = [
  { value: 'store', label: '🏪 Tienda' },
  { value: 'bike', label: '🚲 Bici' },
  { value: 'car', label: '🚗 Auto' },
  { value: 'package', label: '📦 Paquete' },
  { value: 'clock', label: '⏱️ Reloj' },
] as const;

interface ModalidadesEntregaFormProps {
  tipo: 'recogida' | 'domicilio';
  modalidades: ModalidadEntregaRow[];
  onCreate: (data: { tipo: 'recogida' | 'domicilio'; icono: string; nombre_es: string; precioCents: number; tiempoMinMinutos?: number; tiempoMaxMinutos?: number }) => void;
  onUpdate: (id: string, data: Partial<ModalidadEntregaRow>) => void;
  onDelete: (id: string) => void;
}

export function ModalidadesEntregaForm({ tipo, modalidades, onCreate, onUpdate, onDelete }: Readonly<ModalidadesEntregaFormProps>) {
  const [icono, setIcono] = useState<string>(ICONOS_DISPONIBLES[0].value);
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('0');
  const [tiempoMin, setTiempoMin] = useState('');
  const [tiempoMax, setTiempoMax] = useState('');

  const handleSubmit = () => {
    const precioCents = Math.round(Number(precio) * 100);
    onCreate({
      tipo,
      icono,
      nombre_es: nombre,
      precioCents,
      ...(tipo === 'domicilio' ? {
        tiempoMinMinutos: Number(tiempoMin) || 0,
        tiempoMaxMinutos: Number(tiempoMax) || 0,
      } : {}),
    });
    setNombre('');
    setPrecio('0');
    setTiempoMin('');
    setTiempoMax('');
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {modalidades.filter(m => m.tipo === tipo).map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
            <span className="text-lg">{ICONOS_DISPONIBLES.find(i => i.value === m.icono)?.label.split(' ')[0]}</span>
            <span className="flex-1 font-medium">{m.nombre}</span>
            <span className="text-sm text-muted-foreground">{(m.precioCents / 100).toFixed(2)}€</span>
            {tipo === 'domicilio' && m.tiempoMinMinutos !== null && (
              <span className="text-sm text-muted-foreground">{m.tiempoMinMinutos}-{m.tiempoMaxMinutos} min</span>
            )}
            <Button type="button" variant="ghost" size="icon" onClick={() => onUpdate(m.id, { activo: !m.activo })} aria-label={m.activo ? 'Desactivar' : 'Activar'}>
              {m.activo ? '✓' : '○'}
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => onDelete(m.id)} aria-label="Borrar modalidad">
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-border p-3">
        <div>
          <label htmlFor={`icono-${tipo}`} className="text-xs font-medium text-muted-foreground block mb-1">Icono</label>
          <Select value={icono} onValueChange={setIcono}>
            <SelectTrigger id={`icono-${tipo}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {ICONOS_DISPONIBLES.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor={`nombre-${tipo}`} className="text-xs font-medium text-muted-foreground block mb-1">Nombre</label>
          <Input id={`nombre-${tipo}`} value={nombre} onChange={e => setNombre(e.target.value)} maxLength={100} />
        </div>
        <div>
          <label htmlFor={`precio-${tipo}`} className="text-xs font-medium text-muted-foreground block mb-1">Precio (€)</label>
          <Input id={`precio-${tipo}`} type="number" min="0" step="0.10" value={precio} onChange={e => setPrecio(e.target.value)} />
        </div>
        {tipo === 'domicilio' && (
          <>
            <div>
              <label htmlFor={`tiempo-min-${tipo}`} className="text-xs font-medium text-muted-foreground block mb-1">Tiempo mínimo (min)</label>
              <Input id={`tiempo-min-${tipo}`} type="number" min="0" value={tiempoMin} onChange={e => setTiempoMin(e.target.value)} />
            </div>
            <div>
              <label htmlFor={`tiempo-max-${tipo}`} className="text-xs font-medium text-muted-foreground block mb-1">Tiempo máximo (min)</label>
              <Input id={`tiempo-max-${tipo}`} type="number" min="0" value={tiempoMax} onChange={e => setTiempoMax(e.target.value)} />
            </div>
          </>
        )}
        <Button type="button" onClick={handleSubmit} disabled={!nombre.trim()} className="col-span-2">
          Añadir modalidad
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/ui/modalidades-entrega-form.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/ModalidadesEntregaForm.tsx tests/ui/modalidades-entrega-form.test.tsx
git commit -m "feat(admin): formulario ModalidadesEntregaForm"
```

---

### Task 10: `/admin/delivery` condicional por tipo

**Files:**
- Modify: `src/app/admin/(protected)/delivery/page.tsx`

- [ ] **Step 1: Leer el archivo actual para localizar dónde inyectar la condición**

Antes de editar, correr:
```bash
rg -n "isSuperAdmin|empresa.tipo|DeliveryCredentialsForm" "src/app/admin/(protected)/delivery/page.tsx"
```

para ubicar exactamente cómo se lee `empresa.tipo` hoy (o si hay que agregarlo al `getById`/`getEmpresaByDomain` de esa página).

> **Nota encontrada en la review de Task 8:** `GET /api/admin/empresa` NO expone
> `deliveryHabilitado` (ni ahora `recogidaTiendaHabilitada`/`envioDomicilioHabilitado`)
> — esa ruta re-serializa a mano un subconjunto curado de campos de `Empresa`
> (nombre, contacto, promos, impuestos), no la ficha completa. Si `/admin/delivery`
> de restaurante lee su propio `deliveryHabilitado` desde OTRO lado (probablemente
> `getEmpresaByDomain`/`getEmpresaPublicRepository()`, o un fetch server-side
> directo con `getEmpresaUseCase().getById()` sin pasar por esta ruta), replicar
> ESE MISMO mecanismo para los dos toggles nuevos — no asumir que alcanza con
> `GET /api/admin/empresa`, ya que ese endpoint no los va a traer.

> **Nota encontrada en la review final de Task 9:** `ModalidadesEntregaForm`
> no valida el rango de tiempo de una modalidad de domicilio antes de enviar
> — si el admin deja "Tiempo mínimo"/"Tiempo máximo" vacíos, `handleSubmit`
> usa `Number(tiempoMin) || 0`, así que se crea silenciosamente una modalidad
> con `tiempoMinMinutos: 0, tiempoMaxMinutos: 0` en vez de bloquear el envío o
> pedir el dato. Tampoco valida que `min <= max` (esa regla SÍ está en el Zod
> schema del backend, así que un envío inválido devuelve 400 — pero la UX es
> mala: el admin ve un error genérico del servidor en vez de un aviso claro
> en el campo). Si esta página (Task 10) envuelve al formulario con su propio
> manejo de errores de API, mostrar el mensaje de validación del backend de
> forma legible en vez de dejarlo como error genérico.

- [ ] **Step 2: Envolver el contenido existente en `{empresa.tipo === 'restaurante' && (...)}`**

Todo el JSX que hoy renderiza incondicionalmente (zona de cobertura, Glovo, Redsys) pasa a estar envuelto en esa condición — sin tocar una línea de su contenido interno.

- [ ] **Step 3: Agregar la rama `tienda`**

```tsx
{empresa.tipo === 'tienda' && (
  <TiendaDeliverySettings
    empresaId={empresa.id}
    recogidaHabilitada={empresa.recogidaTiendaHabilitada}
    envioHabilitado={empresa.envioDomicilioHabilitado}
  />
)}
```

Donde `TiendaDeliverySettings` (nuevo componente cliente, en el mismo archivo o en `src/components/admin/TiendaDeliverySettings.tsx`) trae:
- Dos switches (`recogidaHabilitada`, `envioHabilitado`) que hacen `PUT /api/admin/empresa` con `fetchWithCsrf` al cambiar.
- Un `<ModalidadesEntregaForm tipo="recogida" .../>` visible solo si `recogidaHabilitada`.
- Un `<ModalidadesEntregaForm tipo="domicilio" .../>` visible solo si `envioHabilitado`.
- Fetch inicial de modalidades vía `GET /api/admin/modalidades-entrega`, y los handlers `onCreate`/`onUpdate`/`onDelete` llaman `POST`/`PUT`/`DELETE` de esa misma ruta con `fetchWithCsrf` (**no `fetch` plano** — el proxy exige `x-csrf-token` en mutaciones de admin, documentado en `docs/context/delivery.md` §8).

> No se escribe el componente entero aquí porque depende de cómo esta página
> específica obtiene `empresa` hoy (Step 1) — quien ejecute esta tarea debe
> mirar el archivo real antes de escribir el componente para no adivinar su
> forma exacta.

- [ ] **Step 4: `pnpm build`**

Run: `pnpm build`
Expected: sin errores — confirma que restaurante sigue renderizando igual (nada dentro de su bloque condicional cambió).

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(protected)/delivery/page.tsx" src/components/admin/TiendaDeliverySettings.tsx
git commit -m "feat(admin): seccion de modalidades de entrega para tipo tienda en /admin/delivery"
```

**Checkpoint Fase 2:** `pnpm lint && pnpm build` en verde.

---

## Fase 3 — Catálogo público y extracción de Mapbox

### Task 11: Extraer `MapboxAddressInput` de `DeliveryMethodSelector`

**Files:**
- Create: `src/components/MapboxAddressInput.tsx`
- Modify: `src/components/DeliveryMethodSelector.tsx`
- Test: `tests/ui/mapbox-address-input.test.tsx`

> Refactor **no funcional** — restaurante debe comportarse exactamente igual
> después de este task. El código real (verificado leyendo
> `DeliveryMethodSelector.tsx` línea por línea, no la doc `delivery.md` que
> está desactualizada en este punto) hace `fetch` directo a
> `api.mapbox.com/geocoding/v5` con debounce — no usa ninguna librería
> `@mapbox/search-js-react` a pesar de lo que dice esa doc.

- [ ] **Step 1: Escribir el test de comportamiento (falla primero)**

```typescript
// tests/ui/mapbox-address-input.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MapboxAddressInput } from '@/components/MapboxAddressInput';

describe('MapboxAddressInput', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{
          place_name: 'Calle Falsa 123, Madrid',
          geometry: { coordinates: [-3.7, 40.4] },
          context: [{ id: 'postcode.123', text: '28001' }],
        }],
      }),
    }));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('muestra sugerencias tras escribir 3+ caracteres y llama onSelect al elegir una', async () => {
    const onSelect = vi.fn();
    render(<MapboxAddressInput onSelect={onSelect} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Calle Falsa' } });
    await vi.advanceTimersByTimeAsync(300);

    await waitFor(() => expect(screen.getByText('Calle Falsa 123, Madrid')).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByText('Calle Falsa 123, Madrid'));

    expect(onSelect).toHaveBeenCalledWith({
      address: 'Calle Falsa 123, Madrid',
      latitude: 40.4,
      longitude: -3.7,
      postalCode: '28001',
    });
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/ui/mapbox-address-input.test.tsx`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Extraer el componente**

```tsx
// src/components/MapboxAddressInput.tsx
'use client';

import { useState, useCallback, useRef } from 'react';
import { t } from '@/lib/translations';
import { useLanguage } from '@/lib/language-context';

interface GeocodingFeature {
  place_name: string;
  geometry: { coordinates: [number, number] };
  context?: { id: string; text: string }[];
}

export interface SelectedAddress {
  address: string;
  latitude: number;
  longitude: number;
  postalCode: string;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

interface MapboxAddressInputProps {
  onSelect: (address: SelectedAddress) => void;
  disabled?: boolean;
}

export function MapboxAddressInput({ onSelect, disabled }: Readonly<MapboxAddressInputProps>) {
  const { language } = useLanguage();
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<GeocodingFeature[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setInputValue(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 3) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_TOKEN}&country=ES&types=address&language=es&limit=5`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json() as { features: GeocodingFeature[] };
        setSuggestions(data.features ?? []);
      } catch { /* silent */ }
    }, 300);
  }, []);

  const handleSelectSuggestion = useCallback((feature: GeocodingFeature) => {
    const [lng, lat] = feature.geometry.coordinates;
    const postalCode = feature.context?.find((c) => c.id.startsWith('postcode'))?.text ?? '';
    setInputValue(feature.place_name);
    setSuggestions([]);
    onSelect({ address: feature.place_name, latitude: lat, longitude: lng, postalCode });
  }, [onSelect]);

  return (
    <div className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        disabled={disabled}
        placeholder={t('deliveryAddressPlaceholder', language)}
        className="min-h-[44px] w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        autoComplete="off"
      />
      {suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full mt-1 z-[200] rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
          {suggestions.map((s) => (
            <li key={s.place_name}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-popover-foreground hover:bg-muted transition-colors"
                onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(s); }}
              >
                {s.place_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/ui/mapbox-address-input.test.tsx`
Expected: PASS.

- [ ] **Step 5: Hacer que `DeliveryMethodSelector` use el componente extraído**

En `src/components/DeliveryMethodSelector.tsx`, reemplazar el bloque `<input>` + `<ul>` de sugerencias (líneas 209-233 del archivo original) por:

```tsx
<MapboxAddressInput
  disabled={disabled}
  onSelect={({ address, latitude, longitude, postalCode }) => {
    setSelectedAddress(address);
    setSelectedLatitude(latitude);
    setSelectedLongitude(longitude);
    setSelectedPostalCode(postalCode);
    setEstimatedFeeCents(null);
    setFeeError(null);
  }}
/>
```

Y borrar de `DeliveryMethodSelector` los ahora-muertos: `inputValue`/`setInputValue`, `suggestions`/`setSuggestions`, `handleInputChange`, `handleSelectSuggestion`, el import de `GeocodingFeature` local si queda sin uso, y agregar `import { MapboxAddressInput } from './MapboxAddressInput';`.

- [ ] **Step 6: Verificar que restaurante no se rompió**

Run: `pnpm build && pnpm lint`
Expected: sin errores. Si existe algún test e2e o de compliance que ejercite el flujo de delivery de restaurante, correrlo también:

```bash
rg -ln "DeliveryMethodSelector" tests/ e2e/
```

y ejecutar lo que aparezca.

- [ ] **Step 7: Commit**

```bash
git add src/components/MapboxAddressInput.tsx src/components/DeliveryMethodSelector.tsx tests/ui/mapbox-address-input.test.tsx
git commit -m "refactor(delivery): extraer MapboxAddressInput de DeliveryMethodSelector"
```

---

### Task 12: Exponer modalidades activas en el catálogo público

**Files:**
- Modify: `src/lib/server-services.ts` (agregar función hermana de `getCachedMenu`)
- Test: `tests/compliance/modalidades-entrega-catalogo-publico.test.ts`

> **Nota de seguridad verificada durante Task 4 review — NO requiere migración nueva.**
> Un revisor de código preguntó si `getModalidadEntregaUseCase()` (Task 6, wired con
> `getSupabaseClient()` = service role) puede servir el catálogo público, dado que
> `modalidades_entrega` tiene RLS `RESTRICTIVE` deny-all para `anon` (Task 1) y NO está
> en la whitelist de "Lecturas públicas" que sí tienen `categorias`/`productos`/`empresas`
> (`docs/context/security.md` §"Lecturas públicas": esas 3 tablas tienen SELECT
> `qual=true` para `anon`, `modalidades_entrega` no).
>
> Verificado contra el precedente real más cercano: `getComplementoGrupoRepository()`
> (`src/core/infrastructure/database/index.ts:106-108`) usa `getSupabaseClient()`
> (service role) y ya alimenta HOY el mismo `getMenuUseCase()` público que renderiza
> `page.tsx` para visitantes anónimos — service role bypasea RLS por completo, así que
> el RESTRICTIVE-deny-anon de la Task 1 nunca se evalúa en este camino. El aislamiento
> de tenant lo da el `.eq("empresa_id", empresaId)` explícito en la query del
> repositorio (Task 4), no RLS — mismo nivel de seguridad que `complemento_grupos`.
>
> **Conclusión: reutilizar `getModalidadEntregaUseCase()` de Task 6 tal cual está
> diseñado más abajo (Step 3). No agregar ninguna policy `TO anon` nueva.**

- [ ] **Step 1: Escribir el test de compliance (falla primero)**

```typescript
// tests/compliance/modalidades-entrega-catalogo-publico.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ModalidadEntregaUseCase } from '@/core/application/use-cases/modalidad-entrega.use-case';
import type { IModalidadEntregaRepository } from '@/core/domain/repositories/IModalidadEntregaRepository';

describe('Catálogo público de modalidades — solo activas', () => {
  it('getActivasPublicas nunca devuelve modalidades con activo=false (lo filtra el repositorio, no el use-case)', async () => {
    const repo: IModalidadEntregaRepository = {
      findAllByTenant: vi.fn(),
      findActivasPublicas: vi.fn().mockResolvedValue({ success: true, data: [] }),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const useCase = new ModalidadEntregaUseCase(repo);
    await useCase.getActivasPublicas('e1');
    expect(repo.findActivasPublicas).toHaveBeenCalledWith('e1');
    // El filtro activo=true vive en el repositorio (.eq("activo", true)),
    // no en el use-case — este test documenta esa responsabilidad para que
    // no se mueva por accidente a un lugar donde sea fácil de saltear.
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que pasa** (este test ya pasa con el código de Task 5 — es documentación ejecutable, no TDD real; confirma la responsabilidad antes de construir el catálogo público encima)

Run: `npx vitest run tests/compliance/modalidades-entrega-catalogo-publico.test.ts`
Expected: PASS.

- [ ] **Step 3: Agregar la función pública en `server-services.ts`**

```typescript
// src/lib/server-services.ts — agregar junto a getCachedMenu
export async function getModalidadesEntregaPublicas(empresaId: string) {
  const result = await getModalidadEntregaUseCase().getActivasPublicas(empresaId);
  if (!result.success) return [];
  return result.data;
}
```

(Importar `getModalidadEntregaUseCase` desde `@/core/infrastructure/database` al tope del archivo. **Sin `unstable_cache`** — a diferencia de `getCachedMenu`, esto no necesita el TTL de 1h: la lista de modalidades es chica y el admin quiere ver sus cambios reflejados de inmediato en su propia tienda.)

- [ ] **Step 4: Consumir en `page.tsx`**

En `src/app/page.tsx`, junto al `try/catch` de `getCachedMenu` (línea ~64-79), agregar:

```typescript
const modalidadesEntrega = empresa?.tipo === 'tienda'
  ? await getModalidadesEntregaPublicas(empresaId!)
  : [];
```

Y pasarlo a `MenuPage`/`CartDrawer` junto con `empresa.recogidaTiendaHabilitada` / `empresa.envioDomicilioHabilitado` (threading exacto depende de cómo `client-menu-page.tsx` ya pasa `isRestaurant`/`deliveryHabilitado` hoy — seguir ese mismo camino de props).

- [ ] **Step 5: `pnpm build`**

Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server-services.ts src/app/page.tsx tests/compliance/modalidades-entrega-catalogo-publico.test.ts
git commit -m "feat(menu): exponer modalidades de entrega activas en el catalogo publico"
```

**Checkpoint Fase 3:** `pnpm lint && pnpm build && npx vitest run tests/ui/mapbox-address-input.test.tsx tests/compliance/modalidades-entrega-catalogo-publico.test.ts` en verde.

---

## Fase 4 — Carrito

### Task 13: `TiendaFulfillmentSelector`

**Files:**
- Create: `src/components/TiendaFulfillmentSelector.tsx`
- Test: `tests/ui/tienda-fulfillment-selector.test.tsx`

- [ ] **Step 1: Escribir los tests de las reglas de visibilidad (fallan primero)**

```typescript
// tests/ui/tienda-fulfillment-selector.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TiendaFulfillmentSelector, debeMostrarSelector } from '@/components/TiendaFulfillmentSelector';

const recogida = { id: 'r1', tipo: 'recogida' as const, icono: 'store', nombre: 'Recogida', precioCents: 0, tiempoMinMinutos: null, tiempoMaxMinutos: null, activo: true, orden: 0 };
const domicilio = { id: 'd1', tipo: 'domicilio' as const, icono: 'bike', nombre: 'Envío', precioCents: 350, tiempoMinMinutos: 120, tiempoMaxMinutos: 180, activo: true, orden: 0 };

describe('debeMostrarSelector', () => {
  it('false si ambos toggles están apagados', () => {
    expect(debeMostrarSelector(false, false, [recogida, domicilio])).toBe(false);
  });

  it('false si el toggle está prendido pero no hay ninguna modalidad activa de ese tipo', () => {
    expect(debeMostrarSelector(true, false, [{ ...recogida, activo: false }])).toBe(false);
  });

  it('true si al menos un tipo tiene toggle prendido Y una modalidad activa', () => {
    expect(debeMostrarSelector(true, false, [recogida])).toBe(true);
  });
});

describe('TiendaFulfillmentSelector', () => {
  it('no renderiza el tab de domicilio si envioHabilitado es false', () => {
    render(
      <TiendaFulfillmentSelector
        recogidaHabilitada modalidades={[recogida, domicilio]}
        envioHabilitado={false}
        value={null} onChange={vi.fn()} onAddressSelect={vi.fn()}
      />
    );
    expect(screen.queryByRole('tab', { name: /domicilio/i })).not.toBeInTheDocument();
  });

  it('muestra el precio y el rango de tiempo de cada modalidad de domicilio', () => {
    render(
      <TiendaFulfillmentSelector
        recogidaHabilitada={false} envioHabilitado modalidades={[domicilio]}
        value="domicilio" onChange={vi.fn()} onAddressSelect={vi.fn()}
      />
    );
    expect(screen.getByText(/3,50/)).toBeInTheDocument();
    expect(screen.getByText(/120-180/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/ui/tienda-fulfillment-selector.test.tsx`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar el componente**

```tsx
// src/components/TiendaFulfillmentSelector.tsx
'use client';

import { useState } from 'react';
import { formatPrice } from '@/lib/format-price';
import { useLanguage } from '@/lib/language-context';
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
  const hayRecogida = recogidaHabilitada && modalidades.some(m => m.tipo === 'recogida' && m.activo);
  const hayDomicilio = envioHabilitado && modalidades.some(m => m.tipo === 'domicilio' && m.activo);
  return hayRecogida || hayDomicilio;
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
  recogidaHabilitada, envioHabilitado, modalidades, value, onChange, onAddressSelect, disabled,
}: Readonly<TiendaFulfillmentSelectorProps>) {
  const { language } = useLanguage();
  const [modalidadSeleccionada, setModalidadSeleccionada] = useState<string | null>(null);

  const modalidadesRecogida = modalidades.filter(m => m.tipo === 'recogida' && m.activo);
  const modalidadesDomicilio = modalidades.filter(m => m.tipo === 'domicilio' && m.activo);
  const mostrarRecogida = recogidaHabilitada && modalidadesRecogida.length > 0;
  const mostrarDomicilio = envioHabilitado && modalidadesDomicilio.length > 0;

  if (!mostrarRecogida && !mostrarDomicilio) return null;

  const modalidadesDelTab = value === 'domicilio' ? modalidadesDomicilio : modalidadesRecogida;

  return (
    <div className="space-y-3 mb-3">
      <div className={`grid gap-2 ${mostrarRecogida && mostrarDomicilio ? 'grid-cols-2' : 'grid-cols-1'}`} role="tablist">
        {mostrarRecogida && (
          <button type="button" role="tab" aria-selected={value === 'recogida'}
            onClick={() => onChange('recogida', modalidadesRecogida[0].id, modalidadesRecogida[0].precioCents)}
            disabled={disabled}
            className={`rounded-xl border-2 px-3 py-3 text-sm font-medium ${value === 'recogida' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background'}`}
          >
            Recoger en tienda
          </button>
        )}
        {mostrarDomicilio && (
          <button type="button" role="tab" aria-selected={value === 'domicilio'}
            onClick={() => onChange('domicilio', modalidadesDomicilio[0].id, modalidadesDomicilio[0].precioCents)}
            disabled={disabled}
            className={`rounded-xl border-2 px-3 py-3 text-sm font-medium ${value === 'domicilio' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background'}`}
          >
            Envío a domicilio
          </button>
        )}
      </div>

      {value && modalidadesDelTab.length > 1 && (
        <ul className="space-y-1.5">
          {modalidadesDelTab.map((m) => (
            <li key={m.id}>
              <button type="button"
                onClick={() => { setModalidadSeleccionada(m.id); onChange(value, m.id, m.precioCents); }}
                className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-left ${modalidadSeleccionada === m.id ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <span>{m.nombre}</span>
                <span className="ml-auto text-muted-foreground">{formatPrice(m.precioCents / 100, 'EUR', language)}</span>
                {m.tiempoMinMinutos !== null && (
                  <span className="text-xs text-muted-foreground">{m.tiempoMinMinutos}-{m.tiempoMaxMinutos} min</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {value === 'domicilio' && (
        <MapboxAddressInput disabled={disabled} onSelect={onAddressSelect} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/ui/tienda-fulfillment-selector.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/TiendaFulfillmentSelector.tsx tests/ui/tienda-fulfillment-selector.test.tsx
git commit -m "feat(carrito): componente TiendaFulfillmentSelector"
```

---

### Task 14: Wizard de 2 pasos en `cart-drawer.tsx`

**Files:**
- Modify: `src/components/cart-drawer.tsx`
- Test: `tests/ui/cart-drawer-wizard-tienda.test.tsx`

> Acotado a `!isRestaurant && !mesaToken && (recogidaHabilitada ||
> envioHabilitado)`. Mesa, waiter y restaurante quedan bit a bit iguales —
> este helper es la única puerta de entrada al comportamiento nuevo.

- [ ] **Step 1: Escribir el test de la función pura de gating (falla primero)**

```typescript
// tests/ui/cart-drawer-wizard-tienda.test.tsx
import { describe, it, expect } from 'vitest';
import { usaWizardTienda } from '@/components/cart-drawer';

describe('usaWizardTienda', () => {
  it('false para restaurante, aunque tenga los toggles de tienda en true', () => {
    expect(usaWizardTienda(true, null, true, true)).toBe(false);
  });

  it('false en modo mesa', () => {
    expect(usaWizardTienda(false, 'mesa-token', true, true)).toBe(false);
  });

  it('false para tienda sin ningún toggle activo', () => {
    expect(usaWizardTienda(false, null, false, false)).toBe(false);
  });

  it('true para tienda con al menos un toggle activo, sin mesa', () => {
    expect(usaWizardTienda(false, null, true, false)).toBe(true);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/ui/cart-drawer-wizard-tienda.test.tsx`
Expected: FAIL — `usaWizardTienda` no exportada.

- [ ] **Step 3: Agregar el helper exportado, junto a `showDeliverySelector` (cart-drawer.tsx:876-877)**

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

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/ui/cart-drawer-wizard-tienda.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 5: Extender `CartDrawerProps` (cart-drawer.tsx:1002-1006)**

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

(Importar `ModalidadEntregaPublica` desde `./TiendaFulfillmentSelector`.)

- [ ] **Step 6: Agregar estado nuevo en `CartDrawer` (junto a los `useState` de la línea 1256-1266)**

```typescript
const [step, setStep] = useState<'items' | 'checkout'>('items');
const [modalidadEntregaId, setModalidadEntregaId] = useState<string | null>(null);
const [modalidadEntregaTipo, setModalidadEntregaTipo] = useState<'recogida' | 'domicilio' | null>(null);
const [modalidadEntregaPrecioCents, setModalidadEntregaPrecioCents] = useState(0);

const usaWizard = usaWizardTienda(isRestaurant, mesaToken, recogidaTiendaHabilitada, envioDomicilioHabilitado);
```

- [ ] **Step 7: Resetear `step` al abrir el drawer o vaciar el carrito**

Junto al `useEffect` de la línea 1246-1248 (el que resetea `activeOrderTokens` con `isCartOpen`):

```typescript
useEffect(() => {
  if (isCartOpen) setStep('items');
}, [isCartOpen]);

useEffect(() => {
  if (items.length === 0) setStep('items');
}, [items.length]);
```

- [ ] **Step 8: Envolver la lista de productos (líneas 1502-1587) en la condición del paso**

Cambiar:
```tsx
<div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-4 py-2">
  <ul className="flex flex-col gap-2 cv-auto" style={{ contentVisibility: 'auto' }}>
```
por:
```tsx
{(!usaWizard || step === 'items') && (
<div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-4 py-2">
  <ul className="flex flex-col gap-2 cv-auto" style={{ contentVisibility: 'auto' }}>
```
y cerrar con `)}` extra después del `</div>` que cierra ese bloque (línea 1587, justo antes de la apertura del footer en 1589). Justo debajo del `</ul>`, dentro del mismo `div`, agregar el botón "Continuar" (solo visible en wizard):

```tsx
{usaWizard && (
  <Button
    type="button"
    onClick={() => setStep('checkout')}
    disabled={items.length === 0}
    className="w-full min-h-[44px] mt-3"
  >
    Continuar — {formatPrice(totalPrice, 'EUR', language)}
  </Button>
)}
```

- [ ] **Step 9: Envolver el footer de checkout (líneas 1589 en adelante) en la condición contraria, y agregar el resumen colapsado + "Volver"**

Justo antes de `<div className="mt-auto shrink-0 border-t border-border pt-3 pb-4 bg-background">` (línea 1589), abrir:

```tsx
{(!usaWizard || step === 'checkout') && (
```

Y dentro de ese `div`, ANTES de `<DatosDelComensal .../>` (línea 1590), agregar:

```tsx
{usaWizard && (
  <button
    type="button"
    onClick={() => setStep('items')}
    className="w-full text-left text-sm text-muted-foreground mb-3 flex items-center gap-1"
  >
    ← {items.length} producto{items.length !== 1 ? 's' : ''} · {formatPrice(totalPrice, 'EUR', language)} — volver
  </button>
)}
```

Cerrar el `)}` de este bloque después del `</div>` que cierra el footer completo (buscar el `</div>` que hace match con la apertura de la línea 1589 — es el que viene justo antes del botón de submit final, que se sigue viendo SIEMPRE dentro de este bloque).

- [ ] **Step 10: Insertar `TiendaFulfillmentSelector` junto a `DeliveryMethodSelector` (línea 1606-1615)**

Después del bloque de `DeliveryMethodSelector` existente, agregar:

```tsx
{!isRestaurant && !mesaToken && (
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
    disabled={sending}
  />
)}
```

(Reutiliza los mismos `deliveryAddress`/`deliveryLatitude`/`deliveryLongitude`/`deliveryPostalCode` que ya existen para restaurante — mismo motivo que la Task 1 reutiliza las columnas de `pedidos`: es "la dirección de entrega de este pedido", sin importar qué sistema la llenó.)

- [ ] **Step 11: `pnpm build`**

Expected: sin errores. Si falla por destructuring de las nuevas props en la firma de `CartDrawer` (línea 1199), agregar `recogidaTiendaHabilitada = false, envioDomicilioHabilitado = false, modalidadesEntrega = []` a los defaults.

- [ ] **Step 12: Commit**

```bash
git add src/components/cart-drawer.tsx tests/ui/cart-drawer-wizard-tienda.test.tsx
git commit -m "feat(carrito): wizard de 2 pasos para tienda con modalidades de entrega"
```

---

### Task 15: Payload del pedido (cliente) — sumar el precio de la modalidad

**Files:**
- Modify: `src/components/cart-drawer.tsx` (`attachDeliveryFields` → nueva función hermana `attachModalidadFields`)
- Test: `tests/core/attach-modalidad-fields.test.ts`

- [ ] **Step 1: Escribir el test (falla primero)**

```typescript
// tests/core/attach-modalidad-fields.test.ts
import { describe, it, expect } from 'vitest';
import { attachModalidadFields } from '@/components/cart-drawer';

describe('attachModalidadFields', () => {
  it('no agrega nada si no hay modalidad seleccionada', () => {
    const payload: Record<string, unknown> = {};
    attachModalidadFields(payload, { modalidadEntregaId: null, modalidadEntregaTipo: null, modalidadEntregaPrecioCents: 0, deliveryAddress: '', deliveryPostalCode: '', deliveryLatitude: null, deliveryLongitude: null });
    expect(payload).toEqual({});
  });

  it('agrega los campos de recogida sin dirección', () => {
    const payload: Record<string, unknown> = {};
    attachModalidadFields(payload, { modalidadEntregaId: 'm1', modalidadEntregaTipo: 'recogida', modalidadEntregaPrecioCents: 0, deliveryAddress: '', deliveryPostalCode: '', deliveryLatitude: null, deliveryLongitude: null });
    expect(payload).toEqual({ modalidad_entrega_id: 'm1', modalidad_entrega_tipo: 'recogida', modalidad_entrega_precio_cents: 0 });
  });

  it('agrega dirección solo si el tipo es domicilio', () => {
    const payload: Record<string, unknown> = {};
    attachModalidadFields(payload, {
      modalidadEntregaId: 'm2', modalidadEntregaTipo: 'domicilio', modalidadEntregaPrecioCents: 350,
      deliveryAddress: 'Calle Falsa 123', deliveryPostalCode: '28001', deliveryLatitude: 40.4, deliveryLongitude: -3.7,
    });
    expect(payload).toEqual({
      modalidad_entrega_id: 'm2', modalidad_entrega_tipo: 'domicilio', modalidad_entrega_precio_cents: 350,
      direccion_entrega: 'Calle Falsa 123', codigo_postal: '28001', latitude_entrega: 40.4, longitude_entrega: -3.7,
    });
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/core/attach-modalidad-fields.test.ts`
Expected: FAIL — `attachModalidadFields` no exportada.

- [ ] **Step 3: Implementar, mismo patrón que `attachDeliveryFields` (cart-drawer.tsx:598-621)**

```typescript
export function attachModalidadFields(
  payload: Record<string, unknown>,
  opts: {
    modalidadEntregaId: string | null;
    modalidadEntregaTipo: 'recogida' | 'domicilio' | null;
    modalidadEntregaPrecioCents: number;
    deliveryAddress: string;
    deliveryPostalCode: string;
    deliveryLatitude: number | null;
    deliveryLongitude: number | null;
  }
) {
  const { modalidadEntregaId, modalidadEntregaTipo, modalidadEntregaPrecioCents, deliveryAddress, deliveryPostalCode, deliveryLatitude, deliveryLongitude } = opts;
  if (!modalidadEntregaId || !modalidadEntregaTipo) return;
  Object.assign(payload, {
    modalidad_entrega_id: modalidadEntregaId,
    modalidad_entrega_tipo: modalidadEntregaTipo,
    modalidad_entrega_precio_cents: modalidadEntregaPrecioCents,
    ...(modalidadEntregaTipo === 'domicilio' ? {
      direccion_entrega: deliveryAddress,
      codigo_postal: deliveryPostalCode,
      latitude_entrega: deliveryLatitude,
      longitude_entrega: deliveryLongitude,
    } : {}),
  });
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/core/attach-modalidad-fields.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Llamarla desde `processStandardOrderResponse` (cart-drawer.tsx:761-769), justo después de `attachDeliveryFields`**

Agregar a `opts` del tipo de `processStandardOrderResponse`: `modalidadEntregaId: string | null; modalidadEntregaTipo: 'recogida' | 'domicilio' | null; modalidadEntregaPrecioCents: number;` y, en el cuerpo:

```typescript
attachModalidadFields(payload, {
  modalidadEntregaId,
  modalidadEntregaTipo,
  modalidadEntregaPrecioCents,
  deliveryAddress,
  deliveryPostalCode,
  deliveryLatitude,
  deliveryLongitude,
});
```

Y en `handleConfirmOrder` (línea 1293), agregar esos tres campos al objeto que se pasa a `processStandardOrderResponse`, y al array de dependencias de su `useCallback` (línea 1318).

- [ ] **Step 6: `pnpm build`**

Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/components/cart-drawer.tsx tests/core/attach-modalidad-fields.test.ts
git commit -m "feat(carrito): sumar el precio de la modalidad de entrega al payload del pedido"
```

---

### Task 16: Revalidación server-side y persistencia

**Files:**
- Modify: `src/app/api/pedidos/route.ts:42-64` (Zod schema)
- Modify: `src/core/application/use-cases/pedido.use-case.ts` (revalidación + `buildModalidadPayload` + `calculateFinalTotal`)
- Modify: `src/core/infrastructure/database/supabase-pedido.repository.ts` (insert)
- Test: `tests/core/pedido-modalidad-revalidacion.test.ts`

> Este es el paso que de verdad importa para la seguridad de precios: el
> cliente manda `modalidad_entrega_id`, el servidor vuelve a leer
> `precio_cents` de la DB y lo usa — nunca el que venga en el body.

- [ ] **Step 1: Extender el schema Zod (`src/app/api/pedidos/route.ts:42-64`)**

```typescript
const defaultPedidoSchema = z.object({
  tipo: z.enum(['restaurante', 'tienda']).optional(),
  items: itemsSchema,
  total: z.number().min(0).max(100_000).optional(),
  nombre: z.string().min(2).max(100),
  telefono: z.string().min(9).max(20).refine(
    v => /^\+?[0-9\s\-()+]+$/.test(v),
    { message: 'Formato de teléfono no válido' }
  ),
  email: z.email().optional().or(z.literal('')),
  idioma: z.enum(['es', 'en', 'fr', 'it', 'de']).optional(),
  codigoDescuento: z.string().max(30).optional(),
  // Delivery fields (restaurant only)
  origen: z.enum(['recogida', 'delivery']).optional(),
  direccion_entrega: z.string().max(500).optional(),
  codigo_postal: z.string().max(10).optional(),
  latitude_entrega: z.number().min(-90).max(90).optional(),
  longitude_entrega: z.number().min(-180).max(180).optional(),
  estimated_delivery_fee_cents: z.number().int().min(0).max(100000).optional(),
  // Modalidad de entrega (tienda)
  modalidad_entrega_id: z.uuid().optional(),
  modalidad_entrega_tipo: z.enum(['recogida', 'domicilio']).optional(),
}).refine(data => !data.codigoDescuento || (data.email && data.email.length > 0), {
  message: 'Email is required when using a discount code',
  path: ['email'],
}).refine(data => !data.modalidad_entrega_id || !!data.modalidad_entrega_tipo, {
  message: 'modalidad_entrega_tipo es requerido junto con modalidad_entrega_id',
  path: ['modalidad_entrega_tipo'],
});
```

> Nota: **no** se acepta `modalidad_entrega_precio_cents` del cliente en el
> schema — a propósito. El servidor lo vuelve a leer de la DB en el use case
> (Step 3). Si el cliente lo manda, Zod lo descarta silenciosamente por no
> estar en el schema (comportamiento default de `.object()` sin `.passthrough()`).

- [ ] **Step 2: Escribir el test de revalidación (falla primero)**

```typescript
// tests/core/pedido-modalidad-revalidacion.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PedidoUseCase } from '@/core/application/use-cases/pedido.use-case';

// Construir un PedidoUseCase con todos sus repos mockeados es extenso —
// en vez de reconstruir el use case completo, este test ejercita
// directamente el método revalidarModalidadEntrega una vez extraído en el
// Step 3, vía una instancia mínima con solo el repo de modalidades real.
// Ajustar los imports de constructor según los repos que PedidoUseCase
// realmente reciba (ver el archivo antes de escribir el test final).
import { ModalidadEntregaUseCase } from '@/core/application/use-cases/modalidad-entrega.use-case';
import type { IModalidadEntregaRepository } from '@/core/domain/repositories/IModalidadEntregaRepository';

describe('Revalidación de precio de modalidad al crear un pedido', () => {
  it('usa el precio de la DB, no el que manda el cliente', async () => {
    const modalidadRepo: IModalidadEntregaRepository = {
      findAllByTenant: vi.fn(),
      findActivasPublicas: vi.fn(),
      findById: vi.fn().mockResolvedValue({
        success: true,
        data: { id: 'm1', empresaId: 'e1', tipo: 'domicilio', icono: 'bike', nombre: 'Envío', precioCents: 350, tiempoMinMinutos: 120, tiempoMaxMinutos: 180, activo: true, orden: 0 },
      }),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const modalidadUseCase = new ModalidadEntregaUseCase(modalidadRepo);

    // Precio "manipulado" que un cliente malicioso intentaría colar: 1 céntimo.
    const result = await modalidadUseCase.validarPrecioVigente('m1', 'e1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.precioCents).toBe(350); // NO el que mandaría el cliente
    }
  });

  it('falla si la modalidad no pertenece a la empresa del pedido', async () => {
    const modalidadRepo: IModalidadEntregaRepository = {
      findAllByTenant: vi.fn(),
      findActivasPublicas: vi.fn(),
      findById: vi.fn().mockResolvedValue({ success: true, data: null }), // findById ya filtra por empresa_id
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const modalidadUseCase = new ModalidadEntregaUseCase(modalidadRepo);
    const result = await modalidadUseCase.validarPrecioVigente('m1', 'empresa-ajena');
    expect(result.success).toBe(false);
  });
});
```

> Este test ya pasa con el código de la Task 5 — documenta el contrato que
> `PedidoUseCase.create` va a consumir en el Step 3. El test de integración
> real de `PedidoUseCase.create` (con TODOS sus repos mockeados) ya existe en
> el proyecto en algún archivo — buscarlo con
> `rg -ln "new PedidoUseCase(" tests/` y extender ESE archivo con un caso
> "pedido de tienda con modalidad de entrega" en vez de crear un mock nuevo
> desde cero.

- [ ] **Step 3: Inyectar `ModalidadEntregaUseCase` en `PedidoUseCase` y revalidar antes de calcular el total**

En el constructor de `PedidoUseCase`, agregar el nuevo dependency (revisar el constructor real antes de escribir el diff — tiene varios repos ya inyectados, seguir ese mismo estilo posicional o por objeto, el que use el archivo).

En `create()` (línea ~535+), después del Step 2 (`validateProductPrices`, línea ~566-569) y antes del Step 3 (descuento, línea ~571+), insertar:

```typescript
// Step 2.5: revalidar precio Y tipo de la modalidad de entrega (tienda) —
// nunca confiar en lo que manda el cliente. Un cliente podría mandar un
// precioCents correcto pero un modalidad_entrega_tipo manipulado (p. ej.
// forzar 'recogida' para evitar mandar direccion_entrega, o 'domicilio'
// para intentar otro efecto secundario) — por eso NO se usa
// `data.modalidad_entrega_tipo` para nada río abajo. `modalidadTipoValidado`
// es el único valor de tipo que debe persistirse o usarse para decidir
// qué campos de dirección incluir.
let modalidadPrecioCents = 0;
let modalidadTipoValidado: 'recogida' | 'domicilio' | undefined;
if (data.modalidad_entrega_id) {
  const modalidadResult = await this.modalidadEntregaUseCase.validarPrecioVigente(data.modalidad_entrega_id, empresaId);
  if (!modalidadResult.success) {
    return { success: false, error: modalidadResult.error };
  }
  modalidadPrecioCents = modalidadResult.data.precioCents;
  modalidadTipoValidado = modalidadResult.data.tipo;
}
```

- [ ] **Step 4: Sumar `modalidadPrecioCents` al total, extendiendo `calculateFinalTotal` (línea 347-362)**

```typescript
private calculateFinalTotal(
  serverTotal: number,
  isDelivery: boolean,
  deliveryFeeCents: number | undefined,
  discountData?: { applied: true; finalTotal: number } | { applied: false },
  modalidadPrecioCents = 0
): number {
  let total = serverTotal;
  if (discountData?.applied) {
    total = discountData.finalTotal;
  }
  if (isDelivery && deliveryFeeCents) {
    total = Math.round((total * 100 + deliveryFeeCents)) / 100;
  }
  if (modalidadPrecioCents > 0) {
    total = Math.round((total * 100 + modalidadPrecioCents)) / 100;
  }
  return total;
}
```

Y en la llamada (línea 597-602), agregar el quinto argumento: `modalidadPrecioCents`.

- [ ] **Step 5: Construir el payload de persistencia, mismo patrón que `buildOrigenPayload` (línea 428-440)**

```typescript
// Recibe `modalidadTipoValidado` (del Step 3, ya revalidado contra la DB) —
// NUNCA `data.modalidad_entrega_tipo` (el que manda el cliente). Ese campo
// del DTO solo sirve para gatillar el refine de Zod que exige que venga
// junto al id; el valor que se persiste y que decide qué campos de
// dirección incluir es siempre el validado.
private buildModalidadPayload(
  data: CreatePedidoDTO,
  modalidadPrecioCents: number,
  modalidadTipoValidado: 'recogida' | 'domicilio' | undefined
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

Y extender la interfaz `CreatePedidoDTO` (línea 29-50) con:

```typescript
modalidad_entrega_id?: string;
modalidad_entrega_tipo?: 'recogida' | 'domicilio';
```

- [ ] **Step 6: Fusionar ambos payloads antes de pasarlos a `this.pedidoRepo.create(...)` (línea 609-618)**

```typescript
const pedidoResult = await this.pedidoRepo.create(
  empresaId,
  clienteResult.data.clienteId,
  data.items,
  finalTotal,
  discountData,
  trackingToken,
  { ...this.buildOrigenPayload(data, isDelivery), ...this.buildModalidadPayload(data, modalidadPrecioCents, modalidadTipoValidado) },
  idempotency
);
```

- [ ] **Step 7: Extender `supabase-pedido.repository.ts` para persistir los 3 campos nuevos**

En la interfaz que declara `origen?`, `direccion_entrega?`, etc. (línea ~8-13), agregar:

```typescript
modalidad_entrega_id?: string;
modalidad_entrega_tipo?: string;
modalidad_entrega_precio_cents?: number;
```

Y donde se arma el `payload` de inserción (línea ~117-122, `if (d.origen) payload.origen = d.origen;` etc.), agregar:

```typescript
if (d.modalidad_entrega_id) payload.modalidad_entrega_id = d.modalidad_entrega_id;
if (d.modalidad_entrega_tipo) payload.modalidad_entrega_tipo = d.modalidad_entrega_tipo;
if (d.modalidad_entrega_precio_cents !== undefined) payload.modalidad_entrega_precio_cents = d.modalidad_entrega_precio_cents;
```

(Repetir en la segunda interfaz/función equivalente de la línea ~633-638 si `createMesaOrder` también construye este payload — verificar si aplica; los pedidos de mesa no usan modalidades de tienda, así que probablemente no haga falta tocar esa rama.)

- [ ] **Step 8: Wiring del nuevo constructor arg en `index.ts`**

Donde se instancia `PedidoUseCase` (buscar `new PedidoUseCase(` en `src/core/infrastructure/database/index.ts`), agregar `getModalidadEntregaUseCase()` (o el repo, según lo decidido en el Step 3) al constructor.

- [ ] **Step 9: Ejecutar todos los tests relacionados**

Run: `npx vitest run tests/core/pedido-modalidad-revalidacion.test.ts` y el archivo de test de `PedidoUseCase.create` existente que se haya extendido en el Step 2.
Expected: PASS.

- [ ] **Step 10: `pnpm build`**

Expected: sin errores.

- [ ] **Step 11: Commit**

```bash
git add src/app/api/pedidos/route.ts src/core/application/use-cases/pedido.use-case.ts src/core/infrastructure/database/supabase-pedido.repository.ts src/core/infrastructure/database/index.ts tests/core/pedido-modalidad-revalidacion.test.ts
git commit -m "feat(pedidos): revalidar precio de modalidad de entrega server-side y persistirlo"
```

**Checkpoint Fase 4:** `pnpm lint && pnpm build` + toda la suite de vitest en verde.

---

## Fase 5 — Verificación final

### Task 17: Suite completa y traducciones

**Files:**
- Modify: `src/lib/translations.ts` (5 bloques de idioma: es, en, fr, it, de)

> **Gap de seguridad de superficie de API encontrado en la review de Task 10
> (no bloqueante para esta task, pero anotado para no perderlo):**
> `updateModalidadEntregaSchema` (en `src/core/application/dtos/modalidad-entrega.dto.ts`)
> se deriva de `baseModalidadEntregaSchema` directo y NO reaplica el
> `.superRefine`/`.refine` que sí tiene `createModalidadEntregaSchema` — así que
> un `PUT /api/admin/modalidades-entrega?id=...` hoy no está protegido contra
> `tiempoMinMinutos > tiempoMaxMinutos` ni contra agregar tiempo a una
> modalidad de `recogida`. La UI actual (`ModalidadesEntregaForm`'s toggle de
> activo/inactivo) solo manda `{ activo: bool }` en sus `onUpdate`, así que no
> lo ejercita hoy — pero si en el futuro se agrega edición completa de una
> modalidad existente (no solo activar/desactivar), hay que agregar la misma
> validación cruzada al schema de update antes de habilitarla. El CHECK
> constraint de la DB (`tiempo_solo_domicilio`) sigue siendo el respaldo
> final, pero fallaría con un 500 crudo de Postgres, no un 400 legible.

- [ ] **Step 1: Agregar las claves de traducción nuevas en los 5 bloques de idioma**

Junto a `deliveryMethodPickup`/`deliveryMethodHome` (buscar esas claves en cada uno de los 5 bloques — líneas ~717, ~1719, ~2238, ~2738 y el bloque de `de` que sigue el mismo patrón), agregar:

```typescript
// es
tiendaPickupTab: "Recoger en tienda",
tiendaDeliveryTab: "Envío a domicilio",
tiendaContinueButton: "Continuar",
tiendaBackToItems: "volver",
```

(Y su traducción real, no el mismo texto en español, para `en`/`fr`/`it`/`de` — mismo criterio que las claves vecinas ya traducidas en esos bloques.)

- [ ] **Step 2: Reemplazar los strings hardcodeados de la Task 13/14 por `t(...)`**

`TiendaFulfillmentSelector` y el botón "Continuar"/"volver" del wizard en `cart-drawer.tsx` quedaron con texto en español fijo en las Tasks anteriores para simplificar la escritura del plan — en este paso se reemplazan por `t('tiendaPickupTab', language)`, etc., como exige `CLAUDE.md` ("Usar `t()` de `@/lib/translations` para TODO el texto de UI").

- [ ] **Step 3: Suite completa**

```bash
pnpm lint
pnpm typecheck
pnpm build
npx vitest run
```

Expected: todo en verde.

- [ ] **Step 4: DB smoke**

```bash
pnpm db:smoke
```

Expected: verde — la tabla nueva y las columnas nuevas no afectan `digest()` ni funciones `SECURITY DEFINER` existentes.

- [ ] **Step 5: Commit final**

```bash
git add src/lib/translations.ts src/components/TiendaFulfillmentSelector.tsx src/components/cart-drawer.tsx
git commit -m "i18n(carrito): traducir textos del selector de modalidades y el wizard"
```

---

## Self-Review

**Cobertura del spec:** las 10 secciones del spec (`2026-09-13-tienda-recogida-domicilio-design.md`) tienen tarea correspondiente — arquitectura independiente (todas las tareas evitan tocar Glovo/Redsys), modelo de datos (Task 1-2), API (Task 3-8), admin UI (Task 9-10), carrito (Task 11-15), i18n (Task 17), testing (test en cada task), manejo de errores (Task 3 refine, Task 16 revalidación), fuera de alcance (respetado — no hay zona de cobertura ni migración de restaurante en ningún task).

**Corrección aplicada durante el planning:** reutilizar `direccion_entrega`/`latitude_entrega`/`longitude_entrega`/`codigo_postal` de `pedidos` en vez de columnas nuevas (mejora sobre el spec, verificada leyendo el repositorio real).

**Riesgo señalado explícitamente:** Task 10 y Task 16 tienen pasos que dicen "leer el archivo real antes de escribir el diff" en vez de código completo — son los dos puntos donde el archivo existente (`/admin/delivery/page.tsx`, `PedidoUseCase`) no se leyó línea por línea durante este planning por su tamaño, y forzar un diff a ciegas ahí sería el placeholder que este proceso prohíbe. Quien ejecute esas dos tareas debe abrir el archivo primero.

---

## Recomendación de PRs encadenadas

Dado el tamaño (17 tasks, 5 fases tocando DB + admin + carrito), sugiero 4 PRs en cadena en vez de una sola:

1. **PR1** — Fase 1 completa (backend, sin UI). Revisable y mergeable de forma aislada.
2. **PR2** — Fase 2 (admin UI). Depende de PR1.
3. **PR3** — Fase 3 (extracción Mapbox + catálogo público). Depende de PR1; el riesgo real de esta PR es no romper restaurante — vale la pena que un reviewer la vea sola.
4. **PR4** — Fase 4 + 5 (carrito + i18n + verificación final). Depende de PR1 y PR3.
