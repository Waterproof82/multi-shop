import { getMesaSesionRepository, getPedidoRepository } from '@/core/infrastructure/database';
import { getSupabaseAnonClient, getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { PAYMENT_LOCK_EXPIRY_MS } from '@/core/domain/constants/pedido';

// ---- Types ----

export interface MesaOrderItem {
  id: unknown;
  numeroPedido: unknown;
  items: unknown[];
  total: unknown;
  estado: string;
  createdAt: unknown;
}

export interface MesaDivision {
  personas: number;
  pagosRealizados: number;
  importePorPersona: number;
}

export interface MesaCustomTurno {
  id: string;
  status: string;
  importeCents: number | null;
}

export interface MesaOrdersResult {
  orders: MesaOrderItem[];
  sesionId: string;
  total: number;
  pagosHabilitados: boolean;
  division: MesaDivision | null;
  sesionPagada: boolean;
  pagoEnCurso: boolean;
  divisionTipo: string | null;
  customTurno: MesaCustomTurno | null;
  itemsPagados: { pedido_id: string; item_idx: number; unidades_pagadas: number }[];
  pagadoCents: number;
  propinaCents: number;
  googleReviewsUrl: string | null;
}

// ---- Helper: resolve which retenido pedidos are still truly retained ----

async function resolveStillRetenidoIds(
  retenidoIds: string[],
  orders: { id: unknown; estado: string; detalle_pedido: unknown }[],
): Promise<Set<string>> {
  const stillRetenidoIds = new Set<string>(retenidoIds);
  if (retenidoIds.length === 0) return stillRetenidoIds;

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

    for (const o of orders.filter(p => p.estado === 'retenido')) {
      const detalle = (o.detalle_pedido as unknown[]) ?? [];
      const overrides = overridesByPedido.get(o.id as string) ?? new Map<number, string>();
      const allReleased =
        detalle.length > 0 &&
        detalle.every((_, idx) => {
          const override = overrides.get(idx);
          return override !== undefined && override !== 'retenido';
        });
      if (allReleased) stillRetenidoIds.delete(o.id as string);
    }
  } catch { /* best-effort */ }

  return stillRetenidoIds;
}

// ---- Helper: fetch cancelled / listo / servido item estados ----

interface ItemEstadoMaps {
  cancelledByPedido: Map<string, Set<number>>;
  listoByPedido: Map<string, Set<number>>;
  servidoByPedido: Map<string, Set<number>>;
}

