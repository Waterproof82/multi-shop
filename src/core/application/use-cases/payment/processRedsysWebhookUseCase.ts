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

    // DS_RESPONSE '0000'–'0099' → paid; anything else → failed
    const responseCode = dsResponse ?? '9999';
    const responseNum = Number.parseInt(responseCode, 10);
    const newPaymentStatus: 'paid' | 'failed' =
      responseNum >= 0 && responseNum <= 99 ? 'paid' : 'failed';

    // Helper: fetch mesa info and session total for Telegram notification
    const fetchMesaContext = async (sesionId: string, empresaId: string): Promise<{
      mesaNumero: number;
      mesaNombre: string | null;
      sessionTotal: number;
    }> => {
      const { data: sesionRow } = await supabase
        .from('mesa_sesiones')
        .select('mesa_id')
        .eq('id', sesionId)
        .maybeSingle();
      const mesaId = (sesionRow as { mesa_id: string | null } | null)?.mesa_id ?? null;

      let mesaNumero = 0;
      let mesaNombre: string | null = null;
      if (mesaId) {
        const { data: mesaData } = await supabase
          .from('mesas')
          .select('numero, nombre')
          .eq('id', mesaId)
          .maybeSingle();
        const m = mesaData as { numero: number; nombre: string | null } | null;
        mesaNumero = m?.numero ?? 0;
        mesaNombre = m?.nombre ?? null;
      }

      const { data: pedidosData } = await supabase
        .from('pedidos')
        .select('total')
        .eq('sesion_id', sesionId)
        .eq('empresa_id', empresaId);
      const sessionTotal = (pedidosData as { total: string | number }[] | null)
        ?.reduce((acc, row) => acc + Number(row.total), 0) ?? 0;

      return { mesaNumero, mesaNombre, sessionTotal };
    };

    // ── Path 1: Division payment (tracked in mesa_division_pagos) ──────────────
    const { data: divPago } = await supabase
      .from('mesa_division_pagos')
      .select('id, sesion_id, empresa_id, status')
      .eq('payment_order_ref', dsOrder)
      .maybeSingle();

    if (divPago) {
      const dp = divPago as { id: string; sesion_id: string; empresa_id: string; status: string };

      // Idempotency: already processed
      if (dp.status !== 'pending') {
        return { success: true, data: { verified: true, skipped: true } };
      }

      const newDivStatus = newPaymentStatus === 'paid' ? 'paid' : 'failed';
      await supabase
        .from('mesa_division_pagos')
        .update({ status: newDivStatus })
        .eq('id', dp.id);

      if (newPaymentStatus === 'paid') {
        const { data: rpcResult } = await supabase
          .rpc('increment_division_pagos', { p_sesion_id: dp.sesion_id });

        const rpcRows = rpcResult as { pagos_realizados: number; personas: number }[] | null;
        const rpcRow = rpcRows?.[0];
        const allPaid = rpcRow ? rpcRow.pagos_realizados >= rpcRow.personas : false;

        if (allPaid) {
          await supabase
            .from('pedidos')
            .update({ payment_status: 'paid' })
            .eq('sesion_id', dp.sesion_id)
            .eq('empresa_id', dp.empresa_id);

          if (bebidasChatId) {
            const { sendTelegramPagoMesaCompleto } = await import('@/core/infrastructure/services/telegram.service');
            const { mesaNumero, mesaNombre, sessionTotal } = await fetchMesaContext(dp.sesion_id, dp.empresa_id);
            await sendTelegramPagoMesaCompleto(dp.sesion_id, mesaNumero, mesaNombre, sessionTotal, bebidasChatId);
          }
        }
      }

      return { success: true, data: { verified: true, paymentStatus: newPaymentStatus } };
    }

    // ── Path 2: Full (non-division) payment (tracked via pedidos) ───────────────
    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .select('id, payment_status, empresa_id, total, numero_pedido, payment_order_ref, sesion_id, direccion_entrega, latitude_entrega, longitude_entrega, clientes(nombre, telefono)')
      .eq('payment_order_ref', dsOrder)
      .eq('empresa_id', input.empresaId)
      .maybeSingle();

    if (pedidoError || !pedido) {
      return { success: true, data: { verified: true } };
    }

    const p = pedido as Record<string, unknown>;

    if (p['payment_status'] === 'paid') {
      return { success: true, data: { verified: true, skipped: true } };
    }

    const { error: updateError } = await supabase
      .from('pedidos')
      .update({ payment_status: newPaymentStatus })
      .eq('id', p['id'] as string)
      .eq('empresa_id', input.empresaId);

    const sesionId = p['sesion_id'] as string | null;
    if (!updateError && sesionId && newPaymentStatus === 'paid') {
      // No division — full payment, mark all session pedidos as paid
      await supabase
        .from('pedidos')
        .update({ payment_status: 'paid' })
        .eq('sesion_id', sesionId)
        .eq('empresa_id', input.empresaId);

      if (bebidasChatId) {
        const { sendTelegramPagoMesaCompleto } = await import('@/core/infrastructure/services/telegram.service');
        const { mesaNumero, mesaNombre, sessionTotal } = await fetchMesaContext(sesionId, input.empresaId);
        await sendTelegramPagoMesaCompleto(sesionId, mesaNumero, mesaNombre, sessionTotal, bebidasChatId);
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
      return { success: true, data: { verified: true, paymentStatus: newPaymentStatus } };
    }

    // On paid: dispatch Glovo order (fire-and-forget) — only for non-mesa delivery orders
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
