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

    // Fetch empresa secret key + bebidas chat id for payment notification
    const { data: empresa, error: empresaError } = await supabase
      .from('empresas')
      .select('redsys_secret_key, telegram_bebidas_chat_id')
      .eq('id', input.empresaId)
      .single();

    if (empresaError || !empresa) {
      return { success: true, data: { verified: false } };
    }

    const e = empresa as Record<string, unknown>;
    const secretKey = e['redsys_secret_key'] as string | null;
    const bebidasChatId = e['telegram_bebidas_chat_id'] as string | null;

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
      .select('id, payment_status, empresa_id, total, numero_pedido, payment_order_ref, sesion_id, direccion_entrega, latitude_entrega, longitude_entrega, clientes(nombre, telefono)')
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

    // If this pedido belongs to a mesa session, handle session-level payment logic
    const sesionId = p['sesion_id'] as string | null;
    if (!updateError && sesionId && newPaymentStatus === 'paid') {
      // Check if this session has division enabled
      const { data: sesionData } = await supabase
        .from('mesa_sesiones')
        .select('division_personas, division_pagos_realizados, total, mesas(numero, nombre)')
        .eq('id', sesionId)
        .maybeSingle();

      const sd = sesionData as {
        division_personas: number | null;
        division_pagos_realizados: number;
        total: number | null;
        mesas: { numero: number; nombre: string | null } | null;
      } | null;
      const divisionPersonas = sd?.division_personas ?? null;

      if (divisionPersonas) {
        // Division payment: atomically increment the counter
        const { data: rpcResult } = await supabase
          .rpc('increment_division_pagos', { p_sesion_id: sesionId });

        const rpcRows = rpcResult as { pagos_realizados: number; personas: number }[] | null;
        const row = rpcRows?.[0];
        const allPaid = row ? row.pagos_realizados >= row.personas : false;

        if (allPaid) {
          // All shares paid — mark every pedido in the session as paid
          await supabase
            .from('pedidos')
            .update({ payment_status: 'paid' })
            .eq('sesion_id', sesionId)
            .eq('empresa_id', input.empresaId);
          // Notify bebidas chat: full session paid
          if (bebidasChatId) {
            const { sendTelegramPagoMesaCompleto } = await import('@/core/infrastructure/services/telegram.service');
            await sendTelegramPagoMesaCompleto(sesionId, sd?.mesas?.numero ?? 0, sd?.mesas?.nombre ?? null, sd?.total ?? 0, bebidasChatId);
          }
        }
        // Otherwise: partial payment confirmed, leave other pedidos unchanged
      } else {
        // No division — full payment, mark all session pedidos as paid
        await supabase
          .from('pedidos')
          .update({ payment_status: 'paid' })
          .eq('sesion_id', sesionId)
          .eq('empresa_id', input.empresaId);
        // Notify bebidas chat: full session paid
        if (bebidasChatId) {
          const { sendTelegramPagoMesaCompleto } = await import('@/core/infrastructure/services/telegram.service');
          await sendTelegramPagoMesaCompleto(sesionId, sd?.mesas?.numero ?? 0, sd?.mesas?.nombre ?? null, sd?.total ?? 0, bebidasChatId);
        }
      }
    }

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

    // On paid: dispatch Glovo order (fire-and-forget)
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
