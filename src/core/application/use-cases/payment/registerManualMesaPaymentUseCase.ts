import { Result } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';

export interface RegisterManualMesaPaymentInput {
  mesaId:    string;
  empresaId: string;
  turnoId?:  string; // required when division_tipo === 'personalizado'
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
      .select('id, empresa_id, division_personas, division_pagos_realizados, sesion_pagada, division_tipo, custom_turno_id')
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
    const divisionTipo = s['division_tipo'] as string | null;

    if (sesionEmpresaId !== input.empresaId) {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Acceso denegado', module: 'use-case', method: 'registerManualMesaPaymentUseCase' } };
    }

    if (s['sesion_pagada'] === true) {
      return { success: false, error: { code: 'ALREADY_PAID', message: 'La sesión ya está pagada', module: 'use-case', method: 'registerManualMesaPaymentUseCase' } };
    }

    let pagosRealizados = 0;
    let fullyPaid = false;

    if (divisionTipo === 'personalizado') {
      // Custom turn payment: commit then complete
      const effectiveTurnoId = input.turnoId ?? (s['custom_turno_id'] as string | null);
      if (!effectiveTurnoId) {
        // No active turn — waiter is manually closing the whole bill (full override)
        fullyPaid = true;
      } else {

      const paymentOrderRef = `MANUAL-${effectiveTurnoId.slice(0, 8)}-${Date.now()}`;

      // commit_custom_payment transitions en_seleccion → en_pago and inserts mesa_item_pagos rows
      const { data: commitResult, error: commitError } = await supabase.rpc('commit_custom_payment', {
        p_turno_id:          effectiveTurnoId,
        p_payment_order_ref: paymentOrderRef,
        p_importe_cents:     0, // manual payment — amount not tracked in RPC
      });
      if (commitError) {
        const appError = await logger.logAndReturnError('DB_ERROR', commitError.message, 'use-case', 'registerManualMesaPaymentUseCase', { details: { turnoId: effectiveTurnoId } });
        return { success: false, error: appError };
      }
      const commitRow = (commitResult as { success: boolean; error_code: string | null }[] | null)?.[0];
      if (!commitRow?.success) {
        return { success: false, error: { code: commitRow?.error_code ?? 'CONFLICT', message: commitRow?.error_code ?? 'Error al confirmar selección', module: 'use-case', method: 'registerManualMesaPaymentUseCase' } };
      }

      // complete_custom_payment transitions en_pago → pagado, clears lock, checks sesion_pagada
      const { data: completeResult, error: completeError } = await supabase.rpc('complete_custom_payment', {
        p_turno_id: effectiveTurnoId,
      });
      if (completeError) {
        const appError = await logger.logAndReturnError('DB_ERROR', completeError.message, 'use-case', 'registerManualMesaPaymentUseCase', { details: { turnoId: effectiveTurnoId } });
        return { success: false, error: appError };
      }
      const completeRow = (completeResult as { success: boolean; sesion_completa: boolean; out_sesion_id: string | null }[] | null)?.[0];
      fullyPaid = completeRow?.sesion_completa ?? false;
      }

    } else if (divisionPersonas != null) {
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
