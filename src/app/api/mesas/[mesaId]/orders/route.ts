import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mesaSesionRepository, pedidoRepository } from '@/core/infrastructure/database';
import { rateLimitMesaPolling } from '@/core/infrastructure/api/rate-limit';
import { getSupabaseAnonClient, getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const mesaIdSchema = z.string().uuid('El mesaId debe ser un UUID válido');

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const { mesaId } = await params;
  const parsed = mesaIdSchema.safeParse(mesaId);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const rateLimited = await rateLimitMesaPolling(parsed.data);
  if (rateLimited) return rateLimited;

  const sesionResult = await mesaSesionRepository.findActiveSesionByMesa(parsed.data);
  if (!sesionResult.success) {
    return NextResponse.json({ error: 'Error al buscar la sesión activa' }, { status: 500 });
  }
  if (!sesionResult.data) {
    return NextResponse.json({ orders: [], sesionId: null, total: 0 });
  }

  const sesion = sesionResult.data;

  const ordersResult = await pedidoRepository.findBySesionId(sesion.id);
  if (!ordersResult.success) {
    return NextResponse.json({ error: 'Error al obtener los pedidos' }, { status: 500 });
  }

  const orders = ordersResult.data.map(o => ({
    id: o.id,
    numeroPedido: o.numero_pedido,
    items: o.detalle_pedido,
    total: o.total,
    estado: o.estado,
    createdAt: o.created_at,
  }));

  const total = ordersResult.data.reduce((sum, o) => sum + Number(o.total), 0);

  // Check if mesa payments are enabled for this empresa
  let pagosHabilitados = false;
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

  // Fetch division state + payment status from the session (service_role to bypass RLS)
  let division: { personas: number; pagosRealizados: number; importePorPersona: number } | null = null;
  let sesionPagada = false;
  let pagoEnCurso = false;
  let divisionTipo: string | null = null;
  let customTurno: { id: string; status: string; importeCents: number | null } | null = null;
  let itemsPagados: { pedido_id: string; item_idx: number; unidades_pagadas: number; importe_pagado_cents: number }[] = [];
  try {
    const supabaseAdmin = getSupabaseClient();
    const [sesionRowResult, paymentRowsResult, itemsPagadosResult] = await Promise.all([
      supabaseAdmin
        .from('mesa_sesiones')
        .select('division_personas, division_pagos_realizados, pago_en_curso, pago_iniciado_en, division_tipo, custom_turno_id, division_base_cents')
        .eq('id', sesion.id)
        .single(),
      supabaseAdmin
        .from('pedidos')
        .select('payment_status')
        .eq('sesion_id', sesion.id),
      supabaseAdmin
        .from('mesa_item_pagos')
        .select('pedido_id, item_idx, unidades_pagadas, importe_pagado_cents')
        .eq('sesion_id', sesion.id),
    ]);

    const row = sesionRowResult.data as {
      division_personas: number | null;
      division_pagos_realizados: number;
      pago_en_curso: boolean;
      pago_iniciado_en: string | null;
      division_tipo: string | null;
      custom_turno_id: string | null;
      division_base_cents: number | null;
    } | null;
    divisionTipo = (row?.division_tipo as string | null) ?? null;
    const customTurnoId = (row?.custom_turno_id as string | null) ?? null;
    const divisionBaseCents = (row?.division_base_cents as number | null) ?? null;

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

    itemsPagados = (itemsPagadosResult.data ?? []) as {
      pedido_id: string; item_idx: number; unidades_pagadas: number; importe_pagado_cents: number;
    }[];

    if (row?.division_personas) {
      const personas = row.division_personas;
      const pagosRealizados = row.division_pagos_realizados;
      const baseTotal = divisionBaseCents != null ? divisionBaseCents / 100 : total;
      const importePorPersona = Math.round((baseTotal / personas) * 100) / 100;
      division = { personas, pagosRealizados, importePorPersona };
    }

    if (division) {
      // Division: sesionPagada when the RPC counter says all shares are paid.
      // Do NOT use payment_status here — after the first share, the anchor pedido
      // is already 'paid' which would give a false positive on a single-pedido session.
      sesionPagada = division.pagosRealizados >= division.personas;
    } else {
      // Full payment: sesionPagada when every pedido in the session is 'paid'.
      const paymentRows = (paymentRowsResult.data ?? []) as { payment_status: string }[];
      if (paymentRows.length > 0) {
        sesionPagada = paymentRows.every(r => r.payment_status === 'paid');
      }
    }
    const LOCK_EXPIRY_MS = 15 * 60 * 1000;
    const lockFresh = row?.pago_iniciado_en
      ? Date.now() - new Date(row.pago_iniciado_en).getTime() < LOCK_EXPIRY_MS
      : false;
    pagoEnCurso = !!(row?.pago_en_curso && lockFresh);
  } catch {
    // best-effort
  }

  return NextResponse.json({ orders, sesionId: sesion.id, total, pagosHabilitados, division, sesionPagada, pagoEnCurso, divisionTipo, customTurno, itemsPagados });
}
