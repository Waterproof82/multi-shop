# Sistema de Complementos por Producto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to execute this plan. Each task must be checked off as it completes. Run `pnpm lint && pnpm build` after ALL tasks to confirm zero regressions. No task is "done" if lint or build fails.

**Spec:** `docs/superpowers/specs/2026-07-11-complementos-productos-design.md`
**Goal:** Add a reusable, multi-group product complement system (radio/checkbox) to both the client menu and the TPV, replacing the single-group category-based approach where needed and layering on top of it where backward compat is required.

---

## Context

- **Existing complement system**: Category-based (`categoria_complemento_de` on `categorias`). Stays intact — backward compat required.
- **New system**: Three tables (`complemento_grupos`, `complemento_opciones`, `producto_complemento_grupos`). Product-level, reusable, multi-group.
- **UI targets**: `QuantitySelectorDialog` (client menu) + `ComplementDialog` inside `MenuPanel.tsx` (TPV).
- **`PendingItem` type change**: `complementos: string[]` → `complementos: { nombre: string; precio: number }[]` + new `precioTotal: number` field.
- **No test runner** detected — validation is `pnpm lint && pnpm build` only.
- **Repository pattern**: follows `SupabaseCategoryRepository` exactly.
- **No `any`**: use `Record<string, unknown>` in mappers.

---

## Tasks

### Task 1 — DB Migration
**File:** `supabase/migrations/20260711000001_complementos.sql`

```sql
-- ============================================================
-- complemento_grupos  (reusable groups per tenant)
-- ============================================================
CREATE TABLE public.complemento_grupos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre_es    text NOT NULL,
  nombre_en    text,
  nombre_fr    text,
  nombre_it    text,
  nombre_de    text,
  tipo         text NOT NULL CHECK (tipo IN ('radio', 'checkbox')),
  obligatorio  boolean NOT NULL DEFAULT false,
  orden        integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- complemento_opciones  (options within a group)
-- ============================================================
CREATE TABLE public.complemento_opciones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id          uuid NOT NULL REFERENCES public.complemento_grupos(id) ON DELETE CASCADE,
  empresa_id        uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre_es         text NOT NULL,
  nombre_en         text,
  nombre_fr         text,
  nombre_it         text,
  nombre_de         text,
  precio_adicional  numeric(10,2) NOT NULL DEFAULT 0,
  orden             integer NOT NULL DEFAULT 0,
  activo            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- producto_complemento_grupos  (N:M — product ↔ group)
-- ============================================================
CREATE TABLE public.producto_complemento_grupos (
  producto_id  uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  grupo_id     uuid NOT NULL REFERENCES public.complemento_grupos(id) ON DELETE CASCADE,
  orden        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (producto_id, grupo_id)
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX ON public.complemento_grupos (empresa_id, orden);
CREATE INDEX ON public.complemento_opciones (grupo_id, orden);
CREATE INDEX ON public.producto_complemento_grupos (producto_id, orden);
CREATE INDEX ON public.producto_complemento_grupos (grupo_id);

-- ============================================================
-- RLS — tables fully closed to anon; service_role bypasses
-- ============================================================
ALTER TABLE public.complemento_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complemento_opciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_complemento_grupos ENABLE ROW LEVEL SECURITY;

-- Deny anon
CREATE POLICY "No anon access to complemento_grupos"
  ON public.complemento_grupos FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "No anon access to complemento_opciones"
  ON public.complemento_opciones FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "No anon access to producto_complemento_grupos"
  ON public.producto_complemento_grupos FOR ALL TO anon USING (false) WITH CHECK (false);

-- authenticated (admin UI uses admin_token → service_role; these are for future RLS if needed)
CREATE POLICY "Admin accede a complemento_grupos"
  ON public.complemento_grupos FOR ALL TO authenticated
  USING (empresa_id = get_mi_empresa_id()) WITH CHECK (empresa_id = get_mi_empresa_id());
CREATE POLICY "Admin accede a complemento_opciones"
  ON public.complemento_opciones FOR ALL TO authenticated
  USING (empresa_id = get_mi_empresa_id()) WITH CHECK (empresa_id = get_mi_empresa_id());
CREATE POLICY "Admin accede a producto_complemento_grupos via grupo"
  ON public.producto_complemento_grupos FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.complemento_grupos g
      WHERE g.id = grupo_id AND g.empresa_id = get_mi_empresa_id()
    )
  );

-- ============================================================
-- GRANTs — service_role needs explicit table grants
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complemento_grupos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complemento_opciones TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.producto_complemento_grupos TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.complemento_grupos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complemento_opciones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.producto_complemento_grupos TO authenticated;
```

**Validation:** Apply via `mcp__supabase__apply_migration`. Confirm tables exist with `mcp__supabase__list_tables`.

---

### Task 2 — Domain types + Repository interface + Zod DTOs

#### 2a. `src/core/domain/entities/complemento-types.ts` (CREATE)

```typescript
export interface ComplementoOpcion {
  id: string;
  grupoId: string;
  empresaId: string;
  nombre_es: string;
  nombre_en: string | null;
  nombre_fr: string | null;
  nombre_it: string | null;
  nombre_de: string | null;
  precioAdicional: number;
  orden: number;
  activo: boolean;
  createdAt: Date;
}

export interface ComplementoGrupo {
  id: string;
  empresaId: string;
  nombre_es: string;
  nombre_en: string | null;
  nombre_fr: string | null;
  nombre_it: string | null;
  nombre_de: string | null;
  tipo: 'radio' | 'checkbox';
  obligatorio: boolean;
  orden: number;
  createdAt: Date;
  opciones: ComplementoOpcion[];
}

export interface ProductoComplementoAsignacion {
  productoId: string;
  grupoId: string;
  orden: number;
}
```

#### 2b. `src/core/domain/repositories/IComplementoGrupoRepository.ts` (CREATE)

```typescript
import type { Result } from '@/core/domain/entities/types';
import type { ComplementoGrupo, ProductoComplementoAsignacion } from '@/core/domain/entities/complemento-types';

export interface CreateComplementoGrupoData {
  empresaId: string;
  nombre_es: string;
  nombre_en?: string | null;
  nombre_fr?: string | null;
  nombre_it?: string | null;
  nombre_de?: string | null;
  tipo: 'radio' | 'checkbox';
  obligatorio: boolean;
  orden?: number;
}

export interface UpdateComplementoGrupoData extends Partial<Omit<CreateComplementoGrupoData, 'empresaId'>> {}

export interface CreateComplementoOpcionData {
  grupoId: string;
  empresaId: string;
  nombre_es: string;
  nombre_en?: string | null;
  nombre_fr?: string | null;
  nombre_it?: string | null;
  nombre_de?: string | null;
  precioAdicional?: number;
  orden?: number;
}

export interface IComplementoGrupoRepository {
  findAllByTenant(empresaId: string): Promise<Result<ComplementoGrupo[]>>;
  findByIds(grupoIds: string[], empresaId: string): Promise<Result<ComplementoGrupo[]>>;
  findByProducto(productoId: string, empresaId: string): Promise<Result<ComplementoGrupo[]>>;
  findAssignmentsByProductos(productoIds: string[], empresaId: string): Promise<Result<ProductoComplementoAsignacion[]>>;
  createGrupo(data: CreateComplementoGrupoData): Promise<Result<ComplementoGrupo>>;
  updateGrupo(id: string, empresaId: string, data: UpdateComplementoGrupoData): Promise<Result<ComplementoGrupo>>;
  deleteGrupo(id: string, empresaId: string): Promise<Result<void>>;
  createOpcion(data: CreateComplementoOpcionData): Promise<Result<{ id: string }>>;
  updateOpcion(id: string, grupoId: string, data: Partial<CreateComplementoOpcionData>): Promise<Result<void>>;
  deleteOpcion(id: string, grupoId: string): Promise<Result<void>>;
  setProductoGrupos(productoId: string, grupoIds: string[]): Promise<Result<void>>;
}
```

