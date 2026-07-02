import { ITpvRepository } from '@/core/domain/repositories/ITpvRepository';
import { TpvCobroPayload } from '@/core/domain/entities/tpv-types';
import { Result, AppError } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

export async function registrarCobroUseCase(
  repo: ITpvRepository,
  payload: TpvCobroPayload,
): Promise<Result<void, AppError>> {
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

  // 2. Close the mesa session via existing RPC
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

  // 3. Accumulate in tpv_turnos
  return repo.registrarCobro(payload);
}
