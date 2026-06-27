# Google Reviews Rating System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 5-star swipe-to-rate widget (half-star increments) to the mesa client ticket, store ratings per device per session in a `valoraciones` table, redirect 4+ star raters to Google Reviews, and surface aggregated metrics in the admin panel.

**Architecture:** The `googleReviewsUrl` field is piggy-backed onto the existing `/api/mesas/[mesaId]/orders` polling response — no extra fetch on the client side. Ratings are posted to a new public endpoint `/api/mesas/[mesaId]/valoracion` which inserts into `valoraciones` with a unique constraint on `(mesa_sesion_id, rater_id)`. Admin stats are served from `/api/admin/valoraciones`. The full Clean Architecture stack: domain types → repository interface → Supabase implementation → use case → index.ts singleton → API route → UI.

**Tech Stack:** Next.js 15 App Router, Supabase (service_role), Zod, TypeScript, Tailwind v4

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/20260625000001_google_reviews_valoraciones.sql` | Create |
| `src/core/domain/entities/types.ts` | Modify — add `Valoracion`, `googleReviewsUrl` to `Empresa` |
| `src/core/domain/repositories/IValoracionRepository.ts` | Create |
| `src/core/infrastructure/database/supabase-valoracion.repository.ts` | Create |
| `src/core/application/use-cases/valoracion.use-case.ts` | Create |
| `src/core/infrastructure/database/index.ts` | Modify — register valoracion repo + use case |
| `src/app/api/mesas/[mesaId]/orders/route.ts` | Modify — add `google_reviews_url` to empresa query + response |
| `src/app/api/mesas/[mesaId]/valoracion/route.ts` | Create |
| `src/app/api/admin/valoraciones/route.ts` | Create |
| `src/components/star-rating.tsx` | Create |
| `src/components/google-reviews-widget.tsx` | Create |
| `src/components/mesa-orders-client.tsx` | Modify — `googleReviewsUrl` in interface + widget |
| `src/app/admin/(protected)/valoraciones/page.tsx` | Create |
| `src/app/admin/(protected)/admin-sidebar.tsx` | Modify — add Valoraciones nav item |
| `src/lib/translations.ts` | Modify — add 5 new keys in all 5 languages |
| `src/app/superadmin/empresas-table.tsx` | Modify — add Google Reviews URL inline edit |
| `src/core/infrastructure/database/SupabaseSuperAdminRepository.ts` | Modify — select + map `google_reviews_url` |
| `src/app/api/superadmin/empresas/[id]/route.ts` | Modify — accept `google_reviews_url` in PUT |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260625000001_google_reviews_valoraciones.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Add Google Reviews URL to empresas
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS google_reviews_url TEXT NULL;

-- Create valoraciones table
CREATE TABLE IF NOT EXISTS public.valoraciones (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  mesa_id        TEXT,
  mesa_sesion_id TEXT,
  rater_id       UUID NOT NULL,
  estrellas      NUMERIC(2,1) NOT NULL CHECK (estrellas >= 0.5 AND estrellas <= 5.0),
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- One rating per device per session
CREATE UNIQUE INDEX IF NOT EXISTS valoraciones_device_sesion_unique
  ON public.valoraciones (mesa_sesion_id, rater_id)
  WHERE mesa_sesion_id IS NOT NULL;

-- RLS
ALTER TABLE public.valoraciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to valoraciones"
  ON public.valoraciones FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve valoraciones de su empresa"
  ON public.valoraciones FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

-- GRANTs (required per project checklist since oct 2026)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.valoraciones TO service_role;
GRANT SELECT ON public.valoraciones TO authenticated;
```

- [ ] **Step 2: Apply migration in Supabase dashboard** (or via `supabase db push` if CLI is configured)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260625000001_google_reviews_valoraciones.sql
git commit -m "feat(db): add valoraciones table and google_reviews_url to empresas"
```

---

## Task 2: Domain Types

**Files:**
- Modify: `src/core/domain/entities/types.ts`

- [ ] **Step 1: Add `googleReviewsUrl` to the `Empresa` interface**

In `src/core/domain/entities/types.ts`, find the `Empresa` interface (around line 61). Add this field after `deliveryHabilitado`:

```ts
  deliveryHabilitado: boolean;
  googleReviewsUrl: string | null;
```

- [ ] **Step 2: Add the `Valoracion` entity at the bottom of the same file**

Append after the last interface:

```ts
export interface Valoracion {
  id: string;
  empresaId: string;
  mesaId: string | null;
  mesaSesionId: string | null;
  raterId: string;
  estrellas: number;
  createdAt: string;
}

export interface ValoracionStats {
  media: number;
  total: number;
  distribucion: Record<string, number>; // "1" | "2" | "3" | "4" | "5" → count
}
```

- [ ] **Step 3: Commit**

```bash
git add src/core/domain/entities/types.ts
git commit -m "feat(domain): add Valoracion entity and googleReviewsUrl to Empresa"
```

---

## Task 3: Repository Interface

**Files:**
- Create: `src/core/domain/repositories/IValoracionRepository.ts`

- [ ] **Step 1: Create the interface**

```ts
import { Result } from '../entities/types';
import type { Valoracion, ValoracionStats } from '../entities/types';