async function fetchItemEstados(pedidoIds: string[]): Promise<ItemEstadoMaps> {
  const cancelledByPedido = new Map<string, Set<number>>();
  const listoByPedido = new Map<string, Set<number>>();
  const servidoByPedido = new Map<string, Set<number>>();

  if (pedidoIds.length === 0) return { cancelledByPedido, listoByPedido, servidoByPedido };

  try {
    const supabase = getSupabaseClient();
    const { data: itemRows } = await supabase
      .from('pedido_item_estados')
      .select('pedido_id, item_idx, estado')
      .in('pedido_id', pedidoIds)
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

  return { cancelledByPedido, listoByPedido, servidoByPedido };
}

// ---- Helper: map raw pedidos to MesaOrderItem[] ----

function mapOrders(
  rawOrders: { id: unknown; numero_pedido: unknown; detalle_pedido: unknown; total: unknown; estado: string; created_at: unknown }[],
  cancelledByPedido: Map<string, Set<number>>,
  listoByPedido: Map<string, Set<number>>,
  servidoByPedido: Map<string, Set<number>>,
  stillRetenidoIds: Set<string>,
): MesaOrderItem[] {
  return rawOrders.map(o => {
    const cancelledIndices = cancelledByPedido.get(o.id as string) ?? new Set<number>();
    const listoIndices = listoByPedido.get(o.id as string) ?? new Set<number>();
    const servidoIndices = servidoByPedido.get(o.id as string) ?? new Set<number>();
    const detalle = (o.detalle_pedido as { precio?: number; cantidad?: number }[]) ?? [];
    const items = detalle.map((item, idx) =>
      cancelledIndices.has(idx) ? { ...item, cancelled: true } : item,
    );

    const activeIndices = detalle.map((_, idx) => idx).filter(idx => !cancelledIndices.has(idx));
    const allItemsDone =
      activeIndices.length === 0 || activeIndices.every(idx => servidoIndices.has(idx));
    const allItemsListo =
      activeIndices.length > 0 &&
      activeIndices.every(idx => listoIndices.has(idx) || servidoIndices.has(idx));

    let estado =
      o.estado === 'retenido' && !stillRetenidoIds.has(o.id as string) ? 'pendiente' : o.estado;
    if (allItemsDone) estado = 'servido';
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
}

// ---- Helper: calculate total deducting cancelled items ----

function calculateTotal(
  rawOrders: { id: unknown; total: unknown; detalle_pedido: unknown }[],
  cancelledByPedido: Map<string, Set<number>>,
): number {
  return rawOrders.reduce((sum, o) => {
    const cancelledIndices = cancelledByPedido.get(o.id as string) ?? new Set<number>();
    const detalle = (o.detalle_pedido as { precio?: number; cantidad?: number }[]) ?? [];
    const cancelledSubtotal = detalle.reduce((s, item, idx) => {
      if (!cancelledIndices.has(idx)) return s;
      return s + Number(item.precio ?? 0) * Number(item.cantidad ?? 1);
    }, 0);
    return sum + Number(o.total) - cancelledSubtotal;
  }, 0);
}

// ---- Helper: fetch empresa settings (pagos habilitados + reviews URL) ----

async function fetchEmpresaSettings(
  empresaId: string,
): Promise<{ pagosHabilitados: boolean; googleReviewsUrl: string | null }> {
  try {
    const supabase = getSupabaseAnonClient();
    const { data: emp } = await supabase
      .from('empresas')
      .select('pagos_mesa_habilitados, google_reviews_url')
      .eq('id', empresaId)
      .single();
    const empRow = emp as {
      pagos_mesa_habilitados: boolean;
      google_reviews_url: string | null;
    } | null;
    return {
      pagosHabilitados: empRow?.pagos_mesa_habilitados ?? false,
      googleReviewsUrl: empRow?.google_reviews_url ?? null,
    };
  } catch {
    return { pagosHabilitados: false, googleReviewsUrl: null };
  }
}

// ---- Helper: fetch all payment state for the session ----

interface PaymentState {
  division: MesaDivision | null;
  sesionPagada: boolean;
  pagoEnCurso: boolean;
  divisionTipo: string | null;
  customTurno: MesaCustomTurno | null;
  itemsPagados: { pedido_id: string; item_idx: number; unidades_pagadas: number }[];
  pagadoCents: number;
  propinaCents: number;
}

async function fetchPaymentState(
  sesionId: string,
  sesionPagadaFlag: boolean,
  total: number,
  rawOrders: { id: unknown; detalle_pedido: unknown }[],
): Promise<PaymentState> {
  let division: MesaDivision | null = null;
  let sesionPagada = sesionPagadaFlag;
  let pagoEnCurso = false;
  let divisionTipo: string | null = null;
  let customTurno: MesaCustomTurno | null = null;
  let itemsPagados: { pedido_id: string; item_idx: number; unidades_pagadas: number }[] = [];
  let pagadoCents = 0;
  let propinaCents = 0;

  try {
    const supabaseAdmin = getSupabaseClient();

    const [sesionRowResult, paymentRowsResult, itemsPagadosResult, pagadoTurnosResult] =
      await Promise.all([
        supabaseAdmin
          .from('mesa_sesiones')
          .select(
            'division_personas, division_pagos_realizados, pago_en_curso, pago_iniciado_en, division_tipo, custom_turno_id, division_base_cents, propina_cents',
          )
          .eq('id', sesionId)
          .single(),
        supabaseAdmin.from('pedidos').select('payment_status').eq('sesion_id', sesionId),
        supabaseAdmin
          .from('mesa_item_pagos')
          .select('pedido_id, item_idx, unidades_pagadas, turno_id')
          .eq('sesion_id', sesionId),
        supabaseAdmin
          .from('mesa_pagos_personalizados')
          .select('id, importe_cents')
          .eq('sesion_id', sesionId)
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
        const tr = turnoRow as {
          id: string;
          status: string;
          importe_cents: number | null;
          expires_at: string | null;
        };
        const isExpired = tr.expires_at ? new Date(tr.expires_at) < new Date() : false;
        if (!isExpired || (tr.status !== 'en_seleccion' && tr.status !== 'en_pago')) {
          customTurno = { id: tr.id, status: tr.status, importeCents: tr.importe_cents };
        }
      }
    }

    const pagadoTurnos = (pagadoTurnosResult.data ?? []) as {
      id: string;
      importe_cents: number | null;
    }[];
    const pagadoIds = new Set(pagadoTurnos.map(t => t.id));
    pagadoCents = pagadoTurnos.reduce((s, t) => s + (t.importe_cents ?? 0), 0);

    const rawItems = (itemsPagadosResult.data ?? []) as {
      pedido_id: string;
      item_idx: number;
      unidades_pagadas: number;
      turno_id: string;
    }[];
    itemsPagados = rawItems
      .filter(ip => pagadoIds.has(ip.turno_id))
      .map(({ pedido_id, item_idx, unidades_pagadas }) => ({ pedido_id, item_idx, unidades_pagadas }));

    if (row?.division_personas) {
      const personas = row.division_personas;
      const pagosRealizados = row.division_pagos_realizados;
      const baseTotal = divisionBaseCents != null ? divisionBaseCents / 100 : total;
      const importePorPersona =
        Math.round(((baseTotal + propinaCents / 100) / personas) * 100) / 100;
      division = { personas, pagosRealizados, importePorPersona };
    }

    if (!sesionPagada) {
      if (division) {
        sesionPagada = division.pagosRealizados >= division.personas;
      } else {
        const paymentRows = (paymentRowsResult.data ?? []) as { payment_status: string }[];
        if (paymentRows.length > 0) {
          sesionPagada = paymentRows.every(r => r.payment_status === 'paid');
        }
      }
    }

    if (!sesionPagada && divisionTipo === 'personalizado' && itemsPagados.length > 0) {
      const currentItems = rawOrders.flatMap(o =>
        (o.detalle_pedido as { cantidad: number }[]).map((it, idx) => ({
          pedido_id: o.id as string,
          item_idx: idx,
          cantidad: it.cantidad,
        })),
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
        void supabaseAdmin
          .from('mesa_sesiones')
          .update({ sesion_pagada: true, pago_en_curso: false, pago_iniciado_en: null })
          .eq('id', sesionId);
      }
    }

    const lockFresh = row?.pago_iniciado_en
      ? Date.now() - new Date(row.pago_iniciado_en).getTime() < PAYMENT_LOCK_EXPIRY_MS
      : false;
    pagoEnCurso = !!(row?.pago_en_curso && lockFresh);
  } catch { /* best-effort */ }

  return {
    division,
    sesionPagada,
    pagoEnCurso,
    divisionTipo,
    customTurno,
    itemsPagados,
    pagadoCents,
    propinaCents,
  };
}

// ---- Main use case ----

/** Sentinel returned when the mesa exists but belongs to a different tenant */
export const MESA_TENANT_MISMATCH = Symbol('MESA_TENANT_MISMATCH');

export async function getMesaOrdersUseCase(
  mesaId: string,
  empresaId: string,
): Promise<MesaOrdersResult | null | typeof MESA_TENANT_MISMATCH> {
  const sesionResult = await getMesaSesionRepository().findActiveSesionByMesa(mesaId);
  if (!sesionResult.success || !sesionResult.data) return null;

  const sesion = sesionResult.data;
  if (sesion.empresaId !== empresaId) return MESA_TENANT_MISMATCH;

  const ordersResult = await getPedidoRepository().findBySesionId(sesion.id);
  if (!ordersResult.success) return null;

  const rawOrders = ordersResult.data;

  const retenidoIds = rawOrders
    .filter(o => o.estado === 'retenido')
    .map(o => o.id as string);

  const [stillRetenidoIds, itemEstados, empresaSettings] = await Promise.all([
    resolveStillRetenidoIds(retenidoIds, rawOrders as { id: unknown; estado: string; detalle_pedido: unknown }[]),
    fetchItemEstados(rawOrders.map(o => o.id as string)),
    fetchEmpresaSettings(sesion.empresaId),
  ]);

  const { cancelledByPedido, listoByPedido, servidoByPedido } = itemEstados;

  const orders = mapOrders(
    rawOrders as { id: unknown; numero_pedido: unknown; detalle_pedido: unknown; total: unknown; estado: string; created_at: unknown }[],
    cancelledByPedido,
    listoByPedido,
    servidoByPedido,
    stillRetenidoIds,
  );

  const total = calculateTotal(
    rawOrders as { id: unknown; total: unknown; detalle_pedido: unknown }[],
    cancelledByPedido,
  );

  const paymentState = await fetchPaymentState(
    sesion.id,
    sesion.sesionPagada,
    total,
    rawOrders as { id: unknown; detalle_pedido: unknown }[],
  );

  return {
    orders,
    sesionId: sesion.id,
    total,
    pagosHabilitados: empresaSettings.pagosHabilitados,
    googleReviewsUrl: empresaSettings.googleReviewsUrl,
    ...paymentState,
  };
}