#### 2c. `src/core/application/dtos/complemento.dto.ts` (CREATE)

```typescript
import { z } from 'zod';

export const createComplementoGrupoSchema = z.object({
  empresaId: z.string().uuid(),
  nombre_es: z.string().min(1).max(200),
  nombre_en: z.string().max(200).nullable().optional(),
  nombre_fr: z.string().max(200).nullable().optional(),
  nombre_it: z.string().max(200).nullable().optional(),
  nombre_de: z.string().max(200).nullable().optional(),
  tipo: z.enum(['radio', 'checkbox']),
  obligatorio: z.boolean().default(false),
  orden: z.number().int().default(0),
});

export const updateComplementoGrupoSchema = createComplementoGrupoSchema.omit({ empresaId: true }).partial();

export const createComplementoOpcionSchema = z.object({
  nombre_es: z.string().min(1).max(200),
  nombre_en: z.string().max(200).nullable().optional(),
  nombre_fr: z.string().max(200).nullable().optional(),
  nombre_it: z.string().max(200).nullable().optional(),
  nombre_de: z.string().max(200).nullable().optional(),
  precio_adicional: z.number().min(0).default(0),
  orden: z.number().int().default(0),
});

export const updateComplementoOpcionSchema = createComplementoOpcionSchema.partial();

export const setProductoGruposSchema = z.object({
  grupoIds: z.array(z.string().uuid()),
});

export type CreateComplementoGrupoDTO = z.infer<typeof createComplementoGrupoSchema>;
export type UpdateComplementoGrupoDTO = z.infer<typeof updateComplementoGrupoSchema>;
export type CreateComplementoOpcionDTO = z.infer<typeof createComplementoOpcionSchema>;
export type SetProductoGruposDTO = z.infer<typeof setProductoGruposSchema>;
```

#### 2d. `src/core/application/dtos/menu-view-model.ts` (MODIFY)

Add `ComplementGroupVM` and extend `MenuItemVM`:

```typescript
// ADD after existing ComplementVM interface:
export interface ComplementGroupVM {
  id: string;
  name: string;
  tipo: 'radio' | 'checkbox';
  obligatorio: boolean;
  translations?: {
    en?: string;
    fr?: string;
    it?: string;
    de?: string;
  };
  opciones: ComplementVM[];
}

// MODIFY MenuItemVM — add after requiresComplement:
  complementGroups?: ComplementGroupVM[];
```

---

### Task 3 — Repository implementation + UseCase + index.ts wiring

#### 3a. `src/core/infrastructure/database/supabase-complemento-grupo.repository.ts` (CREATE)

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import type { IComplementoGrupoRepository, CreateComplementoGrupoData, UpdateComplementoGrupoData, CreateComplementoOpcionData } from '@/core/domain/repositories/IComplementoGrupoRepository';
import type { ComplementoGrupo, ComplementoOpcion, ProductoComplementoAsignacion } from '@/core/domain/entities/complemento-types';
import type { Result } from '@/core/domain/entities/types';
import { logger } from '../logging/logger';

