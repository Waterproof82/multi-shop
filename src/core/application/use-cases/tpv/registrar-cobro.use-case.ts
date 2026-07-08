import { ITpvRepository } from '@/core/domain/repositories/ITpvRepository';
import { TpvCobroPayload, TpvCobro } from '@/core/domain/entities/tpv-types';
import { Result, AppError } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

export async function registrarCobroUseCase(
  repo: ITpvRepository,
  payload: TpvCobroPayload,
): Promise<Result<TpvCobro, AppError>> {
  const supabase = getSupabaseClient();

  // 1. Update tip in mesa_sesiones if present
  if (payload.propinaCents > 0) {
    const { error: propErr } = await supabase
      .from('mesa_sesiones')
      .update({ propina_cents: payload.propinaCents })
      .eq('id', payload.sesionId);

    if (propErr) {
      return {
        success: false,
        error: {
          code: 'TPV_PROPINA_ERROR',
          message: 'Error al registrar propina',
          module: 'use-case',
          method: 'registrarCobroUseCase',
        },
      };
    }
  }

  // 2. Close the mesa session (computes total from pedidos, clears mesa.sesion_id)
  //    Skip for partial payments — session remains open until fully paid.
  if (payload.cerrarSesion !== false) {
    const { error: closeErr } = await supabase.rpc('close_mesa_sesion', {
      p_sesion_id: payload.sesionId,
    });

    if (closeErr) {
      return {
        success: false,
        error: {
          code: 'TPV_CIERRE_SESION_ERROR',
          message: 'Error al cerrar la sesión de mesa',
          module: 'use-case',
          method: 'registrarCobroUseCase',
        },
      };
    }
  }

  // 3. Create cobro record (hash chain) + accumulate turno totals
  if (!payload.empresaId) {
    return {
      success: false,
      error: {
        code: 'TPV_EMPRESA_REQUIRED',
        message: 'empresaId requerido para registrar cobro',
        module: 'use-case',
        method: 'registrarCobroUseCase',
      },
    };
  }

  return repo.crearCobroCompleto({
    empresaId: payload.empresaId,
    turnoId: payload.turnoId,
    sesionId: payload.sesionId,
    metodoPago: payload.metodoPago,
    importeCobradoCents: payload.importeCobradoCents,
    propinaCents: payload.propinaCents,
    descuentoCents: payload.descuentoCents,
    ivaPorcentaje: payload.ivaPorcentaje,
  });
}
