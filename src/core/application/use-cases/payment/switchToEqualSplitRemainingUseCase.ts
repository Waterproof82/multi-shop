import { Result } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';

export interface SwitchToEqualSplitResult {
  importe_por_persona_cents: number;
}

export async function switchToEqualSplitRemainingUseCase(input: {
  mesaId:      string;
  empresaId:   string;
  numPersonas: number;
}): Promise<Result<SwitchToEqualSplitResult>> {
  try {
    const supabase = getSupabaseClient();

    // Resolve sesion_id
    const { data: sesion } = await supabase
      .from('mesa_sesiones')
      .select('id, empresa_id')
      .eq('mesa_id', input.mesaId)
      .is('cerrada_at', null)
      .maybeSingle();

    if (!sesion) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'No hay sesión activa', module: 'use-case', method: 'switchToEqualSplitRemainingUseCase' } };
    }
    const s = sesion as Record<string, unknown>;
    if (s['empresa_id'] !== input.empresaId) {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Acceso denegado', module: 'use-case', method: 'switchToEqualSplitRemainingUseCase' } };
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc('switch_to_equal_split_remaining', {
      p_sesion_id:    s['id'] as string,
      p_empresa_id:   input.empresaId,
      p_num_personas: input.numPersonas,
    });

    if (rpcError) {
      const appError = await logger.logAndReturnError('DB_ERROR', rpcError.message, 'use-case', 'switchToEqualSplitRemainingUseCase', { details: { mesaId: input.mesaId } });
      return { success: false, error: appError };
    }

    const row = (rpcResult as { success: boolean; importe_por_persona_cents: number; error_code: string | null }[] | null)?.[0];
    if (!row?.success) {
      return { success: false, error: { code: row?.error_code ?? 'UNKNOWN', message: row?.error_code ?? 'Error al cambiar división', module: 'use-case', method: 'switchToEqualSplitRemainingUseCase' } };
    }
    return { success: true, data: { importe_por_persona_cents: row.importe_por_persona_cents } };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'use-case', 'switchToEqualSplitRemainingUseCase', { details: { mesaId: input.mesaId } });
    return { success: false, error: appError };
  }
}