export class SupabaseComplementoGrupoRepository implements IComplementoGrupoRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private mapOpcion(row: Record<string, unknown>): ComplementoOpcion {
    return {
      id: row.id as string,
      grupoId: row.grupo_id as string,
      empresaId: row.empresa_id as string,
      nombre_es: row.nombre_es as string,
      nombre_en: (row.nombre_en as string | null) ?? null,
      nombre_fr: (row.nombre_fr as string | null) ?? null,
      nombre_it: (row.nombre_it as string | null) ?? null,
      nombre_de: (row.nombre_de as string | null) ?? null,
      precioAdicional: Number(row.precio_adicional ?? 0),
      orden: (row.orden as number) ?? 0,
      activo: (row.activo as boolean) ?? true,
      createdAt: new Date(row.created_at as string),
    };
  }

  private mapGrupo(row: Record<string, unknown>, opciones: ComplementoOpcion[]): ComplementoGrupo {
    return {
      id: row.id as string,
      empresaId: row.empresa_id as string,
      nombre_es: row.nombre_es as string,
      nombre_en: (row.nombre_en as string | null) ?? null,
      nombre_fr: (row.nombre_fr as string | null) ?? null,
      nombre_it: (row.nombre_it as string | null) ?? null,
      nombre_de: (row.nombre_de as string | null) ?? null,
      tipo: row.tipo as 'radio' | 'checkbox',
      obligatorio: (row.obligatorio as boolean) ?? false,
      orden: (row.orden as number) ?? 0,
      createdAt: new Date(row.created_at as string),
      opciones,
    };
  }

  async findAllByTenant(empresaId: string): Promise<Result<ComplementoGrupo[]>> {
    try {
      const { data: grupos, error: gErr } = await this.supabase
        .from('complemento_grupos')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('orden', { ascending: true });

      if (gErr) {
        await logger.logAndReturnError('DB_SELECT_ERROR', gErr.message, 'repository', 'SupabaseComplementoGrupoRepository.findAllByTenant', { empresaId });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener grupos', module: 'repository', method: 'findAllByTenant' } };
      }

      if (!grupos || grupos.length === 0) return { success: true, data: [] };

      const grupoIds = grupos.map((g: Record<string, unknown>) => g.id as string);
      const { data: opciones, error: oErr } = await this.supabase
        .from('complemento_opciones')
        .select('*')
        .in('grupo_id', grupoIds)
        .eq('activo', true)
        .order('orden', { ascending: true });

      if (oErr) {
        await logger.logAndReturnError('DB_SELECT_ERROR', oErr.message, 'repository', 'SupabaseComplementoGrupoRepository.findAllByTenant.opciones', { empresaId });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener opciones', module: 'repository', method: 'findAllByTenant' } };
      }

      const opcionesByGrupo = new Map<string, ComplementoOpcion[]>();
      for (const o of (opciones ?? []) as Record<string, unknown>[]) {
        const mapped = this.mapOpcion(o);
        const arr = opcionesByGrupo.get(mapped.grupoId) ?? [];
        arr.push(mapped);
        opcionesByGrupo.set(mapped.grupoId, arr);
      }

      const data = (grupos as Record<string, unknown>[]).map(g =>
        this.mapGrupo(g, opcionesByGrupo.get(g.id as string) ?? [])
      );

      return { success: true, data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.findAllByTenant', { empresaId });
      return { success: false, error: appError };
    }
  }

  async findByIds(grupoIds: string[], empresaId: string): Promise<Result<ComplementoGrupo[]>> {
    try {
      if (grupoIds.length === 0) return { success: true, data: [] };

      const { data: grupos, error: gErr } = await this.supabase
        .from('complemento_grupos')
        .select('*')
        .in('id', grupoIds)
        .eq('empresa_id', empresaId)
        .order('orden', { ascending: true });

      if (gErr) {
        await logger.logAndReturnError('DB_SELECT_ERROR', gErr.message, 'repository', 'SupabaseComplementoGrupoRepository.findByIds', { grupoIds });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener grupos', module: 'repository', method: 'findByIds' } };
      }

      if (!grupos || grupos.length === 0) return { success: true, data: [] };

      const { data: opciones, error: oErr } = await this.supabase
        .from('complemento_opciones')
        .select('*')
        .in('grupo_id', grupoIds)
        .eq('activo', true)
        .order('orden', { ascending: true });

      if (oErr) {
        await logger.logAndReturnError('DB_SELECT_ERROR', oErr.message, 'repository', 'SupabaseComplementoGrupoRepository.findByIds.opciones', { grupoIds });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener opciones', module: 'repository', method: 'findByIds' } };
      }

      const opcionesByGrupo = new Map<string, ComplementoOpcion[]>();
      for (const o of (opciones ?? []) as Record<string, unknown>[]) {
        const mapped = this.mapOpcion(o);
        const arr = opcionesByGrupo.get(mapped.grupoId) ?? [];
        arr.push(mapped);
        opcionesByGrupo.set(mapped.grupoId, arr);
      }

      const data = (grupos as Record<string, unknown>[]).map(g =>
        this.mapGrupo(g, opcionesByGrupo.get(g.id as string) ?? [])
      );

      return { success: true, data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.findByIds', { grupoIds });
      return { success: false, error: appError };
    }
  }

  async findByProducto(productoId: string, empresaId: string): Promise<Result<ComplementoGrupo[]>> {
    try {
      const { data: asig, error: aErr } = await this.supabase
        .from('producto_complemento_grupos')
        .select('grupo_id, orden')
        .eq('producto_id', productoId)
        .order('orden', { ascending: true });

      if (aErr) {
        await logger.logAndReturnError('DB_SELECT_ERROR', aErr.message, 'repository', 'SupabaseComplementoGrupoRepository.findByProducto', { productoId });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener asignaciones', module: 'repository', method: 'findByProducto' } };
      }

      if (!asig || asig.length === 0) return { success: true, data: [] };

      const grupoIds = (asig as Record<string, unknown>[]).map(a => a.grupo_id as string);
      return this.findByIds(grupoIds, empresaId);
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.findByProducto', { productoId });
      return { success: false, error: appError };
    }
  }

  async findAssignmentsByProductos(productoIds: string[], empresaId: string): Promise<Result<ProductoComplementoAsignacion[]>> {
    try {
      if (productoIds.length === 0) return { success: true, data: [] };

      const { data, error } = await this.supabase
        .from('producto_complemento_grupos')
        .select('producto_id, grupo_id, orden')
        .in('producto_id', productoIds);

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabaseComplementoGrupoRepository.findAssignmentsByProductos', { empresaId });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener asignaciones', module: 'repository', method: 'findAssignmentsByProductos' } };
      }

      const mapped = ((data ?? []) as Record<string, unknown>[]).map(row => ({
        productoId: row.producto_id as string,
        grupoId: row.grupo_id as string,
        orden: (row.orden as number) ?? 0,
      }));

      return { success: true, data: mapped };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.findAssignmentsByProductos', { empresaId });
      return { success: false, error: appError };
    }
  }

  async createGrupo(data: CreateComplementoGrupoData): Promise<Result<ComplementoGrupo>> {
    try {
      const { data: created, error } = await this.supabase
        .from('complemento_grupos')
        .insert({
          empresa_id: data.empresaId,
          nombre_es: data.nombre_es,
          nombre_en: data.nombre_en ?? null,
          nombre_fr: data.nombre_fr ?? null,
          nombre_it: data.nombre_it ?? null,
          nombre_de: data.nombre_de ?? null,
          tipo: data.tipo,
          obligatorio: data.obligatorio,
          orden: data.orden ?? 0,
        })
        .select()
        .single();

      if (error || !created) {
        await logger.logAndReturnError('DB_INSERT_ERROR', error?.message ?? 'No data', 'repository', 'SupabaseComplementoGrupoRepository.createGrupo', { data });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al crear grupo', module: 'repository', method: 'createGrupo' } };
      }

      return { success: true, data: this.mapGrupo(created as Record<string, unknown>, []) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.createGrupo', { data });
      return { success: false, error: appError };
    }
  }

  async updateGrupo(id: string, empresaId: string, data: UpdateComplementoGrupoData): Promise<Result<ComplementoGrupo>> {
    try {
      const updateData: Record<string, unknown> = {};
      if (data.nombre_es !== undefined) updateData.nombre_es = data.nombre_es;
      if (data.nombre_en !== undefined) updateData.nombre_en = data.nombre_en;
      if (data.nombre_fr !== undefined) updateData.nombre_fr = data.nombre_fr;
      if (data.nombre_it !== undefined) updateData.nombre_it = data.nombre_it;
      if (data.nombre_de !== undefined) updateData.nombre_de = data.nombre_de;
      if (data.tipo !== undefined) updateData.tipo = data.tipo;
      if (data.obligatorio !== undefined) updateData.obligatorio = data.obligatorio;
      if (data.orden !== undefined) updateData.orden = data.orden;

      const { data: updated, error } = await this.supabase
        .from('complemento_grupos')
        .update(updateData)
        .eq('id', id)
        .eq('empresa_id', empresaId)
        .select()
        .single();

      if (error || !updated) {
        await logger.logAndReturnError('DB_UPDATE_ERROR', error?.message ?? 'No data', 'repository', 'SupabaseComplementoGrupoRepository.updateGrupo', { id });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar grupo', module: 'repository', method: 'updateGrupo' } };
      }

      // Fetch opciones for the updated grupo
      const opcionesResult = await this.findByIds([id], empresaId);
      const opciones = opcionesResult.success ? (opcionesResult.data[0]?.opciones ?? []) : [];

      return { success: true, data: this.mapGrupo(updated as Record<string, unknown>, opciones) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.updateGrupo', { id });
      return { success: false, error: appError };
    }
  }

  async deleteGrupo(id: string, empresaId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('complemento_grupos')
        .delete()
        .eq('id', id)
        .eq('empresa_id', empresaId);

      if (error) {
        await logger.logAndReturnError('DB_DELETE_ERROR', error.message, 'repository', 'SupabaseComplementoGrupoRepository.deleteGrupo', { id });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al eliminar grupo', module: 'repository', method: 'deleteGrupo' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.deleteGrupo', { id });
      return { success: false, error: appError };
    }
  }

  async createOpcion(data: CreateComplementoOpcionData): Promise<Result<{ id: string }>> {
    try {
      const { data: created, error } = await this.supabase
        .from('complemento_opciones')
        .insert({
          grupo_id: data.grupoId,
          empresa_id: data.empresaId,
          nombre_es: data.nombre_es,
          nombre_en: data.nombre_en ?? null,
          nombre_fr: data.nombre_fr ?? null,
          nombre_it: data.nombre_it ?? null,
          nombre_de: data.nombre_de ?? null,
          precio_adicional: data.precioAdicional ?? 0,
          orden: data.orden ?? 0,
        })
        .select('id')
        .single();

      if (error || !created) {
        await logger.logAndReturnError('DB_INSERT_ERROR', error?.message ?? 'No data', 'repository', 'SupabaseComplementoGrupoRepository.createOpcion', { data });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al crear opción', module: 'repository', method: 'createOpcion' } };
      }

      return { success: true, data: { id: (created as Record<string, unknown>).id as string } };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.createOpcion', { data });
      return { success: false, error: appError };
    }
  }

  async updateOpcion(id: string, grupoId: string, data: Partial<CreateComplementoOpcionData>): Promise<Result<void>> {
    try {
      const updateData: Record<string, unknown> = {};
      if (data.nombre_es !== undefined) updateData.nombre_es = data.nombre_es;
      if (data.nombre_en !== undefined) updateData.nombre_en = data.nombre_en;
      if (data.nombre_fr !== undefined) updateData.nombre_fr = data.nombre_fr;
      if (data.nombre_it !== undefined) updateData.nombre_it = data.nombre_it;
      if (data.nombre_de !== undefined) updateData.nombre_de = data.nombre_de;
      if (data.precioAdicional !== undefined) updateData.precio_adicional = data.precioAdicional;
      if (data.orden !== undefined) updateData.orden = data.orden;

      const { error } = await this.supabase
        .from('complemento_opciones')
        .update(updateData)
        .eq('id', id)
        .eq('grupo_id', grupoId);

      if (error) {
        await logger.logAndReturnError('DB_UPDATE_ERROR', error.message, 'repository', 'SupabaseComplementoGrupoRepository.updateOpcion', { id });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar opción', module: 'repository', method: 'updateOpcion' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.updateOpcion', { id });
      return { success: false, error: appError };
    }
  }

  async deleteOpcion(id: string, grupoId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('complemento_opciones')
        .delete()
        .eq('id', id)
        .eq('grupo_id', grupoId);

      if (error) {
        await logger.logAndReturnError('DB_DELETE_ERROR', error.message, 'repository', 'SupabaseComplementoGrupoRepository.deleteOpcion', { id });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al eliminar opción', module: 'repository', method: 'deleteOpcion' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.deleteOpcion', { id });
      return { success: false, error: appError };
    }
  }

  async setProductoGrupos(productoId: string, grupoIds: string[]): Promise<Result<void>> {
    try {
      // Delete all existing assignments
      const { error: delErr } = await this.supabase
        .from('producto_complemento_grupos')
        .delete()
        .eq('producto_id', productoId);

      if (delErr) {
        await logger.logAndReturnError('DB_DELETE_ERROR', delErr.message, 'repository', 'SupabaseComplementoGrupoRepository.setProductoGrupos', { productoId });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar asignaciones', module: 'repository', method: 'setProductoGrupos' } };
      }

      if (grupoIds.length === 0) return { success: true, data: undefined };

      const rows = grupoIds.map((grupoId, idx) => ({ producto_id: productoId, grupo_id: grupoId, orden: idx }));
      const { error: insErr } = await this.supabase
        .from('producto_complemento_grupos')
        .insert(rows);

      if (insErr) {
        await logger.logAndReturnError('DB_INSERT_ERROR', insErr.message, 'repository', 'SupabaseComplementoGrupoRepository.setProductoGrupos', { productoId });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al insertar asignaciones', module: 'repository', method: 'setProductoGrupos' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseComplementoGrupoRepository.setProductoGrupos', { productoId });
      return { success: false, error: appError };
    }
  }
}
```

#### 3b. `src/core/application/use-cases/complemento-grupo.use-case.ts` (CREATE)

```typescript
import type { IComplementoGrupoRepository, CreateComplementoGrupoData, UpdateComplementoGrupoData, CreateComplementoOpcionData } from '@/core/domain/repositories/IComplementoGrupoRepository';
import type { ComplementoGrupo } from '@/core/domain/entities/complemento-types';
import type { Result } from '@/core/domain/entities/types';

