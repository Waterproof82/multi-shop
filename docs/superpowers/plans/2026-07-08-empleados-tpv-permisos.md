# Empleados TPV — Permisos y PIN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PIN-authenticated employees (cajero/encargado) to the TPV with role-scoped permissions, a `/tpv/login` page, employee management in admin panel, and blind cierre de caja for cajeros.

**Architecture:** New `empleados_tpv` table + `tpv_employee_token` JWT (1h, sliding-window with late-refresh). Proxy tries `admin_token` first on `/api/tpv/*`, falls back to `tpv_employee_token`. TPV layout checks both cookies and injects role into `TpvRolContext`. Permission gates live in layout/page server components, not client components.

**Tech Stack:** Next.js App Router, jose (JWT), Supabase (service_role), Zod, `hashPin` from `@/lib/waiter-auth`, `fetchWithCsrf` for mutative client calls.

---

## File Map

| File | Action |
|---|---|
| `supabase/migrations/20260708000001_empleados_tpv.sql` | Create |
| `src/core/domain/repositories/IEmpleadoTpvRepository.ts` | Create |
| `src/core/domain/repositories/ITpvRepository.ts` | Modify — add `operadorId?` to `abrirTurno` |
| `src/core/infrastructure/repositories/supabase-empleado-tpv.repository.ts` | Create |
| `src/core/infrastructure/repositories/supabase-tpv.repository.ts` | Modify — pass `operador_id` in insert |
| `src/core/infrastructure/database/index.ts` | Modify — export employee repo + use case |
| `src/lib/tpv-employee-auth.ts` | Create |
| `src/core/application/use-cases/tpv/empleado-tpv-login.use-case.ts` | Create |
| `src/app/api/tpv/empleados/login/route.ts` | Create |
| `src/app/api/tpv/empleados/logout/route.ts` | Create |
| `src/proxy.ts` | Modify — dual-auth for `/api/tpv/*`, `x-pathname` header, late-window refresh |
| `src/app/tpv/login/page.tsx` | Create |
| `src/components/tpv/TpvLoginForm.tsx` | Create |
| `src/lib/tpv-rol-context.tsx` | Modify — add `isEmployeeSession` |
| `src/app/tpv/layout.tsx` | Modify — dual-cookie auth, skip `/tpv/login` |
| `src/app/tpv/turno/abrir/page.tsx` | Modify — read employee token, pre-fill name |
| `src/components/tpv/TurnoAbrirForm.tsx` | Modify — accept `defaultOperador` + `operadorId` props |
| `src/app/api/tpv/turno/route.ts` | Modify — read `x-employee-id`, pass `operadorId` |
| `src/core/application/use-cases/tpv/abrir-turno.use-case.ts` | Modify — optional `userId`/`operadorId` |
| `src/components/tpv/TpvHeader.tsx` | Modify — gear admin-only, hide Mermas for cajero, lock button |
| `src/app/tpv/mermas/layout.tsx` | Modify — also check `tpv_employee_token` |
| `src/app/tpv/turno/cerrar/page.tsx` | Modify — remove cajero redirect, pass `isBlindClose` |
| `src/components/tpv/TurnoCerrarForm.tsx` | Modify — accept `isBlindClose` prop |
| `src/app/api/tpv/turno/[id]/cerrar/route.ts` | Modify — allow cajero, compute total server-side |
| `src/app/api/admin/empleados-tpv/route.ts` | Create |
| `src/app/api/admin/empleados-tpv/[id]/route.ts` | Create |
| `src/components/admin/EmpleadosTpvPanel.tsx` | Create |
| `src/components/admin/configuracion-page-client.tsx` | Modify — add Empleados tab |
| `src/app/admin/(protected)/configuracion/page.tsx` | Modify — pass `empresaId` to panel |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260708000001_empleados_tpv.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ================================================================
-- 1. NEW TABLE: empleados_tpv
-- ================================================================
CREATE TABLE public.empleados_tpv (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre      TEXT        NOT NULL,
  rol         TEXT        NOT NULL CHECK (rol IN ('cajero', 'encargado')),
  pin_hash    TEXT        NOT NULL,
  activo      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique PIN per empresa (active employees only)
CREATE UNIQUE INDEX uq_empleados_tpv_pin_empresa
  ON public.empleados_tpv (empresa_id, pin_hash)
  WHERE activo = true;

CREATE INDEX idx_empleados_tpv_empresa ON public.empleados_tpv (empresa_id);

-- RLS
ALTER TABLE public.empleados_tpv ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to empleados_tpv"
  ON public.empleados_tpv FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve empleados_tpv"
  ON public.empleados_tpv FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin gestiona empleados_tpv"
  ON public.empleados_tpv FOR INSERT TO authenticated
  WITH CHECK (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin edita empleados_tpv"
  ON public.empleados_tpv FOR UPDATE TO authenticated
  USING (empresa_id = get_mi_empresa_id())
  WITH CHECK (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin borra empleados_tpv"
  ON public.empleados_tpv FOR DELETE TO authenticated
  USING (empresa_id = get_mi_empresa_id());

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empleados_tpv TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empleados_tpv TO authenticated;

-- ================================================================
-- 2. ALTER tpv_turnos: add operador_id + make user_id nullable
-- ================================================================
ALTER TABLE public.tpv_turnos
  ADD COLUMN operador_id UUID REFERENCES public.empleados_tpv(id) ON DELETE SET NULL;

-- user_id must be nullable for employee-opened turnos (no auth.users UUID)
ALTER TABLE public.tpv_turnos ALTER COLUMN user_id DROP NOT NULL;
```

- [ ] **Step 2: Apply migration**

```bash
# Apply via Supabase dashboard SQL editor OR CLI:
# supabase db push (if local)
# Or paste into Supabase dashboard → SQL Editor
```

Expected: Table `empleados_tpv` created, `tpv_turnos.operador_id` column added, `user_id` now nullable.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260708000001_empleados_tpv.sql
git commit -m "feat(db): add empleados_tpv table + operador_id on tpv_turnos"
```

---

## Task 2: Domain Layer

**Files:**
- Create: `src/core/domain/repositories/IEmpleadoTpvRepository.ts`
- Modify: `src/core/domain/repositories/ITpvRepository.ts`

- [ ] **Step 1: Create `IEmpleadoTpvRepository.ts`**

```typescript
import type { Result } from '@/core/domain/entities/types';

export interface EmpleadoTpv {
  id: string;
  empresaId: string;
  nombre: string;
  rol: 'cajero' | 'encargado';
  pinHash: string;
  activo: boolean;
  createdAt: string;
}

export interface CreateEmpleadoTpvDto {
  empresaId: string;
  nombre: string;
  rol: 'cajero' | 'encargado';
  pinHash: string;
}

export interface IEmpleadoTpvRepository {
  findActiveByPinHash(empresaId: string, pinHash: string): Promise<Result<EmpleadoTpv | null>>;
  findAllByEmpresa(empresaId: string): Promise<Result<EmpleadoTpv[]>>;
  create(dto: CreateEmpleadoTpvDto): Promise<Result<EmpleadoTpv>>;
  updatePin(id: string, empresaId: string, pinHash: string): Promise<Result<void>>;
  setActivo(id: string, empresaId: string, activo: boolean): Promise<Result<void>>;
  delete(id: string, empresaId: string): Promise<Result<void>>;
  isActivo(id: string): Promise<Result<boolean>>;
}
```

- [ ] **Step 2: Update `ITpvRepository.ts` — add optional `operadorId` to `abrirTurno`**

Read `src/core/domain/repositories/ITpvRepository.ts` first, then replace the `abrirTurno` signature:

```typescript
abrirTurno(params: {
  empresaId: string;
  userId?: string;          // auth.users UUID — null for employee sessions
  operadorId?: string;      // empleados_tpv UUID — null for admin sessions
  operadorNombre: string;
  efectivoAperturaCents: number;
}): Promise<Result<TpvTurno>>;
```

- [ ] **Step 3: Commit**

```bash
git add src/core/domain/repositories/IEmpleadoTpvRepository.ts
git add src/core/domain/repositories/ITpvRepository.ts
git commit -m "feat(domain): IEmpleadoTpvRepository + update ITpvRepository.abrirTurno"
```

---

## Task 3: Repository Implementation

**Files:**
- Create: `src/core/infrastructure/repositories/supabase-empleado-tpv.repository.ts`
- Modify: `src/core/infrastructure/repositories/supabase-tpv.repository.ts`
- Modify: `src/core/infrastructure/database/index.ts`

- [ ] **Step 1: Create `supabase-empleado-tpv.repository.ts`**

```typescript
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import type { IEmpleadoTpvRepository, EmpleadoTpv, CreateEmpleadoTpvDto } from '@/core/domain/repositories/IEmpleadoTpvRepository';
import type { Result } from '@/core/domain/entities/types';
import { logger } from '../logging/logger';

function mapRow(row: Record<string, unknown>): EmpleadoTpv {
  return {
    id: row.id as string,
    empresaId: row.empresa_id as string,
    nombre: row.nombre as string,
    rol: row.rol as 'cajero' | 'encargado',
    pinHash: row.pin_hash as string,
    activo: row.activo as boolean,
    createdAt: row.created_at as string,
  };
}

export class SupabaseEmpleadoTpvRepository implements IEmpleadoTpvRepository {
  private get supabase() { return getSupabaseClient(); }

  async findActiveByPinHash(empresaId: string, pinHash: string): Promise<Result<EmpleadoTpv | null>> {
    try {
      const { data, error } = await this.supabase
        .from('empleados_tpv')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('pin_hash', pinHash)
        .eq('activo', true)
        .maybeSingle();
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'findActiveByPinHash') };
      return { success: true, data: data ? mapRow(data as Record<string, unknown>) : null };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findActiveByPinHash') };
    }
  }

  async findAllByEmpresa(empresaId: string): Promise<Result<EmpleadoTpv[]>> {
    try {
      const { data, error } = await this.supabase
        .from('empleados_tpv')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: true });
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'findAllByEmpresa') };
      return { success: true, data: (data ?? []).map(r => mapRow(r as Record<string, unknown>)) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'findAllByEmpresa') };
    }
  }

  async create(dto: CreateEmpleadoTpvDto): Promise<Result<EmpleadoTpv>> {
    try {
      const { data, error } = await this.supabase
        .from('empleados_tpv')
        .insert({ empresa_id: dto.empresaId, nombre: dto.nombre, rol: dto.rol, pin_hash: dto.pinHash })
        .select()
        .single();
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'create') };
      return { success: true, data: mapRow(data as Record<string, unknown>) };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'create') };
    }
  }

  async updatePin(id: string, empresaId: string, pinHash: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('empleados_tpv')
        .update({ pin_hash: pinHash })
        .eq('id', id)
        .eq('empresa_id', empresaId);
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'updatePin') };
      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'updatePin') };
    }
  }

  async setActivo(id: string, empresaId: string, activo: boolean): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('empleados_tpv')
        .update({ activo })
        .eq('id', id)
        .eq('empresa_id', empresaId);
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'setActivo') };
      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'setActivo') };
    }
  }

  async delete(id: string, empresaId: string): Promise<Result<void>> {
    try {
      const { error } = await this.supabase
        .from('empleados_tpv')
        .delete()
        .eq('id', id)
        .eq('empresa_id', empresaId);
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'delete') };
      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'delete') };
    }
  }

  async isActivo(id: string): Promise<Result<boolean>> {
    try {
      const { data, error } = await this.supabase
        .from('empleados_tpv')
        .select('activo')
        .eq('id', id)
        .maybeSingle();
      if (error) return { success: false, error: await logger.logFromCatch(error, 'repository', 'isActivo') };
      return { success: true, data: (data as { activo: boolean } | null)?.activo ?? false };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'isActivo') };
    }
  }
}
```

- [ ] **Step 2: Update `supabase-tpv.repository.ts` — pass `operadorId` in `abrirTurno`**

Read the file first, then update the `abrirTurno` method signature and insert:

```typescript
// New signature (lines ~70-107):
async abrirTurno(params: {
  empresaId: string;
  userId?: string;
  operadorId?: string;
  operadorNombre: string;
  efectivoAperturaCents: number;
}): Promise<Result<TpvTurno>> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('tpv_turnos')
      .insert({
        empresa_id: params.empresaId,
        user_id: params.userId ?? null,
        operador_id: params.operadorId ?? null,
        operador_nombre: params.operadorNombre,
        efectivo_apertura_cents: params.efectivoAperturaCents,
      })
      .select()
      .single();

    if (error) {
      return {
        success: false,
        error: await logger.logFromCatch(error, 'repository', 'abrirTurno'),
      };
    }

    return { success: true, data: mapRow(data as Record<string, unknown>) };
  } catch (e) {
    return {
      success: false,
      error: await logger.logFromCatch(e, 'repository', 'abrirTurno'),
    };
  }
}
```

- [ ] **Step 3: Update `database/index.ts` — add employee repo + use case singleton**

Read the file first, then add these lines after existing imports/instantiations:

```typescript
// Add import at top:
import { SupabaseEmpleadoTpvRepository } from './supabase-empleado-tpv.repository';
import { EmpleadoTpvLoginUseCase } from '@/core/application/use-cases/tpv/empleado-tpv-login.use-case';

// Add after the other repository instantiations:
export const empleadoTpvRepository = new SupabaseEmpleadoTpvRepository();
export const empleadoTpvLoginUseCase = new EmpleadoTpvLoginUseCase(empleadoTpvRepository);
```

- [ ] **Step 4: Commit**

```bash
git add src/core/infrastructure/repositories/supabase-empleado-tpv.repository.ts
git add src/core/infrastructure/repositories/supabase-tpv.repository.ts
git add src/core/infrastructure/database/index.ts
git commit -m "feat(infra): SupabaseEmpleadoTpvRepository + update abrirTurno"
```

---

## Task 4: Auth Library

**Files:**
- Create: `src/lib/tpv-employee-auth.ts`

- [ ] **Step 1: Write the auth library**

```typescript
import { SignJWT, jwtVerify } from 'jose';

export interface TpvEmployeeTokenPayload {
  empleadoId: string;
  empresaId: string;
  nombre: string;
  rol: 'cajero' | 'encargado';
}

export interface TpvEmployeeTokenVerified extends TpvEmployeeTokenPayload {
  exp: number;
}

const AUDIENCE = 'tpv-employee';
const EXPIRY = '1h';

function getSecret(): Uint8Array {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) throw new Error('ACCESS_TOKEN_SECRET is not configured');
  return new TextEncoder().encode(secret);
}

export async function signTpvEmployeeToken(payload: TpvEmployeeTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecret());
}

export async function verifyTpvEmployeeToken(token: string): Promise<TpvEmployeeTokenVerified | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { audience: AUDIENCE });
    const { empleadoId, empresaId, nombre, rol, exp } = payload as Record<string, unknown>;
    if (
      typeof empleadoId !== 'string' ||
      typeof empresaId !== 'string' ||
      typeof nombre !== 'string' ||
      (rol !== 'cajero' && rol !== 'encargado') ||
      typeof exp !== 'number'
    ) return null;
    return { empleadoId, empresaId, nombre, rol, exp };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/tpv-employee-auth.ts
git commit -m "feat(auth): tpv-employee-auth library (sign/verify tpv_employee_token)"
```

---

## Task 5: Login Use Case

**Files:**
- Create: `src/core/application/use-cases/tpv/empleado-tpv-login.use-case.ts`
- Modify: `src/core/application/use-cases/tpv/abrir-turno.use-case.ts`

- [ ] **Step 1: Create `empleado-tpv-login.use-case.ts`**

```typescript
import { hashPin } from '@/lib/waiter-auth';
import type { IEmpleadoTpvRepository } from '@/core/domain/repositories/IEmpleadoTpvRepository';
import type { TpvEmployeeTokenPayload } from '@/lib/tpv-employee-auth';
import type { Result } from '@/core/domain/entities/types';

export class EmpleadoTpvLoginUseCase {
  constructor(private readonly repo: IEmpleadoTpvRepository) {}

  async execute(pin: string, empresaId: string): Promise<Result<TpvEmployeeTokenPayload>> {
    const pinHash = await hashPin(pin, empresaId);
    const result = await this.repo.findActiveByPinHash(empresaId, pinHash);

    if (!result.success) return result;
    if (!result.data) {
      return {
        success: false,
        error: { code: 'INVALID_PIN', message: 'PIN incorrecto', module: 'use-case', method: 'EmpleadoTpvLoginUseCase' },
      };
    }

    const e = result.data;
    return {
      success: true,
      data: { empleadoId: e.id, empresaId: e.empresaId, nombre: e.nombre, rol: e.rol },
    };
  }
}
```

- [ ] **Step 2: Update `abrir-turno.use-case.ts` — make `userId` optional, add `operadorId`**

Read the file first, then replace:

```typescript
import { ITpvRepository } from '@/core/domain/repositories/ITpvRepository';
import { TpvTurno } from '@/core/domain/entities/tpv-types';
import { Result, AppError } from '@/core/domain/entities/types';

interface AbrirTurnoInput {
  empresaId: string;
  userId?: string;
  operadorId?: string;
  operadorNombre: string;
  efectivoAperturaCents: number;
}

export async function abrirTurnoUseCase(
  repo: ITpvRepository,
  input: AbrirTurnoInput,
): Promise<Result<TpvTurno, AppError>> {
  if (!input.operadorNombre.trim()) {
    return {
      success: false,
      error: {
        code: 'TPV_OPERADOR_REQUERIDO',
        message: 'El nombre del operador es obligatorio',
        module: 'use-case',
        method: 'abrirTurnoUseCase',
      },
    };
  }

  const activo = await repo.findTurnoActivo(input.empresaId);
  if (!activo.success) return activo as Result<TpvTurno, AppError>;
  if (activo.data !== null) {
    return {
      success: false,
      error: {
        code: 'TPV_TURNO_YA_ABIERTO',
        message: 'Ya hay un turno activo para esta empresa',
        module: 'use-case',
        method: 'abrirTurnoUseCase',
      },
    };
  }

  return repo.abrirTurno({
    empresaId: input.empresaId,
    userId: input.userId,
    operadorId: input.operadorId,
    operadorNombre: input.operadorNombre.trim(),
    efectivoAperturaCents: input.efectivoAperturaCents,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/core/application/use-cases/tpv/empleado-tpv-login.use-case.ts
git add src/core/application/use-cases/tpv/abrir-turno.use-case.ts
git commit -m "feat(use-case): EmpleadoTpvLoginUseCase + update abrirTurnoUseCase"
```

---

## Task 6: Login + Logout API Routes

**Files:**
- Create: `src/app/api/tpv/empleados/login/route.ts`
- Create: `src/app/api/tpv/empleados/logout/route.ts`

- [ ] **Step 1: Create login route**

```typescript
// src/app/api/tpv/empleados/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDomainFromHeaders, parseMainDomain } from '@/lib/domain-utils';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { rateLimitAdmin } from '@/core/infrastructure/api/rate-limit';
import { empleadoTpvLoginUseCase } from '@/core/infrastructure/database';
import { signTpvEmployeeToken } from '@/lib/tpv-employee-auth';

const LoginSchema = z.object({
  pin: z.string().min(4).max(8).regex(/^\d+$/, 'Solo dígitos'),
});

export async function POST(req: NextRequest) {
  const rateLimited = await rateLimitAdmin(req);
  if (rateLimited) return rateLimited;

  const domain = await getDomainFromHeaders();
  const mainDomain = parseMainDomain(domain);

  const supabase = getSupabaseClient();
  const { data: empresa } = await supabase
    .from('empresas')
    .select('id')
    .eq('dominio', mainDomain)
    .maybeSingle();

  if (!empresa) {
    return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'PIN inválido' }, { status: 400 });
  }

  const result = await empleadoTpvLoginUseCase.execute(parsed.data.pin, empresa.id as string);
  if (!result.success) {
    return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 });
  }

  const token = await signTpvEmployeeToken(result.data);

  const response = NextResponse.json({ ok: true });
  response.cookies.set('tpv_employee_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60,
  });
  return response;
}
```

- [ ] **Step 2: Create logout route**

```typescript
// src/app/api/tpv/empleados/logout/route.ts
import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set('tpv_employee_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tpv/empleados/login/route.ts
git add src/app/api/tpv/empleados/logout/route.ts
git commit -m "feat(api): POST /api/tpv/empleados/login + logout"
```

---

## Task 7: Proxy Changes

**Files:**
- Modify: `src/proxy.ts`

Read `src/proxy.ts` in full before editing.

- [ ] **Step 1: Add import for tpv-employee-auth**

At the top of the file, add after the existing waiter import:

```typescript
import { verifyTpvEmployeeToken, signTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
```

- [ ] **Step 2: Add `handleTpvEmployeeAuth` function**

Add this function after `handleWaiterAuth`:

```typescript
async function handleTpvEmployeeAuth(request: NextRequest, origin: string | null): Promise<NextResponse> {
  const token = request.cookies.get('tpv_employee_token')?.value;
  if (!token) {
    return addCorsHeaders(
      NextResponse.json(createErrorResponse(AUTH_ERRORS.UNAUTHORIZED), { status: 401 }),
      origin
    );
  }

  const payload = await verifyTpvEmployeeToken(token);
  if (!payload) {
    return addCorsHeaders(
      NextResponse.json(createErrorResponse(AUTH_ERRORS.INVALID_TOKEN), { status: 401 }),
      origin
    );
  }

  // CSRF check for mutative methods
  const isMutativeMethod = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method);
  if (isMutativeMethod) {
    const csrfCookie = request.cookies.get('csrf_token')?.value;
    const csrfHeader = request.headers.get('x-csrf-token');
    if (!csrfHeader || !csrfCookie) {
      return addCorsHeaders(
        NextResponse.json(createErrorResponse(AUTH_ERRORS.CSRF_REQUIRED), { status: 403 }),
        origin
      );
    }
    const [tokenCsrf, signature] = csrfCookie.split(':');
    const csrfHeaderMatchesToken = (() => {
      try { return timingSafeEqual(Buffer.from(csrfHeader), Buffer.from(tokenCsrf)); }
      catch { return false; }
    })();
    if (!tokenCsrf || !signature || !verifyCsrfToken(tokenCsrf, signature) || !csrfHeaderMatchesToken) {
      return addCorsHeaders(
        NextResponse.json(createErrorResponse(AUTH_ERRORS.CSRF_INVALID), { status: 403 }),
        origin
      );
    }
  }

  // Late-window refresh: if token expires in < 15 min, verify employee is still active
  const now = Math.floor(Date.now() / 1000);
  const REFRESH_THRESHOLD_SECS = 15 * 60;
  let refreshedToken: string | undefined;

  if (payload.exp - now < REFRESH_THRESHOLD_SECS) {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('empleados_tpv')
      .select('id')
      .eq('id', payload.empleadoId)
      .eq('activo', true)
      .maybeSingle();

    if (data) {
      refreshedToken = await signTpvEmployeeToken({
        empleadoId: payload.empleadoId,
        empresaId: payload.empresaId,
        nombre: payload.nombre,
        rol: payload.rol,
      });
    }
    // If not active, don't renew — token will expire within 15 min
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-empresa-id', payload.empresaId);
  requestHeaders.set('x-admin-rol', payload.rol);
  requestHeaders.set('x-employee-id', payload.empleadoId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-empresa-id', payload.empresaId);
  response.headers.set('x-admin-rol', payload.rol);
  response.headers.set('x-employee-id', payload.empleadoId);

  if (refreshedToken) {
    response.cookies.set('tpv_employee_token', refreshedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60,
    });
  }

  return addCorsHeaders(response, origin);
}
```

- [ ] **Step 3: Replace the TPV route block in `proxy()` function**

Find the current block:
```typescript
// TPV auth (protected routes — same admin token as /api/admin)
if (path.startsWith('/api/tpv')) {
  return handleAdminAuth(request, origin);
}
```

Replace with:
```typescript
// TPV auth: login and logout are public; all others try admin_token then tpv_employee_token
if (path.startsWith('/api/tpv')) {
  if (path === '/api/tpv/empleados/login' || path === '/api/tpv/empleados/logout') {
    return NextResponse.next();
  }
  const adminResult = await handleAdminAuth(request, origin);
  if (adminResult.status === 200) return adminResult;
  return handleTpvEmployeeAuth(request, origin);
}
```

- [ ] **Step 4: Add `x-pathname` header for page routes**

In the `proxy()` function, find the block that builds CSP for non-API routes:
```typescript
const requestHeaders = new Headers(request.headers);
requestHeaders.set('x-nonce', nonce);
```

Add the pathname header:
```typescript
const requestHeaders = new Headers(request.headers);
requestHeaders.set('x-nonce', nonce);
requestHeaders.set('x-pathname', path);  // ADD THIS LINE
```

- [ ] **Step 5: Lint check**

```bash
pnpm lint
```

Expected: No errors (TypeScript happy with new imports and functions).

- [ ] **Step 6: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(proxy): dual-auth for /api/tpv/*, late-window refresh, x-pathname header"
```

---

## Task 8: TPV Login Page

**Files:**
- Create: `src/app/tpv/login/page.tsx`
- Create: `src/components/tpv/TpvLoginForm.tsx`

- [ ] **Step 1: Create `TpvLoginForm.tsx` (client component)**

```typescript
// src/components/tpv/TpvLoginForm.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function TpvLoginForm() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length < 4 || loading) return;
    setLoading(true);
    setError(null);

    const res = await fetch('/api/tpv/empleados/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });

    setLoading(false);
    if (!res.ok) {
      setError('PIN incorrecto');
      setPin('');
      return;
    }

    router.push('/tpv/turno/abrir');
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <input
        type="password"
        inputMode="numeric"
        value={pin}
        onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
        placeholder="PIN (4-8 dígitos)"
        autoFocus
        className="bg-[#22263a] border border-[#2e3347] rounded-xl px-4 py-3.5 text-2xl font-bold text-center tracking-widest outline-none focus:border-[#4f72ff] transition-colors placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-[#6b7280]"
      />
      {error !== null && (
        <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3 text-center">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pin.length < 4 || loading}
        className="bg-[#4f72ff] text-white rounded-xl py-4 text-base font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
      >
        {loading ? 'Verificando...' : 'Entrar'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create `src/app/tpv/login/page.tsx` (server component)**

```typescript
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { getDomainFromHeaders, parseMainDomain } from '@/lib/domain-utils';
import { TpvLoginForm } from '@/components/tpv/TpvLoginForm';

export const dynamic = 'force-dynamic';

export default async function TpvLoginPage() {
  const cookieStore = await cookies();

  // Already authenticated? Forward to turno/abrir
  const adminToken = cookieStore.get('admin_token')?.value;
  if (adminToken) {
    const admin = await authAdminUseCase.verifyToken(adminToken);
    if (admin) redirect('/tpv/turno/abrir');
  }

  const employeeToken = cookieStore.get('tpv_employee_token')?.value;
  if (employeeToken) {
    const payload = await verifyTpvEmployeeToken(employeeToken);
    if (payload) redirect('/tpv/turno/abrir');
  }

  // Get empresa name from domain for display
  const domain = await getDomainFromHeaders();
  const mainDomain = parseMainDomain(domain);
  const supabase = getSupabaseClient();
  const { data: empresa } = await supabase
    .from('empresas')
    .select('nombre')
    .eq('dominio', mainDomain)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center p-4">
      <div className="bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-12 flex flex-col gap-8 w-full max-w-sm">
        <div className="flex flex-col gap-2 items-center text-center">
          <span className="text-xs font-bold text-[#4f72ff] uppercase tracking-wider">TPV</span>
          <h1 className="text-2xl font-bold text-[#e8eaf0]">
            {(empresa as { nombre: string } | null)?.nombre ?? 'Acceso TPV'}
          </h1>
          <p className="text-sm text-[#6b7280] leading-relaxed">
            Introduce tu PIN para continuar
          </p>
        </div>
        <TpvLoginForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/tpv/login/page.tsx src/components/tpv/TpvLoginForm.tsx
git commit -m "feat(tpv): /tpv/login page with PIN form"
```

---

## Task 9: TPV Layout — Dual-Cookie Auth

**Files:**
- Modify: `src/lib/tpv-rol-context.tsx`
- Modify: `src/app/tpv/layout.tsx`

- [ ] **Step 1: Update `tpv-rol-context.tsx` — add `isEmployeeSession`**

Read the file first, then replace entirely:

```typescript
'use client';

import { createContext, useContext } from 'react';
import type { RolAdmin } from '@/core/domain/repositories/IAdminRepository';

interface TpvRolContextValue {
  rol: RolAdmin;
  isEmployeeSession: boolean;
}

const TpvRolContext = createContext<TpvRolContextValue>({ rol: 'cajero', isEmployeeSession: false });

export function TpvRolProvider({
  children,
  rol,
  isEmployeeSession,
}: Readonly<{ children: React.ReactNode; rol: RolAdmin; isEmployeeSession: boolean }>) {
  return <TpvRolContext.Provider value={{ rol, isEmployeeSession }}>{children}</TpvRolContext.Provider>;
}

export function useTpvRol(): RolAdmin {
  return useContext(TpvRolContext).rol;
}

export function useTpvIsEmployeeSession(): boolean {
  return useContext(TpvRolContext).isEmployeeSession;
}
```

- [ ] **Step 2: Update `src/app/tpv/layout.tsx` — dual-cookie auth**

Read the file first, then replace entirely:

```typescript
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { TpvHeader } from '@/components/tpv/TpvHeader';
import { TpvRolProvider } from '@/lib/tpv-rol-context';
import type { RolAdmin } from '@/core/domain/repositories/IAdminRepository';
import { TpvSwRegistrar } from '@/components/tpv-sw-registrar';

const VALID_ROLES: RolAdmin[] = ['superadmin', 'admin', 'encargado', 'cajero'];

export const dynamic = 'force-dynamic';

export default async function TpvLayout({ children }: { readonly children: React.ReactNode }) {
  // Skip auth for the public PIN login page
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '';
  if (pathname === '/tpv/login') {
    return <>{children}</>;
  }

  const cookieStore = await cookies();
  let rol: RolAdmin | null = null;
  let empresaNombre = '';
  let isEmployeeSession = false;

  // 1. Try admin_token first
  const adminToken = cookieStore.get('admin_token')?.value;
  if (adminToken) {
    const admin = await authAdminUseCase.verifyToken(adminToken);
    if (admin && VALID_ROLES.includes(admin.rol)) {
      rol = admin.rol;
      empresaNombre = admin.empresa?.nombre ?? '';
    }
  }

  // 2. Fallback to tpv_employee_token
  if (!rol) {
    const employeeToken = cookieStore.get('tpv_employee_token')?.value;
    if (employeeToken) {
      const payload = await verifyTpvEmployeeToken(employeeToken);
      if (payload) {
        rol = payload.rol;
        isEmployeeSession = true;
        // Fetch empresa name for the header
        const { getSupabaseClient } = await import('@/core/infrastructure/database/supabase-client');
        const supabase = getSupabaseClient();
        const { data } = await supabase
          .from('empresas')
          .select('nombre')
          .eq('id', payload.empresaId)
          .maybeSingle();
        empresaNombre = (data as { nombre: string } | null)?.nombre ?? '';
      }
    }
  }

  if (!rol) redirect('/tpv/login');

  return (
    <TpvRolProvider rol={rol} isEmployeeSession={isEmployeeSession}>
      <TpvSwRegistrar />
      <div className="flex flex-col h-screen bg-[#0f1117] text-[#e8eaf0] overflow-hidden">
        <TpvHeader empresaNombre={empresaNombre} />
        <main className="flex flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </TpvRolProvider>
  );
}
```

- [ ] **Step 3: Lint check**

```bash
pnpm lint
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/tpv-rol-context.tsx src/app/tpv/layout.tsx
git commit -m "feat(tpv): dual-cookie auth in layout + isEmployeeSession context"
```

---

## Task 10: Turno Abrir — Pre-fill Name from Employee Token

**Files:**
- Modify: `src/app/tpv/turno/abrir/page.tsx`
- Modify: `src/components/tpv/TurnoAbrirForm.tsx`
- Modify: `src/app/api/tpv/turno/route.ts`

- [ ] **Step 1: Update `src/app/tpv/turno/abrir/page.tsx`**

Read the file first, then replace:

```typescript
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { TurnoAbrirForm } from '@/components/tpv/TurnoAbrirForm';

export default async function TurnoAbrirPage() {
  const cookieStore = await cookies();

  let empresaId: string | null = null;
  let defaultOperador = '';

  const adminToken = cookieStore.get('admin_token')?.value;
  if (adminToken) {
    const admin = await authAdminUseCase.verifyToken(adminToken);
    if (!admin || !admin.empresaId) redirect('/admin/login');
    empresaId = admin.empresaId;
  } else {
    const employeeToken = cookieStore.get('tpv_employee_token')?.value;
    if (!employeeToken) redirect('/tpv/login');
    const payload = await verifyTpvEmployeeToken(employeeToken);
    if (!payload) redirect('/tpv/login');
    empresaId = payload.empresaId;
    defaultOperador = payload.nombre;

    // Only encargado can open a turno
    if (payload.rol !== 'encargado') redirect('/tpv/mostrador');
  }

  const repo = new SupabaseTpvRepository();
  const turnoResult = await repo.findTurnoActivo(empresaId);
  if (turnoResult.success && turnoResult.data !== null) redirect('/tpv/mostrador');

  return (
    <div className="flex items-center justify-center w-full h-full">
      <div className="bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-12 flex flex-col gap-8 w-[440px]">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-[#4f72ff] uppercase tracking-wider">TPV</span>
          <h1 className="text-2xl font-bold">¿Quién está a cargo hoy?</h1>
          <p className="text-sm text-[#6b7280] leading-relaxed">
            Este nombre quedará registrado en el turno de caja y en todas las operaciones.
          </p>
        </div>
        <TurnoAbrirForm defaultOperador={defaultOperador} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `TurnoAbrirForm.tsx` — accept `defaultOperador` prop**

Read the file first, then update:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCsrfToken } from '@/lib/csrf-client';

interface Props {
  readonly defaultOperador?: string;
}

export function TurnoAbrirForm({ defaultOperador = '' }: Props) {
  const router = useRouter();
  const [operador, setOperador] = useState(defaultOperador);
  const [efectivo, setEfectivo] = useState('0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReadOnly = defaultOperador.length > 0;
  const canSubmit = operador.trim().length >= 2 && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    const csrfToken = getCsrfToken();
    const res = await fetch('/api/tpv/turno', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      body: JSON.stringify({
        operadorNombre: operador.trim(),
        efectivoAperturaCents: Math.round(parseFloat(efectivo || '0') * 100),
      }),
    });

    await res.json();
    setLoading(false);

    if (!res.ok) {
      setError('Error al abrir el turno. Inténtalo de nuevo.');
      return;
    }

    router.push('/tpv/mostrador');
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-7 w-full max-w-sm">
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider">
          Nombre del operador
        </label>
        <input
          type="text"
          value={operador}
          onChange={e => !isReadOnly && setOperador(e.target.value)}
          readOnly={isReadOnly}
          placeholder="Escribe tu nombre..."
          autoFocus={!isReadOnly}
          maxLength={100}
          className={`bg-[#22263a] border border-[#2e3347] rounded-xl px-4 py-3.5 text-lg font-medium outline-none transition-colors placeholder:text-[#6b7280] placeholder:text-base placeholder:font-normal ${
            isReadOnly
              ? 'cursor-default opacity-70'
              : 'focus:border-[#4f72ff]'
          }`}
        />
        {isReadOnly && (
          <span className="text-xs text-[#6b7280]">Nombre registrado en tu perfil de empleado</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider">
          Efectivo en caja al abrir
        </label>
        <div className="flex items-center gap-2 bg-[#22263a] border border-[#2e3347] rounded-xl px-4 focus-within:border-[#4f72ff] transition-colors">
          <span className="text-[#6b7280] font-semibold">€</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={efectivo}
            onChange={e => setEfectivo(e.target.value)}
            className="flex-1 bg-transparent py-3.5 text-lg font-bold outline-none"
          />
        </div>
        <span className="text-xs text-[#6b7280]">Puede ser 0,00 € si la caja está vacía</span>
      </div>

      {error !== null && (
        <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="bg-[#4f72ff] text-white rounded-xl py-4 text-base font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
      >
        {loading ? 'Abriendo turno...' : 'Comenzar turno'}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Update `src/app/api/tpv/turno/route.ts` — read `x-employee-id`, accept nullable userId**

Read the file first, then update the `POST` handler:

```typescript
export async function POST(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  const forbidden = requireRole(req, ['encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const userId = req.headers.get('x-admin-id') || null;
  const operadorId = req.headers.get('x-employee-id') || null;

  if (!userId && !operadorId) return validationErrorResponse('usuario requerido');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = AbrirSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await abrirTurnoUseCase(repo, {
    empresaId,
    userId: userId ?? undefined,
    operadorId: operadorId ?? undefined,
    operadorNombre: parsed.data.operadorNombre,
    efectivoAperturaCents: parsed.data.efectivoAperturaCents,
  });

  return handleResultWithStatus(result, 201);
}
```

- [ ] **Step 4: Lint check + commit**

```bash
pnpm lint
git add src/app/tpv/turno/abrir/page.tsx
git add src/components/tpv/TurnoAbrirForm.tsx
git add src/app/api/tpv/turno/route.ts
git commit -m "feat(tpv): pre-fill operator name from tpv_employee_token"
```

---

## Task 11: TpvHeader — Permissions + Lock Button

**Files:**
- Modify: `src/components/tpv/TpvHeader.tsx`

Read `src/components/tpv/TpvHeader.tsx` in full before editing.

- [ ] **Step 1: Add `useTpvIsEmployeeSession` import and update TpvHeader**

Replace the file with:

```typescript
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Settings, Package, Tags, BookOpen, Archive, LayoutDashboard, Lock } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/tpv/useOnlineStatus';
import { getQueueCount } from '@/lib/tpv/offline-queue';
import { LowStockBadge } from '@/components/tpv/LowStockBadge';
import { useTpvRol, useTpvIsEmployeeSession } from '@/lib/tpv-rol-context';
import { fetchWithCsrf } from '@/lib/csrf-client';

const ADMIN_SHORTCUTS = [
  { label: 'Productos',    href: '/admin/productos',           icon: Package },
  { label: 'Categorías',  href: '/admin/categorias',          icon: Tags },
  { label: 'Recetas',     href: '/admin/stock/recetas',       icon: BookOpen },
  { label: 'Ingredientes',href: '/admin/stock/ingredientes',  icon: Archive },
  { label: 'Panel admin', href: '/admin',                     icon: LayoutDashboard },
] as const;

interface Props {
  readonly empresaNombre: string;
}

function TpvClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    function tick() {
      const d = new Date();
      setTime(
        String(d.getHours()).padStart(2, '0') + ':' +
        String(d.getMinutes()).padStart(2, '0')
      );
    }
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-semibold tabular-nums text-sm">{time}</span>;
}

export function TpvHeader({ empresaNombre }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const rol = useTpvRol();
  const isEmployeeSession = useTpvIsEmployeeSession();
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [adminOpen, setAdminOpen] = useState(false);
  const [locking, setLocking] = useState(false);
  const adminRef = useRef<HTMLDivElement>(null);

  const isCajero = rol === 'cajero';
  const showGear = rol === 'admin' || rol === 'superadmin';

  const NAV_ITEMS = [
    { label: 'Mostrador', href: '/tpv/mostrador', activePrefix: '/tpv/mostrador' },
    { label: 'Mesas',     href: '/tpv/mesas?seleccionar=1', activePrefix: '/tpv/mesas' },
    { label: 'Historial', href: '/tpv/historial', activePrefix: '/tpv/historial' },
    ...(!isCajero ? [{ label: 'Mermas', href: '/tpv/mermas', activePrefix: '/tpv/mermas' }] : []),
  ];

  useEffect(() => {
    if (!adminOpen) return;
    function handleClick(e: MouseEvent) {
      if (adminRef.current && !adminRef.current.contains(e.target as Node)) {
        setAdminOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [adminOpen]);

  useEffect(() => {
    getQueueCount()
      .then(setPendingCount)
      .catch(() => { /* IndexedDB not available */ });
  }, [isOnline]);

  async function handleLock() {
    setLocking(true);
    await fetchWithCsrf('/api/tpv/empleados/logout', { method: 'POST' });
    setLocking(false);
    router.push('/tpv/login');
  }

  return (
    <>
    {!isOnline && (
      <div className="flex items-center justify-center gap-2 h-8 px-4 bg-[#f59e0b] text-black text-xs font-semibold shrink-0">
        <span>Sin conexión — modo local</span>
        {pendingCount > 0 && (
          <span className="bg-black text-[#f59e0b] rounded-full px-2 py-0.5 text-[10px] font-bold">
            {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    )}
    <header className="flex items-center justify-between h-14 px-5 bg-[#1a1d27] border-b border-[#2e3347] shrink-0">
      <div className="flex items-center gap-4">
        <span className="font-bold text-[#4f72ff] text-sm tracking-wide">TPV</span>
        <span className="text-xs text-[#6b7280]">{empresaNombre}</span>
      </div>

      <nav className="flex gap-1">
        {NAV_ITEMS.map(({ label, href, activePrefix }) => (
          <button
            key={href}
            type="button"
            onClick={() => router.push(href)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              pathname.startsWith(activePrefix)
                ? 'bg-[#22263a] text-[#e8eaf0]'
                : 'text-[#6b7280] hover:text-[#e8eaf0]'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-4">
        <LowStockBadge />
        <TpvClock />
        {showGear && (
          <div ref={adminRef} className="relative">
            <button
              type="button"
              onClick={() => setAdminOpen(o => !o)}
              aria-label="Accesos de administración"
              aria-expanded={adminOpen}
              className={`p-1.5 rounded-md border transition-colors ${
                adminOpen
                  ? 'bg-[#2e3347] border-[#4f72ff] text-[#4f72ff]'
                  : 'bg-[#22263a] border-[#2e3347] text-[#6b7280] hover:border-[#4f72ff] hover:text-[#e8eaf0]'
              }`}
            >
              <Settings className="h-4 w-4" />
            </button>

            {adminOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-[#1a1d27] border border-[#2e3347] rounded-lg shadow-xl z-50 overflow-hidden">
                {ADMIN_SHORTCUTS.map(({ label, href, icon: Icon }, idx) => (
                  <button
                    key={href}
                    type="button"
                    onClick={() => { setAdminOpen(false); router.push(href); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#c4c8d8] hover:bg-[#22263a] hover:text-[#e8eaf0] transition-colors text-left ${
                      idx === ADMIN_SHORTCUTS.length - 1 ? 'border-t border-[#2e3347] mt-1' : ''
                    }`}
                  >
                    <Icon className="h-4 w-4 text-[#4f72ff] flex-shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {isEmployeeSession && (
          <button
            type="button"
            onClick={handleLock}
            disabled={locking}
            aria-label="Bloquear TPV"
            className="p-1.5 rounded-md border bg-[#22263a] border-[#2e3347] text-[#6b7280] hover:border-[#ef4444] hover:text-[#ef4444] transition-colors disabled:opacity-50"
          >
            <Lock className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push('/tpv/turno/cerrar')}
          className="text-xs bg-[#22263a] border border-[#2e3347] px-3 py-1.5 rounded-md hover:border-[#4f72ff] transition-colors"
        >
          Cierre de Caja
        </button>
      </div>
    </header>
    </>
  );
}
```

- [ ] **Step 2: Lint + commit**

```bash
pnpm lint
git add src/components/tpv/TpvHeader.tsx
git commit -m "feat(tpv): gear admin-only, hide Mermas for cajero, lock button for employees"
```

---

## Task 12: Mermas Gate — Employee Token Support

**Files:**
- Modify: `src/app/tpv/mermas/layout.tsx`

Read the file first, then replace:

- [ ] **Step 1: Update mermas layout**

```typescript
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';

export const dynamic = 'force-dynamic';

export default async function MermasLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();

  const adminToken = cookieStore.get('admin_token')?.value;
  if (adminToken) {
    const admin = await authAdminUseCase.verifyToken(adminToken);
    if (!admin) redirect('/tpv/login');
    if (admin.rol === 'cajero') redirect('/tpv/mostrador');
    return <>{children}</>;
  }

  const employeeToken = cookieStore.get('tpv_employee_token')?.value;
  if (employeeToken) {
    const payload = await verifyTpvEmployeeToken(employeeToken);
    if (!payload) redirect('/tpv/login');
    if (payload.rol === 'cajero') redirect('/tpv/mostrador');
    return <>{children}</>;
  }

  redirect('/tpv/login');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/tpv/mermas/layout.tsx
git commit -m "feat(tpv): mermas gate supports tpv_employee_token"
```

---

## Task 13: Blind Cierre de Caja

**Files:**
- Modify: `src/app/tpv/turno/cerrar/page.tsx`
- Modify: `src/components/tpv/TurnoCerrarForm.tsx`
- Modify: `src/app/api/tpv/turno/[id]/cerrar/route.ts`

- [ ] **Step 1: Update `src/app/tpv/turno/cerrar/page.tsx`**

Read the file first, then replace:

```typescript
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { TurnoCerrarForm } from '@/components/tpv/TurnoCerrarForm';
import type { RolAdmin } from '@/core/domain/repositories/IAdminRepository';

const EMPTY_STATS = { totalEfectivoCents: 0, totalTarjetaCents: 0, numOperaciones: 0 };

export default async function TurnoCerrarPage() {
  const cookieStore = await cookies();
  let rol: RolAdmin = 'cajero';
  let empresaId: string | null = null;

  const adminToken = cookieStore.get('admin_token')?.value;
  if (adminToken) {
    const admin = await authAdminUseCase.verifyToken(adminToken);
    if (!admin || !admin.empresaId) redirect('/admin/login');
    rol = admin.rol;
    empresaId = admin.empresaId;
  } else {
    const employeeToken = cookieStore.get('tpv_employee_token')?.value;
    if (!employeeToken) redirect('/tpv/login');
    const payload = await verifyTpvEmployeeToken(employeeToken);
    if (!payload) redirect('/tpv/login');
    rol = payload.rol;
    empresaId = payload.empresaId;
  }

  if (!empresaId) redirect('/tpv/login');

  const isBlindClose = rol === 'cajero';

  const repo = new SupabaseTpvRepository();
  const turnoResult = await repo.findTurnoActivo(empresaId);
  if (!turnoResult.success || turnoResult.data === null) redirect('/tpv/turno/abrir');

  const turno = turnoResult.data;
  const supabase = getSupabaseClient();

  // Only fetch full stats for encargado/admin (cajero sees blind close)
  const [statsResult, sesionesRes] = await Promise.all([
    isBlindClose ? Promise.resolve({ success: true, data: EMPTY_STATS }) : repo.getTurnoStats(turno.id),
    supabase
      .from('mesa_sesiones')
      .select('id, mesas!mesa_sesiones_mesa_id_fkey(numero, nombre)')
      .eq('empresa_id', empresaId)
      .is('cerrada_at', null),
  ]);

  const stats = statsResult.success ? statsResult.data : EMPTY_STATS;

  type MesaJoin = { numero: number | null; nombre: string | null };
  type SesionRow = { id: string; mesas: MesaJoin | MesaJoin[] | null };
  const mesasAbiertas = ((sesionesRes.data ?? []) as unknown as SesionRow[]).map(s => {
    const mesa = Array.isArray(s.mesas) ? s.mesas[0] : s.mesas;
    return { mesaNumero: mesa?.numero ?? null, mesaNombre: mesa?.nombre ?? null };
  });

  return (
    <div className="flex items-center justify-center w-full h-full">
      <div className="bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-12 flex flex-col gap-8 w-[440px]">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-[#ef4444] uppercase tracking-wider">Cierre de Caja</span>
          <h1 className="text-2xl font-bold">{isBlindClose ? 'Cerrar turno' : 'Arqueo final'}</h1>
          <p className="text-sm text-[#6b7280] leading-relaxed">
            {isBlindClose
              ? 'Cuenta el efectivo y declara el total. El encargado revisará el arqueo.'
              : 'Cuenta el efectivo en la caja. El sistema calculará la diferencia.'}
          </p>
        </div>
        <TurnoCerrarForm turno={turno} stats={stats} mesasAbiertas={mesasAbiertas} isBlindClose={isBlindClose} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `TurnoCerrarForm.tsx` — add `isBlindClose` prop**

Read `src/components/tpv/TurnoCerrarForm.tsx` in full. The interface `Props` currently has `turno`, `stats`, `mesasAbiertas`. Add `isBlindClose: boolean` to Props:

```typescript
interface Props {
  readonly turno: TpvTurno;
  readonly stats: TpvTurnoStats;
  readonly mesasAbiertas: MesaAbierta[];
  readonly isBlindClose: boolean;
}
```

In the component function signature, destructure `isBlindClose`. Then in the render:
- When `isBlindClose=true`: hide the "Resumen del turno" stats section (expected totals, tarjeta totals, numOperaciones). Only show the "Efectivo al cierre" input and submit button.
- The `totalEfectivoTeoricoCents` is still computed if shown (for non-blind), but for blind close send `0` or skip it — the server will compute it.

Find where the form renders and wrap stats in `{!isBlindClose && (...)}`.

The submit handler needs to pass `totalEfectivoTeoricoCents` for full arqueo, or send just `efectivoCierreCents` for blind close. The API now accepts both cases:

```typescript
body: JSON.stringify(
  isBlindClose
    ? { efectivoCierreCents }
    : { efectivoCierreCents, totalEfectivoTeoricoCents }
)
```

- [ ] **Step 3: Update `src/app/api/tpv/turno/[id]/cerrar/route.ts`**

Read the file first, then update:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  requireRole,
  errorResponse,
  validationErrorResponse,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { cerrarTurnoUseCase } from '@/core/application/use-cases/tpv/cerrar-turno.use-case';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { z } from 'zod';

const repo = new SupabaseTpvRepository();

const CerrarSchema = z.object({
  efectivoCierreCents: z.number().int().min(0),
  // Optional for cajero (blind close) — server fetches theoretical total
  totalEfectivoTeoricoCents: z.number().int().min(0).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;

  // Now allows cajero (blind close)
  const forbidden = requireRole(req, ['cajero', 'encargado', 'admin', 'superadmin']);
  if (forbidden) return forbidden;

  if (!empresaId) return validationErrorResponse('empresaId requerido');

  const rol = req.headers.get('x-admin-rol') ?? '';

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CerrarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;

  // Guard: no cerrar si hay mesas con sesión abierta
  const supabase = getSupabaseClient();
  const { data: sesionesAbiertas } = await supabase
    .from('mesa_sesiones')
    .select('id')
    .eq('empresa_id', empresaId)
    .is('cerrada_at', null)
    .limit(1);

  if (sesionesAbiertas && sesionesAbiertas.length > 0) {
    return NextResponse.json(
      { error: 'Hay mesas sin cobrar. Cerrá o cobrá todas las mesas antes de cerrar el turno.' },
      { status: 409 },
    );
  }

  let totalEfectivoTeoricoCents = parsed.data.totalEfectivoTeoricoCents ?? 0;

  // For cajero (blind close): fetch the theoretical total server-side
  if (rol === 'cajero' || parsed.data.totalEfectivoTeoricoCents === undefined) {
    const statsResult = await repo.getTurnoStats(id);
    if (statsResult.success) {
      totalEfectivoTeoricoCents = statsResult.data.totalEfectivoCents;
    }
  }

  const result = await cerrarTurnoUseCase(repo, {
    turnoId: id,
    efectivoCierreCents: parsed.data.efectivoCierreCents,
    totalEfectivoTeoricoCents,
  });

  if (!result.success) return errorResponse(result.error.message);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Lint + commit**

```bash
pnpm lint
git add src/app/tpv/turno/cerrar/page.tsx
git add src/components/tpv/TurnoCerrarForm.tsx
git add src/app/api/tpv/turno/[id]/cerrar/route.ts
git commit -m "feat(tpv): blind cierre de caja for cajero role"
```

---

## Task 14: Admin CRUD API Routes

**Files:**
- Create: `src/app/api/admin/empleados-tpv/route.ts`
- Create: `src/app/api/admin/empleados-tpv/[id]/route.ts`

- [ ] **Step 1: Create `route.ts` (GET + POST)**

```typescript
// src/app/api/admin/empleados-tpv/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  requireRole,
  handleResult,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { empleadoTpvRepository } from '@/core/infrastructure/database';
import { hashPin } from '@/lib/waiter-auth';
import { z } from 'zod';

const CreateSchema = z.object({
  nombre: z.string().min(2).max(80),
  rol: z.enum(['cajero', 'encargado']),
  pin: z.string().min(4).max(8).regex(/^\d+$/, 'Solo dígitos'),
});

export async function GET(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;
  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return NextResponse.json({ error: 'empresaId requerido' }, { status: 400 });

  const result = await empleadoTpvRepository.findAllByEmpresa(empresaId);
  return handleResult(result);
}

export async function POST(req: NextRequest) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;
  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return NextResponse.json({ error: 'empresaId requerido' }, { status: 400 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const pinHash = await hashPin(parsed.data.pin, empresaId);

  const result = await empleadoTpvRepository.create({
    empresaId,
    nombre: parsed.data.nombre,
    rol: parsed.data.rol,
    pinHash,
  });

  if (!result.success) {
    // Unique index violation = duplicate PIN
    const msg = result.error.message.includes('unique') || result.error.message.includes('duplicate')
      ? 'Este PIN ya está en uso. Elige uno diferente.'
      : result.error.message;
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  return NextResponse.json(result.data, { status: 201 });
}
```

- [ ] **Step 2: Create `[id]/route.ts` (PATCH + DELETE)**

```typescript
// src/app/api/admin/empleados-tpv/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  requireRole,
  type AuthResult,
} from '@/core/infrastructure/api/helpers';
import { empleadoTpvRepository } from '@/core/infrastructure/database';
import { hashPin } from '@/lib/waiter-auth';
import { z } from 'zod';

const PatchSchema = z.union([
  z.object({ pin: z.string().min(4).max(8).regex(/^\d+$/) }),
  z.object({ activo: z.boolean() }),
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;
  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return NextResponse.json({ error: 'empresaId requerido' }, { status: 400 });

  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let result;
  if ('pin' in parsed.data) {
    const pinHash = await hashPin(parsed.data.pin, empresaId);
    result = await empleadoTpvRepository.updatePin(id, empresaId, pinHash);
  } else {
    result = await empleadoTpvRepository.setActivo(id, empresaId, parsed.data.activo);
  }

  if (!result.success) {
    const msg = result.error.message.includes('unique') || result.error.message.includes('duplicate')
      ? 'Este PIN ya está en uso. Elige uno diferente.'
      : result.error.message;
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { empresaId, error: authError } = (await requireAuth(req)) as AuthResult;
  if (authError) return authError;
  const forbidden = requireRole(req, ['admin', 'superadmin']);
  if (forbidden) return forbidden;
  if (!empresaId) return NextResponse.json({ error: 'empresaId requerido' }, { status: 400 });

  const { id } = await params;
  const result = await empleadoTpvRepository.delete(id, empresaId);

  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Lint + commit**

```bash
pnpm lint
git add src/app/api/admin/empleados-tpv/route.ts
git add src/app/api/admin/empleados-tpv/[id]/route.ts
git commit -m "feat(api): CRUD /api/admin/empleados-tpv"
```

---

## Task 15: Admin UI — EmpleadosTpvPanel + Configuracion Tab

**Files:**
- Create: `src/components/admin/EmpleadosTpvPanel.tsx`
- Modify: `src/components/admin/configuracion-page-client.tsx`

- [ ] **Step 1: Create `EmpleadosTpvPanel.tsx`**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Users, Plus, Key, Power, Trash2, X } from 'lucide-react';
import { fetchWithCsrf } from '@/lib/csrf-client';

interface Empleado {
  id: string;
  nombre: string;
  rol: 'cajero' | 'encargado';
  activo: boolean;
  createdAt: string;
}

interface Props {
  readonly empresaId: string;
}

function RolBadge({ rol }: Readonly<{ rol: 'cajero' | 'encargado' }>) {
  const isEncargado = rol === 'encargado';
  return (
    <span
      className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full"
      style={isEncargado
        ? { background: 'oklch(28% 0.10 250 / 0.6)', color: 'oklch(82% 0.18 250)' }
        : { background: 'oklch(28% 0.10 148 / 0.6)', color: 'oklch(82% 0.18 148)' }}
    >
      {isEncargado ? 'Encargado' : 'Cajero'}
    </span>
  );
}

export function EmpleadosTpvPanel({ empresaId }: Props) {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [pinModalId, setPinModalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<'cajero' | 'encargado'>('cajero');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);

  // PIN change state
  const [newPin, setNewPin] = useState('');
  const [changingPin, setChangingPin] = useState(false);

  async function loadEmpleados() {
    setLoading(true);
    const res = await fetch('/api/admin/empleados-tpv');
    if (res.ok) {
      const data = await res.json() as Empleado[];
      setEmpleados(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadEmpleados();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const res = await fetchWithCsrf('/api/admin/empleados-tpv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, rol, pin }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json() as { error?: string };
      setError(data.error ?? 'Error al crear empleado');
      return;
    }
    setNombre('');
    setPin('');
    setRol('cajero');
    setShowCreate(false);
    await loadEmpleados();
  }

  async function handleToggleActivo(id: string, activo: boolean) {
    await fetchWithCsrf(`/api/admin/empleados-tpv/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !activo }),
    });
    await loadEmpleados();
  }

  async function handleChangePin(id: string) {
    if (newPin.length < 4 || changingPin) return;
    setChangingPin(true);
    const res = await fetchWithCsrf(`/api/admin/empleados-tpv/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: newPin }),
    });
    setChangingPin(false);
    if (!res.ok) {
      const data = await res.json() as { error?: string };
      setError(data.error ?? 'Error al cambiar PIN');
      return;
    }
    setNewPin('');
    setPinModalId(null);
  }

  async function handleDelete(id: string) {
    await fetchWithCsrf(`/api/admin/empleados-tpv/${id}`, { method: 'DELETE' });
    await loadEmpleados();
  }

  if (loading) {
    return <p className="text-sm text-[#6b7280] py-8 text-center">Cargando empleados...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-[#4f72ff]" />
          <h3 className="font-semibold text-[#e8eaf0]">Empleados TPV</h3>
          <span className="text-xs text-[#6b7280]">({empleados.length})</span>
        </div>
        <button
          type="button"
          onClick={() => { setShowCreate(o => !o); setError(null); }}
          className="flex items-center gap-1.5 text-sm bg-[#4f72ff] text-white px-3 py-1.5 rounded-lg hover:brightness-110 transition-all"
        >
          <Plus className="h-4 w-4" />
          Nuevo empleado
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="bg-[#1a1d27] border border-[#2e3347] rounded-xl p-5 flex flex-col gap-4"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-[#e8eaf0]">Nuevo empleado</span>
            <button type="button" onClick={() => setShowCreate(false)}>
              <X className="h-4 w-4 text-[#6b7280] hover:text-[#e8eaf0]" />
            </button>
          </div>
          <input
            type="text"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Nombre completo"
            maxLength={80}
            required
            className="bg-[#22263a] border border-[#2e3347] rounded-lg px-3 py-2 text-sm text-[#e8eaf0] outline-none focus:border-[#4f72ff] transition-colors"
          />
          <select
            value={rol}
            onChange={e => setRol(e.target.value as 'cajero' | 'encargado')}
            className="bg-[#22263a] border border-[#2e3347] rounded-lg px-3 py-2 text-sm text-[#e8eaf0] outline-none focus:border-[#4f72ff] transition-colors"
          >
            <option value="cajero">Cajero</option>
            <option value="encargado">Encargado</option>
          </select>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="PIN (4-8 dígitos)"
            required
            className="bg-[#22263a] border border-[#2e3347] rounded-lg px-3 py-2 text-sm text-[#e8eaf0] outline-none focus:border-[#4f72ff] transition-colors tracking-widest"
          />
          {error !== null && (
            <p className="text-xs text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={nombre.length < 2 || pin.length < 4 || saving}
            className="bg-[#4f72ff] text-white rounded-lg py-2 text-sm font-bold disabled:opacity-40 hover:brightness-110 transition-all"
          >
            {saving ? 'Guardando...' : 'Crear empleado'}
          </button>
        </form>
      )}

      {empleados.length === 0 && !showCreate && (
        <p className="text-sm text-[#6b7280] py-4 text-center">No hay empleados creados aún.</p>
      )}

      <div className="flex flex-col gap-2">
        {empleados.map(emp => (
          <div
            key={emp.id}
            className="bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex flex-col gap-1 min-w-0">
                <span className={`text-sm font-medium truncate ${emp.activo ? 'text-[#e8eaf0]' : 'text-[#6b7280] line-through'}`}>
                  {emp.nombre}
                </span>
                <RolBadge rol={emp.rol} />
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {pinModalId === emp.id ? (
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    inputMode="numeric"
                    value={newPin}
                    onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="Nuevo PIN"
                    autoFocus
                    className="bg-[#22263a] border border-[#2e3347] rounded-lg px-2 py-1 text-xs text-[#e8eaf0] outline-none focus:border-[#4f72ff] w-24 tracking-widest"
                  />
                  <button
                    type="button"
                    onClick={() => handleChangePin(emp.id)}
                    disabled={newPin.length < 4 || changingPin}
                    className="text-xs bg-[#4f72ff] text-white px-2 py-1 rounded-lg disabled:opacity-40"
                  >
                    OK
                  </button>
                  <button type="button" onClick={() => { setPinModalId(null); setNewPin(''); }}>
                    <X className="h-4 w-4 text-[#6b7280]" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => { setPinModalId(emp.id); setError(null); }}
                    title="Cambiar PIN"
                    className="p-1.5 rounded-lg text-[#6b7280] hover:text-[#4f72ff] transition-colors"
                  >
                    <Key className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActivo(emp.id, emp.activo)}
                    title={emp.activo ? 'Desactivar' : 'Activar'}
                    className={`p-1.5 rounded-lg transition-colors ${emp.activo ? 'text-[#22c55e] hover:text-[#6b7280]' : 'text-[#6b7280] hover:text-[#22c55e]'}`}
                  >
                    <Power className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(emp.id)}
                    title="Eliminar"
                    className="p-1.5 rounded-lg text-[#6b7280] hover:text-[#ef4444] transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {error !== null && pinModalId === null && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `configuracion-page-client.tsx` — add Empleados tab**

Read the file in full. Then:

1. Add import at the top:
```typescript
import { Users } from 'lucide-react';
import { EmpleadosTpvPanel } from '@/components/admin/EmpleadosTpvPanel';
```

2. Add `empresaId` to `ConfiguracionPageClientProps`:
```typescript
interface ConfiguracionPageClientProps {
  // ... existing props ...
  empresaId: string;  // already present — verify it's there
}
```

3. Add the Empleados tab to the tab list (wherever the other tabs are defined):
```typescript
{ id: 'empleados', label: 'Empleados', icon: Users }
```

4. Add the panel render in the tab content:
```tsx
{activeTab === 'empleados' && (
  <EmpleadosTpvPanel empresaId={empresaId} />
)}
```

- [ ] **Step 3: Verify `configuracion/page.tsx` already passes `empresaId`**

Read `src/app/admin/(protected)/configuracion/page.tsx`. Confirm `empresaId` is passed to `ConfiguracionPageClient`. It already is — no change needed.

- [ ] **Step 4: Lint + commit**

```bash
pnpm lint
git add src/components/admin/EmpleadosTpvPanel.tsx
git add src/components/admin/configuracion-page-client.tsx
git commit -m "feat(admin): EmpleadosTpvPanel + Empleados tab in Configuración"
```

---

## Final Verification

- [ ] **Step 1: Full lint**

```bash
pnpm lint
```

Expected: 0 errors.

- [ ] **Step 2: Manual smoke test checklist**

1. Go to `/tpv/login` — should show PIN form without any auth redirect
2. Enter wrong PIN → "PIN incorrecto" shown
3. Enter correct PIN → redirected to `/tpv/turno/abrir` with name pre-filled (encargado only)
4. Cajero PIN → redirected to `/tpv/mostrador` (already-open turno) or `/tpv/turno/abrir` (no turno, then redirect to mostrador since cajero can't open turno)
5. As cajero: Mermas nav item is hidden, ⚙ gear is hidden, lock button is visible
6. As encargado: Mermas nav is visible, ⚙ gear is hidden, lock button is visible
7. As admin: all nav items visible, ⚙ gear visible, no lock button
8. Cajero goes to `/tpv/turno/cerrar` → sees blind close form (no expected totals)
9. Admin panel `/admin/configuracion` → "Empleados" tab visible → create cajero/encargado with PIN → employee can then log in at `/tpv/login`
10. Lock button → clears cookie → back to `/tpv/login` (active turno NOT closed)

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(tpv): sistema completo de empleados con PIN y permisos por rol"
```
