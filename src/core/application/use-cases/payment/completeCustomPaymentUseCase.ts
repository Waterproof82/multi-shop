import { Result } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';

export interface CompleteCustomPaymentResult {
  sesionCompleta: boolean;
  sesionId: string | null;
}

export async function completeCustomPaymentUseCase(input: {
  turnoId: string;
}): Promise<Result<CompleteCustomPaymentResult>> {
  try {
    const supabase = getSupabaseClient();

    const { data: rpcResult, error: rpcError } = await supabase.rpc('complete_custom_payment', {
      p_turno_id: input.turnoId,
    });

    if (rpcError) {
      const appError = await logger.logAndReturnError('DB_ERROR', rpcError.message, 'use-case', 'completeCustomPaymentUseCase', { details: { turnoId: input.turnoId } });
      return { success: false, error: appError };
    }

    const row = (rpcResult as { success: boolean; sesion_completa: boolean; out_sesion_id: string | null }[] | null)?.[0];
    if (!row?.success) {
      return { success: false, error: { code: 'CONFLICT', message: 'El turno no está en estado en_pago', module: 'use-case', method: 'completeCustomPaymentUseCase' } };
    }
    return { success: true, data: { sesionCompleta: row.sesion_completa, sesionId: row.out_sesion_id } };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'use-case', 'completeCustomPaymentUseCase', { details: { turnoId: input.turnoId } });
    return { success: false, error: appError };
  }
}