export class ComplementoGrupoUseCase {
  constructor(private readonly repo: IComplementoGrupoRepository) {}

  getAll(empresaId: string): Promise<Result<ComplementoGrupo[]>> {
    return this.repo.findAllByTenant(empresaId);
  }

  getByProducto(productoId: string, empresaId: string): Promise<Result<ComplementoGrupo[]>> {
    return this.repo.findByProducto(productoId, empresaId);
  }

  create(data: CreateComplementoGrupoData): Promise<Result<ComplementoGrupo>> {
    return this.repo.createGrupo(data);
  }

  update(id: string, empresaId: string, data: UpdateComplementoGrupoData): Promise<Result<ComplementoGrupo>> {
    return this.repo.updateGrupo(id, empresaId, data);
  }

  delete(id: string, empresaId: string): Promise<Result<void>> {
    return this.repo.deleteGrupo(id, empresaId);
  }

  createOpcion(data: CreateComplementoOpcionData): Promise<Result<{ id: string }>> {
    return this.repo.createOpcion(data);
  }

  updateOpcion(id: string, grupoId: string, data: Partial<CreateComplementoOpcionData>): Promise<Result<void>> {
    return this.repo.updateOpcion(id, grupoId, data);
  }

  deleteOpcion(id: string, grupoId: string): Promise<Result<void>> {
    return this.repo.deleteOpcion(id, grupoId);
  }

  setProductoGrupos(productoId: string, grupoIds: string[]): Promise<Result<void>> {
    return this.repo.setProductoGrupos(productoId, grupoIds);
  }
}
```

#### 3c. `src/core/infrastructure/database/index.ts` (MODIFY)

Add after existing imports:
```typescript
import { SupabaseComplementoGrupoRepository } from './supabase-complemento-grupo.repository';
import { ComplementoGrupoUseCase } from '@/core/application/use-cases/complemento-grupo.use-case';
```

Add after existing repo instantiations:
```typescript
export const complementoGrupoRepository = new SupabaseComplementoGrupoRepository(supabase);
```

Add after existing use case instantiations:
```typescript
export const complementoGrupoUseCase = new ComplementoGrupoUseCase(complementoGrupoRepository);
```

---

### Task 4 — Admin API: Grupos CRUD

#### `src/app/api/admin/complementos/grupos/route.ts` (CREATE)

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { complementoGrupoUseCase } from '@/core/infrastructure/database';
import { requireAuth, requireRole, handleResult, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { createComplementoGrupoSchema } from '@/core/application/dtos/complemento.dto';

export async function GET(req: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(req);
  if (authError) return authError;
  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const result = await complementoGrupoUseCase.getAll(empresaId);
  return handleResult(result);
}

export async function POST(req: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(req);
  if (authError) return authError;
  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  let body: unknown;
  try { body = await req.json(); } catch { return validationErrorResponse('JSON inválido'); }

  const parsed = createComplementoGrupoSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.errors[0]?.message ?? 'Datos inválidos');

  const result = await complementoGrupoUseCase.create({ ...parsed.data, empresaId });
  return handleResult(result, 201);
}
```

