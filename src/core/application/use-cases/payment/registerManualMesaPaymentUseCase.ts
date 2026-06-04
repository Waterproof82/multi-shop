import { Result } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';

export interface RegisterManualMesaPaymentInput {
  mesaId: string;
  empresaId: string;
}

export interface RegisterManualMesaPaymentResult {
  pagosRealizados: number;
  personas: number | null;
  fullyPaid: boolean;
}

export async function registerManualMesaPaymentUseCase(
  input: RegisterManualMesaPaymentInput
): Promise<Result<RegisterManualMesaPaymentResult>> {
  try {
    const supabase = getSupabaseClient();

    const { data: sesion, error: sesionError } = await supabase
      .from('mesa_sesiones')
      .select('id, empresa_id, division_personas, division_pagos_realizados, sesion_pagada')
      .eq('mesa_id', input.mesaId)
      .is('cerrada_at', null)
      .maybeSingle();

    if (sesionError) {
      return { success: false, error: { code: 'DB_ERROR', message: 'Error al buscar sesión activa', module: 'use-case', method: 'registerManualMesaPaymentUseCase' } };
    }

    if (!sesion) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'No hay sesión activa para esta mesa', module: 'use-case', method: 'registerManualMesaPaymentUseCase' } };
    }

    const s = sesion as Record<string, unknown>;
    const sesionId = s['id'] as string;
    const sesionEmpresaId = s['empresa_id'] as string;
    const divisionPersonas = s['division_personas'] as number | null;

    if (sesionEmpresaId !== input.empresaId) {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Acceso denegado', module: 'use-case', method: 'registerManualMesaPaymentUseCase' } };
    }

    if (s['sesion_pagada'] === true) {
      return { success: false, error: { code: 'ALREADY_PAID', message: 'La sesión ya está pagada', module: 'use-case', method: 'registerManualMesaPaymentUseCase' } };
    }

    let pagosRealizados = 0;
    let fullyPaid = false;

    if (divisionPersonas != null) {
      // Division active — increment counter atomically
      const { data: rpcResult } = await supabase
        .rpc('increment_division_pagos', { p_sesion_id: sesionId });

      const rpcRows = rpcResult as { pagos_realizados: number; personas: number }[] | null;
      const rpcRow = rpcRows?.[0];
      pagosRealizados = rpcRow?.pagos_realizados ?? 0;
      fullyPaid = rpcRow ? rpcRow.pagos_realizados >= rpcRow.personas : false;
    } else {
      // Full payment — no division
      fullyPaid = true;
    }

    if (fullyPaid) {
      await supabase
        .from('pedidos')
        .update({ payment_status: 'paid' })
        .eq('sesion_id', sesionId)
        .eq('empresa_id', input.empresaId);

      await supabase
        .from('mesa_sesiones')
        .update({ sesion_pagada: true, pago_en_curso: false, pago_iniciado_en: null })
        .eq('id', sesionId);
    } else {
      // Release lock if held (division payment not yet complete)
      await supabase
        .from('mesa_sesiones')
        .update({ pago_en_curso: false, pago_iniciado_en: null })
        .eq('id', sesionId);
    }

    return {
      success: true,
      data: { pagosRealizados, personas: divisionPersonas, fullyPaid },
    };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'use-case', 'registerManualMesaPaymentUseCase', {
      details: { mesaId: input.mesaId },
    });
    return { success: false, error: appError };
  }
}
