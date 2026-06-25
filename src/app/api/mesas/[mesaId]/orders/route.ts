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

  // For pedidos with estado='retenido', check pedido_item_estados to see if all items
  // have been explicitly released by kitchen. If so, treat the order as 'pendiente'
  // so the ticket doesn't show stale retained state.
  const retenidoIds = ordersResult.data
    .filter(o => o.estado === 'retenido')
    .map(o => o.id as string);

  const stillRetenidoIds = new Set<string>(retenidoIds);

  if (retenidoIds.length > 0) {
    try {
      const supabase = getSupabaseClient();
      const { data: itemEstados } = await supabase
        .from('pedido_item_estados')
        .select('pedido_id, item_idx, estado')
        .in('pedido_id', retenidoIds);

      const overridesByPedido = new Map<string, Map<number, string>>();
      for (const row of (itemEstados ?? []) as { pedido_id: string; item_idx: number; estado: string }[]) {
        if (!overridesByPedido.has(row.pedido_id)) overridesByPedido.set(row.pedido_id, new Map());
        overridesByPedido.get(row.pedido_id)!.set(row.item_idx, row.estado);
      }

      for (const o of ordersResult.data.filter(p => p.estado === 'retenido')) {
        const detalle = (o.detalle_pedido as unknown[]) ?? [];
        const overrides = overridesByPedido.get(o.id as string) ?? new Map<number, string>();
        // All items must have an explicit non-retenido override to consider the pedido released
        const allReleased = detalle.length > 0 && detalle.every((_, idx) => {
          const override = overrides.get(idx);
          return override !== undefined && override !== 'retenido';
        });
        if (allReleased) stillRetenidoIds.delete(o.id as string);
      }
    } catch { /* best-effort */ }
  }

  // Fetch cancelled, listo and servido item estados for all pedidos in this session.
  // 'listo' = kitchen done but not yet delivered to the table.
  // 'servido' = physically delivered to the table.
  // Payment must only be allowed when everything is 'servido', not just 'listo'.
  const allPedidoIds = ordersResult.data.map(o => o.id as string);
  const cancelledByPedido = new Map<string, Set<number>>();
  const listoByPedido = new Map<string, Set<number>>();
  const servidoByPedido = new Map<string, Set<number>>();
  if (allPedidoIds.length > 0) {
    try {
      const supabase = getSupabaseClient();
      const { data: itemRows } = await supabase
        .from('pedido_item_estados')
        .select('pedido_id, item_idx, estado')
        .in('pedido_id', allPedidoIds)
        .in('estado', ['cancelado', 'listo', 'servido']);
      for (const row of (itemRows ?? []) as { pedido_id: string; item_idx: number; estado: string }[]) {
        if (row.estado === 'cancelado') {
          if (!cancelledByPedido.has(row.pedido_id)) cancelledByPedido.set(row.pedido_id, new Set());
          cancelledByPedido.get(row.pedido_id)!.add(row.item_idx);
        } else if (row.estado === 'listo') {
          if (!listoByPedido.has(row.pedido_id)) listoByPedido.set(row.pedido_id, new Set());
          listoByPedido.get(row.pedido_id)!.add(row.item_idx);
        } else if (row.estado === 'servido') {
          if (!servidoByPedido.has(row.pedido_id)) servidoByPedido.set(row.pedido_id, new Set());
          servidoByPedido.get(row.pedido_id)!.add(row.item_idx);
        }
      }
    } catch { /* best-effort */ }
  }

  const orders = ordersResult.data.map(o => {
    const cancelledIndices = cancelledByPedido.get(o.id as string) ?? new Set<number>();
    const listoIndices = listoByPedido.get(o.id as string) ?? new Set<number>();
    const servidoIndices = servidoByPedido.get(o.id as string) ?? new Set<number>();
    const detalle = (o.detalle_pedido as { precio?: number; cantidad?: number }[]) ?? [];
    const items = detalle.map((item, idx) =>
      cancelledIndices.has(idx) ? { ...item, cancelled: true } : item
    );

    const activeIndices = detalle.map((_, idx) => idx).filter(idx => !cancelledIndices.has(idx));
    // allItemsDone: every active item must be 'servido' (delivered). 'listo' alone is not enough.
    const allItemsDone = activeIndices.length === 0 || activeIndices.every(idx => servidoIndices.has(idx));
    // allItemsListo: all active items are at least 'listo' or 'servido' (ready in kitchen or delivered).
    const allItemsListo = activeIndices.length > 0 && activeIndices.every(idx => listoIndices.has(idx) || servidoIndices.has(idx));

    let estado = o.estado === 'retenido' && !stillRetenidoIds.has(o.id as string) ? 'pendiente' : o.estado;
    if (allItemsDone) estado = 'servido';
    // Synthesize 'listo' when all items are ready in kitchen but waiter hasn't served them yet.
    else if (allItemsListo) estado = 'listo';

    return {
      id: o.id,
      numeroPedido: o.numero_pedido,
      items,
      total: o.total,
      estado,
      createdAt: o.created_at,
    };
  });

  const total = ordersResult.data.reduce((sum, o) => {
    const cancelledIndices = cancelledByPedido.get(o.id as string) ?? new Set<number>();
    const detalle = (o.detalle_pedido as { precio?: number; cantidad?: number }[]) ?? [];
    const cancelledSubtotal = detalle.reduce((s, item, idx) => {
      if (!cancelledIndices.has(idx)) return s;
      return s + (Number(item.precio ?? 0) * Number(item.cantidad ?? 1));
    }, 0);
    return sum + Number(o.total) - cancelledSubtotal;
  }, 0);

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
  let itemsPagados: { pedido_id: string; item_idx: number; unidades_pagadas: number }[] = [];
  let pagadoCents = 0;
  let propinaCents = 0;
  // items_diferidos column was dropped; retenido orders are included in the orders array above.
  const itemsDiferidos: unknown[] = [];
  try {
    const supabaseAdmin = getSupabaseClient();

    const [sesionRowResult, paymentRowsResult, itemsPagadosResult, pagadoTurnosResult] = await Promise.all([
      supabaseAdmin
        .from('mesa_sesiones')
        .select('division_personas, division_pagos_realizados, pago_en_curso, pago_iniciado_en, division_tipo, custom_turno_id, division_base_cents, propina_cents')
        .eq('id', sesion.id)
        .single(),
      supabaseAdmin
        .from('pedidos')
        .select('payment_status')
        .eq('sesion_id', sesion.id),
      supabaseAdmin
        .from('mesa_item_pagos')
        .select('pedido_id, item_idx, unidades_pagadas, turno_id')
        .eq('sesion_id', sesion.id),
      supabaseAdmin
        .from('mesa_pagos_personalizados')
        .select('id, importe_cents')
        .eq('sesion_id', sesion.id)
        .eq('status', 'pagado'),
    ]);

    const row = sesionRowResult.data as {
      division_personas: number | null;
      division_pagos_realizados: number;
      pago_en_curso: boolean;
      pago_iniciado_en: string | null;
      division_tipo: string | null;
      custom_turno_id: string | null;
      division_base_cents: number | null;
      propina_cents: number | null;
    } | null;
    divisionTipo = (row?.division_tipo as string | null) ?? null;
    const customTurnoId = (row?.custom_turno_id as string | null) ?? null;
    const divisionBaseCents = (row?.division_base_cents as number | null) ?? null;
    propinaCents = (row?.propina_cents as number | null) ?? 0;

    if (customTurnoId) {
      const { data: turnoRow } = await supabaseAdmin
        .from('mesa_pagos_personalizados')
        .select('id, status, importe_cents, expires_at')
        .eq('id', customTurnoId)
        .maybeSingle();
      if (turnoRow) {
        const tr = turnoRow as { id: string; status: string; importe_cents: number | null; expires_at: string | null };
        // Ignore expired turns in active states — they'll be cleaned up on the next claim.
        // This prevents the "waiting" overlay from showing due to stale DB state.
        const isExpired = tr.expires_at ? new Date(tr.expires_at) < new Date() : false;
        if (!isExpired || (tr.status !== 'en_seleccion' && tr.status !== 'en_pago')) {
          customTurno = { id: tr.id, status: tr.status, importeCents: tr.importe_cents };
        }
      }
    }

    // Only expose items from confirmed (pagado) turns to the client
    const pagadoTurnos = (pagadoTurnosResult.data ?? []) as { id: string; importe_cents: number | null }[];
    const pagadoIds = new Set(pagadoTurnos.map(t => t.id));
    pagadoCents = pagadoTurnos.reduce((s, t) => s + (t.importe_cents ?? 0), 0);

    const rawItems = (itemsPagadosResult.data ?? []) as { pedido_id: string; item_idx: number; unidades_pagadas: number; turno_id: string }[];
    itemsPagados = rawItems
      .filter(ip => pagadoIds.has(ip.turno_id))
      .map(({ pedido_id, item_idx, unidades_pagadas }) => ({ pedido_id, item_idx, unidades_pagadas }));

    if (row?.division_personas) {
      const personas = row.division_personas;
      const pagosRealizados = row.division_pagos_realizados;
      const baseTotal = divisionBaseCents != null ? divisionBaseCents / 100 : total;
      const importePorPersona = Math.round(((baseTotal + propinaCents / 100) / personas) * 100) / 100;
      division = { personas, pagosRealizados, importePorPersona };
    }

    // Trust the DB flag first — it's the authoritative source set by RPCs.
    // Re-derive only when DB says not paid, to catch cases where the flag
    // wasn't synced (e.g. partial personalizado followed by waiter item deletion).
    sesionPagada = sesion.sesionPagada;

    if (!sesionPagada) {
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
    }

    // Personalizado fallback: all CURRENT items must be individually covered by
    // itemsPagados. Using total-vs-pagadoCents was wrong — if the waiter deletes a
    // paid item, pagadoCents stays the same but total drops, triggering a false positive.
    if (!sesionPagada && divisionTipo === 'personalizado' && itemsPagados.length > 0) {
      const currentItems = ordersResult.data.flatMap((o) =>
        (o.detalle_pedido as { cantidad: number }[]).map((it, idx) => ({
          pedido_id: o.id as string,
          item_idx: idx,
          cantidad: it.cantidad,
        }))
      );
      const allItemsPaid =
        currentItems.length > 0 &&
        currentItems.every(({ pedido_id, item_idx, cantidad }) => {
          const paidUnits = itemsPagados
            .filter(ip => ip.pedido_id === pedido_id && ip.item_idx === item_idx)
            .reduce((s, ip) => s + ip.unidades_pagadas, 0);
          return paidUnits >= cantidad;
        });
      if (allItemsPaid) {
        sesionPagada = true;
        // Sync to DB so the waiter grid (which reads sesion_pagada directly) picks it up
        void supabaseAdmin
          .from('mesa_sesiones')
          .update({ sesion_pagada: true, pago_en_curso: false, pago_iniciado_en: null })
          .eq('id', sesion.id);
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

  return NextResponse.json({ orders, sesionId: sesion.id, total, pagosHabilitados, division, sesionPagada, pagoEnCurso, divisionTipo, customTurno, itemsPagados, pagadoCents, itemsDiferidos, propinaCents });
}
