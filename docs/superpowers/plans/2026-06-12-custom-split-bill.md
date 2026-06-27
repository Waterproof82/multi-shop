# Custom Split Bill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Personalizar el pago" mode to mesa bill splitting — each person selects their own items and pays sequentially, with atomic DB locking per turn.

**Architecture:** Sequential turn-based locking via `mesa_pagos_personalizados` table. One person holds the lock (`custom_turno_id` on `mesa_sesiones`) while selecting; others see a waiting screen. Realtime subscriptions trigger UI transitions. All state mutations go through PostgreSQL RPCs with `FOR UPDATE` to prevent races.

**Tech Stack:** Next.js 15 App Router, Supabase (service_role), PostgreSQL RPCs, Redsys, Tailwind v4, React, Zod, Result<T,E> pattern.

**Spec:** `docs/superpowers/specs/2026-06-12-custom-split-bill-design.md`

---

## File Map

**Create:**
- `supabase/migrations/20260613000001_custom_split_bill_tables.sql`
- `supabase/migrations/20260613000002_custom_split_bill_rpcs.sql`
- `src/core/application/use-cases/payment/initiateCustomTurnUseCase.ts`
- `src/core/application/use-cases/payment/updateCustomSelectionUseCase.ts`
- `src/core/application/use-cases/payment/commitCustomPaymentUseCase.ts`
- `src/core/application/use-cases/payment/completeCustomPaymentUseCase.ts`
- `src/core/application/use-cases/payment/cancelCustomTurnUseCase.ts`
- `src/core/application/use-cases/payment/switchToEqualSplitRemainingUseCase.ts`
- `src/app/api/mesas/[mesaId]/custom-turn/route.ts`
- `src/app/api/mesas/[mesaId]/custom-turn/[turnoId]/selection/route.ts`
- `src/app/api/mesas/[mesaId]/custom-turn/[turnoId]/commit/route.ts`
- `src/app/api/mesas/[mesaId]/custom-turn/[turnoId]/complete/route.ts`
- `src/app/api/mesas/[mesaId]/custom-turn/[turnoId]/route.ts`
- `src/app/api/mesas/[mesaId]/equal-split-remaining/route.ts`

**Modify:**
- `src/app/api/mesas/[mesaId]/orders/route.ts` — add divisionTipo, customTurno, itemsPagados
- `src/core/application/use-cases/payment/processRedsysWebhookUseCase.ts` — add Path 0 for custom turns
- `src/core/application/use-cases/payment/registerManualMesaPaymentUseCase.ts` — handle personalizado mode
- `src/core/application/use-cases/payment/initiateRedsysMesaPaymentUseCase.ts` — use division_base_cents
- `src/components/mesa-orders-client.tsx` — 4 new components + entry point wiring
- `src/lib/translations.ts` — 14 new keys x 5 languages

---

## Task 1: DB Tables Migration

**Files:**
- Create: `supabase/migrations/20260613000001_custom_split_bill_tables.sql`

- [ ] **Step 1: Write the migration**

```sql
-- mesa_pagos_personalizados: one row per custom payment turn
CREATE TABLE public.mesa_pagos_personalizados (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id         UUID        NOT NULL REFERENCES public.mesa_sesiones(id) ON DELETE CASCADE,
  empresa_id        UUID        NOT NULL,
  seleccion         JSONB       NOT NULL DEFAULT '[]',
  -- [{pedido_id: UUID, item_idx: int, unidades: int}]
  importe_cents     INTEGER     NULL,
  payment_order_ref TEXT        NULL,
  status            TEXT        NOT NULL DEFAULT 'en_seleccion',
  -- 'en_seleccion' | 'en_pago' | 'pagado' | 'cancelado'
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT now() + interval '10 minutes',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mpp_status_check CHECK (status IN ('en_seleccion','en_pago','pagado','cancelado')),
  CONSTRAINT mpp_ref_unique   UNIQUE (payment_order_ref)
);

CREATE INDEX mpp_sesion_idx ON public.mesa_pagos_personalizados(sesion_id);
CREATE INDEX mpp_status_idx ON public.mesa_pagos_personalizados(status);

-- mesa_item_pagos: accumulated paid item units (source of truth for remaining)
CREATE TABLE public.mesa_item_pagos (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id            UUID    NOT NULL REFERENCES public.mesa_sesiones(id) ON DELETE CASCADE,
  empresa_id           UUID    NOT NULL,
  pedido_id            UUID    NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  item_idx             INTEGER NOT NULL,
  unidades_pagadas     INTEGER NOT NULL,
  importe_pagado_cents INTEGER NOT NULL DEFAULT 0,
  turno_id             UUID    NOT NULL REFERENCES public.mesa_pagos_personalizados(id)
);

CREATE INDEX mip_sesion_idx ON public.mesa_item_pagos(sesion_id);
CREATE INDEX mip_turno_idx  ON public.mesa_item_pagos(turno_id);

-- Extend mesa_sesiones
ALTER TABLE public.mesa_sesiones
  ADD COLUMN IF NOT EXISTS division_tipo      TEXT NULL,
  -- NULL | 'igual' | 'personalizado'
  ADD COLUMN IF NOT EXISTS custom_turno_id   UUID NULL
    REFERENCES public.mesa_pagos_personalizados(id),
  ADD COLUMN IF NOT EXISTS division_base_cents INTEGER NULL;
  -- used when switching remaining amount to equal split

-- RLS: deny anon, grant service_role (same pattern as mesa_division_pagos)
ALTER TABLE public.mesa_pagos_personalizados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct anon access to mesa_pagos_personalizados"
  ON public.mesa_pagos_personalizados FOR ALL TO anon
  USING (false) WITH CHECK (false);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mesa_pagos_personalizados TO service_role;

ALTER TABLE public.mesa_item_pagos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct anon access to mesa_item_pagos"
  ON public.mesa_item_pagos FOR ALL TO anon
  USING (false) WITH CHECK (false);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mesa_item_pagos TO service_role;

-- Enable Realtime so the client can subscribe to item payment updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.mesa_item_pagos;
```

- [ ] **Step 2: Apply in Supabase SQL editor, verify tables and columns exist**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260613000001_custom_split_bill_tables.sql
git commit -m "feat(db): add custom split bill tables and mesa_sesiones columns"
```

---

## Task 2: DB RPC Functions Migration

**Files:**
- Create: `supabase/migrations/20260613000002_custom_split_bill_rpcs.sql`

- [ ] **Step 1: Write the 6 RPC functions**

```sql
-- 1. claim_custom_turn
-- Atomically claims the selection lock for a sesion.
-- Cancels expired en_seleccion turns. Blocks only on active non-expired en_seleccion.
-- Returns (claimed BOOL, turno_id UUID).
CREATE OR REPLACE FUNCTION public.claim_custom_turn(
  p_sesion_id  UUID,
  p_empresa_id UUID
)
RETURNS TABLE(claimed BOOLEAN, turno_id UUID)
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_current_turno UUID;
  v_status        TEXT;
  v_expires       TIMESTAMPTZ;
  v_new_id        UUID;
BEGIN
  SELECT custom_turno_id INTO v_current_turno
  FROM public.mesa_sesiones
  WHERE id = p_sesion_id AND cerrada_at IS NULL
  FOR UPDATE;

  IF v_current_turno IS NOT NULL THEN
    SELECT status, expires_at INTO v_status, v_expires
    FROM public.mesa_pagos_personalizados WHERE id = v_current_turno;

    -- Active non-expired selection lock -> reject
    IF v_status = 'en_seleccion' AND v_expires > now() THEN
      RETURN QUERY SELECT false, NULL::UUID; RETURN;
    END IF;

    -- Expired en_seleccion -> cancel it and proceed
    IF v_status = 'en_seleccion' THEN
      UPDATE public.mesa_pagos_personalizados
      SET status = 'cancelado', updated_at = now() WHERE id = v_current_turno;
    END IF;

    UPDATE public.mesa_sesiones SET custom_turno_id = NULL WHERE id = p_sesion_id;
  END IF;

  INSERT INTO public.mesa_pagos_personalizados (sesion_id, empresa_id)
  VALUES (p_sesion_id, p_empresa_id) RETURNING id INTO v_new_id;

  UPDATE public.mesa_sesiones
  SET custom_turno_id = v_new_id, division_tipo = 'personalizado'
  WHERE id = p_sesion_id;

  RETURN QUERY SELECT true, v_new_id;
END;
$$;

-- 2. update_custom_selection
-- Saves JSONB selection. Validates unit availability. Refreshes TTL.
-- Returns (success BOOL, error_code TEXT).
CREATE OR REPLACE FUNCTION public.update_custom_selection(
  p_turno_id      UUID,
  p_seleccion     JSONB,
  p_importe_cents INTEGER
)
RETURNS TABLE(success BOOLEAN, error_code TEXT)
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_status    TEXT;
  v_sesion_id UUID;
  item        JSONB;
  v_total_u   INT;
  v_paid_u    INT;
BEGIN
  SELECT status, sesion_id INTO v_status, v_sesion_id
  FROM public.mesa_pagos_personalizados WHERE id = p_turno_id;

  IF v_status IS NULL    THEN RETURN QUERY SELECT false, 'TURNO_NOT_FOUND'; RETURN; END IF;
  IF v_status != 'en_seleccion' THEN RETURN QUERY SELECT false, 'INVALID_STATUS'; RETURN; END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_seleccion) LOOP
    SELECT COALESCE((p.detalle_pedido->((item->>'item_idx')::INT)->>'cantidad')::INT, 0)
    INTO v_total_u
    FROM public.pedidos p
    WHERE p.id = (item->>'pedido_id')::UUID AND p.sesion_id = v_sesion_id;

    SELECT COALESCE(SUM(unidades_pagadas), 0) INTO v_paid_u
    FROM public.mesa_item_pagos
    WHERE sesion_id = v_sesion_id
      AND pedido_id = (item->>'pedido_id')::UUID
      AND item_idx  = (item->>'item_idx')::INT;

    IF (item->>'unidades')::INT > (v_total_u - v_paid_u) THEN
      RETURN QUERY SELECT false, 'ITEM_UNAVAILABLE'; RETURN;
    END IF;
  END LOOP;

  UPDATE public.mesa_pagos_personalizados
  SET seleccion = p_seleccion, importe_cents = p_importe_cents,
      updated_at = now(), expires_at = now() + interval '10 minutes'
  WHERE id = p_turno_id;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