export interface CreateValoracionData {
  empresaId: string;
  mesaId: string | null;
  mesaSesionId: string | null;
  raterId: string;
  estrellas: number;
}

export interface IValoracionRepository {
  create(data: CreateValoracionData): Promise<Result<Valoracion>>;
  getStatsByEmpresa(empresaId: string): Promise<Result<ValoracionStats>>;
  listByEmpresa(empresaId: string, limit: number, offset: number): Promise<Result<Valoracion[]>>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/domain/repositories/IValoracionRepository.ts
git commit -m "feat(domain): add IValoracionRepository interface"
```

---

## Task 4: Supabase Repository Implementation

**Files:**
- Create: `src/core/infrastructure/database/supabase-valoracion.repository.ts`

- [ ] **Step 1: Create the implementation**

```ts
import { SupabaseClient } from '@supabase/supabase-js';
import { Result, Valoracion, ValoracionStats } from '@/core/domain/entities/types';
import { CreateValoracionData, IValoracionRepository } from '@/core/domain/repositories/IValoracionRepository';
import { logger } from '../logging/logger';

export class SupabaseValoracionRepository implements IValoracionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async create(data: CreateValoracionData): Promise<Result<Valoracion>> {
    try {
      const { data: row, error } = await this.supabase
        .from('valoraciones')
        .upsert(
          {
            empresa_id: data.empresaId,
            mesa_id: data.mesaId,
            mesa_sesion_id: data.mesaSesionId,
            rater_id: data.raterId,
            estrellas: data.estrellas,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'mesa_sesion_id,rater_id', ignoreDuplicates: false }
        )
        .select('id, empresa_id, mesa_id, mesa_sesion_id, rater_id, estrellas, created_at')
        .single();

      if (error) {
        await logger.logAndReturnError('DB_INSERT_ERROR', error.message, 'repository', 'SupabaseValoracionRepository.create', { details: data });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al guardar la valoración', module: 'repository', method: 'create' } };
      }

      const r = row as { id: string; empresa_id: string; mesa_id: string | null; mesa_sesion_id: string | null; rater_id: string; estrellas: number; created_at: string };
      return {
        success: true,
        data: {
          id: r.id,
          empresaId: r.empresa_id,
          mesaId: r.mesa_id,
          mesaSesionId: r.mesa_sesion_id,
          raterId: r.rater_id,
          estrellas: Number(r.estrellas),
          createdAt: r.created_at,
        },
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseValoracionRepository.create', { details: data });
      return { success: false, error: appError };
    }
  }

  async getStatsByEmpresa(empresaId: string): Promise<Result<ValoracionStats>> {
    try {
      const { data, error } = await this.supabase
        .from('valoraciones')
        .select('estrellas')
        .eq('empresa_id', empresaId);

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabaseValoracionRepository.getStatsByEmpresa', { details: { empresaId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener estadísticas', module: 'repository', method: 'getStatsByEmpresa' } };
      }

      const rows = (data ?? []) as { estrellas: number }[];
      const total = rows.length;
      const media = total > 0 ? rows.reduce((s, r) => s + Number(r.estrellas), 0) / total : 0;

      const distribucion: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
      for (const r of rows) {
        const bucket = String(Math.ceil(Number(r.estrellas)));
        if (bucket in distribucion) distribucion[bucket]++;
      }

      return { success: true, data: { media: Math.round(media * 10) / 10, total, distribucion } };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseValoracionRepository.getStatsByEmpresa', { details: { empresaId } });
      return { success: false, error: appError };
    }
  }

  async listByEmpresa(empresaId: string, limit: number, offset: number): Promise<Result<Valoracion[]>> {
    try {
      const { data, error } = await this.supabase
        .from('valoraciones')
        .select('id, empresa_id, mesa_id, mesa_sesion_id, rater_id, estrellas, created_at')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'SupabaseValoracionRepository.listByEmpresa', { details: { empresaId } });
        return { success: false, error: { code: 'DB_ERROR', message: 'Error al listar valoraciones', module: 'repository', method: 'listByEmpresa' } };
      }

      const rows = (data ?? []) as { id: string; empresa_id: string; mesa_id: string | null; mesa_sesion_id: string | null; rater_id: string; estrellas: number; created_at: string }[];
      return {
        success: true,
        data: rows.map(r => ({
          id: r.id,
          empresaId: r.empresa_id,
          mesaId: r.mesa_id,
          mesaSesionId: r.mesa_sesion_id,
          raterId: r.rater_id,
          estrellas: Number(r.estrellas),
          createdAt: r.created_at,
        })),
      };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseValoracionRepository.listByEmpresa', { details: { empresaId } });
      return { success: false, error: appError };
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/infrastructure/database/supabase-valoracion.repository.ts
git commit -m "feat(infra): add SupabaseValoracionRepository"
```

---

## Task 5: Use Case

**Files:**
- Create: `src/core/application/use-cases/valoracion.use-case.ts`

- [ ] **Step 1: Create the use case**

```ts
import { z } from 'zod';
import { IValoracionRepository } from '@/core/domain/repositories/IValoracionRepository';
import { Result, Valoracion, ValoracionStats } from '@/core/domain/entities/types';
import { logger } from '@/core/infrastructure/logging/logger';

