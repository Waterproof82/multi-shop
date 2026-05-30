import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';

interface GlovoWebhookPayload {
  // DH On Demand API uses snake_case; accept both forms defensively
  order_id?: string;
  orderId?: string;
  status?: string;
  delivery_fee?: number;   // final fee in euros from DH API
  fee?: { total?: number }; // alternative nested form
  [key: string]: unknown;
}

type GlovoStatus = 'ACCEPTED' | 'COMPLETED' | 'CANCELLED' | string;

function mapGlovoStatusToPedidoEstado(
  glovoStatus: GlovoStatus
): { estado: string } | null {
  switch (glovoStatus) {
    case 'COMPLETED':
      return { estado: 'entregado' };
    case 'CANCELLED':
      return { estado: 'cancelado' };
    default:
      return null; // No pedido estado change for other statuses
  }
}

export async function processGlovoWebhookUseCase(body: unknown): Promise<{ success: true }> {
  try {
    const payload = body as GlovoWebhookPayload;
    const glovoOrderId = payload.order_id ?? payload.orderId;
    const glovoStatus = payload.status;

    if (!glovoOrderId || !glovoStatus) {
      // Malformed webhook — log and return success (Glovo requires 200)
      await logger.logAndReturnError(
        'GLOVO_WEBHOOK_MALFORMED',
        'Missing orderId or status in Glovo webhook',
        'infrastructure',
        'processGlovoWebhookUseCase',
        { details: { payload: JSON.stringify(payload).slice(0, 200) } }
      );
      return { success: true };
    }

    const supabase = getSupabaseClient();

    // Find pedido by glovo_order_id
    const { data: pedido, error: findError } = await supabase
      .from('pedidos')
      .select('id, empresa_id')
      .eq('glovo_order_id', glovoOrderId)
      .maybeSingle();

    if (findError || !pedido) {
      // Unknown order — log but still return 200
      await logger.logAndReturnError(
        'GLOVO_WEBHOOK_ORDER_NOT_FOUND',
        `No pedido found for glovo_order_id: ${glovoOrderId}`,
        'infrastructure',
        'processGlovoWebhookUseCase',
        { details: { glovoOrderId } }
      );
      return { success: true };
    }

    const pedidoEstado = mapGlovoStatusToPedidoEstado(glovoStatus);

    const updatePayload: Record<string, unknown> = {
      glovo_status: glovoStatus,
    };

    if (pedidoEstado) {
      updatePayload.estado = pedidoEstado.estado;
    }

    // Update delivery_fee_cents if provided in webhook (DH uses delivery_fee in euros)
    const feeCents =
      payload.delivery_fee !== undefined
        ? Math.round(payload.delivery_fee * 100)
        : payload.fee?.total !== undefined
          ? Math.round(payload.fee.total * 100)
          : undefined;
    if (feeCents !== undefined) {
      updatePayload.delivery_fee_cents = feeCents;
    }

    const { error: updateError } = await supabase
      .from('pedidos')
      .update(updatePayload)
      .eq('id', pedido.id)
      .eq('empresa_id', pedido.empresa_id);

    if (updateError) {
      await logger.logAndReturnError(
        'GLOVO_WEBHOOK_UPDATE_ERROR',
        updateError.message,
        'infrastructure',
        'processGlovoWebhookUseCase',
        { details: { glovoOrderId, pedidoId: pedido.id } }
      );
    }
  } catch (e) {
    // Never throw from a webhook handler — Glovo requires HTTP 200
    await logger.logFromCatch(e, 'infrastructure', 'processGlovoWebhookUseCase');
  }

  return { success: true };
}
