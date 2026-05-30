import { Result, AppError } from '@/core/domain/entities/types';
import { verifyRedsysWebhook } from '@/core/infrastructure/services/redsys.service';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';
import { createGlovoOrderUseCase } from '@/core/application/use-cases/glovo/createGlovoOrderUseCase';

export interface ProcessRedsysWebhookInput {
  dsParameters: string; // raw Base64 from POST body
  dsSignature: string; // raw signature from POST body
  dsSignatureVersion: string;
  empresaId: string;
}

export interface ProcessRedsysWebhookResult {
  verified: boolean;
  skipped?: boolean;
  paymentStatus?: 'paid' | 'failed';
}

export async function processRedsysWebhookUseCase(
  input: ProcessRedsysWebhookInput
): Promise<Result<ProcessRedsysWebhookResult, AppError>> {
  try {
    const supabase = getSupabaseClient();

    // Decode DS_MERCHANT_PARAMETERS (Base64 → JSON)
    let merchantParams: Record<string, unknown>;
    try {
      const decoded = Buffer.from(input.dsParameters, 'base64').toString('utf8');
      merchantParams = JSON.parse(decoded) as Record<string, unknown>;
    } catch {
      return { success: true, data: { verified: false } };
    }

    const dsOrder = merchantParams['Ds_Order'] as string | undefined
      ?? merchantParams['DS_MERCHANT_ORDER'] as string | undefined;
    const dsResponse = merchantParams['Ds_Response'] as string | undefined;

    if (!dsOrder) {
      return { success: true, data: { verified: false } };
    }

    // Fetch empresa secret key
    const { data: empresa, error: empresaError } = await supabase
      .from('empresas')
      .select('redsys_secret_key')
      .eq('id', input.empresaId)
      .single();

    if (empresaError || !empresa) {
      return { success: true, data: { verified: false } };
    }

    const e = empresa as Record<string, unknown>;
    const secretKey = e['redsys_secret_key'] as string | null;

    if (!secretKey) {
      return { success: true, data: { verified: false } };
    }

    // Verify signature — always return HTTP 200 to Redsys regardless
    const isValid = verifyRedsysWebhook(
      secretKey,
      input.dsParameters,
      input.dsSignature,
      dsOrder
    );

    if (!isValid) {
      return { success: true, data: { verified: false } };
    }

    // Find pedido by payment_order_ref + empresaId
    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .select('id, payment_status, empresa_id, total, numero_pedido, payment_order_ref, direccion_entrega, latitude_entrega, longitude_entrega, clientes(nombre, telefono)')
      .eq('payment_order_ref', dsOrder)
      .eq('empresa_id', input.empresaId)
      .maybeSingle();

    if (pedidoError || !pedido) {
      // Not found — verified but nothing to update
      return { success: true, data: { verified: true } };
    }

    const p = pedido as Record<string, unknown>;

    // Idempotency: already paid, skip
    if (p['payment_status'] === 'paid') {
      return { success: true, data: { verified: true, skipped: true } };
    }

    // DS_RESPONSE '0000'–'0099' → paid; anything else → failed
    const responseCode = dsResponse ?? '9999';
    const responseNum = Number.parseInt(responseCode, 10);
    const newPaymentStatus: 'paid' | 'failed' =
      responseNum >= 0 && responseNum <= 99 ? 'paid' : 'failed';

    const { error: updateError } = await supabase
      .from('pedidos')
      .update({ payment_status: newPaymentStatus })
      .eq('id', p['id'] as string)
      .eq('empresa_id', input.empresaId);

    if (updateError) {
      await logger.logAndReturnError(
        'DB_UPDATE_ERROR',
        updateError.message,
        'use-case',
        'processRedsysWebhookUseCase',
        { details: { code: updateError.code, pedidoId: p['id'] } }
      );
      // Still return 200 to Redsys — log internally
      return { success: true, data: { verified: true, paymentStatus: newPaymentStatus } };
    }

    // On paid: dispatch Glovo order + notify via Telegram
    if (newPaymentStatus === 'paid') {
      const cliente = (p['clientes'] as Record<string, unknown> | null) ?? {};
      const recipientName = (cliente['nombre'] as string | null) ?? 'Cliente';
      const recipientPhone = (cliente['telefono'] as string | null) ?? '';
      const direccion = (p['direccion_entrega'] as string | null) ?? '';
      const lat = (p['latitude_entrega'] as number | null) ?? 0;
      const lng = (p['longitude_entrega'] as number | null) ?? 0;
      const total = (p['total'] as number | null) ?? 0;
      const numeroPedido = (p['numero_pedido'] as number | null) ?? 0;
      const paymentRef = (p['payment_order_ref'] as string | null) ?? dsOrder;

      // Auto-dispatch — fire and forget; errors are logged internally
      createGlovoOrderUseCase({
        empresaId: input.empresaId,
        pedidoId: p['id'] as string,
        clientOrderId: paymentRef,
        recipientName,
        recipientPhone,
        recipientAddress: direccion,
        recipientLatitude: lat,
        recipientLongitude: lng,
        orderTotal: total,
        orderDescription: `Pedido #${numeroPedido}`,
      }).catch((err: unknown) => {
        logger.logFromCatch(err, 'use-case', 'processRedsysWebhookUseCase.glovoDispatch', {
          empresaId: input.empresaId,
        });
      });

      // Telegram notification — best-effort
      try {
        const { data: empresaFull } = await supabase
          .from('empresas')
          .select('telegram_chat_id')
          .eq('id', input.empresaId)
          .single();

        const ef = empresaFull as Record<string, unknown> | null;
        const chatId = ef?.['telegram_chat_id'] as string | null;

        if (chatId) {
          const botToken = process.env.TELEGRAM_BOT_TOKEN;
          if (botToken) {
            const text = `*Pago confirmado* \\| Pedido ref: ${dsOrder.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')}`;
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'MarkdownV2',
              }),
            });
          }
        }
      } catch {
        // Best-effort — do not fail the webhook response
      }
    }

    return { success: true, data: { verified: true, paymentStatus: newPaymentStatus } };
  } catch (e) {
    const appError = await logger.logFromCatch(
      e,
      'use-case',
      'processRedsysWebhookUseCase',
      { empresaId: input.empresaId }
    );
    return { success: false, error: appError };
  }
}
