import { Result } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';

export interface InitiateCustomTurnResult {
  claimed: boolean;
  turnoId: string | null;
}

export async function initiateCustomTurnUseCase(input: {
  mesaId: string;
  empresaId: string;
}): Promise<Result<InitiateCustomTurnResult>> {
  try {
    const supabase = getSupabaseClient();

    const { data: sesion } = await supabase
      .from('mesa_sesiones')
      .select('id, empresa_id, sesion_pagada')
      .eq('mesa_id', input.mesaId)
      .is('cerrada_at', null)
      .maybeSingle();

    if (!sesion) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'No hay sesión activa', module: 'use-case', method: 'initiateCustomTurnUseCase' } };
    }
    const s = sesion as Record<string, unknown>;
    if (s['empresa_id'] !== input.empresaId) {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Acceso denegado', module: 'use-case', method: 'initiateCustomTurnUseCase' } };
    }
    if (s['sesion_pagada'] === true) {
      return { success: false, error: { code: 'ALREADY_PAID', message: 'La sesión ya está pagada', module: 'use-case', method: 'initiateCustomTurnUseCase' } };
    }

    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('claim_custom_turn', { p_sesion_id: s['id'] as string, p_empresa_id: input.empresaId });

    if (rpcError) {
      const appError = await logger.logAndReturnError('DB_ERROR', rpcError.message, 'use-case', 'initiateCustomTurnUseCase', { details: { mesaId: input.mesaId } });
      return { success: false, error: appError };
    }

    const row = (rpcResult as { claimed: boolean; turno_id: string | null }[] | null)?.[0];
    return { success: true, data: { claimed: row?.claimed ?? false, turnoId: row?.turno_id ?? null } };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'use-case', 'initiateCustomTurnUseCase', { details: { mesaId: input.mesaId } });
    return { success: false, error: appError };
  }
}