-- 3. commit_custom_payment
-- Transitions en_seleccion -> en_pago, inserts mesa_item_pagos rows.
-- Call for Redsys (en_pago waits for webhook) and manual (call complete_custom_payment after).
-- Returns (success BOOL, error_code TEXT).
CREATE OR REPLACE FUNCTION public.commit_custom_payment(
  p_turno_id          UUID,
  p_payment_order_ref TEXT,
  p_importe_cents     INTEGER
)
RETURNS TABLE(success BOOLEAN, error_code TEXT)
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_status     TEXT;
  v_sesion_id  UUID;
  v_empresa_id UUID;
  v_seleccion  JSONB;
  item         JSONB;
BEGIN
  SELECT status, sesion_id, empresa_id, seleccion
  INTO v_status, v_sesion_id, v_empresa_id, v_seleccion
  FROM public.mesa_pagos_personalizados WHERE id = p_turno_id FOR UPDATE;

  IF v_status IS NULL THEN RETURN QUERY SELECT false, 'TURNO_NOT_FOUND'; RETURN; END IF;
  IF v_status != 'en_seleccion' THEN RETURN QUERY SELECT false, 'INVALID_STATUS'; RETURN; END IF;
  IF v_seleccion IS NULL OR jsonb_array_length(v_seleccion) = 0
    THEN RETURN QUERY SELECT false, 'EMPTY_SELECTION'; RETURN; END IF;

  UPDATE public.mesa_pagos_personalizados
  SET status = 'en_pago', payment_order_ref = p_payment_order_ref,
      importe_cents = p_importe_cents, updated_at = now()
  WHERE id = p_turno_id;

  FOR item IN SELECT * FROM jsonb_array_elements(v_seleccion) LOOP
    INSERT INTO public.mesa_item_pagos
      (sesion_id, empresa_id, pedido_id, item_idx, unidades_pagadas, importe_pagado_cents, turno_id)
    VALUES (
      v_sesion_id, v_empresa_id,
      (item->>'pedido_id')::UUID, (item->>'item_idx')::INT,
      (item->>'unidades')::INT, 0, p_turno_id
    );
  END LOOP;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

-- 4. complete_custom_payment
-- Transitions en_pago -> pagado. Clears custom_turno_id. Marks sesion_pagada if all items covered.
-- Returns (success BOOL, sesion_completa BOOL, out_sesion_id UUID).
CREATE OR REPLACE FUNCTION public.complete_custom_payment(p_turno_id UUID)
RETURNS TABLE(success BOOLEAN, sesion_completa BOOLEAN, out_sesion_id UUID)
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_status     TEXT;
  v_sesion_id  UUID;
  v_empresa_id UUID;
  v_total_u    INT;
  v_paid_u     INT;
BEGIN
  SELECT status, sesion_id, empresa_id
  INTO v_status, v_sesion_id, v_empresa_id
  FROM public.mesa_pagos_personalizados WHERE id = p_turno_id FOR UPDATE;

  IF v_status IS NULL OR v_status != 'en_pago' THEN
    RETURN QUERY SELECT false, false, NULL::UUID; RETURN;
  END IF;

  UPDATE public.mesa_pagos_personalizados
  SET status = 'pagado', updated_at = now() WHERE id = p_turno_id;

  UPDATE public.mesa_sesiones SET custom_turno_id = NULL WHERE id = v_sesion_id;

  -- Check if all item units in the session are now paid
  SELECT COALESCE(SUM((item->>'cantidad')::INT), 0) INTO v_total_u
  FROM public.pedidos p, jsonb_array_elements(p.detalle_pedido) AS item
  WHERE p.sesion_id = v_sesion_id AND p.empresa_id = v_empresa_id;

  SELECT COALESCE(SUM(unidades_pagadas), 0) INTO v_paid_u
  FROM public.mesa_item_pagos WHERE sesion_id = v_sesion_id;

  IF v_paid_u >= v_total_u AND v_total_u > 0 THEN
    UPDATE public.mesa_sesiones SET sesion_pagada = true WHERE id = v_sesion_id;
    UPDATE public.pedidos SET payment_status = 'paid'
    WHERE sesion_id = v_sesion_id AND empresa_id = v_empresa_id;
    RETURN QUERY SELECT true, true, v_sesion_id;
  ELSE
    RETURN QUERY SELECT true, false, v_sesion_id;
  END IF;
END;
$$;

-- 5. cancel_custom_turn
-- Cancels an en_seleccion turn and clears the lock.
-- Fails if status = en_pago (payment in flight — cannot cancel).
-- Returns (success BOOL, error_code TEXT).
CREATE OR REPLACE FUNCTION public.cancel_custom_turn(p_turno_id UUID)
RETURNS TABLE(success BOOLEAN, error_code TEXT)
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_status    TEXT;
  v_sesion_id UUID;
BEGIN
  SELECT status, sesion_id INTO v_status, v_sesion_id
  FROM public.mesa_pagos_personalizados WHERE id = p_turno_id FOR UPDATE;

  IF v_status IS NULL THEN RETURN QUERY SELECT false, 'TURNO_NOT_FOUND'; RETURN; END IF;
  IF v_status = 'en_pago' THEN RETURN QUERY SELECT false, 'CANNOT_CANCEL_PAYING'; RETURN; END IF;
  IF v_status IN ('pagado','cancelado') THEN RETURN QUERY SELECT true, NULL::TEXT; RETURN; END IF;

  DELETE FROM public.mesa_item_pagos WHERE turno_id = p_turno_id;

  UPDATE public.mesa_pagos_personalizados
  SET status = 'cancelado', updated_at = now() WHERE id = p_turno_id;

  UPDATE public.mesa_sesiones
  SET custom_turno_id = NULL
  WHERE id = v_sesion_id AND custom_turno_id = p_turno_id;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

-- 6. switch_to_equal_split_remaining
-- Switches personalizado -> igual for the remaining unpaid amount.
-- Fails if there is an active en_seleccion turn.
-- Returns (success BOOL, importe_por_persona_cents INT, error_code TEXT).
CREATE OR REPLACE FUNCTION public.switch_to_equal_split_remaining(
  p_sesion_id    UUID,
  p_empresa_id   UUID,
  p_num_personas INTEGER
)
RETURNS TABLE(success BOOLEAN, importe_por_persona_cents INTEGER, error_code TEXT)
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_turno_id     UUID;
  v_turno_status TEXT;
  v_total_cents  INTEGER;
  v_paid_cents   INTEGER;
  v_remaining    INTEGER;
  v_per_person   INTEGER;
BEGIN
  SELECT custom_turno_id INTO v_turno_id
  FROM public.mesa_sesiones WHERE id = p_sesion_id FOR UPDATE;

  IF v_turno_id IS NOT NULL THEN
    SELECT status INTO v_turno_status
    FROM public.mesa_pagos_personalizados WHERE id = v_turno_id;
    IF v_turno_status = 'en_seleccion' THEN
      RETURN QUERY SELECT false, 0, 'TURN_ACTIVE'; RETURN;
    END IF;
  END IF;

  SELECT COALESCE(SUM(ROUND((p.total * 100)::NUMERIC)), 0)::INTEGER
  INTO v_total_cents
  FROM public.pedidos p
  WHERE p.sesion_id = p_sesion_id AND p.empresa_id = p_empresa_id;

  SELECT COALESCE(SUM(importe_cents), 0)::INTEGER INTO v_paid_cents
  FROM public.mesa_pagos_personalizados
  WHERE sesion_id = p_sesion_id AND status = 'pagado';

  v_remaining  := v_total_cents - v_paid_cents;
  v_per_person := ROUND(v_remaining::NUMERIC / p_num_personas);

  UPDATE public.mesa_sesiones
  SET division_tipo = 'igual',
      division_personas = p_num_personas,
      division_pagos_realizados = 0,
      custom_turno_id = NULL,
      division_base_cents = v_remaining
  WHERE id = p_sesion_id;

  RETURN QUERY SELECT true, v_per_person, NULL::TEXT;
END;
$$;
```

- [ ] **Step 2: Apply in Supabase SQL editor, verify all 6 functions exist**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260613000002_custom_split_bill_rpcs.sql
git commit -m "feat(db): add 6 atomic RPCs for custom split bill"
```

---

## Task 3: Session Endpoint Extension

**Files:**
- Modify: `src/app/api/mesas/[mesaId]/orders/route.ts`

- [ ] **Step 1: Extend the parallel fetch to also query mesa_item_pagos**

In the `try` block (line ~68), change the `Promise.all` to:

```ts
const [sesionRowResult, paymentRowsResult, itemsPagadosResult] = await Promise.all([
  supabaseAdmin
    .from('mesa_sesiones')
    .select('division_personas, division_pagos_realizados, pago_en_curso, pago_iniciado_en, division_tipo, custom_turno_id, division_base_cents')
    .eq('id', sesion.id)
    .single(),
  supabaseAdmin.from('pedidos').select('payment_status').eq('sesion_id', sesion.id),
  supabaseAdmin
    .from('mesa_item_pagos')
    .select('pedido_id, item_idx, unidades_pagadas, importe_pagado_cents')
    .eq('sesion_id', sesion.id),
]);
```

- [ ] **Step 2: Extract divisionTipo, customTurno, itemsPagados from the results**

After extracting `row`, add:

```ts
const divisionTipo = (row?.division_tipo as string | null) ?? null;
const customTurnoId = (row?.custom_turno_id as string | null) ?? null;
const divisionBaseCents = (row?.division_base_cents as number | null) ?? null;

let customTurno: { id: string; status: string; importeCents: number | null } | null = null;
if (customTurnoId) {
  const { data: turnoRow } = await supabaseAdmin
    .from('mesa_pagos_personalizados')
    .select('id, status, importe_cents')
    .eq('id', customTurnoId)
    .maybeSingle();
  if (turnoRow) {
    const tr = turnoRow as { id: string; status: string; importe_cents: number | null };
    customTurno = { id: tr.id, status: tr.status, importeCents: tr.importe_cents };
  }
}

const itemsPagados = (itemsPagadosResult.data ?? []) as {
  pedido_id: string; item_idx: number; unidades_pagadas: number; importe_pagado_cents: number;
}[];
```

- [ ] **Step 3: Use divisionBaseCents for importePorPersona**

