# Landing Page — Etapa 2: Capa de datos de secciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear la tabla `empresa_landing_secciones` y toda la capa Clean Architecture (dominio, DTOs Zod, repositorio, use case, API admin) para que un admin pueda leer/guardar el contenido de las 6 secciones de landing (hero, nosotros, cta_carta, testimonio, galeria, visitanos) de su empresa. **Sin UI todavía** — esta etapa no cambia nada visible; la landing pública sigue usando el shell estático de la Etapa 1 hasta la Etapa 4.

**Architecture:** Sigue al pie de la letra el patrón ya establecido por `menus_virtuales` en este mismo repo: tabla con RLS `AS RESTRICTIVE` + `get_mi_empresa_id()`, DTOs Zod en `core/application/dtos/`, repositorio `I*Repository`/`Supabase*Repository`, use case delgado, wiring en `core/infrastructure/database/index.ts`, rutas admin vía `resolveAdminContextWithEmpresa` (sirve admin Y superadmin-con-`?empresaId=` sin código extra).

**Tech Stack:** Next.js App Router, TypeScript, Zod, Supabase (Postgres + RLS), Vitest.

**Spec de referencia:** `docs/superpowers/specs/2026-09-24-landing-page-rearquitectura-rutas-design.md`, secciones "2. Modelo de datos", "3. Capas de aplicación" y "4. API".

---

## Contexto para quien ejecute esto

- Regla de oro del proyecto (`CLAUDE.md`): tras cada tarea completada correr `pnpm lint && pnpm build`. No marcar la tarea como hecha si fallan.
- Commits sin "Co-Authored-By" ni atribución de IA — conventional commits solos.
- **`empresa.telefono` YA es el número de WhatsApp** (respaldado por la columna `telefono_whatsapp` en `supabase-empresa.repository.ts:17,289`) — no hace falta agregar ninguna columna nueva a `empresas` en esta etapa. Esto corrige una idea inicial del spec que ya fue actualizada.
- **La migración de este plan (Task 1) NO se aplica de forma autónoma.** Per `CLAUDE.md`, aplicar significa crear el `.sql` y correr `supabase db push --linked` contra el proyecto Supabase linkeado — que es el proyecto de **producción** con tenants reales (`ugvjrlmoerhvwsqozqfh`), no un sandbox. Task 1 termina en "crear el archivo y commitear" — el `db push` es un paso manual, aparte, que requiere confirmación explícita del usuario en el momento de ejecutarlo. No lo deleguen a un subagente sin supervisión directa.
- La tabla `contenido` (JSONB) se valida con Zod en la capa de aplicación, no con constraints de Postgres más allá del `CHECK` sobre `tipo`.

## File Structure

**Nuevos:**
- `supabase/migrations/20260924000001_empresa_landing_secciones.sql` — tabla + RLS + GRANTs.
- `src/core/application/dtos/landing-seccion.dto.ts` — schemas Zod (envelope + 6 schemas de `contenido` por tipo).
- `src/core/domain/repositories/ILandingSeccionRepository.ts` — interfaz del repositorio.
- `src/core/infrastructure/database/SupabaseLandingSeccionRepository.ts` — implementación Supabase.
- `src/core/application/use-cases/landing-seccion.use-case.ts` — use case delgado.
- `src/app/api/admin/landing-secciones/route.ts` — `GET` (lista todas las secciones de la empresa).
- `src/app/api/admin/landing-secciones/[tipo]/route.ts` — `PUT` (upsert de una sección por tipo).
- `tests/core/landing-seccion-dto.test.ts` — tests de los schemas Zod.

**Modificados:**
- `src/core/domain/entities/types.ts` — agrega `LANDING_SECCION_TIPOS`, `LandingSeccionTipo`, `LandingSeccion`.
- `src/core/infrastructure/database/index.ts` — wiring del repo y use case (patrón lazy singleton ya usado por `menus_virtuales`).

---

