import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';
import { autoCloseMesaAfterPayment } from './autoCloseMesaAfterPayment';

export interface RegisterManualMesaPaymentInput {
  mesaId: string;
  empresaId: string;
}

export interface RegisterManualMesaPaymentResult {
  pagosRealizados: number;
  personas: number | null;
  fullyPaid: boolean;
}

async function sendTelegramCompletionNotification(
  supabase: SupabaseClient,
  sesionId: string,
  mesaId: string,
  empresaId: string
): Promise<void> {
  try {
    const { data: empresaData } = await supabase
      .from('empresas')
      .select('telegram_bebidas_chat_id')
      .eq('id', empresaId)
      .single();

    const chatId = (empresaData as { telegram_bebidas_chat_id: string | null } | null)
      ?.telegram_bebidas_chat_id;
    if (!chatId) return;

    const { data: mesaData } = await supabase
      .from('mesas')
      .select('numero, nombre')
      .eq('id', mesaId)
      .maybeSingle();

    const m = mesaData as { numero: number; nombre: string | null } | null;
    const mesaNumero = m?.numero ?? 0;
    const mesaNombre = m?.nombre ?? null;

    const { data: pedidosData } = await supabase
      .from('pedidos')
      .select('total')
      .eq('sesion_id', sesionId)
      .eq('empresa_id', empresaId);

    const sessionTotal =
      (pedidosData as { total: string | number }[] | null)?.reduce(
        (acc, row) => acc + Number(row.total),
        0
      ) ?? 0;

    const { sendTelegramPagoMesaCompleto } = await import(
      '@/core/infrastructure/services/telegram.service'
    );
    await sendTelegramPagoMesaCompleto(sesionId, mesaNumero, mesaNombre, sessionTotal, chatId);
  } catch {
    // fire-and-forget — do not fail the main operation
  }
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

      // Fire-and-forget Telegram notification + auto-close
      void sendTelegramCompletionNotification(supabase, sesionId, input.mesaId, input.empresaId);
      void autoCloseMesaAfterPayment(sesionId, input.empresaId);
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