const createSchema = z.object({
  empresaId: z.string().uuid(),
  mesaId: z.string().uuid().nullable(),
  mesaSesionId: z.string().uuid().nullable(),
  raterId: z.string().uuid(),
  estrellas: z.number().min(0.5).max(5).multipleOf(0.5),
});

export class ValoracionUseCase {
  constructor(private readonly repo: IValoracionRepository) {}

  async create(input: unknown): Promise<Result<Valoracion>> {
    try {
      const parsed = createSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message, module: 'use-case', method: 'ValoracionUseCase.create' } };
      }
      return this.repo.create(parsed.data);
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'ValoracionUseCase.create', { details: input });
      return { success: false, error: appError };
    }
  }

  async getStats(empresaId: string): Promise<Result<ValoracionStats>> {
    try {
      return this.repo.getStatsByEmpresa(empresaId);
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'ValoracionUseCase.getStats', { details: { empresaId } });
      return { success: false, error: appError };
    }
  }

  async list(empresaId: string, page = 0): Promise<Result<Valoracion[]>> {
    try {
      return this.repo.listByEmpresa(empresaId, 20, page * 20);
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'ValoracionUseCase.list', { details: { empresaId, page } });
      return { success: false, error: appError };
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/application/use-cases/valoracion.use-case.ts
git commit -m "feat(app): add ValoracionUseCase"
```

---

## Task 6: Wire into index.ts

**Files:**
- Modify: `src/core/infrastructure/database/index.ts`

- [ ] **Step 1: Add imports at the top of the existing import block**

After the last import line (currently `import { MesaClientTokenUseCase } from '@/core/application/use-cases/mesa-client-token.use-case';`), add:

```ts
import { SupabaseValoracionRepository } from './supabase-valoracion.repository';
import { ValoracionUseCase } from '@/core/application/use-cases/valoracion.use-case';
```

- [ ] **Step 2: Instantiate the repository and use case**

After `const mesaClientTokenRepository = new SupabaseMesaClientTokenRepository(supabase);`, add:

```ts
export const valoracionRepository = new SupabaseValoracionRepository(supabase);
```

After the last `export const` line (currently `export const mesaClientTokenUseCase = ...`), add:

```ts
export const valoracionUseCase = new ValoracionUseCase(valoracionRepository);
```

- [ ] **Step 3: Lint check**

```bash
pnpm lint
```

Expected: no errors related to the new files.

- [ ] **Step 4: Commit**

```bash
git add src/core/infrastructure/database/index.ts
git commit -m "feat(infra): register SupabaseValoracionRepository and ValoracionUseCase"
```

---

## Task 7: Add googleReviewsUrl to orders API response

**Files:**
- Modify: `src/app/api/mesas/[mesaId]/orders/route.ts`

- [ ] **Step 1: Declare `googleReviewsUrl` variable near the top of the `GET` handler**

After line `let pagosHabilitados = false;` (around line 145), add:

```ts
  let googleReviewsUrl: string | null = null;
```

- [ ] **Step 2: Extend the existing empresa query to also fetch `google_reviews_url`**

Find this block (around line 147):

```ts
  try {
    const supabase = getSupabaseAnonClient();
    const { data: emp } = await supabase
      .from('empresas')
      .select('pagos_mesa_habilitados')
      .eq('id', sesion.empresaId)
      .single();
    pagosHabilitados = (emp as { pagos_mesa_habilitados: boolean } | null)?.pagos_mesa_habilitados ?? false;
  } catch {
    // best-effort — default false
  }
```

Replace with:

```ts
  try {
    const supabase = getSupabaseAnonClient();
    const { data: emp } = await supabase
      .from('empresas')
      .select('pagos_mesa_habilitados, google_reviews_url')
      .eq('id', sesion.empresaId)
      .single();
    const empRow = emp as { pagos_mesa_habilitados: boolean; google_reviews_url: string | null } | null;
    pagosHabilitados = empRow?.pagos_mesa_habilitados ?? false;
    googleReviewsUrl = empRow?.google_reviews_url ?? null;
  } catch {
    // best-effort — default false/null
  }
```

- [ ] **Step 3: Add `googleReviewsUrl` to the final `return` statement**

Find (line 300):

```ts
  return NextResponse.json({ orders, sesionId: sesion.id, total, pagosHabilitados, division, sesionPagada, pagoEnCurso, divisionTipo, customTurno, itemsPagados, pagadoCents, itemsDiferidos, propinaCents });
```

Replace with:

```ts
  return NextResponse.json({ orders, sesionId: sesion.id, total, pagosHabilitados, division, sesionPagada, pagoEnCurso, divisionTipo, customTurno, itemsPagados, pagadoCents, itemsDiferidos, propinaCents, googleReviewsUrl });
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/mesas/[mesaId]/orders/route.ts
git commit -m "feat(api): include googleReviewsUrl in orders response"
```

---

## Task 8: POST /api/mesas/[mesaId]/valoracion

**Files:**
- Create: `src/app/api/mesas/[mesaId]/valoracion/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mesaSesionRepository, valoracionUseCase } from '@/core/infrastructure/database';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';