### Task 1: Migración — tabla `empresa_landing_secciones`

**Files:**
- Create: `supabase/migrations/20260924000001_empresa_landing_secciones.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- supabase/migrations/20260924000001_empresa_landing_secciones.sql
-- Secciones de landing gestionables por tipo fijo (ver
-- docs/superpowers/specs/2026-09-24-landing-page-rearquitectura-rutas-design.md,
-- seccion "Modelo de datos"). Maximo una fila por (empresa_id, tipo).
CREATE TABLE public.empresa_landing_secciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('hero','nosotros','cta_carta','testimonio','galeria','visitanos')),
  activo BOOLEAN NOT NULL DEFAULT false,
  orden INTEGER NOT NULL DEFAULT 0,
  contenido JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(contenido) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, tipo)
);

CREATE INDEX idx_empresa_landing_secciones_empresa_id ON public.empresa_landing_secciones(empresa_id);

ALTER TABLE public.empresa_landing_secciones ENABLE ROW LEVEL SECURITY;

-- AS RESTRICTIVE: se combina con AND, ninguna policy permisiva agregada
-- despues puede anularla (ver docs/context/security.md, incidente 2026-07-31).
-- El catalogo publico NO lee esta tabla directo por RLS: la landing la lee
-- via getSupabaseClient() (service_role) desde un use case, mismo patron que
-- menus_virtuales.
CREATE POLICY "No direct anon access to empresa_landing_secciones"
  ON public.empresa_landing_secciones AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve empresa_landing_secciones"
  ON public.empresa_landing_secciones FOR SELECT TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin inserta empresa_landing_secciones"
  ON public.empresa_landing_secciones FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin edita empresa_landing_secciones"
  ON public.empresa_landing_secciones FOR UPDATE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()))
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin elimina empresa_landing_secciones"
  ON public.empresa_landing_secciones FOR DELETE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresa_landing_secciones TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresa_landing_secciones TO authenticated;
```

- [ ] **Step 2: Verificar sintaxis básica**

Run: `pnpm lint && pnpm build` (no valida SQL, pero confirma que no se rompió nada del resto del repo al agregar el archivo).
Expected: sin errores.

No corras `supabase db push --linked` en este paso — ver nota en "Contexto" arriba. Este task termina con el archivo creado y commiteado; el push es un paso manual posterior, fuera del flujo de subagentes.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260924000001_empresa_landing_secciones.sql
git commit -m "feat(landing): agregar migracion de empresa_landing_secciones"
```

---

### Task 2: Entidad de dominio `LandingSeccion`

**Files:**
- Modify: `src/core/domain/entities/types.ts`

- [ ] **Step 1: Agregar el tipo y la entidad**

Agregar cerca de la definición de `MenuVirtual` (línea ~76-88 de `types.ts`), siguiendo el mismo estilo:

```ts
export const LANDING_SECCION_TIPOS = ['hero', 'nosotros', 'cta_carta', 'testimonio', 'galeria', 'visitanos'] as const;
export type LandingSeccionTipo = typeof LANDING_SECCION_TIPOS[number];

export interface LandingSeccion {
  id: string;
  empresaId: string;
  tipo: LandingSeccionTipo;
  activo: boolean;
  orden: number;
  contenido: Record<string, unknown>;
}
```

`contenido` queda opaco (`Record<string, unknown>`) a nivel de dominio y repositorio — el tipado específico por `tipo` (kicker/titulo/descripcion para `hero`, texto/autor para `testimonio`, etc.) vive solo en los schemas Zod de la capa de aplicación (Task 3). Esto evita generics innecesarios en el repositorio mientras nada además de la validación de entrada consume esa forma específica (la Etapa 4, renderizado público, es la que sí necesitará leer campos concretos — no está en el alcance de esta etapa).

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/core/domain/entities/types.ts
git commit -m "feat(landing): agregar entidad de dominio LandingSeccion"
```

---

