import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { ITpvRepository } from '@/core/domain/repositories/ITpvRepository';
import {
  TpvTurno,
  TpvCobroPayload,
  TpvTurnoStats,
  TpvCobro,
  TpvCobroCompletoPayload,
  TpvIvaDesgloseItem,
  TpvAnalytics,
  GetAnalyticsParams,
  TpvTurnoResumen,
  TipoEventoTurno,
  TpvTurnoEvento,
  TpvMovimientoCajaPayload,
  InformeZData,
  InformeZDesglosePago,
  MetodoPago,
  TipoImpuesto,
} from '@/core/domain/entities/tpv-types';
import { Result } from '@/core/domain/entities/types';
import { logger } from '../logging/logger';

function mapRow(row: Record<string, unknown>): TpvTurno {
  return {
    id: row.id as string,
    empresaId: row.empresa_id as string,
    userId: row.user_id as string,
    operadorNombre: row.operador_nombre as string,
    aperturaAt: row.apertura_at as string,
    cierreAt: row.cierre_at as string | null,
    efectivoAperturaCents: row.efectivo_apertura_cents as number,
    efectivoCierreCents: row.efectivo_cierre_cents as number | null,
    efectivoCierreTeoricoCents: row.efectivo_cierre_teorico_cents as number | null,
    totalEfectivoCents: row.total_efectivo_cents as number,
    totalTarjetaCents: row.total_tarjeta_cents as number,
    diferenciaCents: row.diferencia_cents as number | null,
    requiereRevision: row.requiere_revision as boolean,
    hashEncadenado: row.hash_encadenado as string | null,
    empleadoCierreId: row.empleado_cierre_id as string | null,
    createdAt: row.created_at as string,
  };
}

function mapEvento(row: Record<string, unknown>): TpvTurnoEvento {
  return {
    id: row.id as string,
    turnoId: row.turno_id as string,
    empresaId: row.empresa_id as string,
    tipoEvento: row.tipo_evento as TipoEventoTurno,
    empleadoId: row.empleado_id as string | null,
    montoCents: row.monto_cents as number | null,
    descripcion: row.descripcion as string | null,
    createdAt: row.created_at as string,
  };
}

function mapDesgloseIva(raw: unknown): TpvIvaDesgloseItem[] | null {
  if (!Array.isArray(raw)) return null;
  return (raw as Record<string, unknown>[]).map((item) => ({
    porcentaje: item['porcentaje'] as number,
    baseImponibleCents: item['baseCents'] as number,
    ivaCents: item['ivaCents'] as number,
  }));
}

