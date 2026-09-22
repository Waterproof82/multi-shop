# Menús Virtuales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins group existing products into additional, purpose-built navigation trees ("menús virtuales", e.g. "Vehículos" → "Coches"/"Motos") that appear in the public catalog next to real categories, without moving or duplicating products.

**Architecture:** Two new tables (`menus_virtuales` self-referencing tree, `menu_virtual_productos` many-to-many join) mirror the existing `categorias`/`producto_complemento_grupos` patterns exactly. `GetMenuUseCase` resolves virtual menus against the same in-memory product list it already loads and appends synthetic `MenuCategoryVM` entries — `MenuSection`/`CategoryNav` render them with zero changes. Admin CRUD lives behind service-role-only RLS (anon fully denied), same as complement groups.

**Tech Stack:** Next.js App Router API routes, Supabase (Postgres + RLS), Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-menus-virtuales-design.md`

---

### Task 1: Migration — `menus_virtuales` table

**Files:**
- Create: `supabase/migrations/20260916000003_menus_virtuales.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Menús virtuales: árboles de navegación adicionales sobre productos ya
-- existentes (ver docs/superpowers/specs/2026-09-16-menus-virtuales-design.md).
-- padre_id NULL = menú de nivel superior; padre_id no-nulo = subcategoría.
CREATE TABLE public.menus_virtuales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  padre_id UUID REFERENCES public.menus_virtuales(id) ON DELETE CASCADE,
  nombre_es TEXT NOT NULL,
  nombre_en TEXT,
  nombre_fr TEXT,
  nombre_it TEXT,
  nombre_de TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_menus_virtuales_empresa_id ON public.menus_virtuales(empresa_id);
CREATE INDEX idx_menus_virtuales_padre_id ON public.menus_virtuales(padre_id);

ALTER TABLE public.menus_virtuales ENABLE ROW LEVEL SECURITY;

-- AS RESTRICTIVE: se combina con AND, ninguna policy permisiva agregada
-- despues puede anularla (ver docs/context/security.md, incidente 2026-07-31).
CREATE POLICY "No direct anon access to menus_virtuales"
  ON public.menus_virtuales AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

-- get_mi_empresa_id() envuelta en (SELECT ...) para InitPlan — evaluada una
-- vez por statement, no una vez por fila (ver CLAUDE.md, seccion InitPlan).
CREATE POLICY "Admin ve menus_virtuales"
  ON public.menus_virtuales FOR SELECT TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin inserta menus_virtuales"
  ON public.menus_virtuales FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin edita menus_virtuales"
  ON public.menus_virtuales FOR UPDATE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()))
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin elimina menus_virtuales"
  ON public.menus_virtuales FOR DELETE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.menus_virtuales TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menus_virtuales TO authenticated;
```

- [x] **Step 2: Do NOT apply yet** — Task 3 applies both migrations together with `supabase db push --linked` (project rule: never `apply_migration`/`execute_sql` as the primary path).

**Status: DONE.** Implemented, spec-reviewed (✅ compliant), code-quality-reviewed (found missing InitPlan wrapper + minor casing/naming drift vs. sibling migrations — fixed, re-reviewed, ✅ ready to merge). File remains untracked (commits together with Task 2 in a later step). The SQL block above reflects the final, corrected version.

---

### Task 2: Migration — `menu_virtual_productos` table

**Files:**
- Create: `supabase/migrations/20260916000004_menu_virtual_productos.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Asociación many-to-many entre un nodo HOJA de menus_virtuales y productos.
-- empresa_id denormalizado a proposito (mismo patron que producto_complemento_grupos)
-- para poder filtrar RLS y el DELETE de setProductos sin un JOIN.
CREATE TABLE public.menu_virtual_productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  menu_virtual_id UUID NOT NULL REFERENCES public.menus_virtuales(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (menu_virtual_id, producto_id)
);

CREATE INDEX idx_menu_virtual_productos_empresa_id ON public.menu_virtual_productos(empresa_id);
CREATE INDEX idx_menu_virtual_productos_producto_id ON public.menu_virtual_productos(producto_id);
-- Sin indice propio para menu_virtual_id: UNIQUE(menu_virtual_id, producto_id)
-- ya crea un indice compuesto cuya columna izquierda lo cubre (leftmost prefix).

ALTER TABLE public.menu_virtual_productos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to menu_virtual_productos"
  ON public.menu_virtual_productos AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

-- get_mi_empresa_id() envuelta en (SELECT ...) para InitPlan — mismo criterio
-- que menus_virtuales (ver CLAUDE.md, seccion InitPlan).
CREATE POLICY "Admin ve menu_virtual_productos"
  ON public.menu_virtual_productos FOR SELECT TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin inserta menu_virtual_productos"
  ON public.menu_virtual_productos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin elimina menu_virtual_productos"
  ON public.menu_virtual_productos FOR DELETE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

GRANT SELECT, INSERT, DELETE ON public.menu_virtual_productos TO service_role;
GRANT SELECT, INSERT, DELETE ON public.menu_virtual_productos TO authenticated;
```

Sin policy/GRANT de `UPDATE`: es tabla puente pura (se borra e inserta desde `setProductos`, nunca se edita una fila existente) — mismo criterio que `producto_complemento_grupos`.

- [x] **Step 2: Do NOT apply yet** — see Task 3.

**Status: DONE.** Implemented, spec-reviewed (✅ compliant), code-quality-reviewed (found a redundant index already covered by the `UNIQUE` constraint's leftmost prefix — removed, re-reviewed, ✅ ready to merge). File remains untracked.

---

### Task 3: Apply migrations and verify

**Files:** none (verification task)

- [ ] **Step 1: Apply both migrations**

Run: `supabase db push --linked`
Expected: both `20260916000003_menus_virtuales.sql` and `20260916000004_menu_virtual_productos.sql` listed as applied, no errors.

- [ ] **Step 2: Verify migration history is 1:1**

Run: `supabase migration list`
Expected: `Local` and `Remote` columns match for both new versions (no drift).

- [ ] **Step 3: Run the DB smoke checklist**

Run: `pnpm db:smoke`
Expected: PASS (this migration adds no `SECURITY DEFINER` functions, so it shouldn't affect existing smoke checks — just confirming nothing broke).

- [ ] **Step 4: Sanity-check RLS from the SQL side**

Run via `mcp__supabase__execute_sql`:
```sql
select tablename, policyname, roles, cmd from pg_policies
where schemaname='public' and tablename in ('menus_virtuales','menu_virtual_productos')
order by tablename, policyname;
```
Expected: 5 policies on `menus_virtuales` (anon deny + 4 authenticated CRUD), 4 on `menu_virtual_productos` (anon deny + 3 authenticated, no UPDATE).

**Status: DONE.** Both migrations applied via `supabase db push --linked`, `migration list` shows Local==Remote for both (and no pre-existing drift), `pnpm db:smoke` passed, RLS policy counts verified (5 + 4, matching). Both migration files committed together in `a0705bf8`.

---

### Task 4: Domain entity + repository interface

**Files:**
- Modify: `src/core/domain/entities/types.ts`
- Create: `src/core/domain/repositories/IMenuVirtualRepository.ts`

- [ ] **Step 1: Add the `MenuVirtual` entity**

Add to `src/core/domain/entities/types.ts`, right after the `Category` interface (after its closing `}`):

```ts
export interface MenuVirtual {
  id: string;
  empresaId: string;
  padreId: string | null;
  nombre: string;
  translations?: {
    en?: string;
    fr?: string;
    it?: string;
    de?: string;
  };
  orden: number;
}
```

- [ ] **Step 2: Write the repository interface**

Create `src/core/domain/repositories/IMenuVirtualRepository.ts`:

```ts
import type { Result, MenuVirtual } from '@/core/domain/entities/types';

export interface CreateMenuVirtualData {
  empresaId: string;
  padreId?: string | null;
  nombre_es: string;
  nombre_en?: string | null;
  nombre_fr?: string | null;
  nombre_it?: string | null;
  nombre_de?: string | null;
  orden?: number;
}

export interface UpdateMenuVirtualData extends Partial<Omit<CreateMenuVirtualData, 'empresaId' | 'padreId'>> {}

export interface MenuVirtualProductoAsignacion {
  menuVirtualId: string;
  productoId: string;
}

export interface IMenuVirtualRepository {
  findAllByTenant(empresaId: string): Promise<Result<MenuVirtual[]>>;
  findAsignacionesByTenant(empresaId: string): Promise<Result<MenuVirtualProductoAsignacion[]>>;
  findProductoIdsByMenuVirtual(menuVirtualId: string, empresaId: string): Promise<Result<string[]>>;
  create(data: CreateMenuVirtualData): Promise<Result<MenuVirtual>>;
  update(id: string, empresaId: string, data: UpdateMenuVirtualData): Promise<Result<MenuVirtual>>;
  delete(id: string, empresaId: string): Promise<Result<void>>;
  setProductos(menuVirtualId: string, productoIds: string[], empresaId: string): Promise<Result<void>>;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm build`
Expected: no type errors (interface has no implementation yet, so nothing imports it — should compile clean).

- [ ] **Step 4: Commit**

```bash
git add src/core/domain/entities/types.ts src/core/domain/repositories/IMenuVirtualRepository.ts
git commit -m "feat(menus-virtuales): domain entity and repository interface"
```

**Status: DONE.** Implemented, spec-reviewed (✅ compliant — one round-trip needed: the first commit accidentally swept in unrelated pre-existing `tabla`-feature changes via a whole-file `git add`; fixed via `git add -p` to isolate only the `MenuVirtual` hunk, re-verified clean), code-quality-reviewed (Ready to merge: Yes, with two minor nits applied as a follow-up commit: renamed `MenuVirtualAsignacion` → `MenuVirtualProductoAsignacion` for symmetry with `ProductoComplementoAsignacion`, and documented why `padreId` is excluded from `UpdateMenuVirtualData`). Commits: `2fc72f68` + `d5fc0ecc`. **Note for later tasks:** the type is `MenuVirtualProductoAsignacion`, not `MenuVirtualAsignacion` as written elsewhere below — already corrected in this plan file.

---

### Task 5: `SupabaseMenuVirtualRepository`

**Files:**
- Create: `src/core/infrastructure/database/SupabaseMenuVirtualRepository.ts`

- [ ] **Step 1: Write the implementation**

```ts
import { SupabaseClient } from '@supabase/supabase-js';
import type {
  IMenuVirtualRepository,
  CreateMenuVirtualData,
  UpdateMenuVirtualData,
  MenuVirtualProductoAsignacion,
} from '@/core/domain/repositories/IMenuVirtualRepository';
import type { MenuVirtual, Result } from '@/core/domain/entities/types';
import { logger } from '../logging/logger';

export class SupabaseMenuVirtualRepository implements IMenuVirtualRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private mapRow(row: Record<string, unknown>): MenuVirtual {
    return {
      id: row.id as string,
      empresaId: row.empresa_id as string,
      padreId: (row.padre_id as string | null) ?? null,
      nombre: row.nombre_es as string,
      translations: {
        en: (row.nombre_en as string | null) ?? undefined,
        fr: (row.nombre_fr as string | null) ?? undefined,
        it: (row.nombre_it as string | null) ?? undefined,
        de: (row.nombre_de as string | null) ?? undefined,
      },
      orden: (row.orden as number) ?? 0,
    };
  }