Inside the `if (row?.division_personas)` block, replace the `importePorPersona` line:

```ts
const baseTotal = divisionBaseCents != null ? divisionBaseCents / 100 : total;
const importePorPersona = Math.round((baseTotal / personas) * 100) / 100;
```

- [ ] **Step 4: Add new fields to the return statement**

```ts
return NextResponse.json({
  orders, sesionId: sesion.id, total, pagosHabilitados,
  division, sesionPagada, pagoEnCurso,
  divisionTipo,
  customTurno,
  itemsPagados,
});
```

- [ ] **Step 5: Verify + Commit**

```bash
pnpm lint
git add src/app/api/mesas/[mesaId]/orders/route.ts
git commit -m "feat(api): extend mesa session payload with divisionTipo, customTurno, itemsPagados"
```

---

## Task 4: initiateCustomTurnUseCase + Route

**Files:**
- Create: `src/core/application/use-cases/payment/initiateCustomTurnUseCase.ts`
- Create: `src/app/api/mesas/[mesaId]/custom-turn/route.ts`

- [ ] **Step 1: Write initiateCustomTurnUseCase.ts**

```ts
import { Result } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';

export interface InitiateCustomTurnResult {
  claimed: boolean;
  turnoId: string | null;
}

export async function initiateCustomTurnUseCase(input: {
  mesaId: string;
  empresaId: string;
}): Promise<Result<InitiateCustomTurnResult>> {
  try {
    const supabase = getSupabaseClient();

    const { data: sesion } = await supabase
      .from('mesa_sesiones')
      .select('id, empresa_id, sesion_pagada')
      .eq('mesa_id', input.mesaId)
      .is('cerrada_at', null)
      .maybeSingle();

    if (!sesion) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'No hay sesión activa', module: 'use-case', method: 'initiateCustomTurnUseCase' } };
    }
    const s = sesion as Record<string, unknown>;
    if (s['empresa_id'] !== input.empresaId) {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Acceso denegado', module: 'use-case', method: 'initiateCustomTurnUseCase' } };
    }
    if (s['sesion_pagada'] === true) {
      return { success: false, error: { code: 'ALREADY_PAID', message: 'La sesión ya está pagada', module: 'use-case', method: 'initiateCustomTurnUseCase' } };
    }

    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('claim_custom_turn', { p_sesion_id: s['id'] as string, p_empresa_id: input.empresaId });

    if (rpcError) {
      const appError = await logger.logAndReturnError('DB_ERROR', rpcError.message, 'use-case', 'initiateCustomTurnUseCase', { details: { mesaId: input.mesaId } });
      return { success: false, error: appError };
    }

    const row = (rpcResult as { claimed: boolean; turno_id: string | null }[] | null)?.[0];
    return { success: true, data: { claimed: row?.claimed ?? false, turnoId: row?.turno_id ?? null } };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'use-case', 'initiateCustomTurnUseCase', { details: { mesaId: input.mesaId } });
    return { success: false, error: appError };
  }
}
```

- [ ] **Step 2: Write the route**

```ts
// src/app/api/mesas/[mesaId]/custom-turn/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { initiateCustomTurnUseCase } from '@/core/application/use-cases/payment/initiateCustomTurnUseCase';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const mesaIdSchema = z.string().uuid();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const { mesaId } = await params;
  if (!mesaIdSchema.safeParse(mesaId).success) {
    return NextResponse.json({ error: 'mesaId inválido' }, { status: 400 });
  }
  const rateLimited = await rateLimitPublic(request as Parameters<typeof rateLimitPublic>[0]);
  if (rateLimited) return rateLimited;

  // Resolve empresaId from active session
  const supabase = getSupabaseClient();
  const { data: sesion } = await supabase
    .from('mesa_sesiones').select('empresa_id')
    .eq('mesa_id', mesaId).is('cerrada_at', null).maybeSingle();
  const empresaId = (sesion as { empresa_id: string } | null)?.empresa_id;
  if (!empresaId) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });

  const result = await initiateCustomTurnUseCase({ mesaId, empresaId });
  if (!result.success) {
    const status = result.error.code === 'ALREADY_PAID' ? 409 : result.error.code === 'NOT_FOUND' ? 404 : 500;
    return NextResponse.json({ error: result.error.message }, { status });
  }
  if (!result.data.claimed) {
    return NextResponse.json({ error: 'Turno bloqueado — alguien está eligiendo' }, { status: 409 });
  }
  return NextResponse.json({ turnoId: result.data.turnoId });
}
```

- [ ] **Step 3: Verify + Commit**

```bash
pnpm lint
git add src/core/application/use-cases/payment/initiateCustomTurnUseCase.ts \
        src/app/api/mesas/[mesaId]/custom-turn/route.ts
git commit -m "feat(api): add POST /custom-turn to claim custom payment turn"
```

---

## Task 5: updateCustomSelectionUseCase + Route

**Files:**
- Create: `src/core/application/use-cases/payment/updateCustomSelectionUseCase.ts`
- Create: `src/app/api/mesas/[mesaId]/custom-turn/[turnoId]/selection/route.ts`

- [ ] **Step 1: Write updateCustomSelectionUseCase.ts**

```ts
import { Result } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';

export interface SelectionItem { pedido_id: string; item_idx: number; unidades: number; }

export async function updateCustomSelectionUseCase(input: {
  turnoId: string;
  seleccion: SelectionItem[];
  importeCents: number;
}): Promise<Result<void>> {
  try {
    const supabase = getSupabaseClient();
    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('update_custom_selection', {
        p_turno_id: input.turnoId,
        p_seleccion: input.seleccion,
        p_importe_cents: input.importeCents,
      });
    if (rpcError) {
      const appError = await logger.logAndReturnError('DB_ERROR', rpcError.message, 'use-case', 'updateCustomSelectionUseCase', { details: { turnoId: input.turnoId } });
      return { success: false, error: appError };
    }
    const row = (rpcResult as { success: boolean; error_code: string | null }[] | null)?.[0];
    if (!row?.success) {
      return { success: false, error: { code: row?.error_code ?? 'UNKNOWN', message: row?.error_code ?? 'Error', module: 'use-case', method: 'updateCustomSelectionUseCase' } };
    }
    return { success: true, data: undefined };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'use-case', 'updateCustomSelectionUseCase', { details: { turnoId: input.turnoId } });
    return { success: false, error: appError };
  }
}
```

- [ ] **Step 2: Write the route**

```ts
// src/app/api/mesas/[mesaId]/custom-turn/[turnoId]/selection/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { updateCustomSelectionUseCase } from '@/core/application/use-cases/payment/updateCustomSelectionUseCase';

const paramsSchema = z.object({ mesaId: z.string().uuid(), turnoId: z.string().uuid() });
const bodySchema = z.object({
  seleccion: z.array(z.object({
    pedido_id: z.string().uuid(),
    item_idx: z.number().int().min(0),
    unidades: z.number().int().min(1),
  })),
  importeCents: z.number().int().min(0),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ mesaId: string; turnoId: string }> }
) {
  const { mesaId, turnoId } = await params;
  if (!paramsSchema.safeParse({ mesaId, turnoId }).success) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
  }
  const rateLimited = await rateLimitPublic(request as Parameters<typeof rateLimitPublic>[0]);
  if (rateLimited) return rateLimited;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const result = await updateCustomSelectionUseCase({ turnoId, seleccion: parsed.data.seleccion, importeCents: parsed.data.importeCents });
  if (!result.success) {
    const status = result.error.code === 'ITEM_UNAVAILABLE' ? 409 : result.error.code === 'INVALID_STATUS' ? 409 : 500;
    return NextResponse.json({ error: result.error.message }, { status });
  }
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Verify + Commit**

```bash
pnpm lint
git add src/core/application/use-cases/payment/updateCustomSelectionUseCase.ts \
        src/app/api/mesas/[mesaId]/custom-turn/[turnoId]/selection/route.ts
git commit -m "feat(api): add PATCH /selection to persist item selection draft"
```

---

## Task 6: commitCustomPaymentUseCase + Route

**Files:**
- Create: `src/core/application/use-cases/payment/commitCustomPaymentUseCase.ts`
- Create: `src/app/api/mesas/[mesaId]/custom-turn/[turnoId]/commit/route.ts`

- [ ] **Step 1: Write commitCustomPaymentUseCase.ts**

```ts
import { Result } from '@/core/domain/entities/types';
import { DELIVERY_ERRORS } from '@/core/domain/constants/api-errors';
import { buildRedsysFormData, generatePaymentOrderRef, RedsysFormData } from '@/core/infrastructure/services/redsys.service';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';

export type CommitCustomPaymentResult =
  | { metodo: 'redsys'; formData: RedsysFormData; paymentOrderRef: string }
  | { metodo: 'unavailable' };

