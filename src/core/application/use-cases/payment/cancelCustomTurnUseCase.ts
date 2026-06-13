import { Result } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';

export async function cancelCustomTurnUseCase(input: {
  turnoId: string;
}): Promise<Result<{ errorCode: string | null }>> {
  try {
    const supabase = getSupabaseClient();

    const { data: rpcResult, error: rpcError } = await supabase.rpc('cancel_custom_turn', {
      p_turno_id: input.turnoId,
    });

    if (rpcError) {
      const appError = await logger.logAndReturnError('DB_ERROR', rpcError.message, 'use-case', 'cancelCustomTurnUseCase', { details: { turnoId: input.turnoId } });
      return { success: false, error: appError };
    }

    const row = (rpcResult as { success: boolean; error_code: string | null }[] | null)?.[0];
    if (!row?.success) {
      return { success: false, error: { code: row?.error_code ?? 'UNKNOWN', message: row?.error_code ?? 'Error al cancelar', module: 'use-case', method: 'cancelCustomTurnUseCase' } };
    }
    return { success: true, data: { errorCode: null } };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'use-case', 'cancelCustomTurnUseCase', { details: { turnoId: input.turnoId } });
    return { success: false, error: appError };
  }
}