  async findAllByTenant(empresaId: string): Promise<Result<MenuVirtual[]>> {
    try {
      const { data, error } = await this.supabase
        .from('menus_virtuales')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('orden', { ascending: true });

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabaseMenuVirtualRepository.findAllByTenant', { empresaId });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener menús virtuales', module: 'repository', method: 'findAllByTenant' } };
      }

      return { success: true, data: ((data ?? []) as Record<string, unknown>[]).map(r => this.mapRow(r)) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMenuVirtualRepository.findAllByTenant', { empresaId });
      return { success: false, error: appError };
    }
  }

  async findAsignacionesByTenant(empresaId: string): Promise<Result<MenuVirtualProductoAsignacion[]>> {
    try {
      const { data, error } = await this.supabase
        .from('menu_virtual_productos')
        .select('menu_virtual_id, producto_id')
        .eq('empresa_id', empresaId);

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabaseMenuVirtualRepository.findAsignacionesByTenant', { empresaId });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener asignaciones de menús virtuales', module: 'repository', method: 'findAsignacionesByTenant' } };
      }

      const mapped = ((data ?? []) as Record<string, unknown>[]).map(row => ({
        menuVirtualId: row.menu_virtual_id as string,
        productoId: row.producto_id as string,
      }));

      return { success: true, data: mapped };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMenuVirtualRepository.findAsignacionesByTenant', { empresaId });
      return { success: false, error: appError };
    }
  }

  async findProductoIdsByMenuVirtual(menuVirtualId: string, empresaId: string): Promise<Result<string[]>> {
    try {
      const { data, error } = await this.supabase
        .from('menu_virtual_productos')
        .select('producto_id')
        .eq('menu_virtual_id', menuVirtualId)
        .eq('empresa_id', empresaId)
        .order('orden', { ascending: true });

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabaseMenuVirtualRepository.findProductoIdsByMenuVirtual', { details: { menuVirtualId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener productos del menú virtual', module: 'repository', method: 'findProductoIdsByMenuVirtual' } };
      }

      return { success: true, data: ((data ?? []) as Record<string, unknown>[]).map(r => r.producto_id as string) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMenuVirtualRepository.findProductoIdsByMenuVirtual', { details: { menuVirtualId } });
      return { success: false, error: appError };
    }
  }

  async create(data: CreateMenuVirtualData): Promise<Result<MenuVirtual>> {
    try {
      const { data: created, error } = await this.supabase
        .from('menus_virtuales')
        .insert({
          empresa_id: data.empresaId,
          padre_id: data.padreId ?? null,
          nombre_es: data.nombre_es,
          nombre_en: data.nombre_en ?? null,
          nombre_fr: data.nombre_fr ?? null,
          nombre_it: data.nombre_it ?? null,
          nombre_de: data.nombre_de ?? null,
          orden: data.orden ?? 0,
        })
        .select()
        .single();

      if (error || !created) {
        await logger.logAndReturnError('DB_INSERT_ERROR', error?.message ?? 'No data returned', 'repository', 'SupabaseMenuVirtualRepository.create', { details: { data } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al crear menú virtual', module: 'repository', method: 'create' } };
      }

      return { success: true, data: this.mapRow(created as Record<string, unknown>) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMenuVirtualRepository.create', { details: { data } });
      return { success: false, error: appError };
    }
  }

  async update(id: string, empresaId: string, data: UpdateMenuVirtualData): Promise<Result<MenuVirtual>> {
    try {
      const updateData: Record<string, unknown> = {};
      if (data.nombre_es !== undefined) updateData.nombre_es = data.nombre_es;
      if (data.nombre_en !== undefined) updateData.nombre_en = data.nombre_en;
      if (data.nombre_fr !== undefined) updateData.nombre_fr = data.nombre_fr;
      if (data.nombre_it !== undefined) updateData.nombre_it = data.nombre_it;
      if (data.nombre_de !== undefined) updateData.nombre_de = data.nombre_de;
      if (data.orden !== undefined) updateData.orden = data.orden;

      const { data: updated, error } = await this.supabase
        .from('menus_virtuales')
        .update(updateData)
        .eq('id', id)
        .eq('empresa_id', empresaId)
        .select()
        .single();

      if (error || !updated) {
        await logger.logAndReturnError('DB_UPDATE_ERROR', error?.message ?? 'No data returned', 'repository', 'SupabaseMenuVirtualRepository.update', { details: { id } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar menú virtual', module: 'repository', method: 'update' } };
      }

      return { success: true, data: this.mapRow(updated as Record<string, unknown>) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMenuVirtualRepository.update', { details: { id } });
      return { success: false, error: appError };
    }
  }

  async delete(id: string, empresaId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('menus_virtuales')
        .delete()
        .eq('id', id)
        .eq('empresa_id', empresaId);

      if (error) {
        await logger.logAndReturnError('DB_DELETE_ERROR', error.message, 'repository', 'SupabaseMenuVirtualRepository.delete', { details: { id } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al eliminar menú virtual', module: 'repository', method: 'delete' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMenuVirtualRepository.delete', { details: { id } });
      return { success: false, error: appError };
    }
  }

  async setProductos(menuVirtualId: string, productoIds: string[], empresaId: string): Promise<Result<void>> {
    try {
      // Scoped by empresa_id ademas de menu_virtual_id (mas estricto que el
      // precedente de setProductoGrupos, que solo filtra por producto_id) —
      // evita que un admin de otra empresa pueda tocar asignaciones ajenas
      // adivinando un menuVirtualId.
      const { error: delErr } = await this.supabase
        .from('menu_virtual_productos')
        .delete()
        .eq('menu_virtual_id', menuVirtualId)
        .eq('empresa_id', empresaId);

      if (delErr) {
        await logger.logAndReturnError('DB_DELETE_ERROR', delErr.message, 'repository', 'SupabaseMenuVirtualRepository.setProductos', { details: { menuVirtualId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al actualizar productos del menú virtual', module: 'repository', method: 'setProductos' } };
      }

      if (productoIds.length === 0) return { success: true, data: undefined };

      const rows = productoIds.map((productoId, idx) => ({
        empresa_id: empresaId,
        menu_virtual_id: menuVirtualId,
        producto_id: productoId,
        orden: idx,
      }));
      const { error: insErr } = await this.supabase
        .from('menu_virtual_productos')
        .insert(rows);

      if (insErr) {
        await logger.logAndReturnError('DB_INSERT_ERROR', insErr.message, 'repository', 'SupabaseMenuVirtualRepository.setProductos', { details: { menuVirtualId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al insertar productos del menú virtual', module: 'repository', method: 'setProductos' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMenuVirtualRepository.setProductos', { details: { menuVirtualId } });
      return { success: false, error: appError };
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm build`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/infrastructure/database/SupabaseMenuVirtualRepository.ts
git commit -m "feat(menus-virtuales): Supabase repository implementation"
```

**Status: DONE.** Implemented, spec-reviewed (✅ compliant, two cosmetic-only deviations noted), code-quality-reviewed (found a real gap: `findAllByTenant`/`findAsignacionesByTenant` lacked the transient-PostgREST-error retry that the precedent `supabase-complemento-grupo.repository.ts` has — relevant because these two methods run inside `GetMenuUseCase`'s best-effort, 1h-cached path per `docs/context/menu-cache-y-resiliencia.md`; a transient blip would cache a menu missing all virtual menus for an hour. Fixed by adding the same `TRANSIENT_ERROR_PATTERN` + retry-helper-pair pattern; re-reviewed, ✅ ready to merge). Commits: `71da3d21` + `fa9d003b`.

---

### Task 6: DI wiring

**Files:**
- Modify: `src/core/infrastructure/database/index.ts`

- [ ] **Step 1: Add the import**

Find the import block that includes `SupabaseComplementoGrupoRepository` and add next to it:

```ts
import { SupabaseMenuVirtualRepository } from './SupabaseMenuVirtualRepository';
```

- [ ] **Step 2: Add the singleton getter**

Add right after `getComplementoGrupoRepository` (around line 113 of `index.ts`):

```ts
let _menuVirtualRepository: SupabaseMenuVirtualRepository | undefined;
export function getMenuVirtualRepository(): SupabaseMenuVirtualRepository {
  _menuVirtualRepository ??= new SupabaseMenuVirtualRepository(getSupabaseClient());
  return _menuVirtualRepository;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm build`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/infrastructure/database/index.ts
git commit -m "feat(menus-virtuales): wire repository singleton"
```

**Status: DONE.** Implemented (correctly split a mixed hunk via `git add -p` to avoid sweeping in unrelated pre-existing `tabla-plantilla` changes in the same file), spec-reviewed (✅ compliant), code-quality-reviewed (Ready to merge: Yes — reviewer independently verified `getSupabaseClient()` is the only viable client here by checking RLS policies directly). Commit: `3c1f4a3c`.

---

### Task 7: `MenuVirtualUseCase`

**Files:**
- Create: `src/core/application/use-cases/menu-virtual.use-case.ts`
- Modify: `src/core/infrastructure/database/index.ts`

- [ ] **Step 1: Write the use case**

```ts
import type {
  IMenuVirtualRepository,
  CreateMenuVirtualData,
  UpdateMenuVirtualData,
} from '@/core/domain/repositories/IMenuVirtualRepository';
import type { MenuVirtual, Result } from '@/core/domain/entities/types';

export class MenuVirtualUseCase {
  constructor(private readonly repo: IMenuVirtualRepository) {}

  getAll(empresaId: string): Promise<Result<MenuVirtual[]>> {
    return this.repo.findAllByTenant(empresaId);
  }

  getProductoIds(menuVirtualId: string, empresaId: string): Promise<Result<string[]>> {
    return this.repo.findProductoIdsByMenuVirtual(menuVirtualId, empresaId);
  }

  create(data: CreateMenuVirtualData): Promise<Result<MenuVirtual>> {
    return this.repo.create(data);
  }

  update(id: string, empresaId: string, data: UpdateMenuVirtualData): Promise<Result<MenuVirtual>> {
    return this.repo.update(id, empresaId, data);
  }

  delete(id: string, empresaId: string): Promise<Result<void>> {
    return this.repo.delete(id, empresaId);
  }

  setProductos(menuVirtualId: string, productoIds: string[], empresaId: string): Promise<Result<void>> {
    return this.repo.setProductos(menuVirtualId, productoIds, empresaId);
  }
}
```

- [ ] **Step 2: Wire its getter in `index.ts`**

Add the import next to `MenuVirtualUseCase` usage and the getter next to `getComplementoGrupoUseCase` (find it with `grep -n getComplementoGrupoUseCase src/core/infrastructure/database/index.ts`):

```ts
import { MenuVirtualUseCase } from '@/core/application/use-cases/menu-virtual.use-case';

let _menuVirtualUseCase: MenuVirtualUseCase | undefined;
export function getMenuVirtualUseCase(): MenuVirtualUseCase {
  _menuVirtualUseCase ??= new MenuVirtualUseCase(getMenuVirtualRepository());
  return _menuVirtualUseCase;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm build`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/application/use-cases/menu-virtual.use-case.ts src/core/infrastructure/database/index.ts
git commit -m "feat(menus-virtuales): admin CRUD use case"
```

**Status: DONE.** Implemented, spec-reviewed (✅ compliant, byte-for-byte), code-quality-reviewed (Ready to merge: Yes — reviewer independently judged that skipping ownership validation here is correct, not a gap: enforcement lives in the repository's `empresa_id` scoping, matches the `ComplementoGrupoUseCase` precedent, and `empresaId` is trusted server-derived context, not client input). Commit: `17b123e4`.

---

### Task 8: Zod DTOs

**Files:**
- Create: `src/core/application/dtos/menu-virtual.dto.ts`

- [ ] **Step 1: Write the schemas**

```ts
import { z } from 'zod';

export const createMenuVirtualSchema = z.object({
  empresaId: z.uuid(),
  padreId: z.uuid().nullable().optional(),
  nombre_es: z.string().min(1).max(200),
  nombre_en: z.string().max(200).nullable().optional(),
  nombre_fr: z.string().max(200).nullable().optional(),
  nombre_it: z.string().max(200).nullable().optional(),
  nombre_de: z.string().max(200).nullable().optional(),
  orden: z.number().int().default(0),
});

export const updateMenuVirtualSchema = createMenuVirtualSchema
  .omit({ empresaId: true, padreId: true })
  .partial();

export const setMenuVirtualProductosSchema = z.object({
  productoIds: z.array(z.uuid()),
});

export type CreateMenuVirtualDTO = z.infer<typeof createMenuVirtualSchema>;
export type UpdateMenuVirtualDTO = z.infer<typeof updateMenuVirtualSchema>;
export type SetMenuVirtualProductosDTO = z.infer<typeof setMenuVirtualProductosSchema>;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm build`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/application/dtos/menu-virtual.dto.ts
git commit -m "feat(menus-virtuales): Zod DTOs for admin routes"
```

**Status: DONE.** Implemented, spec-reviewed (✅ compliant, byte-for-byte), code-quality-reviewed (Ready to merge: Yes — two soft gaps noted, `orden`/`productoIds` unbounded, but both pre-existing patterns inherited from `complemento.dto.ts`, flagged as a cross-cutting backlog item, not a regression). Commit: `716124c4`.

---

### Task 9: Mapper — `toVirtualCategoryVM` (TDD)

**Files:**
- Modify: `src/core/application/mappers/menu.mapper.ts`
- Test: `tests/compliance/menu-virtual-mapper.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/compliance/menu-virtual-mapper.test.ts`:

```ts
/**
 * `toVirtualCategoryVM` arma una MenuCategoryVM a partir de un árbol de
 * menús virtuales + la tabla de asociación, en vez de por `categoriaId`.
 * Ver docs/superpowers/specs/2026-09-16-menus-virtuales-design.md.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/core/infrastructure/logging/logger', () => ({
  logger: { logAndReturnError: vi.fn(), logFromCatch: vi.fn() },
}));

import { MenuMapper } from '../../src/core/application/mappers/menu.mapper';
import type { MenuVirtual, Product, Category } from '../../src/core/domain/entities/types';

const producto = (id: string, overrides: Partial<Product> = {}): Product => ({
  id,
  empresaId: 'empresa-1',
  categoriaId: 'cat-baterias',
  titulo_es: `Producto ${id}`,
  titulo_en: null,
  titulo_fr: null,
  titulo_it: null,
  titulo_de: null,
  descripcion_es: null,
  descripcion_en: null,
  descripcion_fr: null,
  descripcion_it: null,
  descripcion_de: null,
  precio: 10,
  fotoUrl: null,
  fotoObjectFit: null,
  esEspecial: false,
  activo: true,
  tipoProducto: 'comida',
  createdAt: new Date(),
  alergenos: [],
  tabla: null,
  ...overrides,
});

const nodo = (id: string, padreId: string | null, nombre = id): MenuVirtual => ({
  id, empresaId: 'empresa-1', padreId, nombre, orden: 0,
});

const categoriaBaterias: Category = {
  id: 'cat-baterias', empresaId: 'empresa-1', nombre: 'Baterías', descripcion: null,
  orden: 0, tipoProducto: 'comida', categoriaComplementoDe: null, complementoObligatorio: false,
  categoriaPadreId: null,
};

describe('MenuMapper.toVirtualCategoryVM', () => {
  it('arma subcategorías con los productos asignados a cada hoja', () => {
    const exide = producto('exide');
    const varta = producto('varta');
    const vm = MenuMapper.toVirtualCategoryVM(
      nodo('vehiculos', null, 'Vehículos'),
      [nodo('coches', 'vehiculos', 'Coches'), nodo('motos', 'vehiculos', 'Motos')],
      new Map([['coches', ['exide']], ['motos', ['varta']]]),
      new Map([['exide', exide], ['varta', varta]]),
      new Map([['cat-baterias', categoriaBaterias]]),
    );

    expect(vm.subcategories?.find(s => s.id === 'coches')?.products.map(p => p.id)).toEqual(['exide']);
    expect(vm.subcategories?.find(s => s.id === 'motos')?.products.map(p => p.id)).toEqual(['varta']);
  });

  it('items del padre es la unión de todos los hijos (para que el filtro de categorías vacías no lo descarte)', () => {
    const exide = producto('exide');
    const varta = producto('varta');
    const vm = MenuMapper.toVirtualCategoryVM(
      nodo('vehiculos', null),
      [nodo('coches', 'vehiculos'), nodo('motos', 'vehiculos')],
      new Map([['coches', ['exide']], ['motos', ['varta']]]),
      new Map([['exide', exide], ['varta', varta]]),
      new Map([['cat-baterias', categoriaBaterias]]),
    );

    expect(vm.items.map(i => i.id).sort()).toEqual(['exide', 'varta']);
  });

  it('excluye productos inactivos', () => {
    const activo = producto('activo', { activo: true });
    const inactivo = producto('inactivo', { activo: false });
    const vm = MenuMapper.toVirtualCategoryVM(
      nodo('vehiculos', null),
      [nodo('coches', 'vehiculos')],
      new Map([['coches', ['activo', 'inactivo']]]),
      new Map([['activo', activo], ['inactivo', inactivo]]),
      new Map([['cat-baterias', categoriaBaterias]]),
    );

    expect(vm.items.map(i => i.id)).toEqual(['activo']);
  });

  it('omite asignaciones huérfanas (producto ya no existe)', () => {
    const vm = MenuMapper.toVirtualCategoryVM(
      nodo('vehiculos', null),
      [nodo('coches', 'vehiculos')],
      new Map([['coches', ['borrado']]]),
      new Map(), // productosPorId vacío: "borrado" no existe
      new Map([['cat-baterias', categoriaBaterias]]),
    );

    expect(vm.items).toEqual([]);
    expect(vm.subcategories?.[0]?.products).toEqual([]);
  });

  it('subcategoría sin productos asignados queda vacía, no rompe', () => {
    const vm = MenuMapper.toVirtualCategoryVM(
      nodo('vehiculos', null),
      [nodo('coches', 'vehiculos'), nodo('motos', 'vehiculos')],
      new Map([['coches', ['exide']]]), // "motos" no tiene entrada en el map
      new Map([['exide', producto('exide')]]),
      new Map([['cat-baterias', categoriaBaterias]]),
    );

    expect(vm.subcategories?.find(s => s.id === 'motos')?.products).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/compliance/menu-virtual-mapper.test.ts`
Expected: FAIL — `MenuMapper.toVirtualCategoryVM is not a function`.

- [ ] **Step 3: Implement `toVirtualCategoryVM`**

Add to `src/core/application/mappers/menu.mapper.ts`, inside the `MenuMapper` class (after `toCategoryVM`, before the closing `}` of the class), plus one new import at the top of the file:

```ts
// añadir al import existente en la línea 1 de menu.mapper.ts:
import type { Product, Category, ProductoTabla, TablaCelda, MenuVirtual } from "@/core/domain/entities/types";
```

```ts
  static toVirtualSubcategoryVM(
    nodo: MenuVirtual,
    productoIds: string[],
    productosPorId: Map<string, Product>,
    categoriasPorId: Map<string, Category>,
  ): MenuSubcategoryVM {
    const productos = productoIds
      .map((id) => productosPorId.get(id))
      .filter((p): p is Product => p !== undefined && p.activo)
      .map((p) => {
        const categoriaReal = p.categoriaId ? categoriasPorId.get(p.categoriaId) : undefined;
        return mapProductToItem(p, categoriaReal?.nombre ?? "uncategorized");
      });

    return {
      id: nodo.id,
      nombre: nodo.nombre,
      translations: nodo.translations ? {
        en: nodo.translations.en ? { name: nodo.translations.en } : undefined,
        fr: nodo.translations.fr ? { name: nodo.translations.fr } : undefined,
        it: nodo.translations.it ? { name: nodo.translations.it } : undefined,
        de: nodo.translations.de ? { name: nodo.translations.de } : undefined,
      } : undefined,
      products: productos,
    };
  }

  static toVirtualCategoryVM(
    padre: MenuVirtual,
    hijos: MenuVirtual[],
    asignacionesPorNodo: Map<string, string[]>,
    productosPorId: Map<string, Product>,
    categoriasPorId: Map<string, Category>,
  ): MenuCategoryVM {
    const subcategories = hijos.map((hijo) =>
      MenuMapper.toVirtualSubcategoryVM(hijo, asignacionesPorNodo.get(hijo.id) ?? [], productosPorId, categoriasPorId)
    );

    // items = unión de todos los hijos, con duplicados posibles si un producto
    // está en más de una hoja — mismo criterio que combinedProducts en
    // toCategoryVM. Necesario porque el filtro final de GetMenuUseCase.execute
    // solo mira `items.length`, no `subcategories`.
    const items = subcategories.flatMap((s) => s.products);

    return {
      id: padre.id,
      label: padre.nombre,
      tipoProducto: undefined,
      translations: padre.translations ? {
        en: padre.translations.en ? { name: padre.translations.en } : undefined,
        fr: padre.translations.fr ? { name: padre.translations.fr } : undefined,
        it: padre.translations.it ? { name: padre.translations.it } : undefined,
        de: padre.translations.de ? { name: padre.translations.de } : undefined,
      } : undefined,
      subcategories: subcategories.length > 0 ? subcategories : undefined,
      items,
    };
  }
```

`mapProductToItem` ya es una función de módulo privada del archivo (usada por `toCategoryVM`) — se reutiliza tal cual, sin exportarla.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/compliance/menu-virtual-mapper.test.ts`
Expected: PASS, 5/5 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm lint && pnpm build`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/core/application/mappers/menu.mapper.ts tests/compliance/menu-virtual-mapper.test.ts
git commit -m "feat(menus-virtuales): map virtual menu nodes to MenuCategoryVM"
```

**Status: DONE.** Implemented (TDD confirmed: RED with `MenuMapper.toVirtualCategoryVM is not a function`), spec-reviewed (✅ compliant), code-quality-reviewed (found 3 real gaps beyond style: `tipoProducto` hardcoded to `undefined` would misroute virtual menus for restaurants with food/drink tabs, the design-doc-required duplicate-across-leaves test was missing, and complement groups from the newer per-product system weren't propagating to virtual-menu items — all three fixed with TDD for the complementGroups case, plus a translation-mapping helper extracted per Minor feedback; final commit re-verified directly by the orchestrator after the second-round reviewer agent hit a weekly usage limit — 8/8 tests pass, lint/build clean, no unrelated content swept in). Commits: `060384a2` + `9e82fcb2`.

---

### Task 10: Extend `GetMenuUseCase` and its wiring

**Files:**
- Modify: `src/core/application/use-cases/get-menu.use-case.ts`
- Modify: `src/lib/server-services.ts`
- Modify: `src/core/application/mappers/menu.mapper.ts` (one-line export, see Step 0)

**Type mismatch caught before dispatch:** `gruposPorProducto` in `execute()` (line 131) is `Map<string, ComplementoGrupo[]>` — the DOMAIN type, straight from the repository — but `toVirtualCategoryVM`'s 6th param (added in Task 9) expects `Map<string, ComplementGroupVM[]>` — the already-converted VIEW-MODEL type. `toCategoryVM` does this conversion internally via a private module function, `mapComplementoGrupoToGroupVM` (line 89 of `menu.mapper.ts`). This function needs to be exported so `get-menu.use-case.ts` can reuse it for the same conversion when feeding virtual menus — see Step 0 and the updated Step 3 below.

- [ ] **Step 0: Export the conversion helper**

In `src/core/application/mappers/menu.mapper.ts`, change:
```ts
function mapComplementoGrupoToGroupVM(grupo: ComplementoGrupo): ComplementGroupVM {
```
to:
```ts
export function mapComplementoGrupoToGroupVM(grupo: ComplementoGrupo): ComplementGroupVM {
```
(one-word change — add `export`. No other change to this function or its usage inside `toCategoryVM`.)

- [ ] **Step 1: Add the constructor dependency**

In `src/core/application/use-cases/get-menu.use-case.ts`, add the import:

```ts
import type { IMenuVirtualRepository } from "@/core/domain/repositories/IMenuVirtualRepository";
```

Replace the constructor (currently lines 85-89):

```ts
  constructor(
    private readonly productRepo: IProductRepository,
    private readonly categoryRepo: ICategoryRepository,
    private readonly complementoRepo: IComplementoGrupoRepository,
    private readonly menuVirtualRepo: IMenuVirtualRepository,
  ) {}
```

- [ ] **Step 2: Extend `execute` to append virtual menus**

Replace the final two lines of `execute` (currently):

```ts
      // Una categoría sin nada que ofrecer no se pinta: dejaría un encabezado
      // vacío en la carta del cliente.
      return { data: menu.filter(categoria => categoria.items.length > 0) };
```

with:

```ts
      const menuVirtualVMs = await this.construirMenusVirtuales(empresaId, productos.data, categoriasPorId, gruposPorProducto);

      // Una categoría sin nada que ofrecer no se pinta: dejaría un encabezado
      // vacío en la carta del cliente. Aplica igual a categorías reales y a
      // menús virtuales — toVirtualCategoryVM puebla `items` con la unión de
      // sus hojas justo para que este mismo filtro los alcance.
      return { data: [...menu, ...menuVirtualVMs].filter(categoria => categoria.items.length > 0) };
```

**Nota importante (ajuste post-Task 9):** `toVirtualCategoryVM` ganó un 6º parámetro opcional `complementoGruposByProductId` en la Tarea 9 (propaga los grupos de complementos del sistema nuevo a los productos vistos desde un menú virtual). `gruposPorProducto` ya existe en `execute()` (línea `131`, resultado de `this.cargarComplementos(...)`, el mismo Map que ya se le pasa a `MenuMapper.toCategoryVM` en la línea `156`) — hay que reenviarlo a `construirMenusVirtuales` como se ve arriba, y de ahí a `toVirtualCategoryVM` (ver Step 3 más abajo). Sin este paso, el fix de la Tarea 9 quedaría implementado pero nunca invocado con datos reales.

- [ ] **Step 3: Add the private helper `construirMenusVirtuales`**

Add as a new private method on `GetMenuUseCase`, right after `cargarComplementos`:

```ts
  /**
   * Menús virtuales (ver docs/superpowers/specs/2026-09-16-menus-virtuales-design.md).
   * Best-effort: si cualquiera de las dos consultas falla, la carta se sirve
   * igual sin menús virtuales — mismo criterio que cargarComplementos.
   */
  private async construirMenusVirtuales(
    empresaId: string,
    productos: Product[],
    categoriasPorId: Map<string, Category>,
    gruposPorProducto: Map<string, ComplementoGrupo[]>,
  ): Promise<MenuCategoryVM[]> {
    const [nodos, asignaciones] = await Promise.all([
      this.menuVirtualRepo.findAllByTenant(empresaId),
      this.menuVirtualRepo.findAsignacionesByTenant(empresaId),
    ]);

    if (!nodos.success || !asignaciones.success) return [];

    const asignacionesPorNodo = agruparPor(asignaciones.data, a => a.menuVirtualId)
      .entries();
    const productoIdsPorNodo = new Map(
      [...asignacionesPorNodo].map(([menuVirtualId, asigs]) => [menuVirtualId, asigs.map(a => a.productoId)])
    );
    const productosPorId = new Map(productos.map(p => [p.id, p]));
    const padres = nodos.data.filter(m => !m.padreId).sort((a, b) => a.orden - b.orden);
    const hijosPorPadre = agruparPor(nodos.data.filter(m => m.padreId), m => m.padreId!);

    // toVirtualCategoryVM espera el tipo VIEW-MODEL (ComplementGroupVM), no el
    // de dominio (ComplementoGrupo) — misma conversión que toCategoryVM hace
    // internamente, reutilizando la función ahora exportada (Step 0).
    const gruposVMPorProducto = new Map(
      [...gruposPorProducto.entries()].map(([productoId, grupos]) => [productoId, grupos.map(mapComplementoGrupoToGroupVM)])
    );

    return padres.map(padre => MenuMapper.toVirtualCategoryVM(
      padre,
      hijosPorPadre.get(padre.id) ?? [],
      productoIdsPorNodo,
      productosPorId,
      categoriasPorId,
      gruposVMPorProducto,
    ));
  }
```

Nuevo import necesario en `get-menu.use-case.ts`: `import { mapComplementoGrupoToGroupVM } from "@/core/application/mappers/menu.mapper";` (agregar a la línea 7 existente, que ya importa `MenuMapper` desde el mismo módulo — un solo `import` con ambos nombres, no dos líneas).

Nota: `agruparPor` ya existe como función de módulo en este mismo archivo (línea ~73) — se reutiliza tal cual.

- [ ] **Step 4: Update the only call site**

In `src/lib/server-services.ts`, add the imports:

```ts
import { getComplementoGrupoRepository, getMenuVirtualRepository, getModalidadEntregaUseCase } from "@/core/infrastructure/database";
```

(reemplaza la línea de import existente que trae `getComplementoGrupoRepository, getModalidadEntregaUseCase` — solo se agrega `getMenuVirtualRepository` a la misma línea)

Replace the `getMenuUseCase` body:

```ts
export function getMenuUseCase(): GetMenuUseCase {
  return _menuUseCase ??= new GetMenuUseCase(
    new SupabaseProductRepository(getSupabaseAnonClient()),
    new SupabaseCategoryRepository(getSupabaseAnonClient()),
    getComplementoGrupoRepository(),
    getMenuVirtualRepository()
  );
}
```

- [ ] **Step 5: Run the existing mapper/use-case unit tests**

Run: `pnpm vitest run tests/compliance/menu-agrupacion.test.ts tests/compliance/menu-virtual-mapper.test.ts`
Expected: PASS — confirms the constructor change didn't break the pure-function exports these tests import directly.

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm lint && pnpm build`
Expected: no errors (this is the step that will catch any other call site of `new GetMenuUseCase(...)` if one was missed).

- [ ] **Step 7: Commit**

```bash
git add src/core/application/use-cases/get-menu.use-case.ts src/lib/server-services.ts
git commit -m "feat(menus-virtuales): append virtual menus to the public catalog"
```

**Status: DONE.** Implemented (a type mismatch between domain `ComplementoGrupo[]` and view-model `ComplementGroupVM[]` was caught by the orchestrator before dispatch and fixed via exporting the existing conversion helper), spec-reviewed (✅ compliant — implementer also proactively found and fixed 2 additional `new GetMenuUseCase(...)` call sites in tests that the plan didn't mention, one of them a runtime-only failure invisible to typecheck due to module mocking), code-quality-reviewed (found a real gap: no test exercised `construirMenusVirtuales`'s orchestration wiring at the `execute()` level, only the mapper in isolation — fixed with 2 targeted tests: happy path proving no forced dedup between real and virtual menus, and degradation proving a virtual-menu repo failure doesn't affect the real menu; re-reviewed, ✅ ready to merge). Commits: `9c415c2a` + `142c31ad`.

---

### Task 11: Admin API routes

**Files:**
- Create: `src/app/api/admin/menus-virtuales/route.ts`
- Create: `src/app/api/admin/menus-virtuales/[id]/route.ts`
- Create: `src/app/api/admin/menus-virtuales/[id]/productos/route.ts`

- [ ] **Step 1: List + create**

Create `src/app/api/admin/menus-virtuales/route.ts`:

```ts
import { type NextRequest } from 'next/server';
import { getMenuVirtualUseCase } from '@/core/infrastructure/database';
import { createMenuVirtualSchema } from '@/core/application/dtos/menu-virtual.dto';
import { resolveAdminContextWithEmpresa, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';

export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const result = await getMenuVirtualUseCase().getAll(empresaId);
  return handleResultWithStatus(result);
}

export async function POST(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('JSON inválido');
  }

  const parsed = createMenuVirtualSchema.safeParse({ ...(body as Record<string, unknown>), empresaId });
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.issues[0].message);
  }

  const result = await getMenuVirtualUseCase().create(parsed.data);
  return handleResultWithStatus(result, 201);
}
```

- [ ] **Step 2: Update + delete a node**

Create `src/app/api/admin/menus-virtuales/[id]/route.ts`:

```ts
import { type NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getMenuVirtualUseCase } from '@/core/infrastructure/database';
import { updateMenuVirtualSchema } from '@/core/application/dtos/menu-virtual.dto';
import { resolveAdminContextWithEmpresa, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { catalogTag } from '@/lib/cache-tags';

interface Params {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: Params) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('JSON inválido');
  }

  const parsed = updateMenuVirtualSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.issues[0].message);
  }

  const result = await getMenuVirtualUseCase().update(id, empresaId, parsed.data);
  if (result.success) revalidateTag(catalogTag(empresaId), {});
  return handleResultWithStatus(result);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const { id } = await params;

  const result = await getMenuVirtualUseCase().delete(id, empresaId);
  if (result.success) revalidateTag(catalogTag(empresaId), {});
  return handleResultWithStatus(result);
}
```

- [ ] **Step 3: Replace-all product association**

Create `src/app/api/admin/menus-virtuales/[id]/productos/route.ts`:

```ts
import { type NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getMenuVirtualUseCase } from '@/core/infrastructure/database';
import { setMenuVirtualProductosSchema } from '@/core/application/dtos/menu-virtual.dto';
import { resolveAdminContextWithEmpresa, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';
import { catalogTag } from '@/lib/cache-tags';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const { id } = await params;

  const result = await getMenuVirtualUseCase().getProductoIds(id, empresaId);
  return handleResultWithStatus(result);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('JSON inválido');
  }

  const parsed = setMenuVirtualProductosSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.issues[0]?.message ?? 'Datos inválidos');
  }

  const result = await getMenuVirtualUseCase().setProductos(id, parsed.data.productoIds, empresaId);
  if (result.success) revalidateTag(catalogTag(empresaId), {});
  return handleResultWithStatus(result);
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm lint && pnpm build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/menus-virtuales
git commit -m "feat(menus-virtuales): admin CRUD API routes"
```

**Status: DONE.** Implemented, spec-reviewed (✅ compliant, character-for-character), code-quality-reviewed (Ready to merge: Yes — reviewer independently confirmed the repository layer closes the cross-tenant mutation risk the route layer alone would leave open, and verified `catalogTag(empresaId)` is the correct/only cache tag to bust). Commit: `c662b433`.

---

### Task 12: Translations

**Files:**
- Modify: `src/lib/translations.ts`

- [ ] **Step 1: Add new keys**

In the `es` block, right after the `searchNoResults` line added by the previous feature (`grep -n searchNoResults src/lib/translations.ts` to find it):

```ts
    sidebarMenusVirtuales: "Menús virtuales",
    menuVirtualNuevoMenu: "Nuevo menú",
    menuVirtualNuevaSubcategoria: "Nueva subcategoría",
    menuVirtualNombre: "Nombre",
    menuVirtualEliminar: "Eliminar",
    menuVirtualEliminarConfirm: "¿Eliminar este nodo? Si tiene subcategorías o productos asociados, se eliminan también.",
    menuVirtualProductosAsociados: "Productos asociados",
    menuVirtualBuscarProducto: "Buscar producto...",
    menuVirtualGuardar: "Guardar",
    menuVirtualSinNodos: "Todavía no creaste ningún menú virtual.",
```

In the `en` block, right after its `searchNoResults` line:

```ts
    sidebarMenusVirtuales: "Virtual menus",
    menuVirtualNuevoMenu: "New menu",
    menuVirtualNuevaSubcategoria: "New subcategory",
    menuVirtualNombre: "Name",
    menuVirtualEliminar: "Delete",
    menuVirtualEliminarConfirm: "Delete this node? Its subcategories and product associations will be deleted too.",
    menuVirtualProductosAsociados: "Associated products",
    menuVirtualBuscarProducto: "Search product...",
    menuVirtualGuardar: "Save",
    menuVirtualSinNodos: "You haven't created any virtual menus yet.",
```

(fr/it/de quedan sin traducir — `t()` cae a `es` automáticamente, mismo criterio ya confirmado para otras claves de este archivo.)

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/translations.ts
git commit -m "feat(menus-virtuales): add i18n keys"
```

**Status: DONE.** Implemented, spec-reviewed (✅ compliant, byte-for-byte), code-quality-reviewed (found one Spanish tone inconsistency — voseo bleeding into a Spain-facing admin's copy — fixed, verified directly by the orchestrator). Commits: `449a7d04` + `6f0e7602`.

---

### Task 13: Admin sidebar entry

**Files:**
- Modify: `src/app/admin/(protected)/admin-sidebar.tsx`

- [ ] **Step 1: Add the nav item**

In the `catalogo` group's `items` array (around line 106-108), add after the `complementos` entry:

```ts
        { href: '/admin/categorias', labelKey: 'sidebarCategories', icon: Tags },
        { href: '/admin/productos', labelKey: 'sidebarProducts', icon: Package },
        { href: '/admin/complementos', labelKey: 'sidebarComplementos', icon: Layers, requiresRestaurant: true },
        { href: '/admin/menus-virtuales', labelKey: 'sidebarMenusVirtuales', icon: Grid2X2 },
```

`Grid2X2` ya está importado en este archivo (usado por otra entrada del sidebar) — confirmarlo con `grep -n Grid2X2 src/app/admin/\(protected\)/admin-sidebar.tsx` antes de asumirlo; si no está, agregarlo al import de `lucide-react` de la línea 7-14.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/(protected)/admin-sidebar.tsx"
git commit -m "feat(menus-virtuales): add sidebar entry"
```

**Status: DONE.** Implemented, spec-reviewed (✅ compliant), code-quality-verified directly by the orchestrator (trivial 1-line change). Commit: `11f5d351`.

---

### Task 14: Admin UI page

**Files:**
- Create: `src/app/admin/(protected)/menus-virtuales/page.tsx`

- [ ] **Step 1: Write the page**

Master-detail layout, same shape as `src/app/admin/(protected)/complementos/page.tsx`: list of nodes on the left (flat list rendered as a tree by indentation), edit panel on the right. Leaf nodes (no children) get a searchable product checklist instead of just a name field.

```tsx
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useAdmin } from '@/lib/admin-context';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface MenuVirtual {
  id: string;
  empresaId: string;
  padreId: string | null;
  nombre: string;
  orden: number;
}

interface AdminProducto {
  id: string;
  titulo_es: string;
  activo: boolean;
}

export default function MenusVirtualesPage() {
  const { empresaId } = useAdmin();
  const { language } = useLanguage();
  const [nodos, setNodos] = useState<MenuVirtual[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [saving, setSaving] = useState(false);

  const [productos, setProductos] = useState<AdminProducto[]>([]);
  const [selectedProductoIds, setSelectedProductoIds] = useState<string[]>([]);
  const [productoSearch, setProductoSearch] = useState('');
  const [savingProductos, setSavingProductos] = useState(false);

  const fetchNodos = useCallback(async () => {
    const res = await fetch('/api/admin/menus-virtuales');
    if (!res.ok) return;
    const data = await res.json() as MenuVirtual[];
    setNodos(data);
  }, []);

  useEffect(() => {
    void fetchNodos().finally(() => setLoading(false));
  }, [fetchNodos]);

  useEffect(() => {
    void fetch('/api/admin/productos')
      .then(res => res.ok ? res.json() : [])
      .then((data: AdminProducto[]) => setProductos(data));
  }, []);

  const padres = useMemo(() => nodos.filter(n => !n.padreId).sort((a, b) => a.orden - b.orden), [nodos]);
  const hijosDe = useCallback((padreId: string) => nodos.filter(n => n.padreId === padreId).sort((a, b) => a.orden - b.orden), [nodos]);

  const selectedNodo = nodos.find(n => n.id === selectedId) ?? null;
  const selectedEsHoja = selectedNodo !== null && hijosDe(selectedNodo.id).length === 0;

  function handleSelect(nodo: MenuVirtual) {
    setSelectedId(nodo.id);
    setEditNombre(nodo.nombre);
    setProductoSearch('');
    setSelectedProductoIds([]);
  }

  useEffect(() => {
    if (!selectedId || !selectedEsHoja) return;
    void fetch(`/api/admin/menus-virtuales/${selectedId}/productos`)
      .then(res => res.ok ? res.json() : [])
      .then((ids: string[]) => setSelectedProductoIds(ids));
  }, [selectedId, selectedEsHoja]);

  async function handleNuevoMenu() {
    if (!empresaId) return;
    const res = await fetchWithCsrf('/api/admin/menus-virtuales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre_es: t('menuVirtualNuevoMenu', language), empresaId }),
    });
    if (!res.ok) return;
    const created = await res.json() as MenuVirtual;
    setNodos(prev => [...prev, created]);
    handleSelect(created);
  }

  async function handleNuevaSubcategoria(padreId: string) {
    if (!empresaId) return;
    const res = await fetchWithCsrf('/api/admin/menus-virtuales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre_es: t('menuVirtualNuevaSubcategoria', language), empresaId, padreId }),
    });
    if (!res.ok) return;
    const created = await res.json() as MenuVirtual;
    setNodos(prev => [...prev, created]);
    handleSelect(created);
  }

  async function handleGuardarNombre() {
    if (!selectedId) return;
    setSaving(true);
    try {
      const res = await fetchWithCsrf(`/api/admin/menus-virtuales/${selectedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_es: editNombre }),
      });
      if (res.ok) {
        const updated = await res.json() as MenuVirtual;
        setNodos(prev => prev.map(n => n.id === selectedId ? updated : n));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleEliminar(id: string) {
    if (!confirm(t('menuVirtualEliminarConfirm', language))) return;
    const res = await fetchWithCsrf(`/api/admin/menus-virtuales/${id}`, { method: 'DELETE' });
    if (!res.ok) return;
    setNodos(prev => prev.filter(n => n.id !== id && n.padreId !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function toggleProducto(productoId: string) {
    setSelectedProductoIds(prev =>
      prev.includes(productoId) ? prev.filter(id => id !== productoId) : [...prev, productoId]
    );
  }

  async function handleGuardarProductos() {
    if (!selectedId) return;
    setSavingProductos(true);
    try {
      await fetchWithCsrf(`/api/admin/menus-virtuales/${selectedId}/productos`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productoIds: selectedProductoIds }),
      });
    } finally {
      setSavingProductos(false);
    }
  }

  const productosFiltrados = useMemo(() => {
    const q = productoSearch.trim().toLowerCase();
    const activos = productos.filter(p => p.activo);
    if (!q) return activos;
    return activos.filter(p => p.titulo_es.toLowerCase().includes(q));
  }, [productos, productoSearch]);

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6">
      <div className="space-y-2">
        <Button onClick={handleNuevoMenu} className="w-full justify-start gap-2">
          <Plus className="w-4 h-4" /> {t('menuVirtualNuevoMenu', language)}
        </Button>
        {padres.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">{t('menuVirtualSinNodos', language)}</p>
        )}
        {padres.map(padre => (
          <div key={padre.id} className="space-y-1">
            <button
              type="button"
              onClick={() => handleSelect(padre)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${selectedId === padre.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'}`}
            >
              {padre.nombre}
            </button>
            {hijosDe(padre.id).map(hijo => (
              <button
                key={hijo.id}
                type="button"
                onClick={() => handleSelect(hijo)}
                className={`w-full text-left pl-6 pr-3 py-1.5 rounded-lg text-sm ${selectedId === hijo.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-muted-foreground'}`}
              >
                {hijo.nombre}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleNuevaSubcategoria(padre.id)}
              className="w-full text-left pl-6 pr-3 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              + {t('menuVirtualNuevaSubcategoria', language)}
            </button>
          </div>
        ))}
      </div>

      {selectedNodo && (
        <div className="space-y-6 max-w-xl">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="menu-virtual-nombre" className="text-sm font-medium text-foreground">{t('menuVirtualNombre', language)}</label>
              <Input id="menu-virtual-nombre" value={editNombre} onChange={e => setEditNombre(e.target.value)} />
            </div>
            <Button onClick={handleGuardarNombre} disabled={saving} className="gap-2">
              <Save className="w-4 h-4" /> {t('menuVirtualGuardar', language)}
            </Button>
            <Button variant="outline" onClick={() => handleEliminar(selectedNodo.id)} className="gap-2 text-destructive">
              <Trash2 className="w-4 h-4" /> {t('menuVirtualEliminar', language)}
            </Button>
          </div>

          {selectedEsHoja && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">
                  {t('menuVirtualProductosAsociados', language)} ({selectedProductoIds.length})
                </h3>
                <Button size="sm" onClick={handleGuardarProductos} disabled={savingProductos} className="gap-2">
                  <Save className="w-4 h-4" /> {t('menuVirtualGuardar', language)}
                </Button>
              </div>
              <Input
                type="search"
                value={productoSearch}
                onChange={e => setProductoSearch(e.target.value)}
                placeholder={t('menuVirtualBuscarProducto', language)}
              />
              <div className="max-h-96 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
                {productosFiltrados.map(producto => (
                  <label
                    key={producto.id}
                    className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProductoIds.includes(producto.id)}
                      onChange={() => toggleProducto(producto.id)}
                      className="w-4 h-4 accent-primary shrink-0"
                    />
                    <span className="text-sm text-foreground truncate">{producto.titulo_es}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm lint && pnpm build`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/(protected)/menus-virtuales/page.tsx"
git commit -m "feat(menus-virtuales): admin management screen"
```

**Status: DONE.** Implemented, spec-reviewed (✅ compliant), code-quality-reviewed (found 2 real issues to fix before merge: `handleGuardarProductos` silently swallowed a failed destructive save with no `res.ok` check, and the product search input lacked an accessible name — both fixed; also flagged, as an explicit out-of-scope fast-follow, that there's no server-side depth guard preventing a 3-level tree via direct API calls even though the UI itself can't create one; re-reviewed, ✅ ready to merge). Commits: `d17f042e` + `5d61cfb1`.

**Known follow-up (not implemented, tracked for later):** add a depth check in `createMenuVirtualSchema`/`MenuVirtualUseCase.create` (reject if `padreId` already has a non-null `padreId`) so the 2-level cap is enforced server-side, not just by this one admin screen's UI choices.

---

### Task 15: Manual verification

**Files:** none (verification task, uses the real running app)

- [ ] **Step 1: Start the dev server fresh**

Run: `pnpm dev` (stop and restart if one is already running — Turbopack on Windows serves stale modules after editing existing files across this many tasks, ver `turbopack-windows-bug` en memoria).

- [ ] **Step 2: Create the tree in admin**

En `/admin/menus-virtuales`: crear "Vehículos" → "Coches" y "Motos". Entrar a "Coches", buscar "exide", tildar "BATERÍA EXIDE GEL ES900", guardar. Entrar a "Motos", buscar "varta", tildar "BATERÍA VARTA A5 AGM...", guardar.

- [ ] **Step 3: Verify the public catalog**

Abrir el catálogo público de esa empresa. Confirmar:
- "Vehículos" aparece como categoría en `CategoryNav`, con "Coches"/"Motos" como subcategorías.
- "Coches" muestra solo la batería Exide; "Motos" solo la Varta.
- "Baterías" (categoría real) sigue mostrando ambas bajo "Exide"/"Varta" sin cambios.
- Buscar "exide" en el buscador in-place del catálogo devuelve un solo resultado (no duplicado por aparecer en dos árboles).

- [ ] **Step 4: Verify deletion cascades**

Borrar "Vehículos" desde el admin. Confirmar que desaparece del catálogo público (esperar el TTL de cache o forzar refresh — `revalidateTag` ya lo invalida al guardar/borrar) y que "Coches"/"Motos" también desaparecieron de la lista del admin.

- [ ] **Step 5: Final full verification**

Run: `pnpm lint && pnpm build && pnpm vitest run`
Expected: all green.

- [ ] **Step 6: `pnpm db:smoke`**

Run: `pnpm db:smoke`
Expected: PASS.

---

## Fase 2: asignación masiva desde `/admin/productos`

**Motivación (feedback del usuario tras probar la Fase 1):** el flujo de "entrar a cada nodo hoja y buscar productos uno por uno" es lento para asociar muchos productos de una. Se agrega un camino aditivo (no reemplaza `setProductos`/la pantalla de árbol, que sigue siendo donde se crean los nodos): desde `/admin/productos`, seleccionar varios productos con checkboxes y asignarlos en una sola acción a un nodo hoja existente, sin tocar las asociaciones que ese nodo ya tenía.

### Task 16: Repositorio — `addProductos` (aditivo, no reemplaza)

**Files:**
- Modify: `src/core/domain/repositories/IMenuVirtualRepository.ts`
- Modify: `src/core/infrastructure/database/SupabaseMenuVirtualRepository.ts`

- [ ] **Step 1: Agregar el método a la interfaz**

En `IMenuVirtualRepository.ts`, agregar al final de la interfaz (antes del `}` de cierre):

```ts
  addProductos(menuVirtualId: string, productoIds: string[], empresaId: string): Promise<Result<void>>;
```

- [ ] **Step 2: Implementar en el repositorio**

Agregar a `SupabaseMenuVirtualRepository`, después de `setProductos`:

```ts
  async addProductos(menuVirtualId: string, productoIds: string[], empresaId: string): Promise<Result<void>> {
    try {
      if (productoIds.length === 0) return { success: true, data: undefined };

      // orden continua desde el final de lo ya asociado, para no pisar el
      // orden de las filas existentes ni dejarlas todas en 0.
      const { count } = await this.supabase
        .from('menu_virtual_productos')
        .select('*', { count: 'exact', head: true })
        .eq('menu_virtual_id', menuVirtualId)
        .eq('empresa_id', empresaId);

      const startOrden = count ?? 0;
      const rows = productoIds.map((productoId, idx) => ({
        empresa_id: empresaId,
        menu_virtual_id: menuVirtualId,
        producto_id: productoId,
        orden: startOrden + idx,
      }));

      // upsert + ignoreDuplicates: si un producto ya estaba asociado a este
      // nodo, la fila existente no se toca (no cambia su orden) — a
      // diferencia de setProductos, esto NUNCA borra asociaciones previas.
      const { error } = await this.supabase
        .from('menu_virtual_productos')
        .upsert(rows, { onConflict: 'menu_virtual_id,producto_id', ignoreDuplicates: true });

      if (error) {
        await logger.logAndReturnError('DB_INSERT_ERROR', error.message, 'repository', 'SupabaseMenuVirtualRepository.addProductos', { details: { menuVirtualId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al agregar productos al menú virtual', module: 'repository', method: 'addProductos' } };
      }

      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseMenuVirtualRepository.addProductos', { details: { menuVirtualId } });
      return { success: false, error: appError };
    }
  }
```

- [ ] **Step 3: Typecheck**

Run: `pnpm build`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/domain/repositories/IMenuVirtualRepository.ts src/core/infrastructure/database/SupabaseMenuVirtualRepository.ts
git commit -m "feat(menus-virtuales): additive addProductos repository method"
```

**Status: DONE.** Implementado, verificado directamente por el orquestador (el revisor de spec falló por límite de sesión) — diff exacto byte-for-byte contra el spec, build limpio confirmando que el `.upsert(..., { onConflict, ignoreDuplicates })` tipa correctamente contra la versión instalada de `@supabase/supabase-js`, y confirmado que `SupabaseMenuVirtualRepository` es la única clase que implementa la interfaz. Commit: `45d3d283`.

---

### Task 17: Use case — exponer `addProductos`

**Files:**
- Modify: `src/core/application/use-cases/menu-virtual.use-case.ts`

- [ ] **Step 1: Agregar el método**

Agregar a `MenuVirtualUseCase`, después de `setProductos`:

```ts
  addProductos(menuVirtualId: string, productoIds: string[], empresaId: string): Promise<Result<void>> {
    return this.repo.addProductos(menuVirtualId, productoIds, empresaId);
  }
```

- [ ] **Step 2: Typecheck**

Run: `pnpm build`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/application/use-cases/menu-virtual.use-case.ts
git commit -m "feat(menus-virtuales): expose addProductos in use case"
```

**Status: DONE.** Implementado y verificado directamente por el orquestador (cambio trivial, 4 líneas). Commit: `6fa8eee3`.

---

### Task 18: API route — `POST` aditivo

**Files:**
- Modify: `src/app/api/admin/menus-virtuales/[id]/productos/route.ts`

- [ ] **Step 1: Agregar el handler POST**

Agregar al archivo existente (que ya tiene `GET`/`PUT`), reusando el mismo `setMenuVirtualProductosSchema` (misma forma `{ productoIds: string[] }`):

```ts
export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('JSON inválido');
  }

  const parsed = setMenuVirtualProductosSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.issues[0]?.message ?? 'Datos inválidos');
  }

  const result = await getMenuVirtualUseCase().addProductos(id, parsed.data.productoIds, empresaId);
  if (result.success) revalidateTag(catalogTag(empresaId), {});
  return handleResultWithStatus(result);
}
```

Semántica REST de este archivo tras este cambio: `GET` = leer asociados, `PUT` = reemplazar-todo (ya existía, lo usa la pantalla de árbol), `POST` = agregar sin borrar (nuevo, lo usa el bulk-assign de productos).

- [ ] **Step 2: Typecheck y lint**

Run: `pnpm lint && pnpm build`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/admin/menus-virtuales/[id]/productos/route.ts"
git commit -m "feat(menus-virtuales): additive POST endpoint for bulk product assignment"
```

**Status: DONE.** Implementado y verificado directamente por el orquestador — usa correctamente `addProductos` (no `setProductos`), auth-first, `revalidateTag` bien condicionado. Commit: `d4ea4f8f`.

---

### Task 19: Traducciones para la UI de asignación masiva

**Files:**
- Modify: `src/lib/translations.ts`

- [ ] **Step 1: Agregar claves**

En el bloque `es`, junto a las demás claves `menuVirtual*`:

```ts
    menuVirtualProductosSeleccionadosSufijo: "producto(s) seleccionado(s)",
    menuVirtualAsignarAMenu: "Asignar a menú virtual",
    menuVirtualElegirNodo: "Elegí un menú o submenú",
    menuVirtualAsignarConfirmar: "Asignar",
    menuVirtualAsignarExito: "Productos asignados correctamente.",
    menuVirtualAsignarError: "Error al asignar los productos.",
```

En el bloque `en`:

```ts
    menuVirtualProductosSeleccionadosSufijo: "product(s) selected",
    menuVirtualAsignarAMenu: "Assign to virtual menu",
    menuVirtualElegirNodo: "Choose a menu or submenu",
    menuVirtualAsignarConfirmar: "Assign",
    menuVirtualAsignarExito: "Products assigned successfully.",
    menuVirtualAsignarError: "Error assigning products.",
```

(fr/it/de sin cambios, mismo criterio de fallback a `es` ya usado en todo este feature.)

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/translations.ts
git commit -m "feat(menus-virtuales): i18n keys for bulk product assignment"
```

**Status: DONE.** Implementado y verificado directamente por el orquestador. `selectAll`/`select` no existían en el archivo — se agregaron nuevas, sin duplicar. Commit: `f70150bd`.

---

### Task 20: Selección múltiple y asignación masiva en `/admin/productos`

**Files:**
- Modify: `src/app/admin/(protected)/productos/page.tsx`

**Contexto del archivo (ya explorado, 727 líneas):**
- Estado y `filteredProductos` (memo) están cerca de la línea 336.
- Barra de "Buscador y acciones" con el input de búsqueda y el botón "Nuevo producto" está en la línea ~415-432.
- Tabla desktop: `<thead>` arranca ~450, columnas actuales son Imagen/Nombre/Precio/Categoría/(Tipo si restaurante)/Estado/Acciones; `<tbody>` con `filteredProductos.map((prod) => ...)` arranca en la línea 502.
- Hay una vista mobile en tarjetas, con su propio `filteredProductos.map(...)` más abajo en el archivo (buscarla con Grep antes de tocarla) — debe recibir el MISMO tratamiento de checkbox que la tabla desktop; dejarla sin selección sería una regresión de UX, no una reducción de alcance válida.
- Patrón de checkbox ya usado en este proyecto (`AllergenSelector` en `product-form-dialog.tsx`): `<input type="checkbox" className="w-4 h-4 accent-primary shrink-0" checked={...} onChange={...} />`.
- El endpoint nuevo es `POST /api/admin/menus-virtuales/{nodoId}/productos` con body `{ productoIds: string[] }` (Task 18) — agrega sin borrar. El árbol completo de nodos se obtiene de `GET /api/admin/menus-virtuales` (devuelve un array plano de `{ id, empresaId, padreId, nombre, orden }[]`, igual forma que usa `/admin/menus-virtuales/page.tsx`).

- [ ] **Step 1: Estado de selección**

Agregar cerca de los otros `useState` del componente:

```ts
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [menusVirtuales, setMenusVirtuales] = useState<{ id: string; padreId: string | null; nombre: string }[]>([]);
const [showAsignarPicker, setShowAsignarPicker] = useState(false);
const [asignando, setAsignando] = useState(false);
```

Cargar los nodos una vez al montar (mismo patrón `useEffect` que ya usa este archivo para cargar categorías/productos):

```ts
useEffect(() => {
  void fetch('/api/admin/menus-virtuales')
    .then(res => res.ok ? res.json() : [])
    .then((data: { id: string; padreId: string | null; nombre: string }[]) => setMenusVirtuales(data));
}, []);
```

Calcular los nodos HOJA (sin hijos) para ofrecer en el picker — un nodo padre (sin `padreId`) no es una hoja válida si tiene hijos, y un nodo sin `padreId` Y sin hijos tampoco es una hoja útil aquí (sería un menú vacío de nivel superior sin subcategoría, caso raro pero posible — igual se puede listar, mostrando el nombre completo del padre solo). Etiqueta legible como "Padre › Hijo" para las hojas con padre, o solo "Nombre" para un nodo de nivel superior sin hijos:

```ts
const nodosHoja = useMemo(() => {
  const hijosDe = (id: string) => menusVirtuales.filter(m => m.padreId === id);
  return menusVirtuales
    .filter(m => hijosDe(m.id).length === 0)
    .map(m => {
      const padre = m.padreId ? menusVirtuales.find(p => p.id === m.padreId) : null;
      return { id: m.id, label: padre ? `${padre.nombre} › ${m.nombre}` : m.nombre };
    });
}, [menusVirtuales]);
```

- [ ] **Step 2: Toggle de selección por fila y "seleccionar todos"**

```ts
function toggleSeleccion(id: string) {
  setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
}

function toggleSeleccionarTodos() {
  setSelectedIds(prev =>
    prev.size === filteredProductos.length ? new Set() : new Set(filteredProductos.map(p => p.id))
  );
}
```

- [ ] **Step 3: Checkbox en la tabla desktop**

Agregar una columna nueva al `<thead>` (primera columna, antes de "Imagen"), con un checkbox de "seleccionar todos":

```tsx
<th scope="col" className="px-4 py-3 text-left">
  <input
    type="checkbox"
    aria-label={t("selectAll", language)}
    checked={filteredProductos.length > 0 && selectedIds.size === filteredProductos.length}
    onChange={toggleSeleccionarTodos}
    className="w-4 h-4 accent-primary shrink-0"
  />
</th>
```

Si no existe la clave `selectAll` en `translations.ts`, agregarla junto con las de la Task 19 (`es: "Seleccionar todos"`, `en: "Select all"`).

Y en el `<tbody>`, dentro de cada `<tr>`, agregar la celda correspondiente como primera `<td>`:

```tsx
<td className="px-4 py-3 whitespace-nowrap">
  <input
    type="checkbox"
    aria-label={`${t("select", language)} ${prod.titulo_es}`}
    checked={selectedIds.has(prod.id)}
    onChange={() => toggleSeleccion(prod.id)}
    className="w-4 h-4 accent-primary shrink-0"
  />
</td>
```

Si no existe la clave `select` (verbo, distinto de `selectAll`), agregarla también (`es: "Seleccionar"`, `en: "Select"`). Ajustar el `colSpan` del `<td>` de "sin resultados" (línea ~602-607) sumando 1 por la columna nueva.

- [ ] **Step 4: Mismo tratamiento en la vista mobile**

Ubicar el segundo `filteredProductos.map(...)` (vista de tarjetas) con Grep y agregar el mismo checkbox dentro de cada tarjeta, en una posición visible (ej. esquina superior de la tarjeta), con el mismo patrón `checked={selectedIds.has(prod.id)}` / `onChange={() => toggleSeleccion(prod.id)}`.

- [ ] **Step 5: Barra de acción masiva**

Debajo de la barra de "Buscador y acciones" (línea ~432), agregar condicionalmente cuando hay selección:

```tsx
{selectedIds.size > 0 && (
  <div className="flex items-center justify-between gap-4 backdrop-blur-xl bg-primary/10 border border-primary/20 rounded-xl px-4 py-3">
    <span className="text-sm text-foreground">
      {selectedIds.size} {t('menuVirtualProductosSeleccionadosSufijo', language)}
    </span>
    <Button size="sm" onClick={() => setShowAsignarPicker(true)} disabled={nodosHoja.length === 0}>
      {t('menuVirtualAsignarAMenu', language)}
    </Button>
  </div>
)}
```

- [ ] **Step 6: Picker de nodo destino**

Reusar el componente `Dialog`/`DialogContent` ya existente en el proyecto (`@/components/ui/dialog`, mismo import que usa `product-form-dialog.tsx` para sus diálogos). Contenido: lista de `nodosHoja` como botones, cada uno dispara la asignación:

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ...dentro del componente:
async function handleAsignar(nodoId: string) {
  setAsignando(true);
  try {
    const res = await fetchWithCsrf(`/api/admin/menus-virtuales/${nodoId}/productos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productoIds: [...selectedIds] }),
    });
    if (res.ok) {
      alert(t('menuVirtualAsignarExito', language));
      setSelectedIds(new Set());
      setShowAsignarPicker(false);
    } else {
      alert(t('menuVirtualAsignarError', language));
    }
  } finally {
    setAsignando(false);
  }
}

// ...en el JSX, junto a los demás <Dialog> del archivo si los hay, o al final antes del cierre del componente:
<Dialog open={showAsignarPicker} onOpenChange={setShowAsignarPicker}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{t('menuVirtualElegirNodo', language)}</DialogTitle>
    </DialogHeader>
    <div className="space-y-1 max-h-80 overflow-y-auto">
      {nodosHoja.map(nodo => (
        <button
          key={nodo.id}
          type="button"
          disabled={asignando}
          onClick={() => handleAsignar(nodo.id)}
          className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-muted/50 disabled:opacity-50"
        >
          {nodo.label}
        </button>
      ))}
    </div>
  </DialogContent>
</Dialog>
```

Verificar la firma real de `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` en `src/components/ui/dialog.tsx` antes de asumir esta API — ajustar si difiere (ej. si `DialogDescription` es obligatorio para accesibilidad, agregarlo con un texto breve o `sr-only`, siguiendo el mismo patrón que `menu-section.tsx`'s `ItemDetailDialog` cuando no hace falta descripción visible).

- [ ] **Step 7: Typecheck, lint y build**

Run: `pnpm lint && pnpm build`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add "src/app/admin/(protected)/productos/page.tsx"
git commit -m "feat(menus-virtuales): bulk-assign products to a virtual menu node"
```

**Status: DONE.** Implementado, spec-reviewed (✅ compliant tras un fix: faltaba `?empresaId=` en el fetch GET, rompía la pantalla para superadmin), code-quality-reviewed (encontró 5 problemas reales más allá de estilo: el mismo bug de `empresaId` faltante pero en el POST de asignación, `alert()` rompiendo la convención de banner de error del archivo, mensaje de error genérico en vez del real del servidor, un bug real en "seleccionar todos" que comparaba tamaños en vez de pertenencia — podía borrar silenciosamente una selección válida — y falta de reintento ante errores transitorios; los 5 corregidos, re-revisado, ✅ ready to merge, 632/632 tests). Commits: `d0527c46` + `c16323a7` + `ba5aaf0a`.

---

### Task 21: Verificación manual de la Fase 2

**Files:** none (verification task)

- [ ] **Step 1:** En `/admin/productos`, tildar 2-3 productos, click en "Asignar a menú virtual", elegir "Vehículos › Coches", confirmar. Verificar que aparece el mensaje de éxito y la selección se limpia.
- [ ] **Step 2:** Entrar a `/admin/menus-virtuales` → "Coches" y confirmar que los productos recién asignados aparecen, SIN que se hayan perdido los que ya estaban asociados antes (si los había) — este es el comportamiento aditivo que distingue esta vía de `setProductos`.
- [ ] **Step 3:** Repetir la asignación masiva sobre uno de los MISMOS productos ya asociados — confirmar que no se duplica en la lista ni rompe (gracias a `ignoreDuplicates`).
- [ ] **Step 4:** `pnpm lint && pnpm build && pnpm vitest run` — todo verde.

**Status: DONE (con hallazgo real).** Al probar el POST de asignación masiva de punta a punta, apareció un 500: `NextResponse.json(undefined, ...)` lanza `"Value is not JSON serializable"` — un bug SISTÉMICO preexistente en el helper compartido `successResponse` (`src/core/infrastructure/api/helpers.ts`), que afecta a CUALQUIER endpoint admin que devuelva `Result<void>` (deletes, sets), no solo a este. Nunca se había disparado en vivo porque ningún endpoint void se había ejercitado de punta a punta en una sesión de desarrollo hasta ahora. Corregido en la raíz (`data ?? null` antes de serializar) con TDD (RED confirmado reproduciendo el error exacto del log, GREEN después del fix) y test de regresión nuevo (`tests/core/api-helpers-success-response.test.ts`). Verificado con la suite completa (637/637) sin romper nada. Commit: `60d46498`. El resto de la Fase 2 (asignación aditiva, no duplica, no pierde asociaciones previas) verificado correcto por el usuario tras el fix.

---

## Fase 3: orden combinado entre categorías reales y menús virtuales

**Motivación (feedback del usuario tras probar la Fase 2):** los menús virtuales siempre aparecen al final de todas las categorías reales en el catálogo público — `GetMenuUseCase.execute()` concatena `[...menu, ...menuVirtualVMs]` sin mezclar por orden. El usuario quiere poder intercalarlos libremente (ej. "Vehículos" entre "Baterías" y "Aceites").

**Diseño:** `/admin/categorias` ya tiene el patrón exacto necesario — un campo numérico "Orden" (`orderLabel`) editable por categoría. El backend de menús virtuales YA acepta y persiste `orden` en el PUT desde la Fase 1 (`updateMenuVirtualSchema`, `SupabaseMenuVirtualRepository.update`) — solo falta: (1) propagar `orden` al view-model (`MenuCategoryVM`) para que `GetMenuUseCase` pueda comparar categorías reales y menús virtuales por el mismo campo, (2) mezclar y ordenar ambas listas juntas en vez de concatenarlas, y (3) agregar el input "Orden" en `/admin/menus-virtuales`, que hoy no lo expone.

### Task 22: Propagar `orden` a `MenuCategoryVM`

**Files:**
- Modify: `src/core/application/dtos/menu-view-model.ts`
- Modify: `src/core/application/mappers/menu.mapper.ts`

- [ ] **Step 1: Agregar el campo al view-model**

En `menu-view-model.ts`, en la interfaz `MenuCategoryVM`, agregar (después de `label: string;`):

```ts
  orden?: number;
```

- [ ] **Step 2: Setearlo en `toCategoryVM`**

En `menu.mapper.ts`, en el objeto que retorna `MenuMapper.toCategoryVM` (busca `label: parentCat.nombre ?? "Unnamed Category",`), agregar la línea `orden: parentCat.orden,` inmediatamente después de esa línea.

- [ ] **Step 3: Setearlo en `toVirtualCategoryVM`**

En el objeto que retorna `MenuMapper.toVirtualCategoryVM` (busca `label: padre.nombre,`), agregar la línea `orden: padre.orden,` inmediatamente después de esa línea.

- [ ] **Step 4: Typecheck y tests**

Run: `pnpm build && pnpm vitest run tests/compliance/menu-virtual-mapper.test.ts tests/compliance/menu-agrupacion.test.ts`
Expected: sin errores, todos los tests existentes siguen en verde (el campo es opcional y aditivo, no debería romper ninguna aserción existente).

- [ ] **Step 5: Commit**

```bash
git add src/core/application/dtos/menu-view-model.ts src/core/application/mappers/menu.mapper.ts
git commit -m "feat(menus-virtuales): propagate orden to MenuCategoryVM"
```

**Status: DONE.** Implementado y verificado directamente por el orquestador — diff exacto en ambas funciones (`toCategoryVM`, no `toSubcategoryVM`; `toVirtualCategoryVM`, no `toVirtualSubcategoryVM`), build y 19 tests existentes en verde. Commit: `64732302`.

---

### Task 23: Mezclar categorías reales y menús virtuales por `orden`

**Files:**
- Modify: `src/core/application/use-cases/get-menu.use-case.ts`

- [ ] **Step 1: Reemplazar la concatenación simple por un merge-sort**

Reemplazar las líneas finales de `execute()` (actualmente):

```ts
      const menuVirtualVMs = await this.construirMenusVirtuales(empresaId, productos.data, categoriasPorId, gruposPorProducto);

      // Una categoría sin nada que ofrecer no se pinta: dejaría un encabezado
      // vacío en la carta del cliente. Aplica igual a categorías reales y a
      // menús virtuales — toVirtualCategoryVM puebla `items` con la unión de
      // sus hojas justo para que este mismo filtro los alcance.
      return { data: [...menu, ...menuVirtualVMs].filter(categoria => categoria.items.length > 0) };
```

con:

```ts
      const menuVirtualVMs = await this.construirMenusVirtuales(empresaId, productos.data, categoriasPorId, gruposPorProducto);

      // Categorías reales y menús virtuales se intercalan por `orden` — el
      // admin elige la posición relativa de ambos tipos de nodo desde sus
      // respectivas pantallas, en vez de que los virtuales queden siempre al
      // final. Sort estable (garantizado desde ES2019): a igual `orden`,
      // las categorías reales mantienen su posición antes que las virtuales,
      // que es el orden en que llegan en el spread.
      const todasLasCategorias = [...menu, ...menuVirtualVMs].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

      // Una categoría sin nada que ofrecer no se pinta: dejaría un encabezado
      // vacío en la carta del cliente. Aplica igual a categorías reales y a
      // menús virtuales — toVirtualCategoryVM puebla `items` con la unión de
      // sus hojas justo para que este mismo filtro los alcance.
      return { data: todasLasCategorias.filter(categoria => categoria.items.length > 0) };
```

- [ ] **Step 2: Correr TODOS los tests de este use case (no solo los nuevos)**

Run: `pnpm vitest run tests/compliance/menu-agrupacion.test.ts tests/compliance/menu-virtual-mapper.test.ts tests/core/get-menu-use-case-no-duplicate-log.test.ts tests/core/get-cached-menu-no-cache-on-error.test.ts`
Expected: todos en verde. **Atención particular** al test de `get-menu-use-case-no-duplicate-log.test.ts` que asocia `data[0]`/`data[1]` a categoría real/virtual respectivamente (agregado en la Task 10) — si las fixtures de ese test no fijan `orden` explícito (ambas caen en el default 0), el sort estable debe preservar el mismo orden que antes (reales primero) y el test debería seguir pasando sin cambios. Si por algún motivo YA falla, es señal de que las fixtures necesitan un `orden` explícito para expresar la intención del test — no lo asumas, ejecutalo y confirmá.

- [ ] **Step 3: Lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/core/application/use-cases/get-menu.use-case.ts
git commit -m "feat(menus-virtuales): interleave real categories and virtual menus by orden"
```

**Status: DONE.** Implementado, spec-reviewed (✅ compliant, 637/637 tests full suite), code-quality-reviewed (encontró que el único test de orden existente pasaba por empate en `orden: 0`, no porque probara el interleaving real — se agregó un test con `orden` explícitamente distinto y en sentido inverso al orden de llegada, que sí falla si el comparador se rompe). Commits: `77db0cdc` + `dd9975c6`.

---

### Task 24: Campo "Orden" en `/admin/menus-virtuales`

**Files:**
- Modify: `src/app/admin/(protected)/menus-virtuales/page.tsx`

**Contexto:** el backend YA acepta y persiste `orden` en `PUT /api/admin/menus-virtuales/[id]` desde la Fase 1 (`updateMenuVirtualSchema` lo incluye, `SupabaseMenuVirtualRepository.update` lo escribe) — este task es puramente de UI. La interfaz local `MenuVirtual` en este archivo ya incluye `orden: number` (`GET /api/admin/menus-virtuales` ya lo devuelve), simplemente nunca se mostró ni editó. Reusar la clave de traducción `orderLabel`, ya existente y usada por el campo equivalente en `/admin/categorias/page.tsx`.

- [ ] **Step 1: Estado**

Agregar junto a `editNombre`:

```ts
const [editOrden, setEditOrden] = useState(0);
```

- [ ] **Step 2: Inicializar al seleccionar un nodo**

En `handleSelect`, agregar `setEditOrden(nodo.orden);` junto a `setEditNombre(nodo.nombre);`.

- [ ] **Step 3: Incluir en el guardado**

En `handleGuardarNombre`, el body del PUT pasa de `{ nombre_es: editNombre }` a `{ nombre_es: editNombre, orden: editOrden }`.

- [ ] **Step 4: Input en el formulario**

Junto al `<Input id="menu-virtual-nombre" .../>` existente, agregar un segundo campo (ajustar el layout de la fila con buen criterio — por ejemplo, "Nombre" en su propia fila y "Orden" + los botones Guardar/Eliminar en la fila siguiente, dado que agregar un tercer campo a la fila `flex` actual la haría muy angosta):

```tsx
<div>
  <label htmlFor="menu-virtual-orden" className="text-sm font-medium text-foreground">{t('orderLabel', language)}</label>
  <Input
    id="menu-virtual-orden"
    type="number"
    value={editOrden}
    onChange={e => setEditOrden(Number.parseInt(e.target.value) || 0)}
  />
</div>
```

- [ ] **Step 5: Typecheck, lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add "src/app/admin/(protected)/menus-virtuales/page.tsx"
git commit -m "feat(menus-virtuales): expose orden field in admin tree screen"
```

**Status: DONE.** Implementado y verificado directamente por el orquestador — diff limpio, layout resuelto con buen criterio (Nombre en su fila, Orden angosto + Guardar/Eliminar en la siguiente), 638/638 tests, lint y build limpios. Commit: `f7786cd6`.

---

### Task 25: Verificación manual de la Fase 3

**Files:** none (verification task)

- [ ] **Step 1:** En `/admin/categorias`, anotar el `orden` de dos categorías reales existentes (ej. "Baterías" = 10, la siguiente = 20).
- [ ] **Step 2:** En `/admin/menus-virtuales`, seleccionar "Vehículos", poner Orden = 15, guardar.
- [ ] **Step 3:** Abrir el catálogo público y confirmar que "Vehículos" aparece INTERCALADO entre las dos categorías reales (no al final).
- [ ] **Step 4:** `pnpm lint && pnpm build && pnpm vitest run` — todo verde.

---

## Self-review notes

- **Spec coverage:** modelo de datos (Tasks 1-2), dominio/repo/use-case (Tasks 4-7), mapper + extensión de GetMenuUseCase (Tasks 9-10), DTOs + rutas admin (Tasks 8, 11), UI admin (Tasks 13-14), verificación pública (Task 15). Todas las secciones del spec tienen tarea.
- **Fuera de alcance respetado:** no se tocó `categorias`/`productos.categoria_id`, no se agregó gating por `empresa.tipo`, no se tocó la búsqueda in-place del catálogo (Task 9 confirma con test que un producto en dos hojas no se duplica en `items` de menús virtuales distintos — la dedupe de la búsqueda ya vive en `client-menu-page.tsx` y no necesita cambios).
- **Consistencia de tipos:** `MenuVirtual.nombre` (no `nombre_es`) en el dominio, igual que `Category.nombre`; `menuVirtualId`/`productoId` camelCase en `MenuVirtualProductoAsignacion`, igual que `ProductoComplementoAsignacion`. `toVirtualCategoryVM`/`toVirtualSubcategoryVM` firmas usadas en Task 9 y consumidas en Task 10 coinciden (mismo orden de parámetros: nodo, hijos/ids, mapas, categoriasPorId).
