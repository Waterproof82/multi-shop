import { Result, AppError } from '@/core/domain/entities/types';
import {
  buildRedsysFormData,
  generatePaymentOrderRef,
  RedsysFormData,
} from '@/core/infrastructure/services/redsys.service';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';

export interface CommitCustomPaymentInput {
  turnoId:    string;
  mesaId:     string;
  empresaId:  string;
  urlOk:      string;
  urlKo:      string;
  webhookUrl: string;
}

export type CommitCustomPaymentResult =
  | { type: 'redsys'; formData: RedsysFormData & { paymentOrderRef: string } }
  | { type: 'no_amount'; errorCode: string };

export async function commitCustomPaymentUseCase(
  input: CommitCustomPaymentInput
): Promise<Result<CommitCustomPaymentResult, AppError>> {
  try {
    const supabase = getSupabaseClient();

    // Load turno to get importe_cents and verify status
    const { data: turnoRow } = await supabase
      .from('mesa_pagos_personalizados')
      .select('status, importe_cents, sesion_id')
      .eq('id', input.turnoId)
      .maybeSingle();

    if (!turnoRow) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Turno no encontrado', module: 'use-case', method: 'commitCustomPaymentUseCase' } };
    }
    const tr = turnoRow as { status: string; importe_cents: number | null; sesion_id: string };
    if (tr.status !== 'en_seleccion') {
      return { success: false, error: { code: 'CONFLICT', message: 'El turno no está en selección', module: 'use-case', method: 'commitCustomPaymentUseCase' } };
    }
    if (!tr.importe_cents || tr.importe_cents <= 0) {
      return { success: true, data: { type: 'no_amount', errorCode: 'EMPTY_SELECTION' } };
    }

    // Fetch empresa Redsys credentials
    const { data: empresa } = await supabase
      .from('empresas')
      .select('nombre, redsys_merchant_code, redsys_terminal, redsys_secret_key')
      .eq('id', input.empresaId)
      .single();

    const e = empresa as Record<string, unknown> | null;
    const isDev = process.env.NODE_ENV !== 'production';
    const merchantCode = (e?.['redsys_merchant_code'] as string | null) ?? (isDev ? '999008881' : null);
    const secretKey    = (e?.['redsys_secret_key']    as string | null) ?? (isDev ? 'sq7HjrUOBfKmC576ILgskD5srU870gJ7' : null);
    const terminal     = (e?.['redsys_terminal']      as string | null) ?? '001';
    const merchantName = (e?.['nombre']               as string | null) ?? 'Tienda';

    if (!merchantCode || !secretKey) {
      return { success: false, error: { code: 'PAYMENT_NOT_CONFIGURED', message: 'Redsys no configurado', module: 'use-case', method: 'commitCustomPaymentUseCase' } };
    }

    // Generate payment reference anchored to the mesa
    const { data: pedidos } = await supabase
      .from('pedidos')
      .select('numero_pedido')
      .eq('sesion_id', tr.sesion_id)
      .eq('empresa_id', input.empresaId);

    const rows = (pedidos ?? []) as { numero_pedido: unknown }[];
    const maxNum = rows.reduce((m, p) => Math.max(m, Number(p.numero_pedido) || 0), 0);
    const paymentOrderRef = generatePaymentOrderRef(maxNum || undefined);

    // Commit: transition to en_pago, insert mesa_item_pagos rows
    const { data: rpcResult, error: rpcError } = await supabase.rpc('commit_custom_payment', {
      p_turno_id:          input.turnoId,
      p_payment_order_ref: paymentOrderRef,
      p_importe_cents:     tr.importe_cents,
    });

    if (rpcError) {
      const appError = await logger.logAndReturnError('DB_ERROR', rpcError.message, 'use-case', 'commitCustomPaymentUseCase', { details: { turnoId: input.turnoId } });
      return { success: false, error: appError };
    }

    const row = (rpcResult as { success: boolean; error_code: string | null }[] | null)?.[0];
    if (!row?.success) {
      return { success: true, data: { type: 'no_amount', errorCode: row?.error_code ?? 'UNKNOWN' } };
    }

    const formData = buildRedsysFormData(
      { merchantCode, terminal, secretKey },
      {
        order:           paymentOrderRef,
        amountCents:     tr.importe_cents,
        currency:        '978',
        transactionType: '0',
        urlOk:           input.urlOk,
        urlKo:           input.urlKo,
        merchantName,
        webhookUrl:      input.webhookUrl,
      }
    );

    return { success: true, data: { type: 'redsys', formData: { ...formData, paymentOrderRef } } };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'use-case', 'commitCustomPaymentUseCase', { details: { turnoId: input.turnoId } });
    return { success: false, error: appError };
  }
}