#### `src/app/api/admin/complementos/grupos/[grupoId]/route.ts` (CREATE)

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { complementoGrupoUseCase } from '@/core/infrastructure/database';
import { requireAuth, requireRole, handleResult, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { updateComplementoGrupoSchema } from '@/core/application/dtos/complemento.dto';

interface Params { params: Promise<{ grupoId: string }> }

export async function PUT(req: NextRequest, { params }: Params) {
  const { grupoId } = await params;
  const { empresaId, error: authError } = await requireAuth(req);
  if (authError) return authError;
  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  let body: unknown;
  try { body = await req.json(); } catch { return validationErrorResponse('JSON inválido'); }

  const parsed = updateComplementoGrupoSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.errors[0]?.message ?? 'Datos inválidos');

  const result = await complementoGrupoUseCase.update(grupoId, empresaId, parsed.data);
  return handleResult(result);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { grupoId } = await params;
  const { empresaId, error: authError } = await requireAuth(req);
  if (authError) return authError;
  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const result = await complementoGrupoUseCase.delete(grupoId, empresaId);
  return handleResult(result);
}
```

---

### Task 5 — Admin API: Opciones + Producto-Complementos

#### `src/app/api/admin/complementos/grupos/[grupoId]/opciones/route.ts` (CREATE)

```typescript
import { type NextRequest } from 'next/server';
import { complementoGrupoUseCase } from '@/core/infrastructure/database';
import { requireAuth, requireRole, handleResult, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { createComplementoOpcionSchema } from '@/core/application/dtos/complemento.dto';

interface Params { params: Promise<{ grupoId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { grupoId } = await params;
  const { empresaId, error: authError } = await requireAuth(req);
  if (authError) return authError;
  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  let body: unknown;
  try { body = await req.json(); } catch { return validationErrorResponse('JSON inválido'); }

  const parsed = createComplementoOpcionSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.errors[0]?.message ?? 'Datos inválidos');

  const result = await complementoGrupoUseCase.createOpcion({
    grupoId,
    empresaId,
    nombre_es: parsed.data.nombre_es,
    nombre_en: parsed.data.nombre_en,
    nombre_fr: parsed.data.nombre_fr,
    nombre_it: parsed.data.nombre_it,
    nombre_de: parsed.data.nombre_de,
    precioAdicional: parsed.data.precio_adicional,
    orden: parsed.data.orden,
  });
  return handleResult(result, 201);
}
```

#### `src/app/api/admin/complementos/grupos/[grupoId]/opciones/[opcionId]/route.ts` (CREATE)

```typescript
import { type NextRequest } from 'next/server';
import { complementoGrupoUseCase } from '@/core/infrastructure/database';
import { requireAuth, requireRole, handleResult, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { updateComplementoOpcionSchema } from '@/core/application/dtos/complemento.dto';

interface Params { params: Promise<{ grupoId: string; opcionId: string }> }

export async function PUT(req: NextRequest, { params }: Params) {
  const { grupoId, opcionId } = await params;
  const { error: authError } = await requireAuth(req);
  if (authError) return authError;
  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;

  let body: unknown;
  try { body = await req.json(); } catch { return validationErrorResponse('JSON inválido'); }

  const parsed = updateComplementoOpcionSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.errors[0]?.message ?? 'Datos inválidos');

  const result = await complementoGrupoUseCase.updateOpcion(opcionId, grupoId, {
    nombre_es: parsed.data.nombre_es,
    precioAdicional: parsed.data.precio_adicional,
    orden: parsed.data.orden,
  });
  return handleResult(result);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { grupoId, opcionId } = await params;
  const { error: authError } = await requireAuth(req);
  if (authError) return authError;
  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;

  const result = await complementoGrupoUseCase.deleteOpcion(opcionId, grupoId);
  return handleResult(result);
}
```

#### `src/app/api/admin/productos/[productoId]/complementos/route.ts` (CREATE)

```typescript
import { type NextRequest } from 'next/server';
import { complementoGrupoUseCase } from '@/core/infrastructure/database';
import { requireAuth, requireRole, handleResult, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { setProductoGruposSchema } from '@/core/application/dtos/complemento.dto';

interface Params { params: Promise<{ productoId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { productoId } = await params;
  const { empresaId, error: authError } = await requireAuth(req);
  if (authError) return authError;
  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const result = await complementoGrupoUseCase.getByProducto(productoId, empresaId);
  return handleResult(result);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { productoId } = await params;
  const { error: authError } = await requireAuth(req);
  if (authError) return authError;
  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;

  let body: unknown;
  try { body = await req.json(); } catch { return validationErrorResponse('JSON inválido'); }

  const parsed = setProductoGruposSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.errors[0]?.message ?? 'Datos inválidos');

  const result = await complementoGrupoUseCase.setProductoGrupos(productoId, parsed.data.grupoIds);
  return handleResult(result);
}
```

---

### Task 6 — Menu: VM types + mapper + GetMenuUseCase

#### 6a. `src/core/application/dtos/menu-view-model.ts` (MODIFY)

The actual edits to make:

1. Add `ComplementGroupVM` interface after `ComplementVM`:
```typescript
export interface ComplementGroupVM {
  id: string;
  name: string;
  tipo: 'radio' | 'checkbox';
  obligatorio: boolean;
  translations?: {
    en?: string;
    fr?: string;
    it?: string;
    de?: string;
  };
  opciones: ComplementVM[];
}
```

2. Add `complementGroups?: ComplementGroupVM[];` to `MenuItemVM` after `requiresComplement`.

#### 6b. `src/core/application/mappers/menu.mapper.ts` (MODIFY)

Add `complementGroups` parameter to `toCategoryVM` and pass it through to items:

```typescript
// Add import at top:
import type { ComplementGroupVM } from '@/core/application/dtos/menu-view-model';
import type { ComplementoGrupo } from '@/core/domain/entities/complemento-types';

// Add helper function before MenuMapper class:
function mapComplementoGrupoToGroupVM(grupo: ComplementoGrupo): ComplementGroupVM {
  return {
    id: grupo.id,
    name: grupo.nombre_es,
    tipo: grupo.tipo,
    obligatorio: grupo.obligatorio,
    translations: {
      en: grupo.nombre_en ?? undefined,
      fr: grupo.nombre_fr ?? undefined,
      it: grupo.nombre_it ?? undefined,
      de: grupo.nombre_de ?? undefined,
    },
    opciones: grupo.opciones.map(o => ({
      id: o.id,
      name: o.nombre_es,
      price: o.precioAdicional,
      translations: {
        en: o.nombre_en ? { name: o.nombre_en } : undefined,
        fr: o.nombre_fr ? { name: o.nombre_fr } : undefined,
        it: o.nombre_it ? { name: o.nombre_it } : undefined,
        de: o.nombre_de ? { name: o.nombre_de } : undefined,
      },
    })),
  };
}

// Modify toCategoryVM signature — add parameter after products:
//   complementoGruposByProductId: Map<string, ComplementoGrupo[]>
// Inside the items map, after existing complement logic, add:
//   complementGroups: complementoGruposByProductId.get(p.id)?.map(mapComplementoGrupoToGroupVM),
```

Full modified `toCategoryVM` signature:
```typescript
static toCategoryVM(
  parentCat: Category,
  allProducts: Product[],
  childSubcategories: Category[],
  categoryComplements: Product[],
  requiresComplement: boolean,
  categoriesById: Map<string, Category>,
  products: Product[],
  complementCategoryName: string | undefined,
  complementCategoryTranslations: Category['translations'] | undefined,
  complementoGruposByProductId: Map<string, ComplementoGrupo[]>,
): MenuCategoryVM
```

And in the items map:
```typescript
return {
  ...item,
  complements: categoryComplements.length > 0 ? categoryComplements.map(mapComplementProduct) : undefined,
  requiresComplement: requiresComplement || undefined,
  complementGroups: complementoGruposByProductId.get(p.id)?.map(mapComplementoGrupoToGroupVM),
};
```

#### 6c. `src/core/application/use-cases/get-menu.use-case.ts` (MODIFY)

Add `IComplementoGrupoRepository` as third constructor arg. After fetching products and categories, also fetch complement assignments and groups in parallel:

```typescript
import type { IComplementoGrupoRepository } from '@/core/domain/repositories/IComplementoGrupoRepository';
import type { ComplementoGrupo } from '@/core/domain/entities/complemento-types';

export class GetMenuUseCase {
  constructor(
    private readonly productRepo: IProductRepository,
    private readonly categoryRepo: ICategoryRepository,
    private readonly complementoRepo: IComplementoGrupoRepository,
  ) {}

  async execute(empresaId: string): Promise<{ data?: MenuCategoryVM[]; error?: string }> {
    // ... existing try/catch ...
    const [productsResult, categoriesResult] = await Promise.all([...]);
    // ... existing error handling ...

    // NEW: fetch complement groups for all active products
    const activeProductIds = productsResult.data
      .filter(p => p.activo)
      .map(p => p.id);

    const [assignmentsResult, gruposResult] = await Promise.all([
      this.complementoRepo.findAssignmentsByProductos(activeProductIds, empresaId),
      this.complementoRepo.findAllByTenant(empresaId),
    ]);

    // Build map: productoId -> ComplementoGrupo[] (ordered by asignacion.orden)
    const complementoGruposByProductId = new Map<string, ComplementoGrupo[]>();
    if (assignmentsResult.success && gruposResult.success) {
      const gruposById = new Map(gruposResult.data.map(g => [g.id, g]));
      for (const asig of assignmentsResult.data) {
        const grupo = gruposById.get(asig.grupoId);
        if (!grupo) continue;
        const arr = complementoGruposByProductId.get(asig.productoId) ?? [];
        arr.push(grupo);
        complementoGruposByProductId.set(asig.productoId, arr);
      }
    }

    // Pass complementoGruposByProductId to MenuMapper.toCategoryVM
    // (update the call site inside parentCategories.map)
  }
}
```

The call site in `parentCategories.map` needs the new argument appended:
```typescript
return MenuMapper.toCategoryVM(
  parentCat, products, childSubcategories, categoryComplements, requiresComplement,
  categoriesById, products, complementCategoryName, complementCategoryTranslations,
  complementoGruposByProductId,  // NEW
);
```

#### 6d. Wire new GetMenuUseCase in `src/core/infrastructure/database/index.ts` (MODIFY)

The `GetMenuUseCase` is currently instantiated in the API route directly or via a separate factory. Find where it's created and add `complementoGrupoRepository` as the third arg.

Check: `grep -r "GetMenuUseCase" src/` to find the instantiation, then add the new argument.

---

### Task 7 — TPV: PendingItem type change + catalog + context + TicketPanel display

#### 7a. `src/hooks/tpv/useMesaActiva.ts` (MODIFY)

**PendingItem type change:**
```typescript
export interface PendingItem {
  productId: string;
  nombre: string;
  precio: number;       // base price (immutable)
  precioTotal: number;  // precio + sum(complementos[].precio) * cantidad is NOT included here — this is per-unit total
  cantidad: number;
  complementos: { nombre: string; precio: number }[];
  nota?: string;
}
```

**`calcPendingTotal`:**
```typescript
function calcPendingTotal(items: PendingItem[]): number {
  return items.reduce((sum, i) => sum + i.precioTotal * i.cantidad, 0);
}
```

**`addItem` function — update signature and dedup key:**
```typescript
const addItem = useCallback((item: Omit<PendingItem, 'cantidad'>) => {
  setMesa(prev => {
    const complementos = item.complementos ?? [];
    const key = complementos.map(c => c.nombre).join(',');
    const existing = prev.pendingItems.findIndex(
      i => i.productId === item.productId && i.complementos.map(c => c.nombre).join(',') === key
    );
    const pendingItems: PendingItem[] = existing >= 0
      ? prev.pendingItems.map((it, idx) =>
          idx === existing ? { ...it, cantidad: it.cantidad + 1 } : it
        )
      : [...prev.pendingItems, {
          productId: item.productId,
          nombre: item.nombre,
          precio: item.precio,
          precioTotal: item.precioTotal,
          cantidad: 1,
          complementos,
          nota: item.nota,
        }];
    return { ...prev, pendingItems, pendingTotal: calcPendingTotal(pendingItems) };
  });
}, []);
```

**`removeItem` — update key:**
```typescript
const removeItem = useCallback((nombre: string, complementos: { nombre: string; precio: number }[] = []) => {
  setMesa(prev => {
    const key = complementos.map(c => c.nombre).join(',');
    const pendingItems = prev.pendingItems.filter(
      i => !(i.nombre === nombre && i.complementos.map(c => c.nombre).join(',') === key)
    );
    return { ...prev, pendingItems, pendingTotal: calcPendingTotal(pendingItems) };
  });
}, []);
```

**`updatePendingNota` — update key:**
```typescript
const updatePendingNota = useCallback((productId: string, complementos: { nombre: string; precio: number }[], nota: string | undefined) => {
  setMesa(prev => {
    const key = complementos.map(c => c.nombre).join(',');
    return {
      ...prev,
      pendingItems: prev.pendingItems.map(it =>
        it.productId === productId && it.complementos.map(c => c.nombre).join(',') === key
          ? { ...it, nota: nota || undefined }
          : it
      ),
    };
  });
}, []);
```

#### 7b. `src/components/tpv/TicketPanel.tsx` (MODIFY)

1. Update `onRemovePending` prop type: `(nombre: string, complementos: { nombre: string; precio: number }[]) => void`
2. Update `onUpdatePendingNota` prop type: `(productId: string, complementos: { nombre: string; precio: number }[], nota: string | undefined) => void`
3. Line 148/189 display: `item.complementos.map(c => c.nombre).join(', ')`
4. Line 178 key: `item.complementos.map(c => c.nombre).join(',')`
5. Line 152 price display: change `item.precio * item.cantidad` → `item.precioTotal * item.cantidad`
6. Line 300 API body: change `precio: i.precio` → `precio: i.precioTotal` in the items mapping
7. Line 300 complementos: `complementos: i.complementos` stays as-is (already `{nombre,precio}[]` after type change)
8. Line 206 `onRemovePending`: stays same call site, type is updated above

#### 7c. `src/app/api/tpv/catalog/route.ts` (MODIFY)

Add complement groups fetch and return:

```typescript
import { complementoGrupoRepository } from '@/core/infrastructure/database';

// In GET handler, add to the parallel fetch:
const [productsResult, categoriesResult, empresaRes, gruposResult, assignmentsResult] = await Promise.all([
  productUseCase.getAll(empresaId),
  categoryUseCase.getAll(empresaId),
  supabase.from('empresas').select('tipo_impuesto, porcentaje_impuesto').eq('id', empresaId).maybeSingle(),
  complementoGrupoRepository.findAllByTenant(empresaId),
  // assignments fetched separately in endpoint to avoid N+1
]);

// Note: assignments are fetched from gruposResult after product IDs are known
// Build a map: productoId -> ComplementoGrupo[]
// This requires a second call — do it after productsResult is known:
const activeProductIds = (productsResult.success ? productsResult.data : [])
  .filter(p => p.activo)
  .map(p => p.id);
const assignmentsResult = await complementoGrupoRepository.findAssignmentsByProductos(activeProductIds, empresaId);

// Return:
return NextResponse.json({
  products: productsResult.success ? productsResult.data : [],
  categories: categoriesResult.success ? categoriesResult.data : [],
  tipoImpuesto: ...,
  porcentajeImpuesto: ...,
  complementoGrupos: gruposResult.success ? gruposResult.data : [],
  productoGrupos: assignmentsResult.success ? assignmentsResult.data : [],
});
```

**IMPORTANT**: Refactor the parallel fetch to avoid the sequential dependency. Pattern:
1. Fetch `[products, categories, empresa]` in parallel.
2. Then fetch `[gruposResult, assignmentsResult]` in parallel (using product IDs from step 1).
Or: fetch `findAllByTenant` for groups (doesn't need product IDs) + `findAssignmentsByProductos` (needs product IDs) sequentially after products resolve.

Simpler: run all in two Promise.all calls:
```typescript
const [productsResult, categoriesResult, empresaRes, gruposResult] = await Promise.all([
  productUseCase.getAll(empresaId),
  categoryUseCase.getAll(empresaId),
  supabase.from('empresas').select('tipo_impuesto, porcentaje_impuesto').eq('id', empresaId).maybeSingle(),
  complementoGrupoRepository.findAllByTenant(empresaId),
]);

const activeIds = (productsResult.success ? productsResult.data : []).filter(p => p.activo).map(p => p.id);
const assignmentsResult = await complementoGrupoRepository.findAssignmentsByProductos(activeIds, empresaId);
```

#### 7d. `src/lib/tpv-catalog-ctx.tsx` (MODIFY)

Add to `TpvCatalogContextValue`:
```typescript
complementoGruposByProductId: Map<string, ComplementoGrupo[]>;
```

Add to `TpvCatalogProviderProps`:
```typescript
readonly initialComplementoGrupos: ComplementoGrupo[];
readonly initialProductoGrupos: ProductoComplementoAsignacion[];
```

Add to `CatalogResponse`:
```typescript
type CatalogResponse = {
  products: Product[];
  categories: Category[];
  complementoGrupos: ComplementoGrupo[];
  productoGrupos: ProductoComplementoAsignacion[];
};
```

Build the map in state:
```typescript
function buildComplementoMap(
  grupos: ComplementoGrupo[],
  asignaciones: ProductoComplementoAsignacion[],
): Map<string, ComplementoGrupo[]> {
  const gruposById = new Map(grupos.map(g => [g.id, g]));
  const map = new Map<string, ComplementoGrupo[]>();
  for (const asig of asignaciones) {
    const grupo = gruposById.get(asig.grupoId);
    if (!grupo) continue;
    const arr = map.get(asig.productoId) ?? [];
    arr.push(grupo);
    map.set(asig.productoId, arr);
  }
  return map;
}
```

Add state:
```typescript
const [complementoGruposByProductId, setComplementoGruposByProductId] = useState<Map<string, ComplementoGrupo[]>>(
  () => buildComplementoMap(initialComplementoGrupos, initialProductoGrupos)
);
```

Update `refreshCatalog` to rebuild the map from the new API response.

Update context default value and provider value to include `complementoGruposByProductId`.

#### 7e. `src/app/tpv/layout.tsx` (MODIFY — only the SSR fetch)

The layout fetches initial catalog. Need to also fetch complement groups from the DB and pass as props to `TpvCatalogProvider`:

```typescript
// Find the initial catalog fetch in layout.tsx
// Add complementoGrupoRepository calls:
import { complementoGrupoRepository } from '@/core/infrastructure/database';

// In the parallel fetch:
const [products, categories, gruposResult, assignmentsResult] = await Promise.all([...]);

// Pass to TpvCatalogProvider:
<TpvCatalogProvider
  ...
  initialComplementoGrupos={gruposResult.success ? gruposResult.data : []}
  initialProductoGrupos={assignmentsResult.success ? assignmentsResult.data : []}
>
```

---

### Task 8 — Admin sidebar + Complementos page

#### 8a. `src/app/admin/(protected)/admin-sidebar.tsx` (MODIFY)

Add import for `Layers` icon (or `ListChecks`) from lucide-react. Then add to `BASE_NAV_ITEMS`:

```typescript
import { ..., Layers } from 'lucide-react';

// Add to BASE_NAV_ITEMS after sidebarProducts:
{ href: '/admin/complementos', labelKey: 'sidebarComplementos', icon: Layers, requiresRestaurant: true },
```

#### 8b. `src/lib/translations.ts` (MODIFY)

Add `sidebarComplementos` key to all 5 language objects:
- es: `'Grupos de complementos'`
- en: `'Complement groups'`
- fr: `'Groupes de compléments'`
- it: `'Gruppi di complementi'`
- de: `'Ergänzungsgruppen'`

#### 8c. `src/app/admin/(protected)/complementos/page.tsx` (CREATE)

Two-panel layout: left = list of groups, right = selected group detail (options + product assignments).

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit2, Check, X, ChevronRight } from 'lucide-react';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useAdmin } from '@/lib/admin-context';
import { useLanguage } from '@/lib/language-context';
import type { ComplementoGrupo } from '@/core/domain/entities/complemento-types';

// Full two-panel admin page:
// Left: list of ComplementoGrupo cards (click to select)
// Right:
//   - Group meta editor (nombre_es, tipo, obligatorio, orden)
//   - Opciones list with inline add/edit/delete
//   - Assign to productos section (search + toggle)
//
// State:
//   grupos: ComplementoGrupo[]
//   selectedGrupoId: string | null
//   loading: boolean
//
// The component fetches GET /api/admin/complementos/grupos on mount.
// All mutations call the respective API endpoints and refresh state.
```

> **Note for implementor:** Build a minimal but functional version. No need for full i18n on the admin page body — labels in Spanish (`nombre_es`) are acceptable for the admin UI. Do use `t()` for any translatable strings that already exist. The admin page is for internal use only.

Key UI sections:
1. **Left panel** (`w-72 border-r`): list of group cards, each showing `nombre_es`, `tipo` badge, `obligatorio` badge, item count. "Nuevo grupo" button at top.
2. **Right panel** (`flex-1`): only shown when a group is selected.
   - **Header**: editable group name + type selector + obligatorio toggle + save/delete buttons.
   - **Opciones section**: list of options with `nombre_es`, `precio_adicional`, trash icon. "Añadir opción" inline form at bottom.
   - **No product-assignment UI needed in MVP** — product form handles it (Task 9).

---

### Task 9 — Product form: complement group assignment

#### `src/app/admin/(protected)/productos/[productoId]/edit/page.tsx` (or similar product form) (MODIFY)

Find the product edit form (grep for `productoId` or `productos` in admin pages). Add a "Grupos de complementos" section at the bottom of the form.

The section:
1. Fetches `GET /api/admin/complementos/grupos` (all tenant groups).
2. Fetches `GET /api/admin/productos/[productoId]/complementos` (currently assigned groups).
3. Renders a multi-select list: each group shown as a checkbox, checked if assigned.
4. On save: `PUT /api/admin/productos/[productoId]/complementos` with `{ grupoIds: [...] }`.

This can be a separate save button or part of the existing product save flow (separate is simpler and avoids coupling).

```typescript
// Section component:
function ProductComplementosSection({ productoId }: { productoId: string }) {
  const [allGrupos, setAllGrupos] = useState<ComplementoGrupo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // fetch on mount
  // toggle checkbox → update selectedIds
  // "Guardar asignaciones" → PUT /api/admin/productos/[productoId]/complementos
}
```

---

### Task 10 — QuantitySelectorDialog refactor (client-facing menu)

#### `src/components/quantity-selector-dialog.tsx` (MODIFY — major refactor)

Replace single `selectedComplement` state with multi-group state. Full logic:

**State:**
```typescript
// Map from grupoId → Set of selected opcionIds
const [selectedByGroup, setSelectedByGroup] = useState<Record<string, Set<string>>>({});
```

**Reset on open:**
```typescript
useEffect(() => {
  if (open && item) {
    setQuantity(1);
    setSelectedByGroup({});
    setIsDeferred(false);
    setNote('');
    setShowNote(false);
  }
}, [open, item?.id]);
```

**Validation:**
```typescript
// Build effective groups: new complementGroups + legacy complements[] normalized
function getEffectiveGroups(item: MenuItemVM): ComplementGroupVM[] {
  const groups: ComplementGroupVM[] = item.complementGroups ?? [];
  // legacy backward-compat: if complements[] exist and no complementGroups, create synthetic group
  if (groups.length === 0 && item.complements && item.complements.length > 0) {
    return [{
      id: '__legacy__',
      name: item.complements[0]?.name ?? 'Opciones',  // use existing complement category name if available
      tipo: 'radio',
      obligatorio: item.requiresComplement ?? false,
      opciones: item.complements,
    }];
  }
  return groups;
}

function isValid(groups: ComplementGroupVM[], selectedByGroup: Record<string, Set<string>>): boolean {
  return groups
    .filter(g => g.obligatorio)
    .every(g => {
      const sel = selectedByGroup[g.id];
      return sel && sel.size > 0;
    });
}
```

**Toggle handlers:**
```typescript
function toggleRadio(grupoId: string, opcionId: string) {
  setSelectedByGroup(prev => {
    const current = prev[grupoId];
    const already = current?.has(opcionId);
    // radio: toggle off if clicking selected; otherwise replace
    return {
      ...prev,
      [grupoId]: already ? new Set() : new Set([opcionId]),
    };
  });
}

function toggleCheckbox(grupoId: string, opcionId: string) {
  setSelectedByGroup(prev => {
    const current = new Set(prev[grupoId] ?? []);
    if (current.has(opcionId)) { current.delete(opcionId); }
    else { current.add(opcionId); }
    return { ...prev, [grupoId]: current };
  });
}
```

**Price calculation:**
```typescript
const effectiveGroups = item ? getEffectiveGroups(item) : [];
const allOpciones = effectiveGroups.flatMap(g => g.opciones);
const selectedOpciones = allOpciones.filter(o =>
  effectiveGroups.some(g => selectedByGroup[g.id]?.has(o.id))
);
const complementsPrice = selectedOpciones.reduce((s, o) => s + o.price, 0);
const unitPrice = (item?.price ?? 0) + complementsPrice;
const totalPrice = unitPrice * quantity;
```

**Validation display — progress bar per group:**
```typescript
// For each obligatorio group: red if not selected, green if selected
// For optional groups: always blue/complete
```

**On confirm:**
```typescript
function handleConfirmAddToCart() {
  if (!item || quantity < 1) return;
  if (!isValid(effectiveGroups, selectedByGroup)) return;

  const complementos = selectedOpciones.map(o => ({ id: o.id, name: o.name, price: o.price }));
  addItem(item, quantity, complementos.length > 0 ? complementos : undefined, isDeferred || undefined, note.trim() || undefined);
  // reset and close
}
```

**Render — group sections with scroll hint:**
```typescript
// Wrapper: max-h-[60vh] overflow-y-auto with scroll shadow at bottom when overflowing
// Each group:
//   - Group header: name + badge (tipo + obligatorio)
//   - Progress bar: red/incomplete or green/complete for required; blue always for optional
//   - Options list: radio buttons (custom toggle) or checkboxes
```

**Badge text logic:**
```typescript
function groupBadgeText(g: ComplementGroupVM): string {
  if (!g.obligatorio) return g.tipo === 'radio' ? 'Opcional · elige 1' : 'Opcional';
  return g.tipo === 'radio' ? 'Obligatorio · elige 1' : 'Obligatorio · elige al menos 1';
}
```

**Note on `addItem` from `useCart`:** The `cart-context` `addItem` signature currently takes `selectedComplement: ComplementVM[] | undefined`. Update the call to pass the new format — the cart context's `addItem` may need its type updated too (check `src/lib/cart-context.tsx`).

---

### Task 11 — TPV ComplementDialog refactor (MenuPanel.tsx)

#### `src/components/tpv/MenuPanel.tsx` (MODIFY)

**Props update:**
```typescript
import type { ComplementoGrupo } from '@/core/domain/entities/complemento-types';
import { useTpvCatalog } from '@/lib/tpv-catalog-ctx';

// In Props:
interface Props {
  readonly products: Product[];
  readonly categories: Category[];
  readonly onAddItem: (item: AddItemPayload) => void;
  readonly mesaSeleccionada: boolean;
}
```

**AddItemPayload update** (since PendingItem.complementos changed):
```typescript
type AddItemPayload = Omit<PendingItem, 'cantidad'>;
// Already correct — PendingItem now has { nombre, precio }[] for complementos
```

**ComplementDialogState update:**
```typescript
interface ComplementDialogState {
  product: Product;
  // New groups from the new system (may be empty)
  newGroups: ComplementoGrupo[];
  // Legacy from category system (may be empty)
  legacyOptions: Product[];
  legacyRequired: boolean;
}
```

**buildComplementMaps** stays the same (for legacy).

**Product click handler** — check new groups first, fall back to legacy:
```typescript
const { complementoGruposByProductId } = useTpvCatalog();

function handleProductClick(product: Product) {
  const newGroups = complementoGruposByProductId.get(product.id) ?? [];
  const legacyOpts = complementsByCatId.get(product.categoriaId ?? '') ?? [];
  const legacyRequired = requiredByCatId.get(product.categoriaId ?? '') ?? false;

  if (newGroups.length > 0 || legacyOpts.length > 0) {
    setComplementDialog({ product, newGroups, legacyOptions: legacyOpts, legacyRequired });
  } else {
    // No complements — add directly
    onAddItem({
      productId: product.id,
      nombre: product.titulo_es,
      precio: product.precio,
      precioTotal: product.precio,
      complementos: [],
    });
  }
}
```

**ComplementDialog component** — multi-group support:

```typescript
interface ComplementDialogProps {
  state: ComplementDialogState;
  onConfirm: (complementos: { nombre: string; precio: number }[], precioTotal: number) => void;
  onClose: () => void;
}

function ComplementDialog({ state, onConfirm, onClose }: Readonly<ComplementDialogProps>) {
  // State: selectedByGroup: Record<string, string | Set<string>>
  // For radio: string | null (one selection or none)
  // For checkbox: Set<string>

  // Normalize all into one structure: Record<groupId, Set<string>>
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, Set<string>>>({});

  // Effective groups: new system takes priority; if none, normalize legacy into one synthetic group
  const groups: Array<{
    id: string; name: string; tipo: 'radio' | 'checkbox'; obligatorio: boolean;
    opciones: Array<{ id: string; name: string; precio: number }>;
  }> = state.newGroups.length > 0
    ? state.newGroups.map(g => ({
        id: g.id, name: g.nombre_es, tipo: g.tipo, obligatorio: g.obligatorio,
        opciones: g.opciones.map(o => ({ id: o.id, name: o.nombre_es, precio: o.precioAdicional })),
      }))
    : state.legacyOptions.length > 0
      ? [{
          id: '__legacy__', name: 'Complementos', tipo: 'radio' as const,
          obligatorio: state.legacyRequired,
          opciones: state.legacyOptions.map(p => ({ id: p.titulo_es, name: p.titulo_es, precio: p.precio })),
        }]
      : [];

  const isValid = groups
    .filter(g => g.obligatorio)
    .every(g => (selectedByGroup[g.id]?.size ?? 0) > 0);

  const selectedOpciones = groups.flatMap(g =>
    g.opciones.filter(o => selectedByGroup[g.id]?.has(o.id))
  );
  const complementosExtra = selectedOpciones.reduce((s, o) => s + o.precio, 0);
  const precioTotal = state.product.precio + complementosExtra;

  function handleConfirm() {
    if (!isValid) return;
    const complementos = selectedOpciones.map(o => ({ nombre: o.name, precio: o.precio }));
    onConfirm(complementos, precioTotal);
  }

  // ... render similar to current ComplementDialog but with group sections
}
```

**onConfirm call site in MenuPanel** — update to use new signature:
```typescript
onConfirm={(complementos, precioTotal) => {
  onAddItem({
    productId: state.product.id,
    nombre: state.product.titulo_es,
    precio: state.product.precio,
    precioTotal,
    complementos,
  });
  setComplementDialog(null);
}}
```

---

## Validation (after ALL tasks)

```bash
pnpm lint && pnpm build
```

Zero errors required. Pay attention to:
- TypeScript errors from `PendingItem.complementos` type change propagating to all callers
- `GetMenuUseCase` constructor arity change — update all instantiation sites
- `TpvCatalogProvider` new required props — update all mount sites
- `MenuMapper.toCategoryVM` new parameter — update the single call site in `GetMenuUseCase`

---

## Gotchas & Non-Obvious Notes

1. **`calcPendingTotal`** must use `precioTotal` not `precio` — otherwise cart total is wrong.
2. **`setProductoGrupos` is destructive** — always send full array. Admin UI must preload current state before saving.
3. **Two fetch calls in catalog route** — groups don't need product IDs, assignments do. Use two sequential `Promise.all` groups to minimize latency without a waterfall.
4. **`ComplementGroupVM` vs `ComplementoGrupo`** — the VM is for the public menu (i18n-aware, name resolved for current lang). The domain type is the full raw domain object. Don't mix them.
5. **Radio optional deselect** — use `role="radio" aria-checked` custom button, not native `<input type="radio">`. Click same radio again → deselect.
6. **Progress bar per group** — required group: red when no selection, green when selected. Optional group: always blue/neutral (never red).
7. **Legacy backward compat in `QuantitySelectorDialog`** — if `complementGroups` is empty and `complements[]` exists, normalize to synthetic group with `tipo='radio'` and `obligatorio=requiresComplement`.
8. **TPV `ComplementDialog`** — new system groups take priority over legacy. If a product has both, show only new groups (admin migrated it).
9. **`findAssignmentsByProductos` with empty array** — returns `{ success: true, data: [] }` immediately without hitting DB.
10. **`useId()` for Realtime channels** — don't use `Math.random()` in hooks (ESLint `react-hooks/purity`). Already pattern-established in codebase.
