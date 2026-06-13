import { Result } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';

export interface SelectionItem {
  pedido_id: string;
  item_idx: number;
  unidades: number;
}

export interface UpdateCustomSelectionInput {
  turnoId: string;
  seleccion: SelectionItem[];
  importeCents: number;
}

export async function updateCustomSelectionUseCase(
  input: UpdateCustomSelectionInput
): Promise<Result<{ success: boolean; errorCode: string | null }>> {
  try {
    const supabase = getSupabaseClient();

    const { data: rpcResult, error: rpcError } = await supabase.rpc('update_custom_selection', {
      p_turno_id:      input.turnoId,
      p_seleccion:     input.seleccion,
      p_importe_cents: input.importeCents,
    });

    if (rpcError) {
      const appError = await logger.logAndReturnError('DB_ERROR', rpcError.message, 'use-case', 'updateCustomSelectionUseCase', { details: { turnoId: input.turnoId } });
      return { success: false, error: appError };
    }

    const row = (rpcResult as { success: boolean; error_code: string | null }[] | null)?.[0];
    return { success: true, data: { success: row?.success ?? false, errorCode: row?.error_code ?? null } };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'use-case', 'updateCustomSelectionUseCase', { details: { turnoId: input.turnoId } });
    return { success: false, error: appError };
  }
}