export async function commitCustomPaymentUseCase(input: {
  turnoId: string;
  empresaId: string;
  importeCents: number;
  urlOk: string;
  urlKo: string;
  webhookUrl: string;
}): Promise<Result<CommitCustomPaymentResult>> {
  try {
    const supabase = getSupabaseClient();

    const { data: empresa } = await supabase
      .from('empresas')
      .select('nombre, redsys_merchant_code, redsys_terminal, redsys_secret_key, pagos_mesa_habilitados')
      .eq('id', input.empresaId).single();

    if (!empresa) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Empresa no encontrada', module: 'use-case', method: 'commitCustomPaymentUseCase' } };
    }
    const e = empresa as Record<string, unknown>;
    if (!e['pagos_mesa_habilitados']) {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Pagos no habilitados', module: 'use-case', method: 'commitCustomPaymentUseCase' } };
    }

    const merchantCode = e['redsys_merchant_code'] as string | null;
    const terminal     = e['redsys_terminal'] as string | null;
    const secretKey    = e['redsys_secret_key'] as string | null;
    const merchantName = (e['nombre'] as string | null) ?? 'Tienda';
    const isDev = process.env.NODE_ENV !== 'production';
    const effectiveCode = merchantCode ?? (isDev ? '999008881' : null);
    const effectiveKey  = secretKey    ?? (isDev ? 'sq7HjrUOBfKmC576ILgskD5srU870gJ7' : null);
    const effectiveTerm = terminal     ?? '001';

    if (!effectiveCode || !effectiveKey) {
      return { success: true, data: { metodo: 'unavailable' } };
    }

    const paymentOrderRef = generatePaymentOrderRef();

    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('commit_custom_payment', {
        p_turno_id: input.turnoId,
        p_payment_order_ref: paymentOrderRef,
        p_importe_cents: input.importeCents,
      });

    if (rpcError) {
      const appError = await logger.logAndReturnError('DB_ERROR', rpcError.message, 'use-case', 'commitCustomPaymentUseCase', { details: { turnoId: input.turnoId } });
      return { success: false, error: appError };
    }

    const row = (rpcResult as { success: boolean; error_code: string | null }[] | null)?.[0];
    if (!row?.success) {
      return { success: false, error: { code: row?.error_code ?? 'COMMIT_FAILED', message: 'Error al confirmar selección', module: 'use-case', method: 'commitCustomPaymentUseCase' } };
    }

    const formData = buildRedsysFormData(
      { merchantCode: effectiveCode, terminal: effectiveTerm, secretKey: effectiveKey },
      { order: paymentOrderRef, amountCents: input.importeCents, currency: '978', transactionType: '0', urlOk: input.urlOk, urlKo: input.urlKo, merchantName, webhookUrl: input.webhookUrl }
    );

    return { success: true, data: { metodo: 'redsys', formData, paymentOrderRef } };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'use-case', 'commitCustomPaymentUseCase', { details: { turnoId: input.turnoId } });
    return { success: false, error: appError };
  }
}
```

- [ ] **Step 2: Write the route**

```ts
// src/app/api/mesas/[mesaId]/custom-turn/[turnoId]/commit/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { commitCustomPaymentUseCase } from '@/core/application/use-cases/payment/commitCustomPaymentUseCase';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const paramsSchema = z.object({ mesaId: z.string().uuid(), turnoId: z.string().uuid() });
const bodySchema = z.object({ importeCents: z.number().int().min(1) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mesaId: string; turnoId: string }> }
) {
  const { mesaId, turnoId } = await params;
  if (!paramsSchema.safeParse({ mesaId, turnoId }).success) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
  }
  const rateLimited = await rateLimitPublic(request as Parameters<typeof rateLimitPublic>[0]);
  if (rateLimited) return rateLimited;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const supabase = getSupabaseClient();
  const { data: sesion } = await supabase
    .from('mesa_sesiones').select('empresa_id')
    .eq('mesa_id', mesaId).is('cerrada_at', null).maybeSingle();
  const empresaId = (sesion as { empresa_id: string } | null)?.empresa_id;
  if (!empresaId) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });

  const origin = new URL(request.url).origin;
  const result = await commitCustomPaymentUseCase({
    turnoId, empresaId, importeCents: parsed.data.importeCents,
    urlOk: `${origin}/mesa/${mesaId}/orders?customPaid=ok`,
    urlKo: `${origin}/mesa/${mesaId}/orders?customPaid=ko`,
    webhookUrl: `${origin}/api/payments/redsys/webhook?empresaId=${empresaId}`,
  });

  if (!result.success) {
    const status = result.error.code === 'EMPTY_SELECTION' ? 422 : result.error.code === 'INVALID_STATUS' ? 409 : 500;
    return NextResponse.json({ error: result.error.message }, { status });
  }
  return NextResponse.json(result.data);
}
```

- [ ] **Step 3: Verify + Commit**

```bash
pnpm lint
git add src/core/application/use-cases/payment/commitCustomPaymentUseCase.ts \
        src/app/api/mesas/[mesaId]/custom-turn/[turnoId]/commit/route.ts
git commit -m "feat(api): add POST /commit to lock selection and initiate Redsys payment"
```

---

## Task 7: completeCustomPaymentUseCase + Route

**Files:**
- Create: `src/core/application/use-cases/payment/completeCustomPaymentUseCase.ts`
- Create: `src/app/api/mesas/[mesaId]/custom-turn/[turnoId]/complete/route.ts`

- [ ] **Step 1: Write completeCustomPaymentUseCase.ts**

```ts
import { Result } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';

export interface CompleteCustomPaymentResult {
  sesionCompleta: boolean;
  sesionId: string | null;
}

export async function completeCustomPaymentUseCase(turnoId: string): Promise<Result<CompleteCustomPaymentResult>> {
  try {
    const supabase = getSupabaseClient();
    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('complete_custom_payment', { p_turno_id: turnoId });

    if (rpcError) {
      const appError = await logger.logAndReturnError('DB_ERROR', rpcError.message, 'use-case', 'completeCustomPaymentUseCase', { details: { turnoId } });
      return { success: false, error: appError };
    }

    const row = (rpcResult as { success: boolean; sesion_completa: boolean; out_sesion_id: string }[] | null)?.[0];
    if (!row?.success) {
      return { success: false, error: { code: 'COMPLETE_FAILED', message: 'No se pudo completar el turno', module: 'use-case', method: 'completeCustomPaymentUseCase' } };
    }
    return { success: true, data: { sesionCompleta: row.sesion_completa, sesionId: row.out_sesion_id } };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'use-case', 'completeCustomPaymentUseCase', { details: { turnoId } });
    return { success: false, error: appError };
  }
}
```

- [ ] **Step 2: Write the route**

```ts
// src/app/api/mesas/[mesaId]/custom-turn/[turnoId]/complete/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { completeCustomPaymentUseCase } from '@/core/application/use-cases/payment/completeCustomPaymentUseCase';

const paramsSchema = z.object({ mesaId: z.string().uuid(), turnoId: z.string().uuid() });

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ mesaId: string; turnoId: string }> }
) {
  const { mesaId, turnoId } = await params;
  if (!paramsSchema.safeParse({ mesaId, turnoId }).success) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
  }
  const result = await completeCustomPaymentUseCase(turnoId);
  if (!result.success) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json(result.data);
}
```

- [ ] **Step 3: Verify + Commit**

```bash
pnpm lint
git add src/core/application/use-cases/payment/completeCustomPaymentUseCase.ts \
        src/app/api/mesas/[mesaId]/custom-turn/[turnoId]/complete/route.ts
git commit -m "feat(api): add completeCustomPaymentUseCase and POST /complete route"
```

---

## Task 8: cancelCustomTurnUseCase + Route (DELETE)

**Files:**
- Create: `src/core/application/use-cases/payment/cancelCustomTurnUseCase.ts`
- Create: `src/app/api/mesas/[mesaId]/custom-turn/[turnoId]/route.ts`

- [ ] **Step 1: Write cancelCustomTurnUseCase.ts**

```ts
import { Result } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';

export async function cancelCustomTurnUseCase(turnoId: string): Promise<Result<void>> {
  try {
    const supabase = getSupabaseClient();
    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('cancel_custom_turn', { p_turno_id: turnoId });
    if (rpcError) {
      const appError = await logger.logAndReturnError('DB_ERROR', rpcError.message, 'use-case', 'cancelCustomTurnUseCase', { details: { turnoId } });
      return { success: false, error: appError };
    }
    const row = (rpcResult as { success: boolean; error_code: string | null }[] | null)?.[0];
    if (!row?.success) {
      return { success: false, error: { code: row?.error_code ?? 'CANCEL_FAILED', message: row?.error_code ?? 'Error', module: 'use-case', method: 'cancelCustomTurnUseCase' } };
    }
    return { success: true, data: undefined };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'use-case', 'cancelCustomTurnUseCase', { details: { turnoId } });
    return { success: false, error: appError };
  }
}
```

- [ ] **Step 2: Write the route**

```ts
// src/app/api/mesas/[mesaId]/custom-turn/[turnoId]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { cancelCustomTurnUseCase } from '@/core/application/use-cases/payment/cancelCustomTurnUseCase';

const paramsSchema = z.object({ mesaId: z.string().uuid(), turnoId: z.string().uuid() });

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ mesaId: string; turnoId: string }> }
) {
  const { mesaId, turnoId } = await params;
  if (!paramsSchema.safeParse({ mesaId, turnoId }).success) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
  }
  const rateLimited = await rateLimitPublic(request as Parameters<typeof rateLimitPublic>[0]);
  if (rateLimited) return rateLimited;

  const result = await cancelCustomTurnUseCase(turnoId);
  if (!result.success) {
    const status = result.error.code === 'CANNOT_CANCEL_PAYING' ? 409 : 500;
    return NextResponse.json({ error: result.error.message }, { status });
  }
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Verify + Commit**

```bash
pnpm lint
git add src/core/application/use-cases/payment/cancelCustomTurnUseCase.ts \
        src/app/api/mesas/[mesaId]/custom-turn/[turnoId]/route.ts
git commit -m "feat(api): add DELETE /custom-turn/[turnoId] to cancel a turn"
```

---

## Task 9: switchToEqualSplitRemainingUseCase + Route

**Files:**
- Create: `src/core/application/use-cases/payment/switchToEqualSplitRemainingUseCase.ts`
- Create: `src/app/api/mesas/[mesaId]/equal-split-remaining/route.ts`

- [ ] **Step 1: Write switchToEqualSplitRemainingUseCase.ts**

```ts
import { Result } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';

export async function switchToEqualSplitRemainingUseCase(input: {
  mesaId: string;
  empresaId: string;
  numPersonas: number;
}): Promise<Result<{ importePorPersonaCents: number }>> {
  try {
    const supabase = getSupabaseClient();
    const { data: sesion } = await supabase
      .from('mesa_sesiones').select('id, empresa_id')
      .eq('mesa_id', input.mesaId).is('cerrada_at', null).maybeSingle();

    if (!sesion) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'No hay sesión activa', module: 'use-case', method: 'switchToEqualSplitRemainingUseCase' } };
    }
    const s = sesion as Record<string, unknown>;
    if (s['empresa_id'] !== input.empresaId) {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Acceso denegado', module: 'use-case', method: 'switchToEqualSplitRemainingUseCase' } };
    }

    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('switch_to_equal_split_remaining', {
        p_sesion_id: s['id'] as string,
        p_empresa_id: input.empresaId,
        p_num_personas: input.numPersonas,
      });

    if (rpcError) {
      const appError = await logger.logAndReturnError('DB_ERROR', rpcError.message, 'use-case', 'switchToEqualSplitRemainingUseCase', { details: { mesaId: input.mesaId } });
      return { success: false, error: appError };
    }

    const row = (rpcResult as { success: boolean; importe_por_persona_cents: number; error_code: string | null }[] | null)?.[0];
    if (!row?.success) {
      return { success: false, error: { code: row?.error_code ?? 'SWITCH_FAILED', message: 'No se pudo cambiar el modo', module: 'use-case', method: 'switchToEqualSplitRemainingUseCase' } };
    }
    return { success: true, data: { importePorPersonaCents: row.importe_por_persona_cents } };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'use-case', 'switchToEqualSplitRemainingUseCase', { details: { mesaId: input.mesaId } });
    return { success: false, error: appError };
  }
}
```