export class SupabaseTpvRepository implements ITpvRepository {
  async findTurnoActivo(empresaId: string): Promise<Result<TpvTurno | null>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('tpv_turnos')
        .select('*')
        .eq('empresa_id', empresaId)
        .is('cierre_at', null)
        .order('apertura_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        return {
          success: false,
          error: await logger.logFromCatch(error, 'repository', 'findTurnoActivo'),
        };
      }

      return {
        success: true,
        data: data ? mapRow(data as Record<string, unknown>) : null,
      };
    } catch (e) {
      return {
        success: false,
        error: await logger.logFromCatch(
          e,
          'repository',
          'findTurnoActivo'
        ),
      };
    }
  }

  async abrirTurno(params: {
    empresaId: string;
    userId?: string;
    operadorId?: string;
    operadorNombre: string;
    efectivoAperturaCents: number;
  }): Promise<Result<TpvTurno>> {
    try {
      const supabase = getSupabaseClient();
      // El trigger BEFORE INSERT calcula hash_encadenado.
      // El trigger AFTER INSERT inserta el evento 'apertura' en la misma transacción.
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

  async cerrarTurno(params: {
    turnoId: string;
    efectivoCierreCents: number;
    efectivoCierreTeoricoCents: number;
    diferenciaCents: number;
    empleadoCierreId?: string;
  }): Promise<Result<void>> {
    try {
      const supabase = getSupabaseClient();
      // El trigger AFTER UPDATE inserta los eventos 'cierre' y 'descuadre' (si aplica)
      // en la misma transacción. Si falla la inserción del evento, el UPDATE se revierte.
      // empleado_cierre_id queda grabado en la fila del turno y lo lee el trigger.
      const { error } = await supabase
        .from('tpv_turnos')
        .update({
          cierre_at: new Date().toISOString(),
          efectivo_cierre_cents: params.efectivoCierreCents,
          efectivo_cierre_teorico_cents: params.efectivoCierreTeoricoCents,
          diferencia_cents: params.diferenciaCents,
          empleado_cierre_id: params.empleadoCierreId ?? null,
        })
        .eq('id', params.turnoId)
        .is('cierre_at', null);

      if (error) {
        return {
          success: false,
          error: await logger.logFromCatch(error, 'repository', 'cerrarTurno'),
        };
      }

      return { success: true, data: undefined };
    } catch (e) {
      return {
        success: false,
        error: await logger.logFromCatch(e, 'repository', 'cerrarTurno'),
      };
    }
  }

  async registrarCobro(payload: TpvCobroPayload): Promise<Result<void>> {
    try {
      const supabase = getSupabaseClient();
      const col =
        payload.metodoPago === 'efectivo'
          ? 'total_efectivo_cents'
          : 'total_tarjeta_cents';

      const { data: turno, error: fetchErr } = await supabase
        .from('tpv_turnos')
        .select(col)
        .eq('id', payload.turnoId)
        .single();

      if (fetchErr) {
        return {
          success: false,
          error: await logger.logFromCatch(
            fetchErr,
            'repository',
            'registrarCobro'
          ),
        };
      }

      const prev = ((turno as Record<string, unknown>)[col] ?? 0) as number;

      const { error } = await supabase
        .from('tpv_turnos')
        .update({ [col]: prev + payload.importeCobradoCents })
        .eq('id', payload.turnoId);

      if (error) {
        return {
          success: false,
          error: await logger.logFromCatch(error, 'repository', 'registrarCobro'),
        };
      }

      return { success: true, data: undefined };
    } catch (e) {
      return {
        success: false,
        error: await logger.logFromCatch(
          e,
          'repository',
          'registrarCobro'
        ),
      };
    }
  }

  async crearCobroCompleto(payload: TpvCobroCompletoPayload): Promise<Result<TpvCobro>> {
    try {
      const supabase = getSupabaseClient();
      const col = payload.metodoPago === 'efectivo' ? 'total_efectivo_cents' : 'total_tarjeta_cents';

      // 1. Insert cobro — trigger computes numero_ticket, hash, IVA breakdown
      const { data: cobro, error: cobroErr } = await supabase
        .from('tpv_cobros')
        .insert({
          empresa_id: payload.empresaId,
          turno_id: payload.turnoId,
          sesion_id: payload.sesionId ?? null,
          metodo_pago: payload.metodoPago,
          importe_cobrado_cents: payload.importeCobradoCents,
          propina_cents: payload.propinaCents,
          descuento_cents: payload.descuentoCents ?? 0,
          iva_porcentaje: payload.ivaPorcentaje ?? 10,
          rectifica_cobro_id: payload.rectificaCobroId ?? null,
          detalle_items: payload.detalleItems ?? null,
        })
        .select()
        .single();

      if (cobroErr) {
        return { success: false, error: await logger.logFromCatch(cobroErr, 'repository', 'crearCobroCompleto/insert') };
      }

      const row = cobro as Record<string, unknown>;

      // 2. Increment turno totals
      const { data: turnoRow } = await supabase
        .from('tpv_turnos')
        .select(col)
        .eq('id', payload.turnoId)
        .single();

      const prev = (((turnoRow ?? {}) as Record<string, unknown>)[col] ?? 0) as number;
      await supabase
        .from('tpv_turnos')
        .update({ [col]: prev + payload.importeCobradoCents })
        .eq('id', payload.turnoId);

      return {
        success: true,
        data: {
          id: row.id as string,
          empresaId: row.empresa_id as string,
          turnoId: row.turno_id as string,
          sesionId: row.sesion_id as string | null,
          numeroTicket: row.numero_ticket as number,
          serie: row.serie as string,
          metodoPago: row.metodo_pago as TpvCobro['metodoPago'],
          importeCobradoCents: row.importe_cobrado_cents as number,
          propinaCents: row.propina_cents as number,
          descuentoCents: (row.descuento_cents as number) ?? 0,
          ivaPorcentaje: Number(row.iva_porcentaje),
          baseImponibleCents: row.base_imponible_cents as number,
          ivaCents: row.iva_cents as number,
          hashAnterior: row.hash_anterior as string | null,
          hash: row.hash as string,
          cobradoAt: row.cobrado_at as string,
          rectificaCobroId: row.rectifica_cobro_id as string | null ?? null,
          detalleItems: (row.detalle_items as TpvCobro['detalleItems']) ?? null,
          desgloseIva: mapDesgloseIva(row.desglose_iva),
        },
      };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'crearCobroCompleto') };
    }
  }

  async getTurnoStats(turnoId: string): Promise<Result<TpvTurnoStats>> {
    try {
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('tpv_turnos')
        .select('total_efectivo_cents, total_tarjeta_cents, efectivo_apertura_cents')
        .eq('id', turnoId)
        .single();

      if (error) {
        return {
          success: false,
          error: await logger.logFromCatch(error, 'repository', 'getTurnoStats'),
        };
      }

      const row = data as Record<string, unknown>;

      // Sumar movimientos de caja del turno para calcular el teórico correcto al cierre.
      // Teórico = fondo apertura + ventas efectivo + Σ entradas - Σ salidas
      const { data: movs } = await supabase
        .from('tpv_turno_eventos')
        .select('tipo_evento, monto_cents')
        .eq('turno_id', turnoId)
        .in('tipo_evento', ['entrada_caja', 'salida_caja']);

      let movimientosNetoCents = 0;
      for (const m of (movs ?? []) as { tipo_evento: string; monto_cents: number | null }[]) {
        movimientosNetoCents += m.tipo_evento === 'entrada_caja'
          ? (m.monto_cents ?? 0)
          : -(m.monto_cents ?? 0);
      }

      return {
        success: true,
        data: {
          totalEfectivoCents: row.total_efectivo_cents as number,
          totalTarjetaCents: row.total_tarjeta_cents as number,
          numOperaciones: 0,
          efectivoAperturaCents: row.efectivo_apertura_cents as number,
          movimientosNetoCents,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: await logger.logFromCatch(e, 'repository', 'getTurnoStats'),
      };
    }
  }

  async registrarMovimientoCaja(payload: TpvMovimientoCajaPayload): Promise<Result<TpvTurnoEvento>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('tpv_turno_eventos')
        .insert({
          turno_id: payload.turnoId,
          empresa_id: payload.empresaId,
          tipo_evento: payload.tipoEvento,
          empleado_id: payload.empleadoId ?? null,
          monto_cents: payload.montoCents,
          descripcion: payload.descripcion,
        })
        .select()
        .single();

      if (error) {
        return {
          success: false,
          error: await logger.logFromCatch(error, 'repository', 'registrarMovimientoCaja'),
        };
      }

      return { success: true, data: mapEvento(data as Record<string, unknown>) };
    } catch (e) {
      return {
        success: false,
        error: await logger.logFromCatch(e, 'repository', 'registrarMovimientoCaja'),
      };
    }
  }

  async getMovimientosCaja(turnoId: string): Promise<Result<TpvTurnoEvento[]>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('tpv_turno_eventos')
        .select('*')
        .eq('turno_id', turnoId)
        .order('created_at', { ascending: true });

      if (error) {
        return {
          success: false,
          error: await logger.logFromCatch(error, 'repository', 'getMovimientosCaja'),
        };
      }

      return {
        success: true,
        data: ((data ?? []) as Record<string, unknown>[]).map(mapEvento),
      };
    } catch (e) {
      return {
        success: false,
        error: await logger.logFromCatch(e, 'repository', 'getMovimientosCaja'),
      };
    }
  }

  async getAnalytics(params: GetAnalyticsParams): Promise<Result<TpvAnalytics>> {
    try {
      const supabase = getSupabaseClient();
      const { empresaId, desde, hasta } = params;

      // Query 1: KPIs de cobros (excluye rectificativos)
      const { data: kpiData, error: kpiErr } = await supabase.rpc('tpv_analytics_kpis', {
        p_empresa_id: empresaId,
        p_desde: desde,
        p_hasta: hasta,
      });

      if (kpiErr) {
        return { success: false, error: await logger.logFromCatch(kpiErr, 'repository', 'getAnalytics/kpis') };
      }

      const kpi = (kpiData as Record<string, unknown>[] | null)?.[0] ?? {};

      // Query 2: ventas por hora
      const { data: horasData, error: horasErr } = await supabase.rpc('tpv_analytics_por_hora', {
        p_empresa_id: empresaId,
        p_desde: desde,
        p_hasta: hasta,
      });

      if (horasErr) {
        return { success: false, error: await logger.logFromCatch(horasErr, 'repository', 'getAnalytics/horas') };
      }

      const ventasPorHora = Array(24).fill(0) as number[];
      for (const row of (horasData as { hora: number; total: number }[] | null) ?? []) {
        ventasPorHora[row.hora] = Number(row.total);
      }

      // Query 3: historial de turnos
      const { data: turnosData, error: turnosErr } = await supabase
        .from('tpv_turnos')
        .select('id, operador_nombre, apertura_at, cierre_at, total_efectivo_cents, total_tarjeta_cents')
        .eq('empresa_id', empresaId)
        .gte('apertura_at', desde)
        .lte('apertura_at', `${hasta}T23:59:59Z`)
        .order('apertura_at', { ascending: false });

      if (turnosErr) {
        return { success: false, error: await logger.logFromCatch(turnosErr, 'repository', 'getAnalytics/turnos') };
      }

      const turnoIds = ((turnosData ?? []) as Record<string, unknown>[]).map(t => t.id as string);

      // Query 3b: cobros por turno
      const cobrosPorTurno: Record<string, number> = {};
      if (turnoIds.length > 0) {
        const { data: conteos } = await supabase
          .from('tpv_cobros')
          .select('turno_id')
          .in('turno_id', turnoIds)
          .is('rectifica_cobro_id', null);

        for (const c of (conteos ?? []) as { turno_id: string }[]) {
          cobrosPorTurno[c.turno_id] = (cobrosPorTurno[c.turno_id] ?? 0) + 1;
        }
      }

      const historialTurnos: TpvTurnoResumen[] = ((turnosData ?? []) as Record<string, unknown>[]).map(t => ({
        id: t.id as string,
        operadorNombre: t.operador_nombre as string,
        aperturaAt: t.apertura_at as string,
        cierreAt: t.cierre_at as string | null,
        totalCents: (Number(t.total_efectivo_cents) + Number(t.total_tarjeta_cents)),
        numCobros: cobrosPorTurno[t.id as string] ?? 0,
        activo: t.cierre_at === null,
      }));

      // Query 4: top productos (JSONB expansion via RPC)
      // Query 5: heatmap (parallel with top productos)
      const [
        { data: topData, error: topErr },
        { data: heatmapData, error: heatmapErr },
      ] = await Promise.all([
        supabase.rpc('tpv_analytics_top_productos', { p_empresa_id: empresaId, p_desde: desde, p_hasta: hasta }),
        supabase.rpc('tpv_analytics_heatmap',       { p_empresa_id: empresaId, p_desde: desde, p_hasta: hasta }),
      ]);

      if (topErr) {
        return { success: false, error: await logger.logFromCatch(topErr, 'repository', 'getAnalytics/top') };
      }
      if (heatmapErr) {
        return { success: false, error: await logger.logFromCatch(heatmapErr, 'repository', 'getAnalytics/heatmap') };
      }

      const numCobros = Number(kpi.num_cobros ?? 0);
      const totalFacturadoCents = Number(kpi.total_facturado ?? 0);

      const closedTurnos = historialTurnos.filter(t => !t.activo);
      const duracionMediaMinutos = closedTurnos.length > 0
        ? Math.round(
            closedTurnos.reduce((sum, t) => {
              const ms = new Date(t.cierreAt!).getTime() - new Date(t.aperturaAt).getTime();
              return sum + ms / 60000;
            }, 0) / closedTurnos.length
          )
        : null;

      return {
        success: true,
        data: {
          totalFacturadoCents,
          numCobros,
          ticketMedioCents: numCobros > 0 ? Math.round(totalFacturadoCents / numCobros) : 0,
          totalIvaCents: Number(kpi.total_iva ?? 0),
          baseImponibleCents: Number(kpi.base_imponible ?? 0),
          totalPropinaCents: Number(kpi.total_propina ?? 0),
          splitEfectivoCents: Number(kpi.efectivo ?? 0),
          splitTarjetaCents: Number(kpi.tarjeta ?? 0),
          ventasPorHora,
          heatmap: ((heatmapData as { dow: number; hora: number; total_cents: number }[] | null) ?? [])
            .map(r => ({ dow: r.dow, hora: r.hora, totalCents: Number(r.total_cents) })),
          topProductos: ((topData as { nombre: string; cantidad: number }[] | null) ?? []),
          historialTurnos,
          numTurnos: historialTurnos.length,
          duracionMediaMinutos,
        },
      };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'repository', 'getAnalytics') };
    }
  }

  async getInformeZ(turnoId: string, empresaId: string): Promise<Result<InformeZData>> {
    try {
      const supabase = getSupabaseClient();

      const [turnoRes, cobrosRes, eventosRes] = await Promise.all([
        supabase
          .from('tpv_turnos')
          .select(`
            id,
            numero_z,
            operador_nombre,
            apertura_at,
            cierre_at,
            hash_encadenado,
            efectivo_apertura_cents,
            efectivo_cierre_cents,
            efectivo_cierre_teorico_cents,
            diferencia_cents,
            empresas!tpv_turnos_empresa_id_fkey (
              nombre,
              nif,
              tipo_impuesto,
              porcentaje_impuesto
            )
          `)
          .eq('id', turnoId)
          .eq('empresa_id', empresaId)
          .single(),

        supabase
          .from('tpv_cobros')
          .select('base_imponible_cents, iva_cents, propina_cents, importe_cobrado_cents, metodo_pago, desglose_iva')
          .eq('turno_id', turnoId)
          .eq('empresa_id', empresaId)
          .is('rectifica_cobro_id', null),

        supabase
          .from('tpv_turno_eventos')
          .select('*')
          .eq('turno_id', turnoId)
          .order('created_at', { ascending: true }),
      ]);

      if (turnoRes.error) {
        return { success: false, error: await logger.logFromCatch(turnoRes.error, 'repository', 'getInformeZ/turno') };
      }
      if (!turnoRes.data) {
        return { success: false, error: await logger.logFromCatch(new Error('Turno not found'), 'repository', 'getInformeZ') };
      }
      if (cobrosRes.error) {
        return { success: false, error: await logger.logFromCatch(cobrosRes.error, 'repository', 'getInformeZ/cobros') };
      }
      if (eventosRes.error) {
        return { success: false, error: await logger.logFromCatch(eventosRes.error, 'repository', 'getInformeZ/eventos') };
      }

      const turno = turnoRes.data as Record<string, unknown>;
      const empresaRaw = turno.empresas;
      const empresa = (Array.isArray(empresaRaw) ? empresaRaw[0] : empresaRaw) as Record<string, unknown> | null;
      type RawCobroInforme = {
        base_imponible_cents: number | null;
        iva_cents: number | null;
        propina_cents: number | null;
        importe_cobrado_cents: number | null;
        metodo_pago: string;
        desglose_iva: Array<{ porcentaje: number; baseCents: number; ivaCents: number }> | null;
      };
      const cobros = (cobrosRes.data ?? []) as RawCobroInforme[];
      const eventos = (eventosRes.data ?? []) as Record<string, unknown>[];

      let totalFacturadoCents = 0;
      let baseImponibleCents = 0;
      let ivaCents = 0;
      let propinaCents = 0;
      const pagoMap = new Map<string, { totalCents: number; numOperaciones: number }>();
      const ivaMap = new Map<number, { baseCents: number; ivaCents: number }>();

      for (const c of cobros) {
        totalFacturadoCents += c.importe_cobrado_cents ?? 0;
        baseImponibleCents += c.base_imponible_cents ?? 0;
        ivaCents += c.iva_cents ?? 0;
        propinaCents += c.propina_cents ?? 0;
        const prev = pagoMap.get(c.metodo_pago) ?? { totalCents: 0, numOperaciones: 0 };
        pagoMap.set(c.metodo_pago, {
          totalCents: prev.totalCents + (c.importe_cobrado_cents ?? 0),
          numOperaciones: prev.numOperaciones + 1,
        });
        if (c.desglose_iva && c.desglose_iva.length > 0) {
          for (const bracket of c.desglose_iva) {
            const prevBracket = ivaMap.get(bracket.porcentaje) ?? { baseCents: 0, ivaCents: 0 };
            ivaMap.set(bracket.porcentaje, {
              baseCents: prevBracket.baseCents + bracket.baseCents,
              ivaCents: prevBracket.ivaCents + bracket.ivaCents,
            });
          }
        } else {
          // Legacy cobros (desglose_iva NULL): agregar al bracket del rate general de empresa
          const legacyRate = (empresa?.porcentaje_impuesto as number | null) ?? 0;
          const prevLegacy = ivaMap.get(legacyRate) ?? { baseCents: 0, ivaCents: 0 };
          ivaMap.set(legacyRate, {
            baseCents: prevLegacy.baseCents + (c.base_imponible_cents ?? 0),
            ivaCents: prevLegacy.ivaCents + (c.iva_cents ?? 0),
          });
        }
      }

      const desglosePagos: InformeZDesglosePago[] = Array.from(pagoMap.entries()).map(([metodoPago, v]) => ({
        metodoPago: metodoPago as MetodoPago,
        totalCents: v.totalCents,
        numOperaciones: v.numOperaciones,
      }));

      const desgloseImpuesto: TpvIvaDesgloseItem[] | undefined = ivaMap.size > 0
        ? Array.from(ivaMap.entries())
            .sort(([a], [b]) => a - b)
            .map(([porcentaje, v]) => ({
              porcentaje,
              baseImponibleCents: v.baseCents,
              ivaCents: v.ivaCents,
            }))
        : undefined;

      const informeZ: InformeZData = {
        turnoId: turno.id as string,
        numeroZ: (turno.numero_z as number) ?? 0,
        operadorNombre: (turno.operador_nombre as string) ?? '',
        aperturaAt: turno.apertura_at as string,
        cierreAt: (turno.cierre_at as string) ?? '',
        hashEncadenado: (turno.hash_encadenado as string) ?? '',
        empresaNombre: (empresa?.nombre as string) ?? '',
        empresaNif: (empresa?.nif as string | null) ?? null,
        tipoImpuesto: ((empresa?.tipo_impuesto as string) ?? 'iva') as TipoImpuesto,
        efectivoAperturaCents: (turno.efectivo_apertura_cents as number) ?? 0,
        efectivoCierreCents: (turno.efectivo_cierre_cents as number) ?? 0,
        efectivoCierreTeoricoCents: (turno.efectivo_cierre_teorico_cents as number) ?? 0,
        diferenciaCents: (turno.diferencia_cents as number) ?? 0,
        totalFacturadoCents,
        baseImponibleCents,
        ivaCents,
        propinaCents,
        numCobros: cobros.length,
        desglosePagos,
        desgloseImpuesto,
        movimientos: eventos.map(mapEvento),
      };

      return { success: true, data: informeZ };
    } catch (err) {
      return { success: false, error: await logger.logFromCatch(err, 'repository', 'getInformeZ', { details: { sesionId: turnoId } }) };
    }
  }
}
