import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { ITpvRepository } from '@/core/domain/repositories/ITpvRepository';
import {
  TpvTurno,
  TpvCobroPayload,
  TpvTurnoStats,
  TpvCobro,
  TpvCobroCompletoPayload,
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
    totalEfectivoCents: row.total_efectivo_cents as number,
    totalTarjetaCents: row.total_tarjeta_cents as number,
    diferenciaCents: row.diferencia_cents as number | null,
    requiereRevision: row.requiere_revision as boolean,
    createdAt: row.created_at as string,
  };
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
    userId: string;
    operadorNombre: string;
    efectivoAperturaCents: number;
  }): Promise<Result<TpvTurno>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('tpv_turnos')
        .insert({
          empresa_id: params.empresaId,
          user_id: params.userId,
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
        error: await logger.logFromCatch(
          e,
          'repository',
          'abrirTurno'
        ),
      };
    }
  }

  async cerrarTurno(params: {
    turnoId: string;
    efectivoCierreCents: number;
    diferenciaCents: number;
  }): Promise<Result<void>> {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('tpv_turnos')
        .update({
          cierre_at: new Date().toISOString(),
          efectivo_cierre_cents: params.efectivoCierreCents,
          diferencia_cents: params.diferenciaCents,
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
        error: await logger.logFromCatch(
          e,
          'repository',
          'cerrarTurno'
        ),
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
          iva_porcentaje: payload.ivaPorcentaje ?? 10,
          rectifica_cobro_id: payload.rectificaCobroId ?? null,
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
          ivaPorcentaje: Number(row.iva_porcentaje),
          baseImponibleCents: row.base_imponible_cents as number,
          ivaCents: row.iva_cents as number,
          hashAnterior: row.hash_anterior as string | null,
          hash: row.hash as string,
          cobradoAt: row.cobrado_at as string,
          rectificaCobroId: row.rectifica_cobro_id as string | null ?? null,
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
        .select('total_efectivo_cents, total_tarjeta_cents')
        .eq('id', turnoId)
        .single();

      if (error) {
        return {
          success: false,
          error: await logger.logFromCatch(
            error,
            'repository',
            'getTurnoStats'
          ),
        };
      }

      const row = data as Record<string, unknown>;

      return {
        success: true,
        data: {
          totalEfectivoCents: row.total_efectivo_cents as number,
          totalTarjetaCents: row.total_tarjeta_cents as number,
          numOperaciones: 0,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: await logger.logFromCatch(
          e,
          'repository',
          'getTurnoStats'
        ),
      };
    }
  }
}