- [ ] **Step 2: Write the route**

```ts
// src/app/api/mesas/[mesaId]/equal-split-remaining/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimitPublic } from '@/core/infrastructure/api/rate-limit';
import { switchToEqualSplitRemainingUseCase } from '@/core/application/use-cases/payment/switchToEqualSplitRemainingUseCase';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const mesaIdSchema = z.string().uuid();
const bodySchema = z.object({ numPersonas: z.number().int().min(1).max(20) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const { mesaId } = await params;
  if (!mesaIdSchema.safeParse(mesaId).success) {
    return NextResponse.json({ error: 'mesaId inválido' }, { status: 400 });
  }
  const rateLimited = await rateLimitPublic(request as Parameters<typeof rateLimitPublic>[0]);
  if (rateLimited) return rateLimited;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const supabase = getSupabaseClient();
  const { data: sesion } = await supabase
    .from('mesa_sesiones').select('empresa_id')
    .eq('mesa_id', mesaId).is('cerrada_at', null).maybeSingle();
  const empresaId = (sesion as { empresa_id: string } | null)?.empresa_id;
  if (!empresaId) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });

  const result = await switchToEqualSplitRemainingUseCase({ mesaId, empresaId, numPersonas: parsed.data.numPersonas });
  if (!result.success) {
    const status = result.error.code === 'TURN_ACTIVE' ? 409 : 500;
    return NextResponse.json({ error: result.error.message }, { status });
  }
  return NextResponse.json(result.data);
}
```

- [ ] **Step 3: Verify + Commit**

```bash
pnpm lint
git add src/core/application/use-cases/payment/switchToEqualSplitRemainingUseCase.ts \
        src/app/api/mesas/[mesaId]/equal-split-remaining/route.ts
git commit -m "feat(api): add POST /equal-split-remaining"
```

---

## Task 10: Extend Redsys Webhook

**Files:**
- Modify: `src/core/application/use-cases/payment/processRedsysWebhookUseCase.ts`

- [ ] **Step 1: Locate the "Path 1" comment (~line 81) and insert Path 0 above it**

```ts
// ── Path 0: Custom turn payment (mesa_pagos_personalizados) ────────────────
const { data: customTurno } = await supabase
  .from('mesa_pagos_personalizados')
  .select('id, sesion_id, empresa_id, status')
  .eq('payment_order_ref', dsOrder)
  .maybeSingle();

if (customTurno) {
  const ct = customTurno as { id: string; sesion_id: string; empresa_id: string; status: string };

  if (newPaymentStatus === 'paid') {
    const { data: rpc } = await supabase
      .rpc('complete_custom_payment', { p_turno_id: ct.id });
    const rpcRow = (rpc as { success: boolean }[] | null)?.[0];
    // If RPC returns !success, another webhook already processed it — skip (idempotent)
    if (!rpcRow?.success) {
      return { success: true, data: { verified: true, skipped: true } };
    }
  } else {
    // Failed payment: cancel turn, delete item_pagos, release lock
    await supabase.rpc('cancel_custom_turn', { p_turno_id: ct.id });
  }

  return { success: true, data: { verified: true, paymentStatus: newPaymentStatus } };
}
// ── end Path 0 ───────────────────────────────────────────────────────────────
```

- [ ] **Step 2: Verify + Commit**

```bash
pnpm lint
git add src/core/application/use-cases/payment/processRedsysWebhookUseCase.ts
git commit -m "feat(payment): handle custom turn payments in Redsys webhook (Path 0)"
```

---

## Task 11: Extend Manual Payment for Custom Turns

**Files:**
- Modify: `src/core/application/use-cases/payment/registerManualMesaPaymentUseCase.ts`

- [ ] **Step 1: Extend the session select to include new columns**

Change the `.select(...)` line to:

```ts
.select('id, empresa_id, division_personas, division_pagos_realizados, sesion_pagada, division_tipo, custom_turno_id')
```

- [ ] **Step 2: Extract new fields and add personalizado branch**

After extracting `sesionId`, `sesionEmpresaId`, `divisionPersonas`, add:

```ts
const divisionTipo = s['division_tipo'] as string | null;
const customTurnoId = s['custom_turno_id'] as string | null;
```

Then insert this block before the existing `if (divisionPersonas != null)`:

```ts
if (divisionTipo === 'personalizado' && customTurnoId) {
  const { data: turno } = await supabase
    .from('mesa_pagos_personalizados')
    .select('id, status, seleccion, importe_cents')
    .eq('id', customTurnoId)
    .maybeSingle();

  const t = turno as { id: string; status: string; seleccion: unknown[]; importe_cents: number | null } | null;
  if (!t || t.status === 'pagado' || t.status === 'cancelado') {
    return { success: false, error: { code: 'ALREADY_PAID', message: 'El turno ya está resuelto', module: 'use-case', method: 'registerManualMesaPaymentUseCase' } };
  }

  if (t.status === 'en_seleccion') {
    // Commit items first (en_seleccion -> en_pago)
    const { data: commitResult } = await supabase.rpc('commit_custom_payment', {
      p_turno_id: t.id,
      p_payment_order_ref: `manual-${t.id.slice(0, 8)}-${Date.now()}`,
      p_importe_cents: t.importe_cents ?? 0,
    });
    const commitRow = (commitResult as { success: boolean }[] | null)?.[0];
    if (!commitRow?.success) {
      return { success: false, error: { code: 'EMPTY_SELECTION', message: 'No hay ítems seleccionados', module: 'use-case', method: 'registerManualMesaPaymentUseCase' } };
    }
  }

  const { data: completeResult } = await supabase
    .rpc('complete_custom_payment', { p_turno_id: customTurnoId });
  const completeRow = (completeResult as { success: boolean; sesion_completa: boolean }[] | null)?.[0];

  return { success: true, data: { pagosRealizados: 0, personas: null, fullyPaid: completeRow?.sesion_completa ?? false } };
}
```

- [ ] **Step 3: Verify + Commit**

```bash
pnpm lint
git add src/core/application/use-cases/payment/registerManualMesaPaymentUseCase.ts
git commit -m "feat(payment): extend manual payment to handle personalizado custom turn"
```

---

## Task 12: division_base_cents in initiateRedsysMesaPaymentUseCase

**Files:**
- Modify: `src/core/application/use-cases/payment/initiateRedsysMesaPaymentUseCase.ts`

- [ ] **Step 1: Add division_base_cents to the sesion select**

Find the `mesa_sesiones` select and add `division_base_cents`:

```ts
.select('id, empresa_id, division_personas, division_pagos_realizados, sesion_pagada, pago_en_curso, pago_iniciado_en, division_base_cents')
```

- [ ] **Step 2: Use it when calling the RPC**

After extracting `divisionPersonas`, add:

```ts
const divisionBaseCents = (s['division_base_cents'] as number | null) ?? null;
```

In the RPC call, change `p_session_total_cents`:

```ts
p_session_total_cents: divisionBaseCents ?? sessionTotalCents,
```

- [ ] **Step 3: Verify + Commit**

```bash
pnpm lint
git add src/core/application/use-cases/payment/initiateRedsysMesaPaymentUseCase.ts
git commit -m "feat(payment): use division_base_cents for remaining equal split amount"
```

---

## Task 13: i18n — 14 New Keys in 5 Languages

**Files:**
- Modify: `src/lib/translations.ts`

- [ ] **Step 1: Add to `es` block** (after `mesaDivisionCancel`)

```ts
mesaDivisionTypeTitle: "¿Cómo queréis dividir?",
mesaDivisionTypeEqual: "Dividir el total",
mesaDivisionTypeEqualDesc: "Elegís el número de personas",
mesaDivisionTypeCustom: "Personalizar el pago",
mesaDivisionTypeCustomDesc: "Cada uno elige lo suyo",
mesaCustomWaiting: "Alguien está eligiendo sus ítems. Espera un momento...",
mesaCustomSelectTitle: "Seleccioná lo que vas a pagar",
mesaCustomItemPaid: "Pagado",
mesaCustomSubtotal: "Mi parte",
mesaCustomPay: "Pagar {amount}",
mesaCustomCancel: "Cancelar mi turno",
mesaRemainingAmount: "Quedan {amount} por pagar",
mesaRemainingMyTurn: "Es mi turno — elegir ítems",
mesaRemainingEqualSplit: "Dividir lo que queda",
mesaCustomTurnExpired: "Tu turno expiró. Podés volver a empezar.",
```

- [ ] **Step 2: Add to `en` block** (after `mesaDivisionCancel`)

```ts
mesaDivisionTypeTitle: "How do you want to split?",
mesaDivisionTypeEqual: "Split the total",
mesaDivisionTypeEqualDesc: "Choose the number of people",
mesaDivisionTypeCustom: "Customize payment",
mesaDivisionTypeCustomDesc: "Each person picks their own",
mesaCustomWaiting: "Someone is selecting their items. Please wait...",
mesaCustomSelectTitle: "Select what you want to pay for",
mesaCustomItemPaid: "Paid",
mesaCustomSubtotal: "My share",
mesaCustomPay: "Pay {amount}",
mesaCustomCancel: "Cancel my turn",
mesaRemainingAmount: "{amount} remaining",
mesaRemainingMyTurn: "My turn — pick items",
mesaRemainingEqualSplit: "Split remaining",
mesaCustomTurnExpired: "Your turn expired. You can start again.",
```

- [ ] **Step 3: Add to `fr` block** (after `mesaDivisionCancel`)

```ts
mesaDivisionTypeTitle: "Comment voulez-vous diviser?",
mesaDivisionTypeEqual: "Diviser le total",
mesaDivisionTypeEqualDesc: "Choisissez le nombre de personnes",
mesaDivisionTypeCustom: "Paiement personnalisé",
mesaDivisionTypeCustomDesc: "Chacun choisit sa part",
mesaCustomWaiting: "Quelqu'un choisit ses plats. Veuillez patienter...",
mesaCustomSelectTitle: "Sélectionnez ce que vous payez",
mesaCustomItemPaid: "Payé",
mesaCustomSubtotal: "Ma part",
mesaCustomPay: "Payer {amount}",
mesaCustomCancel: "Annuler mon tour",
mesaRemainingAmount: "Reste {amount} à payer",
mesaRemainingMyTurn: "Mon tour — choisir des plats",
mesaRemainingEqualSplit: "Diviser le reste",
mesaCustomTurnExpired: "Votre tour a expiré. Vous pouvez recommencer.",
```