const mesaIdSchema = z.string().uuid();
const bodySchema = z.object({
  estrellas: z.number().min(0.5).max(5).multipleOf(0.5),
  sesion_id: z.string().uuid(),
  rater_id: z.string().uuid(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const { mesaId } = await params;
  const mesaParsed = mesaIdSchema.safeParse(mesaId);
  if (!mesaParsed.success) {
    return NextResponse.json({ error: 'mesaId inválido' }, { status: 400 });
  }

  const rateLimited = await rateLimitPublic(request as Parameters<typeof rateLimitPublic>[0]);
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const bodyParsed = bodySchema.safeParse(body);
  if (!bodyParsed.success) {
    return NextResponse.json({ error: bodyParsed.error.errors[0].message }, { status: 400 });
  }

  // Resolve empresaId from active session
  const sesionResult = await mesaSesionRepository.findActiveSesionByMesa(mesaParsed.data);
  if (!sesionResult.success) {
    return NextResponse.json({ error: 'Error al buscar sesión' }, { status: 500 });
  }
  if (!sesionResult.data) {
    return NextResponse.json({ error: 'No hay sesión activa para esta mesa' }, { status: 404 });
  }

  const result = await valoracionUseCase.create({
    empresaId: sesionResult.data.empresaId,
    mesaId: mesaParsed.data,
    mesaSesionId: bodyParsed.data.sesion_id,
    raterId: bodyParsed.data.rater_id,
    estrellas: bodyParsed.data.estrellas,
  });

  if (!result.success) {
    return NextResponse.json({ error: 'Error al guardar la valoración' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/mesas/[mesaId]/valoracion/route.ts
git commit -m "feat(api): POST /api/mesas/[mesaId]/valoracion"
```

---

## Task 9: GET /api/admin/valoraciones

**Files:**
- Create: `src/app/api/admin/valoraciones/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextRequest } from 'next/server';
import { requireAuth, handleResult, errorResponse } from '@/core/infrastructure/api/helpers';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
import { valoracionUseCase } from '@/core/infrastructure/database';
import { z } from 'zod';

const pageSchema = z.coerce.number().int().min(0).default(0);

export async function GET(request: NextRequest) {
  const rateLimited = await rateLimitAdmin(request);
  if (rateLimited) return rateLimited;

  const { empresaId, error } = await requireAuth(request);
  if (error) return error;

  const page = pageSchema.parse(request.nextUrl.searchParams.get('page') ?? '0');

  const [statsResult, listResult] = await Promise.all([
    valoracionUseCase.getStats(empresaId!),
    valoracionUseCase.list(empresaId!, page),
  ]);

  if (!statsResult.success) return handleResult(statsResult);
  if (!listResult.success) return handleResult(listResult);

  return handleResult({ success: true, data: { stats: statsResult.data, list: listResult.data } });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/admin/valoraciones/route.ts
git commit -m "feat(api): GET /api/admin/valoraciones"
```

---

## Task 10: StarRating Component

**Files:**
- Create: `src/components/star-rating.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useRef, useState } from 'react';

interface StarRatingProps {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  size?: number;
}

function StarIcon({ fill, size, id }: { fill: 'full' | 'half' | 'empty'; size: number; id: string }) {
  if (fill === 'full') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="#f5a623" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    );
  }
  if (fill === 'empty') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#d4c9b8" strokeWidth="1.5" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
          <stop offset="50%" stopColor="#f5a623" />
          <stop offset="50%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill={`url(#${id})`}
        stroke="#d4c9b8"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function StarRating({ value, onChange, disabled = false, size = 28 }: Readonly<StarRatingProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const displayValue = hoverValue ?? value;

  function getValueFromX(clientX: number): number {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0.5, Math.min(5, Math.round(ratio * 10) / 2));
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (disabled) return;
    setHoverValue(getValueFromX(e.touches[0].clientX));
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (disabled) return;
    const v = getValueFromX(e.changedTouches[0].clientX);
    setHoverValue(null);
    onChange(v);
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (disabled) return;
    setHoverValue(getValueFromX(e.clientX));
  }

  function handleMouseLeave() {
    setHoverValue(null);
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (disabled) return;
    onChange(getValueFromX(e.clientX));
  }

  return (
    <div
      ref={containerRef}
      className={`flex gap-0.5 ${disabled ? 'opacity-80' : 'cursor-pointer select-none'}`}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseUp={handleMouseUp}
      style={{ touchAction: 'none' }}
      role="slider"
      aria-valuenow={value}
      aria-valuemin={0.5}
      aria-valuemax={5}
      aria-disabled={disabled}
    >
      {[1, 2, 3, 4, 5].map(star => {
        let fill: 'full' | 'half' | 'empty';
        if (displayValue >= star) fill = 'full';
        else if (displayValue >= star - 0.5) fill = 'half';
        else fill = 'empty';
        return <StarIcon key={star} fill={fill} size={size} id={`star-half-${star}`} />;
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/star-rating.tsx
git commit -m "feat(ui): add StarRating component with half-star swipe support"
```

---

## Task 11: GoogleReviewsWidget Component

**Files:**
- Create: `src/components/google-reviews-widget.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { StarRating } from './star-rating';
import type { Language } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface GoogleReviewsWidgetProps {
  mesaId: string;
  sesionId: string | null;
  googleReviewsUrl: string | null;
  lang: Language;
}

function getRaterId(): string {
  try {
    const stored = localStorage.getItem('rater_id');
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem('rater_id', id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function getStoredRating(sesionId: string): number | null {
  try {
    const v = localStorage.getItem(`valoracion_${sesionId}`);
    return v !== null ? parseFloat(v) : null;
  } catch {
    return null;
  }
}

export function GoogleReviewsWidget({
  mesaId,
  sesionId,
  googleReviewsUrl,
  lang,
}: Readonly<GoogleReviewsWidgetProps>) {
  const [submitted, setSubmitted] = useState(false);
  const [submittedValue, setSubmittedValue] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const raterIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sesionId) return;
    raterIdRef.current = getRaterId();
    const stored = getStoredRating(sesionId);
    if (stored !== null) {
      setSubmittedValue(stored);
      setSubmitted(true);
    }
  }, [sesionId]);

  if (!sesionId || !googleReviewsUrl) return null;

  const handleChange = async (stars: number) => {
    if (submitted || submitting || !sesionId || !raterIdRef.current) return;
    setSubmitting(true);
    try {
      await fetch(`/api/mesas/${encodeURIComponent(mesaId)}/valoracion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estrellas: stars,
          sesion_id: sesionId,
          rater_id: raterIdRef.current,
        }),
      });
      try {
        localStorage.setItem(`valoracion_${sesionId}`, stars.toString());
      } catch { /* ignore */ }
      setSubmittedValue(stars);
      setSubmitted(true);
      if (stars >= 4 && googleReviewsUrl) {
        window.open(googleReviewsUrl, '_blank', 'noopener,noreferrer');
      }
    } catch { /* best-effort — no UI error */ }
    finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 py-3">
      <div className="flex items-center gap-2">
        <Image
          src="/g-reviews-icon.png"
          alt="Google Reviews"
          width={28}
          height={28}
          className="object-contain"
        />
        <StarRating
          value={submittedValue}
          onChange={handleChange}
          disabled={submitted || submitting}
          size={28}
        />
      </div>
      <p
        className="text-xs tracking-widest uppercase"
        style={{ color: '#b0a090', fontFamily: 'monospace' }}
      >
        {submitted ? t('mesaRatingThanks', lang) : t('mesaRateUs', lang)}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/google-reviews-widget.tsx
git commit -m "feat(ui): add GoogleReviewsWidget component"
```

---

## Task 12: Integrate Widget into mesa-orders-client.tsx

**Files:**
- Modify: `src/components/mesa-orders-client.tsx`

- [ ] **Step 1: Add `googleReviewsUrl` to the `MesaSessionData` interface**

Find this block (around line 51):

```ts
interface MesaSessionData {
  orders: MesaOrder[];
  sesionId: string | null;
  total: number;
  pagosHabilitados: boolean;
  division: DivisionState | null;
  sesionPagada: boolean;
  pagoEnCurso?: boolean;
  divisionTipo?: 'igual' | 'personalizado' | null;
  customTurno?: CustomTurno | null;
  itemsPagados?: ItemPagado[];
  pagadoCents?: number;
  itemsDiferidos?: unknown[];
  propinaCents?: number;
}
```

Replace with:

```ts
interface MesaSessionData {
  orders: MesaOrder[];
  sesionId: string | null;
  total: number;
  pagosHabilitados: boolean;
  division: DivisionState | null;
  sesionPagada: boolean;
  pagoEnCurso?: boolean;
  divisionTipo?: 'igual' | 'personalizado' | null;
  customTurno?: CustomTurno | null;
  itemsPagados?: ItemPagado[];
  pagadoCents?: number;
  itemsDiferidos?: unknown[];
  propinaCents?: number;
  googleReviewsUrl?: string | null;
}
```

- [ ] **Step 2: Add the import at the top of the file**

Find the existing import block (around line 3–13). After the last import line, add:

```tsx
import { GoogleReviewsWidget } from "@/components/google-reviews-widget";
```

- [ ] **Step 3: Add the widget inside the ticket header block**

Find this exact block (around lines 1843–1858):

```tsx
              {/* Header */}
              <div className="flex flex-col items-center py-5 gap-1">
                <p
                  className="text-xs tracking-[0.25em] uppercase"
                  style={{ color: "#8a7560", fontFamily: "monospace" }}
                >
                  {tableLabel}
                </p>
                <p
                  className="text-xs"
                  style={{ color: "#b0a090", fontFamily: "monospace" }}
                >
                  {dateStr} · {timeStr}
                </p>
              </div>

              <DottedRule />
```

Replace with:

```tsx
              {/* Header */}
              <div className="flex flex-col items-center py-5 gap-1">
                <p
                  className="text-xs tracking-[0.25em] uppercase"
                  style={{ color: "#8a7560", fontFamily: "monospace" }}
                >
                  {tableLabel}
                </p>
                <p
                  className="text-xs"
                  style={{ color: "#b0a090", fontFamily: "monospace" }}
                >
                  {dateStr} · {timeStr}
                </p>
              </div>

              {!isWaiterMode && (
                <GoogleReviewsWidget
                  mesaId={mesaId}
                  sesionId={sessionData.sesionId}
                  googleReviewsUrl={sessionData.googleReviewsUrl ?? null}
                  lang={lang}
                />
              )}

              <DottedRule />
```

- [ ] **Step 4: Lint + build check**

```bash
pnpm lint && pnpm build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/mesa-orders-client.tsx
git commit -m "feat(ui): integrate GoogleReviewsWidget into mesa ticket header"
```

---

## Task 13: Translations

**Files:**
- Modify: `src/lib/translations.ts`

This file has one block per language. Add 5 new keys to each language. The pattern: each language block is a flat object. Find a nearby key to use as an anchor.

- [ ] **Step 1: Spanish (es) — add after `mesaPropinaAceptada`**

Find:
```ts
    mesaPropinaAceptada: "Propina aceptada",
```

Add immediately after:
```ts
    mesaRateUs: "¿Cómo fue tu experiencia?",
    mesaRatingThanks: "Gracias por tu valoración",
    adminValoraciones: "Valoraciones",
    adminValoracionesMedia: "Media",
    adminValoracionesTotal: "Total valoraciones",
```

- [ ] **Step 2: English (en) — add after `mesaPropinaAceptada`**

Find:
```ts
    mesaPropinaAceptada: "Tip accepted",
```

Add immediately after:
```ts
    mesaRateUs: "How was your experience?",
    mesaRatingThanks: "Thanks for your rating!",
    adminValoraciones: "Ratings",
    adminValoracionesMedia: "Average",
    adminValoracionesTotal: "Total ratings",
```

- [ ] **Step 3: French (fr) — add after `mesaPropinaAceptada`**

Find:
```ts
    mesaPropinaAceptada: "Pourboire accepté",
```

Add immediately after:
```ts
    mesaRateUs: "Comment était votre expérience ?",
    mesaRatingThanks: "Merci pour votre avis !",
    adminValoraciones: "Avis",
    adminValoracionesMedia: "Moyenne",
    adminValoracionesTotal: "Total des avis",
```

- [ ] **Step 4: Italian (it) — add after `mesaPropinaAceptada`**

Find:
```ts
    mesaPropinaAceptada: "Mancia accettata",
```

Add immediately after:
```ts
    mesaRateUs: "Com'è stata la tua esperienza?",
    mesaRatingThanks: "Grazie per la tua valutazione!",
    adminValoraciones: "Valutazioni",
    adminValoracionesMedia: "Media",
    adminValoracionesTotal: "Totale valutazioni",
```

- [ ] **Step 5: German (de) — add after `mesaPropinaAceptada`**

Find:
```ts
    mesaPropinaAceptada: "Trinkgeld akzeptiert",
```

Add immediately after:
```ts
    mesaRateUs: "Wie war Ihre Erfahrung?",
    mesaRatingThanks: "Danke für Ihre Bewertung!",
    adminValoraciones: "Bewertungen",
    adminValoracionesMedia: "Durchschnitt",
    adminValoracionesTotal: "Gesamtbewertungen",
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/translations.ts
git commit -m "feat(i18n): add rating and admin valoraciones translation keys (5 langs)"
```

---

## Task 14: Admin Sidebar Entry

**Files:**
- Modify: `src/app/admin/(protected)/admin-sidebar.tsx`

- [ ] **Step 1: Add the Star icon import**

Find the existing import:
```ts
import { LayoutDashboard, Package, Tags, LogOut, Menu, X, ShoppingCart, BarChart3, Users, Megaphone, Settings, ExternalLink, ShoppingBag, UtensilsCrossed, MapPin } from 'lucide-react';
```

Replace with:
```ts
import { LayoutDashboard, Package, Tags, LogOut, Menu, X, ShoppingCart, BarChart3, Users, Megaphone, Settings, ExternalLink, ShoppingBag, UtensilsCrossed, MapPin, Star } from 'lucide-react';
```

- [ ] **Step 2: Add the Valoraciones nav item**

Find:
```ts
  { href: '/admin/mesas', labelKey: 'sidebarMesas', icon: UtensilsCrossed, requiresRestaurant: true },
```

Add immediately after:
```ts
  { href: '/admin/valoraciones', labelKey: 'adminValoraciones', icon: Star, requiresRestaurant: true },
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/(protected)/admin-sidebar.tsx
git commit -m "feat(admin): add Valoraciones sidebar entry for restaurant tipo"
```

---

## Task 15: Admin Valoraciones Page

**Files:**
- Create: `src/app/admin/(protected)/valoraciones/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface ValoracionItem {
  id: string;
  mesaId: string | null;
  estrellas: number;
  createdAt: string;
}

interface ValoracionStats {
  media: number;
  total: number;
  distribucion: Record<string, number>;
}

interface ValoracionData {
  stats: ValoracionStats;
  list: ValoracionItem[];
}

function StarDisplay({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star
          key={s}
          size={size}
          fill={value >= s ? '#f5a623' : value >= s - 0.5 ? '#f5a623' : 'none'}
          stroke={value >= s - 0.5 ? '#f5a623' : '#d4c9b8'}
          style={value >= s - 0.5 && value < s ? { clipPath: 'inset(0 50% 0 0)' } : undefined}
        />
      ))}
    </span>
  );
}

export default function ValoracionesPage() {
  const { language } = useLanguage();
  const [data, setData] = useState<ValoracionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetchWithCsrf(`/api/admin/valoraciones?page=${page}`)
      .then(r => r.json())
      .then((d: ValoracionData) => setData(d))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-white mb-6">
        {t('adminValoraciones', language)}
      </h1>

      {loading && !data && (
        <p className="text-slate-400">Cargando...</p>
      )}

      {data && (
        <>
          {/* Stats card */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-slate-800 rounded-2xl p-5 border border-white/10">
              <p className="text-slate-400 text-sm mb-1">{t('adminValoracionesMedia', language)}</p>
              <p className="text-4xl font-bold text-white mb-2">{data.stats.media.toFixed(1)}</p>
              <StarDisplay value={data.stats.media} size={20} />
            </div>
            <div className="bg-slate-800 rounded-2xl p-5 border border-white/10">
              <p className="text-slate-400 text-sm mb-1">{t('adminValoracionesTotal', language)}</p>
              <p className="text-4xl font-bold text-white">{data.stats.total}</p>
            </div>
          </div>

          {/* Distribution */}
          <div className="bg-slate-800 rounded-2xl p-5 border border-white/10 mb-6">
            {['5', '4', '3', '2', '1'].map(bucket => {
              const count = data.stats.distribucion[bucket] ?? 0;
              const pct = data.stats.total > 0 ? (count / data.stats.total) * 100 : 0;
              return (
                <div key={bucket} className="flex items-center gap-3 mb-2">
                  <span className="text-slate-300 text-sm w-4">{bucket}</span>
                  <Star size={14} fill="#f5a623" stroke="#f5a623" />
                  <div className="flex-1 bg-slate-700 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-amber-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-slate-400 text-xs w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>

          {/* Recent list */}
          {data.list.length > 0 && (
            <div className="bg-slate-800 rounded-2xl border border-white/10 overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-slate-400 px-4 py-3 font-medium">Fecha</th>
                    <th className="text-left text-slate-400 px-4 py-3 font-medium">Mesa</th>
                    <th className="text-left text-slate-400 px-4 py-3 font-medium">Estrellas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.list.map(v => (
                    <tr key={v.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-slate-300">
                        {new Date(v.createdAt).toLocaleDateString(language, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{v.mesaId ?? '—'}</td>
                      <td className="px-4 py-3">
                        <StarDisplay value={v.estrellas} size={14} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm disabled:opacity-40 hover:bg-slate-600 transition-colors"
            >
              Anterior
            </button>
            <button
              disabled={data.list.length < 20}
              onClick={() => setPage(p => p + 1)}
              className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm disabled:opacity-40 hover:bg-slate-600 transition-colors"
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Lint + build check**

```bash
pnpm lint && pnpm build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/(protected)/valoraciones/page.tsx
git commit -m "feat(admin): add /admin/valoraciones ratings dashboard page"
```

---

## Task 16: Superadmin — google_reviews_url Column

**Files:**
- Modify: `src/core/infrastructure/database/SupabaseSuperAdminRepository.ts`
- Modify: `src/app/superadmin/empresas-table.tsx`
- Modify: `src/app/api/superadmin/empresas/[id]/route.ts`

### 16a: Repository

- [ ] **Step 1: Read SupabaseSuperAdminRepository to find the select string and EmpresaRow shape**

The `EmpresaRow` interface already contains many fields. Add `google_reviews_url: string | null;` to it.

In the `.select()` call in `getAllEmpresas()`, find the existing column list (it's a long string) and append `, google_reviews_url` to it.

In the mapper from `EmpresaRow` to the return type, add:
```ts
googleReviewsUrl: row.google_reviews_url ?? null,
```

Also add `googleReviewsUrl: string | null;` to the mapped return type / `EmpresaWithStats` interface in `ISuperAdminRepository.ts`.

- [ ] **Step 2: Check ISuperAdminRepository shape**

Open `src/core/domain/repositories/ISuperAdminRepository.ts`, find the `EmpresaWithStats` interface (or equivalent return type of `getAllEmpresas`), and add:
```ts
  googleReviewsUrl: string | null;
```

### 16b: Superadmin API [id] route

- [ ] **Step 3: Read `src/app/api/superadmin/empresas/[id]/route.ts`**

Find the PUT handler's Zod schema or the destructuring of the body. Add acceptance of `google_reviews_url`:

```ts
google_reviews_url: z.string().url().nullable().optional(),
```

In the `UpdateEmpresaData` call or direct DB update payload, forward it:

```ts
if (data.google_reviews_url !== undefined) updatePayload.google_reviews_url = data.google_reviews_url;
```

### 16c: EmpresaTableRow UI

- [ ] **Step 4: Add `googleReviewsUrl` to the `EmpresaRow` interface in `empresas-table.tsx`**

```ts
  googleReviewsUrl: string | null;
```

- [ ] **Step 5: Add the inline-editable field in `EmpresaTableRow`**

Find where other inline text inputs are rendered (look for a field like `email_notification` or similar inline text edit in the row). Add a new section with the same pattern:

```tsx
<GoogleReviewsField empresaId={empresa.id} initialValue={empresa.googleReviewsUrl} />
```

Create a small inline component `GoogleReviewsField` inside `empresas-table.tsx` following the same `ModuloSwitch` pattern but for text:

```tsx
function GoogleReviewsField({ empresaId, initialValue }: { readonly empresaId: string; readonly initialValue: string | null }) {
  const [value, setValue] = useState(initialValue ?? '');
  const [saving, setSaving] = useState(false);

  const handleBlur = async () => {
    setSaving(true);
    try {
      await fetchWithCsrf(`/api/superadmin/empresas/${empresaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ google_reviews_url: value || null }),
      });
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="url"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={handleBlur}
        placeholder="https://g.page/r/..."
        className="text-xs bg-slate-700 border border-white/10 rounded px-2 py-1 text-slate-200 w-48 focus:outline-none focus:border-cyan-400"
        aria-label="Google Reviews URL"
      />
      {saving && <span className="text-xs text-slate-400">...</span>}
    </div>
  );
}
```

- [ ] **Step 6: Lint + build check**

```bash
pnpm lint && pnpm build
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/core/infrastructure/database/SupabaseSuperAdminRepository.ts \
        src/core/domain/repositories/ISuperAdminRepository.ts \
        src/app/superadmin/empresas-table.tsx \
        src/app/api/superadmin/empresas/[id]/route.ts
git commit -m "feat(superadmin): add Google Reviews URL editable field per empresa"
```

---

## Self-Review Checklist

- [x] **Spec § 1** — Migration creates `google_reviews_url` on `empresas` and `valoraciones` table with unique index on `(mesa_sesion_id, rater_id)` ✅ Task 1
- [x] **Spec § 2** — `Empresa.googleReviewsUrl` + `Valoracion` + `ValoracionStats` entities ✅ Task 2
- [x] **Spec § 3** — `IValoracionRepository` with `create`, `getStatsByEmpresa`, `listByEmpresa` ✅ Task 3
- [x] **Spec § 3.2** — `EmpresaRepository` updated — covered via orders route direct query (Task 7), not the full empresa repository chain; simpler and sufficient
- [x] **Spec § 4** — POST `/api/mesas/[mesaId]/valoracion` ✅ Task 8
- [x] **Spec § 5.1** — `StarRating` with touch + mouse, half-star ✅ Task 10
- [x] **Spec § 5.2** — `GoogleReviewsWidget` — `rater_id` from localStorage, submit logic, redirect ≥4, thanks message ✅ Task 11
- [x] **Spec § 5.3** — widget in ticket header, guarded by `!isWaiterMode` ✅ Task 12
- [x] **Spec § 6** — Admin `/admin/valoraciones` page with stats + distribution + list ✅ Task 15
- [x] **Spec § 6.2** — Sidebar entry with `requiresRestaurant: true` ✅ Task 14
- [x] **Spec § 7** — Superadmin `google_reviews_url` column ✅ Task 16
- [x] **Spec § 8** — Translations in 5 languages ✅ Task 13
- [x] **rater_id device pattern** — `getRaterId()` generates UUID, persists in `localStorage['rater_id']`, sent in body, stored in unique index ✅ Task 11