### Task 3: DTOs Zod por tipo de sección

**Files:**
- Create: `src/core/application/dtos/landing-seccion.dto.ts`
- Test: `tests/core/landing-seccion-dto.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/core/landing-seccion-dto.test.ts
import { describe, it, expect } from 'vitest';
import {
  upsertLandingSeccionSchema,
  parseContenidoPorTipo,
} from '@/core/application/dtos/landing-seccion.dto';

describe('upsertLandingSeccionSchema', () => {
  it('acepta el envelope mínimo válido', () => {
    const parsed = upsertLandingSeccionSchema.safeParse({
      activo: true,
      orden: 0,
      contenido: {},
    });
    expect(parsed.success).toBe(true);
  });

  it('rechaza activo faltante', () => {
    const parsed = upsertLandingSeccionSchema.safeParse({
      orden: 0,
      contenido: {},
    });
    expect(parsed.success).toBe(false);
  });

  it('orden por defecto es 0 si se omite', () => {
    const parsed = upsertLandingSeccionSchema.safeParse({
      activo: false,
      contenido: {},
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.orden).toBe(0);
  });
});

describe('parseContenidoPorTipo', () => {
  it('hero: acepta kicker/titulo/descripcion/imagenUrl/horario traducibles', () => {
    const result = parseContenidoPorTipo('hero', {
      kicker: { es: 'Tacoronte · Norte de Tenerife' },
      titulo: { es: 'Cocina india auténtica' },
      descripcion: { es: 'Disfrutá de sabores exóticos' },
      imagenUrl: 'https://cdn.example.com/hero.webp',
      horario: { es: 'Todos los días · 13:00–23:00' },
    });
    expect(result.success).toBe(true);
  });

  it('hero: rechaza imagenUrl que no sea string', () => {
    const result = parseContenidoPorTipo('hero', { imagenUrl: 123 });
    expect(result.success).toBe(false);
  });

  it('nosotros: acepta kicker/titulo/descripcion/imagenUrl', () => {
    const result = parseContenidoPorTipo('nosotros', {
      titulo: { es: 'Nosotros' },
      descripcion: { es: 'Somos una empresa familiar' },
    });
    expect(result.success).toBe(true);
  });

  it('cta_carta: acepta cta secundaria opcional', () => {
    const result = parseContenidoPorTipo('cta_carta', {
      titulo: { es: 'Más de 200 platos' },
      ctaSecundariaTexto: { es: 'Reservar mesa' },
      ctaSecundariaUrl: 'https://wa.me/34600000000',
    });
    expect(result.success).toBe(true);
  });

  it('testimonio: acepta texto y autor', () => {
    const result = parseContenidoPorTipo('testimonio', {
      texto: { es: 'Un lugar increíble para celebrar' },
      autor: { es: 'Eventos y celebraciones' },
    });
    expect(result.success).toBe(true);
  });

  it('galeria: acepta un array de imagenes, por defecto vacío', () => {
    const result = parseContenidoPorTipo('galeria', {});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.imagenes).toEqual([]);
  });

  it('galeria: rechaza más de 20 imágenes', () => {
    const result = parseContenidoPorTipo('galeria', {
      imagenes: Array.from({ length: 21 }, (_, i) => `https://cdn.example.com/${i}.webp`),
    });
    expect(result.success).toBe(false);
  });

  it('visitanos: acepta kicker/titulo/horario, sin direccion/telefono (se leen de empresa)', () => {
    const result = parseContenidoPorTipo('visitanos', {
      titulo: { es: 'Dónde estamos' },
      horario: { es: 'Todos los días · 13:00–23:00' },
    });
    expect(result.success).toBe(true);
  });

  it('cualquier tipo: contenido vacío es válido (todos los campos son opcionales)', () => {
    for (const tipo of ['hero', 'nosotros', 'cta_carta', 'testimonio', 'galeria', 'visitanos'] as const) {
      const result = parseContenidoPorTipo(tipo, {});
      expect(result.success, `tipo=${tipo}`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm vitest run tests/core/landing-seccion-dto.test.ts`
Expected: FAIL — `Cannot find module '@/core/application/dtos/landing-seccion.dto'`

- [ ] **Step 3: Implementación**

```ts
// src/core/application/dtos/landing-seccion.dto.ts
import { z } from 'zod';
import { LANDING_SECCION_TIPOS, type LandingSeccionTipo } from '@/core/domain/entities/types';

const translatableTextSchema = z.object({
  es: z.string().max(2000).nullable().optional(),
  en: z.string().max(2000).nullable().optional(),
  fr: z.string().max(2000).nullable().optional(),
  it: z.string().max(2000).nullable().optional(),
  de: z.string().max(2000).nullable().optional(),
});

const heroContenidoSchema = z.object({
  kicker: translatableTextSchema.optional(),
  titulo: translatableTextSchema.optional(),
  descripcion: translatableTextSchema.optional(),
  imagenUrl: z.string().max(2000).nullable().optional(),
  ctaSecundariaTexto: translatableTextSchema.optional(),
  ctaSecundariaUrl: z.string().max(2000).nullable().optional(),
  horario: translatableTextSchema.optional(),
});

const nosotrosContenidoSchema = z.object({
  kicker: translatableTextSchema.optional(),
  titulo: translatableTextSchema.optional(),
  descripcion: translatableTextSchema.optional(),
  imagenUrl: z.string().max(2000).nullable().optional(),
});

const ctaCartaContenidoSchema = z.object({
  kicker: translatableTextSchema.optional(),
  titulo: translatableTextSchema.optional(),
  descripcion: translatableTextSchema.optional(),
  ctaSecundariaTexto: translatableTextSchema.optional(),
  ctaSecundariaUrl: z.string().max(2000).nullable().optional(),
});

const testimonioContenidoSchema = z.object({
  texto: translatableTextSchema.optional(),
  autor: translatableTextSchema.optional(),
});

const galeriaContenidoSchema = z.object({
  titulo: translatableTextSchema.optional(),
  imagenes: z.array(z.string().max(2000)).max(20).default([]),
});

const visitanosContenidoSchema = z.object({
  kicker: translatableTextSchema.optional(),
  titulo: translatableTextSchema.optional(),
  horario: translatableTextSchema.optional(),
});

const contenidoSchemaPorTipo: Record<LandingSeccionTipo, z.ZodType> = {
  hero: heroContenidoSchema,
  nosotros: nosotrosContenidoSchema,
  cta_carta: ctaCartaContenidoSchema,
  testimonio: testimonioContenidoSchema,
  galeria: galeriaContenidoSchema,
  visitanos: visitanosContenidoSchema,
};

export const upsertLandingSeccionSchema = z.object({
  activo: z.boolean(),
  orden: z.number().int().min(0).max(100).default(0),
  contenido: z.record(z.string(), z.unknown()),
});

export type UpsertLandingSeccionDTO = z.infer<typeof upsertLandingSeccionSchema>;

// Sin anotar el tipo de retorno a propósito: cada schema de contenidoSchemaPorTipo
// tiene una forma distinta (los campos opcionales de cada tipo de sección), y
// dejar que TypeScript infiera el SafeParseReturnType real evita depender de
// nombres de tipos internos de Zod que pueden cambiar entre versiones.
export function parseContenidoPorTipo(tipo: LandingSeccionTipo, contenido: unknown) {
  return contenidoSchemaPorTipo[tipo].safeParse(contenido);
}

export { LANDING_SECCION_TIPOS };
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm vitest run tests/core/landing-seccion-dto.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/application/dtos/landing-seccion.dto.ts tests/core/landing-seccion-dto.test.ts
git commit -m "feat(landing): agregar DTOs Zod de contenido por tipo de seccion"
```

---

### Task 4: Repositorio (`ILandingSeccionRepository` + implementación Supabase)

**Files:**
- Create: `src/core/domain/repositories/ILandingSeccionRepository.ts`
- Create: `src/core/infrastructure/database/SupabaseLandingSeccionRepository.ts`

No hay test dedicado para este task — sigue el mismo precedente que `SupabaseMenuVirtualRepository` (sin test unitario propio; el repositorio se verifica en conjunto vía `pnpm build`, y el CRUD real se ejerce end-to-end recién en la Etapa 3 cuando exista UI que lo llame).

- [ ] **Step 1: Crear la interfaz del repositorio**

```ts
// src/core/domain/repositories/ILandingSeccionRepository.ts
import type { Result, LandingSeccion, LandingSeccionTipo } from '@/core/domain/entities/types';

export interface UpsertLandingSeccionData {
  activo: boolean;
  orden: number;
  contenido: Record<string, unknown>;
}

export interface ILandingSeccionRepository {
  findAllByTenant(empresaId: string): Promise<Result<LandingSeccion[]>>;
  upsertByTipo(empresaId: string, tipo: LandingSeccionTipo, data: UpsertLandingSeccionData): Promise<Result<LandingSeccion>>;
}
```

- [ ] **Step 2: Crear la implementación Supabase**

```ts
// src/core/infrastructure/database/SupabaseLandingSeccionRepository.ts
import { SupabaseClient } from '@supabase/supabase-js';
import type {
  ILandingSeccionRepository,
  UpsertLandingSeccionData,
} from '@/core/domain/repositories/ILandingSeccionRepository';
import type { LandingSeccion, LandingSeccionTipo, Result } from '@/core/domain/entities/types';
import { logger } from '../logging/logger';

export class SupabaseLandingSeccionRepository implements ILandingSeccionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private mapRow(row: Record<string, unknown>): LandingSeccion {
    return {
      id: row.id as string,
      empresaId: row.empresa_id as string,
      tipo: row.tipo as LandingSeccionTipo,
      activo: row.activo as boolean,
      orden: (row.orden as number) ?? 0,
      contenido: (row.contenido as Record<string, unknown>) ?? {},
    };
  }

  async findAllByTenant(empresaId: string): Promise<Result<LandingSeccion[]>> {
    try {
      const { data, error } = await this.supabase
        .from('empresa_landing_secciones')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('orden', { ascending: true });

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabaseLandingSeccionRepository.findAllByTenant', { empresaId });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener secciones de landing', module: 'repository', method: 'findAllByTenant' } };
      }

      return { success: true, data: ((data ?? []) as Record<string, unknown>[]).map(r => this.mapRow(r)) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseLandingSeccionRepository.findAllByTenant', { empresaId });
      return { success: false, error: appError };
    }
  }

  async upsertByTipo(empresaId: string, tipo: LandingSeccionTipo, data: UpsertLandingSeccionData): Promise<Result<LandingSeccion>> {
    try {
      const { data: upserted, error } = await this.supabase
        .from('empresa_landing_secciones')
        .upsert(
          {
            empresa_id: empresaId,
            tipo,
            activo: data.activo,
            orden: data.orden,
            contenido: data.contenido,
          },
          { onConflict: 'empresa_id,tipo' }
        )
        .select()
        .single();

      if (error || !upserted) {
        await logger.logAndReturnError('DB_UPSERT_ERROR', error?.message ?? 'No data returned', 'repository', 'SupabaseLandingSeccionRepository.upsertByTipo', { empresaId, details: { tipo } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al guardar la sección de landing', module: 'repository', method: 'upsertByTipo' } };
      }

      return { success: true, data: this.mapRow(upserted as Record<string, unknown>) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseLandingSeccionRepository.upsertByTipo', { empresaId, details: { tipo } });
      return { success: false, error: appError };
    }
  }
}
```

- [ ] **Step 3: Verificar tipos**

Run: `pnpm typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/core/domain/repositories/ILandingSeccionRepository.ts src/core/infrastructure/database/SupabaseLandingSeccionRepository.ts
git commit -m "feat(landing): agregar repositorio de secciones de landing"
```

---

### Task 5: Use case + wiring DI

**Files:**
- Create: `src/core/application/use-cases/landing-seccion.use-case.ts`
- Modify: `src/core/infrastructure/database/index.ts`

- [ ] **Step 1: Crear el use case**

```ts
// src/core/application/use-cases/landing-seccion.use-case.ts
import type {
  ILandingSeccionRepository,
  UpsertLandingSeccionData,
} from '@/core/domain/repositories/ILandingSeccionRepository';
import type { LandingSeccion, LandingSeccionTipo, Result } from '@/core/domain/entities/types';

export class LandingSeccionUseCase {
  constructor(private readonly repo: ILandingSeccionRepository) {}

  getAll(empresaId: string): Promise<Result<LandingSeccion[]>> {
    return this.repo.findAllByTenant(empresaId);
  }

  upsert(empresaId: string, tipo: LandingSeccionTipo, data: UpsertLandingSeccionData): Promise<Result<LandingSeccion>> {
    return this.repo.upsertByTipo(empresaId, tipo, data);
  }
}
```

- [ ] **Step 2: Wiring en `core/infrastructure/database/index.ts`**

Primero, leé el archivo actual para ubicar exactamente dónde están las secciones de `SupabaseMenuVirtualRepository`/`MenuVirtualUseCase` (imports arriba del archivo, singleton lazy más abajo) y replicá el mismo patrón para `LandingSeccion`, en las mismas 3 zonas del archivo:

En la zona de imports (cerca de la línea 33-35, junto a los imports de `SupabaseMenuVirtualRepository`/`MenuVirtualUseCase`):
```ts
import { SupabaseLandingSeccionRepository } from './SupabaseLandingSeccionRepository';
import { LandingSeccionUseCase } from '@/core/application/use-cases/landing-seccion.use-case';
```

En la zona de singletons de repositorio (cerca de la línea 117-119, junto a `getMenuVirtualRepository`):
```ts
let _landingSeccionRepository: SupabaseLandingSeccionRepository | undefined;
export function getLandingSeccionRepository(): SupabaseLandingSeccionRepository {
  return _landingSeccionRepository ??= new SupabaseLandingSeccionRepository(getSupabaseClient());
}
```

En la zona de singletons de use case (cerca de la línea 259-261, junto a `getMenuVirtualUseCase`):
```ts
let _landingSeccionUseCase: LandingSeccionUseCase | undefined;
export function getLandingSeccionUseCase(): LandingSeccionUseCase {
  return _landingSeccionUseCase ??= new LandingSeccionUseCase(getLandingSeccionRepository());
}
```

(Los números de línea son orientativos — el archivo puede haber cambiado; ubicá las secciones por los nombres de `MenuVirtual`, no por número de línea literal.)

- [ ] **Step 3: Verificar tipos**

Run: `pnpm typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/core/application/use-cases/landing-seccion.use-case.ts src/core/infrastructure/database/index.ts
git commit -m "feat(landing): agregar use case y wiring de secciones de landing"
```

---

### Task 6: API admin — `GET`/`PUT`

**Files:**
- Create: `src/app/api/admin/landing-secciones/route.ts`
- Create: `src/app/api/admin/landing-secciones/[tipo]/route.ts`

- [ ] **Step 1: Ruta `GET` — listar todas las secciones**

```ts
// src/app/api/admin/landing-secciones/route.ts
import { type NextRequest } from 'next/server';
import { getLandingSeccionUseCase } from '@/core/infrastructure/database';
import { resolveAdminContextWithEmpresa, handleResultWithStatus } from '@/core/infrastructure/api/helpers';

export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const result = await getLandingSeccionUseCase().getAll(empresaId);
  return handleResultWithStatus(result);
}
```

- [ ] **Step 2: Ruta `PUT` — upsert de una sección por tipo**

```ts
// src/app/api/admin/landing-secciones/[tipo]/route.ts
import { type NextRequest } from 'next/server';
import { getLandingSeccionUseCase } from '@/core/infrastructure/database';
import { upsertLandingSeccionSchema, parseContenidoPorTipo } from '@/core/application/dtos/landing-seccion.dto';
import { LANDING_SECCION_TIPOS, type LandingSeccionTipo } from '@/core/domain/entities/types';
import { resolveAdminContextWithEmpresa, handleResultWithStatus, validationErrorResponse } from '@/core/infrastructure/api/helpers';

interface Params {
  params: Promise<{ tipo: string }>;
}

function isLandingSeccionTipo(value: string): value is LandingSeccionTipo {
  return (LANDING_SECCION_TIPOS as readonly string[]).includes(value);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const { tipo } = await params;
  if (!isLandingSeccionTipo(tipo)) {
    return validationErrorResponse('Tipo de sección inválido');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('JSON inválido');
  }

  const parsedEnvelope = upsertLandingSeccionSchema.safeParse(body);
  if (!parsedEnvelope.success) {
    return validationErrorResponse(parsedEnvelope.error.issues[0].message);
  }

  const parsedContenido = parseContenidoPorTipo(tipo, parsedEnvelope.data.contenido);
  if (!parsedContenido.success) {
    return validationErrorResponse(parsedContenido.error.issues[0].message);
  }

  const result = await getLandingSeccionUseCase().upsert(empresaId, tipo, {
    activo: parsedEnvelope.data.activo,
    orden: parsedEnvelope.data.orden,
    // parseContenidoPorTipo no anota su tipo de retorno (ver comentario en
    // landing-seccion.dto.ts) para no depender de nombres internos de Zod,
    // así que acá `.data` llega como `unknown` — el cast es seguro porque
    // ya pasó `.success` arriba y todos los schemas de contenido son
    // z.object(), cuyo output siempre es un objeto plano.
    contenido: parsedContenido.data as Record<string, unknown>,
  });
  return handleResultWithStatus(result);
}
```

Nota: no hace falta `revalidateTag` acá — a diferencia del catálogo de productos (`getCachedMenu`, cacheado 1h con `unstable_cache`), las secciones de landing todavía no tienen ningún `unstable_cache` en el camino de lectura (no existe hasta la Etapa 4), así que no hay nada que invalidar.

- [ ] **Step 3: Verificar lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/landing-secciones/route.ts "src/app/api/admin/landing-secciones/[tipo]/route.ts"
git commit -m "feat(landing): agregar API admin de secciones de landing"
```

---

### Task 7: Verificación final

**Files:** ninguno nuevo — corrida completa de la suite.

- [ ] **Step 1: Suite completa**

Run: `pnpm test`
Expected: PASS — incluye los 13 tests nuevos de `landing-seccion-dto.test.ts` más el resto de la suite (712 + 13 = 725), nada roto.

- [ ] **Step 2: Lint + build final**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 3: Reporte**

Confirmar en el chat con el usuario:
- Qué quedó armado (tabla + RLS + DTOs + repo + use case + API), y que **nada de esto es visible todavía** — cero cambio en la landing pública o en el admin.
- Que la migración está **creada pero no aplicada** — el `supabase db push --linked` contra producción queda como paso manual explícito, a decidir con el usuario antes de correrlo.
- Recordar el checklist post-migración de `CLAUDE.md` (`pnpm db:smoke`, `supabase migration list` para confirmar `Local == Remote`) para cuando se aplique.

---

## Fuera de alcance de esta etapa

- Aplicar la migración a producción (paso manual, fuera del flujo automatizado).
- Cualquier UI (`/admin/landing`, switches de superadmin) — Etapas 3 y 5.
- Renderizado público data-driven de las secciones — Etapa 4.