- [ ] **Step 4: Add to `it` block** (after `mesaDivisionCancel`)

```ts
mesaDivisionTypeTitle: "Come volete dividere?",
mesaDivisionTypeEqual: "Dividi il totale",
mesaDivisionTypeEqualDesc: "Scegliete il numero di persone",
mesaDivisionTypeCustom: "Personalizza il pagamento",
mesaDivisionTypeCustomDesc: "Ognuno sceglie il proprio",
mesaCustomWaiting: "Qualcuno sta scegliendo. Aspetta un momento...",
mesaCustomSelectTitle: "Seleziona cosa vuoi pagare",
mesaCustomItemPaid: "Pagato",
mesaCustomSubtotal: "La mia parte",
mesaCustomPay: "Paga {amount}",
mesaCustomCancel: "Cancella il mio turno",
mesaRemainingAmount: "Rimangono {amount} da pagare",
mesaRemainingMyTurn: "Tocca a me — scegli articoli",
mesaRemainingEqualSplit: "Dividi il resto",
mesaCustomTurnExpired: "Il tuo turno è scaduto. Puoi ricominciare.",
```

- [ ] **Step 5: Add to `de` block** (after `mesaDivisionCancel`)

```ts
mesaDivisionTypeTitle: "Wie möchtet ihr teilen?",
mesaDivisionTypeEqual: "Gesamtbetrag teilen",
mesaDivisionTypeEqualDesc: "Anzahl der Personen wählen",
mesaDivisionTypeCustom: "Zahlung anpassen",
mesaDivisionTypeCustomDesc: "Jeder wählt seinen Anteil",
mesaCustomWaiting: "Jemand wählt gerade. Bitte warten...",
mesaCustomSelectTitle: "Auswählen, was bezahlt wird",
mesaCustomItemPaid: "Bezahlt",
mesaCustomSubtotal: "Mein Anteil",
mesaCustomPay: "{amount} bezahlen",
mesaCustomCancel: "Meinen Zug abbrechen",
mesaRemainingAmount: "Noch {amount} zu zahlen",
mesaRemainingMyTurn: "Ich bin dran — Artikel wählen",
mesaRemainingEqualSplit: "Rest aufteilen",
mesaCustomTurnExpired: "Ihr Zug ist abgelaufen. Sie können neu beginnen.",
```

- [ ] **Step 6: Verify + Commit**

```bash
pnpm lint
git add src/lib/translations.ts
git commit -m "feat(i18n): add custom split bill keys (5 languages)"
```

---

## Task 14: DivisionTypeModal + Entry Point

**Files:**
- Modify: `src/components/mesa-orders-client.tsx`

- [ ] **Step 1: Add interfaces above MesaSessionData**

Find `interface DivisionState` and add above it:

```ts
interface CustomTurno {
  id: string;
  status: 'en_seleccion' | 'en_pago' | 'pagado' | 'cancelado';
  importeCents: number | null;
}

interface ItemPagado {
  pedido_id: string;
  item_idx: number;
  unidades_pagadas: number;
  importe_pagado_cents: number;
}
```

Extend `MesaSessionData` with:

```ts
divisionTipo?: 'igual' | 'personalizado' | null;
customTurno?: CustomTurno | null;
itemsPagados?: ItemPagado[];
```

- [ ] **Step 2: Add DivisionTypeModal component** (after the existing `DivisionModal` component)

```tsx
function DivisionTypeModal({
  onSelectEqual,
  onSelectCustom,
  onClose,
  lang,
}: {
  onSelectEqual: () => void;
  onSelectCustom: () => void;
  onClose: () => void;
  lang: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
         onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-2xl"
           onClick={e => e.stopPropagation()}>
        <h2 className="mb-5 text-center text-lg font-semibold text-[#1a1612]">
          {t("mesaDivisionTypeTitle", lang)}
        </h2>
        <div className="flex flex-col gap-3">
          <button onClick={onSelectEqual}
            className="flex flex-col items-start rounded-xl border border-[#e8e0d8] bg-[#f8f4ef] p-4 text-left active:scale-[0.98]">
            <span className="font-semibold text-[#1a1612]">{t("mesaDivisionTypeEqual", lang)}</span>
            <span className="text-sm text-[#8a7d6b]">{t("mesaDivisionTypeEqualDesc", lang)}</span>
          </button>
          <button onClick={onSelectCustom}
            className="flex flex-col items-start rounded-xl border border-[#1a1612] bg-[#1a1612] p-4 text-left active:scale-[0.98]">
            <span className="font-semibold text-white">{t("mesaDivisionTypeCustom", lang)}</span>
            <span className="text-sm text-[#c8b99a]">{t("mesaDivisionTypeCustomDesc", lang)}</span>
          </button>
        </div>
        <button onClick={onClose} className="mt-4 w-full py-2 text-sm text-[#8a7d6b]">
          Cancelar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add state and handlers in the main component**

Add near other `useState` declarations:

```ts
const [showDivisionTypeModal, setShowDivisionTypeModal] = useState(false);
const [claimingTurn, setClaimingTurn] = useState(false);
const [activeTurnoId, setActiveTurnoId] = useState<string | null>(() => {
  try { return sessionStorage.getItem(`mesa-custom-turno-${mesaId}`); } catch { return null; }
});

const handleClaimCustomTurn = async () => {
  setClaimingTurn(true);
  try {
    const res = await fetch(`/api/mesas/${encodeURIComponent(mesaId)}/custom-turn`, { method: 'POST' });
    if (!res.ok) return; // 409 means someone else has the lock — UI will update via Realtime
    const body = await res.json() as { turnoId: string };
    setActiveTurnoId(body.turnoId);
    try { sessionStorage.setItem(`mesa-custom-turno-${mesaId}`, body.turnoId); } catch { /* ignore */ }
  } finally {
    setClaimingTurn(false);
  }
};

