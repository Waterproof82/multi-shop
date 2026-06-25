import { Result, AppError } from '@/core/domain/entities/types';
import { DELIVERY_ERRORS } from '@/core/domain/constants/api-errors';
import {
  buildRedsysFormData,
  generatePaymentOrderRef,
  RedsysFormData,
} from '@/core/infrastructure/services/redsys.service';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';

export interface InitiateRedsysPaymentInput {
  pedidoId: string;
  empresaId: string;
  /** Absolute URLs for Redsys redirect after payment */
  urlOk: string;
  urlKo: string;
  /** Absolute URL for Redsys server-to-server notification */
  webhookUrl: string;
}

export async function initiateRedsysPaymentUseCase(
  input: InitiateRedsysPaymentInput
): Promise<Result<RedsysFormData, AppError>> {
  try {
    const supabase = getSupabaseClient();

    // Fetch empresa credentials
    const { data: empresa, error: empresaError } = await supabase
      .from('empresas')
      .select('nombre, redsys_merchant_code, redsys_terminal, redsys_secret_key')
      .eq('id', input.empresaId)
      .single();

    if (empresaError || !empresa) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Empresa not found',
          module: 'use-case',
          method: 'initiateRedsysPaymentUseCase',
        },
      };
    }

    const e = empresa as Record<string, unknown>;
    const merchantCode = e['redsys_merchant_code'] as string | null;
    const terminal = e['redsys_terminal'] as string | null;
    const secretKey = e['redsys_secret_key'] as string | null;
    const merchantName = (e['nombre'] as string | null) ?? 'Tienda';

    // In development, always use Redsys public test credentials (override DB values).
    // This ensures production credentials stored in DB are never sent to the test URL.
    const isDev = process.env.NODE_ENV !== 'production';
    const effectiveMerchantCode = isDev ? '999008881' : (merchantCode ?? null);
    const effectiveSecretKey    = isDev ? 'sq7HjrUOBfKmC576ILgskD5srU870gJ7' : (secretKey ?? null);
    const effectiveTerminal     = isDev ? '001' : (terminal ?? '001');

    if (!effectiveMerchantCode || !effectiveSecretKey) {
      return {
        success: false,
        error: {
          ...DELIVERY_ERRORS.PAYMENT_NOT_CONFIGURED,
          module: 'use-case',
          method: 'initiateRedsysPaymentUseCase',
        },
      };
    }

    // Fetch pedido to get total
    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .select('id, total, payment_status, numero_pedido, tracking_token')
      .eq('id', input.pedidoId)
      .eq('empresa_id', input.empresaId)
      .single();

    if (pedidoError || !pedido) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Pedido not found',
          module: 'use-case',
          method: 'initiateRedsysPaymentUseCase',
        },
      };
    }

    const p = pedido as Record<string, unknown>;
    const rawTotal = p['total'];
    const total = rawTotal !== null && rawTotal !== undefined ? Number(rawTotal) : 0;
    const amountCents = Math.round(total * 100);
    const numeroPedido = p['numero_pedido'] !== null && p['numero_pedido'] !== undefined
      ? Number(p['numero_pedido']) : undefined;
    const trackingToken = p['tracking_token'] as string | null;

    // Generate order reference — must start with 4 numeric digits (Redsys spec)
    const paymentOrderRef = generatePaymentOrderRef(numeroPedido);

    console.log('[Redsys] pedidoId:', input.pedidoId, '| total_raw:', rawTotal, '| total:', total, '| amountCents:', amountCents, '| numeroPedido:', numeroPedido, '| paymentOrderRef:', paymentOrderRef);

    // Update pedido with payment state
    const { error: updateError } = await supabase
      .from('pedidos')
      .update({
        payment_status: 'pending',
        payment_order_ref: paymentOrderRef,
        payment_amount_cents: amountCents,
      })
      .eq('id', input.pedidoId)
      .eq('empresa_id', input.empresaId);

    if (updateError) {
      await logger.logAndReturnError(
        'DB_UPDATE_ERROR',
        updateError.message,
        'use-case',
        'initiateRedsysPaymentUseCase',
        { details: { code: updateError.code, pedidoId: input.pedidoId } }
      );
      return {
        success: false,
        error: {
          code: 'DB_ERROR',
          message: 'Error al iniciar pago',
          module: 'use-case',
          method: 'initiateRedsysPaymentUseCase',
        },
      };
    }

    const formData = buildRedsysFormData(
      {
        merchantCode: effectiveMerchantCode,
        terminal: effectiveTerminal,
        secretKey: effectiveSecretKey,
      },
      {
        order: paymentOrderRef,
        amountCents,
        currency: '978',
        transactionType: '0',
        urlOk: trackingToken ? `${input.urlOk}?token=${trackingToken}` : input.urlOk,
        urlKo: trackingToken ? `${input.urlKo}&token=${trackingToken}` : input.urlKo,
        merchantName,
        webhookUrl: input.webhookUrl,
      }
    );

    const decodedCheck = JSON.parse(Buffer.from(formData.DS_MERCHANT_PARAMETERS, 'base64').toString('utf8')) as Record<string, unknown>;
    console.log('[Redsys params]', decodedCheck);

    return { success: true, data: formData };
  } catch (e) {
    const appError = await logger.logFromCatch(
      e,
      'use-case',
      'initiateRedsysPaymentUseCase',
      { empresaId: input.empresaId, details: { pedidoId: input.pedidoId } }
    );
    return { success: false, error: appError };
  }
}