const handleSwitchToEqualRemaining = async (numPersonas: number) => {
  const res = await fetch(`/api/mesas/${encodeURIComponent(mesaId)}/equal-split-remaining`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ numPersonas }),
  });
  if (res.ok) void refreshSessionData();   // use whatever the existing refresh function is named
};
```

- [ ] **Step 4: Replace "Dividir cuenta" button onClick and add modal render**

Find the button with `onClick={() => { void handlePrePaymentCheck('division-modal'); }}` and change to:

```tsx
onClick={() => { setShowDivisionTypeModal(true); }}
```

Add the `DivisionTypeModal` render alongside the existing `{showDivisionModal && ...}`:

```tsx
{showDivisionTypeModal && (
  <DivisionTypeModal
    lang={lang}
    onClose={() => setShowDivisionTypeModal(false)}
    onSelectEqual={() => {
      setShowDivisionTypeModal(false);
      setShowDivisionModal(true);
    }}
    onSelectCustom={() => {
      setShowDivisionTypeModal(false);
      void handleClaimCustomTurn();
    }}
  />
)}
```

- [ ] **Step 5: Verify + Commit**

```bash
pnpm lint
git add src/components/mesa-orders-client.tsx
git commit -m "feat(ui): add DivisionTypeModal and custom turn entry point"
```

---

## Task 15: CustomSelectionView + CustomItemRow

**Files:**
- Modify: `src/components/mesa-orders-client.tsx`

- [ ] **Step 1: Add CustomItemRow component**

```tsx
function CustomItemRow({
  nombre, precio, totalUnidades, unidadesPagadas, unidadesSeleccionadas, onChangeUnidades, lang,
}: {
  nombre: string; precio: number; totalUnidades: number; unidadesPagadas: number;
  unidadesSeleccionadas: number; onChangeUnidades: (n: number) => void; lang: string;
}) {
  const disponibles = totalUnidades - unidadesPagadas;

  if (disponibles <= 0) {
    return (
      <div className="flex items-center justify-between py-2 opacity-40">
        <span className="text-sm line-through">{totalUnidades}× {nombre}</span>
        <span className="text-xs text-[#8a7d6b]">{t("mesaCustomItemPaid", lang)}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1">
        <p className="text-sm font-medium text-[#1a1612]">{nombre}</p>
        <p className="text-xs text-[#8a7d6b]">
          {formatPrice(precio, "EUR", lang)} · {disponibles} disponible{disponibles !== 1 ? "s" : ""}
        </p>
      </div>
      <div className="flex items-center gap-2 ml-4">
        <button onClick={() => onChangeUnidades(Math.max(0, unidadesSeleccionadas - 1))}
          disabled={unidadesSeleccionadas === 0}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e8e0d8] text-[#1a1612] disabled:opacity-30">−</button>
        <span className="w-6 text-center text-sm font-semibold">{unidadesSeleccionadas}</span>
        <button onClick={() => onChangeUnidades(Math.min(disponibles, unidadesSeleccionadas + 1))}
          disabled={unidadesSeleccionadas >= disponibles}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1a1612] text-white disabled:opacity-30">+</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add CustomSelectionView component**

```tsx
function CustomSelectionView({
  orders, itemsPagados, turnoId, mesaId, lang, onCancelled, onCommitted,
}: {
  orders: MesaOrder[];
  itemsPagados: ItemPagado[];
  turnoId: string;
  mesaId: string;
  lang: string;
  onCancelled: () => void;
  onCommitted: (formData: Record<string, string>, paymentOrderRef: string) => void;
}) {
  const [selection, setSelection] = useState<Map<string, number>>(new Map());
  const [committing, setCommitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getPaidUnits = (pedidoId: string, itemIdx: number) =>
    itemsPagados
      .filter(p => p.pedido_id === pedidoId && p.item_idx === itemIdx)
      .reduce((s, p) => s + p.unidades_pagadas, 0);

  const subtotalCents = Array.from(selection.entries()).reduce((sum, [key, units]) => {
    const [pedidoId, idxStr] = key.split(':');
    const order = orders.find(o => o.id === pedidoId);
    const item = order?.items[Number(idxStr)];
    return sum + Math.round((item?.precio ?? 0) * 100) * units;
  }, 0);

  const handleChange = (pedidoId: string, itemIdx: number, units: number) => {
    const key = `${pedidoId}:${itemIdx}`;
    setSelection(prev => {
      const next = new Map(prev);
      if (units === 0) next.delete(key); else next.set(key, units);
      return next;
    });

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const seleccion = Array.from(selection.entries()).map(([k, u]) => {
        const [pid, idx] = k.split(':');
        return { pedido_id: pid, item_idx: Number(idx), unidades: u };
      });
      void fetch(
        `/api/mesas/${encodeURIComponent(mesaId)}/custom-turn/${encodeURIComponent(turnoId)}/selection`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seleccion, importeCents: subtotalCents }) }
      );
    }, 500);
  };

  const handlePay = async () => {
    setCommitting(true);
    try {
      const res = await fetch(
        `/api/mesas/${encodeURIComponent(mesaId)}/custom-turn/${encodeURIComponent(turnoId)}/commit`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ importeCents: subtotalCents }) }
      );
      if (!res.ok) { setCommitting(false); return; }
      const body = await res.json() as { metodo: string; formData?: Record<string, string>; paymentOrderRef?: string };
      if (body.metodo === 'redsys' && body.formData && body.paymentOrderRef) {
        onCommitted(body.formData, body.paymentOrderRef);
      }
    } catch { setCommitting(false); }
  };

  const handleCancel = async () => {
    setCancelling(true);
    await fetch(
      `/api/mesas/${encodeURIComponent(mesaId)}/custom-turn/${encodeURIComponent(turnoId)}`,
      { method: 'DELETE' }
    );
    try { sessionStorage.removeItem(`mesa-custom-turno-${mesaId}`); } catch { /* ignore */ }
    onCancelled();
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#f0ede8]">
      <div className="sticky top-0 z-10 bg-[#f0ede8] px-4 pt-4 pb-2 border-b border-[#e8e0d8]">
        <h2 className="text-lg font-semibold text-[#1a1612]">{t("mesaCustomSelectTitle", lang)}</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2 divide-y divide-[#e8e0d8]">
        {orders.map(order =>
          order.items.map((item, idx) => (
            <CustomItemRow
              key={`${order.id}:${idx}`}
              nombre={item.nombre}
              precio={item.precio}
              totalUnidades={item.cantidad}
              unidadesPagadas={getPaidUnits(order.id, idx)}
              unidadesSeleccionadas={selection.get(`${order.id}:${idx}`) ?? 0}
              onChangeUnidades={units => handleChange(order.id, idx, units)}
              lang={lang}
            />
          ))
        )}
      </div>
      <div className="sticky bottom-0 bg-white border-t border-[#e8e0d8] p-4 flex flex-col gap-2 safe-area-bottom">
        <div className="flex justify-between text-sm text-[#8a7d6b] mb-1">
          <span>{t("mesaCustomSubtotal", lang)}</span>
          <span className="font-semibold text-[#1a1612]">{formatPrice(subtotalCents / 100, "EUR", lang)}</span>
        </div>
        <button onClick={() => { void handlePay(); }}
          disabled={subtotalCents === 0 || committing}
          className="w-full rounded-xl bg-[#1a1612] py-4 text-sm font-semibold text-white disabled:opacity-40">
          {t("mesaCustomPay", lang).replace("{amount}", formatPrice(subtotalCents / 100, "EUR", lang))}
        </button>
        <button onClick={() => { void handleCancel(); }} disabled={cancelling}
          className="w-full py-2 text-sm text-[#8a7d6b]">
          {t("mesaCustomCancel", lang)}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire CustomSelectionView in the main render**

At the top of the main `return` block, before any existing content, add:

```tsx
if (activeTurnoId && sessionData?.customTurno?.id === activeTurnoId && sessionData.customTurno.status === 'en_seleccion') {
  return (
    <CustomSelectionView
      orders={sessionData.orders}
      itemsPagados={sessionData.itemsPagados ?? []}
      turnoId={activeTurnoId}
      mesaId={mesaId}
      lang={lang}
      onCancelled={() => {
        setActiveTurnoId(null);
        try { sessionStorage.removeItem(`mesa-custom-turno-${mesaId}`); } catch { /* ignore */ }
      }}
      onCommitted={(_formData, _paymentOrderRef) => {
        // Submit Redsys form using the same hidden-form mechanism as the existing division flow
        // Look for the existing setPaying/setPaymentFormData pattern and reuse it
      }}
    />
  );
}
```

> **Note:** Find the existing Redsys form submission pattern (look for `paying`, `formData`, or a hidden `<form>` ref in the component) and reuse the same mechanism. The `onCommitted` callback receives `formData` (the Redsys fields) and `paymentOrderRef` (to store in sessionStorage before redirect).

- [ ] **Step 4: Verify + Commit**

```bash
pnpm lint
git add src/components/mesa-orders-client.tsx
git commit -m "feat(ui): add CustomSelectionView and CustomItemRow"
```

---

## Task 16: CustomWaitingView + RemainingItemsActions

**Files:**
- Modify: `src/components/mesa-orders-client.tsx`

- [ ] **Step 1: Add CustomWaitingView**

```tsx
function CustomWaitingView({ lang }: { lang: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1a1612] border-t-transparent" />
      <p className="font-medium text-[#1a1612]">{t("mesaCustomWaiting", lang)}</p>
    </div>
  );
}
```

- [ ] **Step 2: Add RemainingItemsActions**

```tsx
function RemainingItemsActions({
  orders, itemsPagados, total, lang, onClaimTurn, onSwitchToEqual,
}: {
  orders: MesaOrder[];
  itemsPagados: ItemPagado[];
  total: number;
  lang: string;
  onClaimTurn: () => void;
  onSwitchToEqual: (numPersonas: number) => void;
}) {
  const [showSplitInput, setShowSplitInput] = useState(false);
  const [numPersonas, setNumPersonas] = useState(2);

  const paidCents = itemsPagados.reduce((s, p) => s + p.importe_pagado_cents, 0);
  const remainingCents = Math.round(total * 100) - paidCents;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="rounded-xl bg-[#f8f4ef] p-4">
        <p className="mb-2 text-sm font-semibold text-[#1a1612]">
          {t("mesaRemainingAmount", lang).replace("{amount}", formatPrice(remainingCents / 100, "EUR", lang))}
        </p>
        <div className="divide-y divide-[#e8e0d8]">
          {orders.flatMap(order =>
            order.items.map((item, idx) => {
              const paid = itemsPagados
                .filter(p => p.pedido_id === order.id && p.item_idx === idx)
                .reduce((s, p) => s + p.unidades_pagadas, 0);
              const remaining = item.cantidad - paid;
              if (remaining <= 0) return null;
              return (
                <div key={`${order.id}:${idx}`} className="flex justify-between py-2 text-sm">
                  <span>{remaining}× {item.nombre}</span>
                  <span>{formatPrice(item.precio * remaining, "EUR", lang)}</span>
                </div>
              );
            }).filter(Boolean)
          )}
        </div>
      </div>

      <button onClick={onClaimTurn}
        className="w-full rounded-xl bg-[#1a1612] py-4 text-sm font-semibold text-white">
        {t("mesaRemainingMyTurn", lang)}
      </button>

      {!showSplitInput ? (
        <button onClick={() => setShowSplitInput(true)}
          className="w-full rounded-xl border border-[#1a1612] py-4 text-sm font-semibold text-[#1a1612]">
          {t("mesaRemainingEqualSplit", lang)}
        </button>
      ) : (
        <div className="rounded-xl border border-[#e8e0d8] p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">{t("mesaDivisionPersonas", lang)}</span>
            <div className="flex items-center gap-3">
              <button onClick={() => setNumPersonas(n => Math.max(1, n - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e8e0d8]">−</button>
              <span className="w-6 text-center font-semibold">{numPersonas}</span>
              <button onClick={() => setNumPersonas(n => Math.min(20, n + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1a1612] text-white">+</button>
            </div>
          </div>
          <p className="text-center text-xs text-[#8a7d6b]">
            {formatPrice(remainingCents / 100 / numPersonas, "EUR", lang)} {t("mesaDivisionPorPersona", lang)}
          </p>
          <button onClick={() => onSwitchToEqual(numPersonas)}
            className="w-full rounded-xl bg-[#1a1612] py-3 text-sm font-semibold text-white">
            {t("mesaDivisionConfirm", lang)}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire both views in the main render** (after the CustomSelectionView guard)

```tsx
// Waiting: someone else holds the lock
if (sessionData?.customTurno?.status === 'en_seleccion' && !activeTurnoId) {
  return (
    <div className="min-h-screen bg-[#f0ede8]">
      <CustomWaitingView lang={lang} />
    </div>
  );
}

// Between turns: personalizado mode, no active lock, not fully paid
if (
  sessionData?.divisionTipo === 'personalizado' &&
  !sessionData?.customTurno &&
  !sessionData?.sesionPagada
) {
  return (
    <div className="min-h-screen bg-[#f0ede8]">
      <RemainingItemsActions
        orders={sessionData.orders}
        itemsPagados={sessionData.itemsPagados ?? []}
        total={sessionData.total}
        lang={lang}
        onClaimTurn={() => { void handleClaimCustomTurn(); }}
        onSwitchToEqual={numPersonas => { void handleSwitchToEqualRemaining(numPersonas); }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify + Commit**

```bash
pnpm lint
git add src/components/mesa-orders-client.tsx
git commit -m "feat(ui): add CustomWaitingView and RemainingItemsActions"
```

---

## Task 17: Waiter Payment Breakdown

**Files:**
- Modify: `src/components/mesa-orders-client.tsx`

- [ ] **Step 1: Find the waiter-visible section**

Search for `isWaiterMode` in the render. Locate where payment buttons are hidden for the waiter. Add the breakdown after the ticket display and before any waiter-specific buttons.

- [ ] **Step 2: Add breakdown block**

```tsx
{isWaiterMode && sessionData?.divisionTipo === 'personalizado' && (
  <div className="mx-4 mb-4 rounded-xl border border-[#e8e0d8] bg-white overflow-hidden">
    <div className="border-b border-[#e8e0d8] bg-[#f8f4ef] px-4 py-3">
      <p className="text-sm font-semibold text-[#1a1612]">Pago personalizado</p>
    </div>
    <div className="divide-y divide-[#e8e0d8]">
      {sessionData.orders.flatMap(order =>
        order.items.map((item, idx) => {
          const paid = (sessionData.itemsPagados ?? [])
            .filter(p => p.pedido_id === order.id && p.item_idx === idx)
            .reduce((s, p) => s + p.unidades_pagadas, 0);
          const isPaid = paid >= item.cantidad;
          return (
            <div key={`${order.id}:${idx}`}
              className={`flex items-center justify-between px-4 py-2 text-sm ${isPaid ? 'opacity-50' : ''}`}>
              <span className={isPaid ? 'line-through' : ''}>{item.cantidad}× {item.nombre}</span>
              <div className="flex items-center gap-2">
                <span>{formatPrice(item.precio * item.cantidad, "EUR", lang)}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${isPaid ? 'bg-green-100 text-green-700' : 'bg-[#f8f4ef] text-[#8a7d6b]'}`}>
                  {isPaid ? 'pagado' : 'pendiente'}
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
    <div className="flex justify-between border-t border-[#e8e0d8] bg-[#f8f4ef] px-4 py-3 text-sm">
      <span className="text-[#8a7d6b]">Pendiente</span>
      <span className="font-semibold text-[#1a1612]">
        {formatPrice(
          (Math.round(sessionData.total * 100) - (sessionData.itemsPagados ?? []).reduce((s, p) => s + p.importe_pagado_cents, 0)) / 100,
          "EUR", lang
        )}
      </span>
    </div>
  </div>
)}
```

- [ ] **Step 3: Verify + Commit**

```bash
pnpm lint
git add src/components/mesa-orders-client.tsx
git commit -m "feat(ui): add waiter item payment breakdown for personalizado mode"
```

---

## Task 18: Realtime Subscription for mesa_item_pagos

**Files:**
- Modify: `src/components/mesa-orders-client.tsx`

- [ ] **Step 1: Find the existing Realtime useEffect**

Search for `.channel(` or `supabase_realtime`. There is already a subscription to `mesa_sesiones`.

- [ ] **Step 2: Add mesa_item_pagos channel** inside the same useEffect

```ts
const sesionId = sessionData?.sesionId;

const itemPagosChannel = supabase
  .channel(`mesa-item-pagos-${mesaId}-${sesionId ?? 'none'}`)
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'mesa_item_pagos',
      filter: `sesion_id=eq.${sesionId ?? 'none'}`,
    },
    () => { void refreshSessionData(); }  // same refresh used by existing subscription
  )
  .subscribe();

// Add to cleanup return
return () => {
  void supabase.removeChannel(itemPagosChannel);
  // ...existing cleanup
};
```

> Add `sesionId` to the effect dependency array so it re-subscribes when the session changes.

- [ ] **Step 3: Verify + Commit**

```bash
pnpm lint
git add src/components/mesa-orders-client.tsx
git commit -m "feat(ui): add Realtime subscription for mesa_item_pagos"
```

---

## Task 19: Final Lint, Build, Smoke Test

- [ ] **Step 1: Full lint**

```bash
pnpm lint
```

Fix any errors that appear.

- [ ] **Step 2: Build**

```bash
pnpm build
```

Fix any TypeScript errors. Common ones to watch for:
- Missing keys in translation type (add them if the translations file is typed)
- `itemsPagados` being possibly undefined — add `?? []` guards
- Implicit `any` from RPC result — cast with `as` and `Record<string, unknown>`

- [ ] **Step 3: Manual smoke test checklist**

1. Open two tabs to the same mesa URL
2. Tab 1: "Dividir cuenta" → "Personalizar el pago" → verify lock is claimed
3. Tab 2: verify `CustomWaitingView` appears (spinner + message)
4. Tab 1: use steppers to select items — verify subtotal updates
5. Tab 1: cancel → verify Tab 2 transitions to `RemainingItemsActions`
6. Tab 1: claim turn again, select items, click "Pagar" → Redsys form submits
7. After Redsys: verify turno = pagado, lock released, remaining items shown
8. Test "Dividir lo que queda" → verify modal appears, confirm → existing division flow takes over with correct remaining amount
9. Waiter mode: verify payment breakdown shows paid/pending items

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(mesa): custom split bill — pago personalizado por ítems (complete)"
```

---

## Spec Coverage Checklist

| Spec Requirement | Task |
|---|---|
| Two division options: igual / personalizado | Task 14 |
| Sequential turn locking (one at a time) | Tasks 2, 4 |
| Others see waiting view | Task 16 |
| Item picker with per-unit steppers | Task 15 |
| Debounced PATCH to save selection draft | Task 15 |
| Waiter sees pending/paid items | Task 17 |
| Switch remaining to equal split | Tasks 9, 16 |
| division_base_cents for correct remaining amount | Task 12 |
| Atomic RPCs with FOR UPDATE | Task 2 |
| expires_at TTL (10 min) auto-cancel | Task 2 (claim_custom_turn) |
| Survive Redsys redirect (sessionStorage) | Task 15 |
| Redsys webhook handles custom turns | Task 10 |
| Manual payment handles custom turns | Task 11 |
| i18n 5 languages | Task 13 |

---

## Post-Implementation Bug Fixes

Bugs discovered and fixed after the initial implementation (Tasks 1–19).

### DB: `complete_custom_payment` RPC — lost `sesion_pagada` write (migration 000004)

**Migration:** `20260612190000_complete_custom_payment_set_sesion_pagada.sql`

Migration `000004` (added `pago_en_curso` tracking) replaced the RPC but removed the atomic `sesion_pagada = true` + `payment_status = 'paid'` writes that existed in `000002`. The RPC only returned `sesion_completa = true` and relied on the webhook app layer to write to DB. If the webhook ran the old code (which ignored the result), `sesion_pagada` was never set and the session got stuck.

**Fix:** Restored the DB writes inside the RPC itself — they are now atomic. The app layer is a redundant safety net, not the only path.

### DB: `get_mesas_with_sessions` — `session_total` was `pending_total` (always 0 when served)

**Migration:** `20260612191000_get_mesas_with_sessions_billing_total.sql`

`pending_total` tracks items not yet served to the table. When all items are delivered, `pending_total = 0`. The waiter grid was reading `pending_total` as the bill total, so paid mesas showed "0.00€".

**Fix:** `session_total` now reads `COALESCE((SELECT SUM(p.total) FROM pedidos p WHERE p.sesion_id = ms.id), 0)` — the actual billing total, always correct regardless of service state.

### DB: `pago_en_curso` not tracked for custom turns (migration 000004)

**Migration:** `20260613000004_custom_turn_pago_en_curso.sql`

`claim_custom_turn` did not set `pago_en_curso = true`, so other users on the same session could not detect a payment was in progress. `complete_custom_payment` and `cancel_custom_turn` did not clear it either.

**Fix:** `claim_custom_turn` sets `pago_en_curso = true, pago_iniciado_en = now()`. Both `complete_custom_payment` and `cancel_custom_turn` set `pago_en_curso = false`.

### UI: Paid items not shown as green in `CustomItemRow`

Paid items in the "Selecciona lo que vas a pagar" page were shown with `opacity-40` white, same as the empty state. Hard to distinguish.

**Fix:** Paid items now render in green (`#6aaa7a`) with `line-through`. Badge "✓ pagado" aligned right alongside price.

### UI: `fullyPaid` did not force all items to show as paid after a full payment

When a full (non-itemised) payment completed after some custom turns, `paidByKey` only contained entries from `mesa_item_pagos`. Items not explicitly tracked as paid still showed as unpaid.

**Fix:** `paidUnits = fullyPaid ? item.cantidad : (paidByKey.get(mergeKey) ?? 0)`.

### UI: `externalPaymentInProgress` showed infinite spinner when session was fully paid

`externalPaymentInProgress` was derived before `fullyPaid`, so a race where `pagoEnCurso = true` and `sesionPagada = true` simultaneously could trigger the spinner on an already-paid session.

**Fix:** `fullyPaid` is derived first; `externalPaymentInProgress` is gated: `&& !fullyPaid`.

### UI: Waiter grid showed "pagando" after full custom payment

`get_mesas_with_sessions` reads `sesion_pagada` directly from DB. The `complete_custom_payment` fallback in `orders/route.ts` computed `sesionPagada = true` client-side but was a `void` fire-and-forget — it could race or fail silently, leaving `sesion_pagada = false` in DB.

**Fix (combined):** The RPC now writes `sesion_pagada = true` atomically (see above). The fallback in `orders/route.ts` also writes `pago_en_curso = false` to cover stale lock state left by `initiateRedsysMesaPaymentUseCase`.

### UI: Waiter ticket modal showed "Pagar la cuenta" button after payment

`ticketMesa` was initialised from stale grid data. When the waiter opened the ticket, `sesionPagada` still had the old value.

**Fix:** `handleViewTicket` reads fresh `sesionPagada` + `pagoEnCurso` from the orders API and patches `ticketMesa` state.

### Use Case: `removeSessionItemUseCase` did not trigger `sesionPagada` after item removal

When the waiter removed the last unpaid item from a personalizado session where everything else was already paid, the session could end up in "fully covered" state without `sesion_pagada = true` being set.

**Fix:** After item removal, if `division_tipo = 'personalizado'` and `pagadoCents >= newSessionTotalCents`, the use case sets `sesion_pagada = true`, `pago_en_curso = false`.

### Webhook: `processRedsysWebhookUseCase` Path 0 ignored `complete_custom_payment` result

Path 0 called `complete_custom_payment` RPC but discarded the return value. When `sesion_completa = true`, `sesion_pagada` and `payment_status` were never updated.

**Fix:** Result is now read. When `sesion_completa = true`, the webhook sets `payment_status = 'paid'` on all session pedidos and `sesion_pagada = true` on the session.

### i18n: Voseo → Castilian Spanish

5 translation keys in `translations.ts` used Rioplatense voseo forms. All updated to Castilian tuteo:
- `"¿Cómo querés dividir?"` → `"¿Cómo quieres dividir?"`
- `"Elegís el número de personas"` → `"Elige el número de personas"`
- `"Esperá un momento."` → `"Espera un momento."`
- `"Seleccioná lo que vas a pagar"` → `"Selecciona lo que vas a pagar"`
- `"Seleccioná una dirección válida"` → `"Selecciona una dirección válida"`
| Realtime updates for item_pagos | Task 18 |
