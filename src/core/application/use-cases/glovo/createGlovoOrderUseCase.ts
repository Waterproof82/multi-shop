import { Result, AppError } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { createGlovoOrder } from '@/core/infrastructure/services/glovo.service';
import { GLOVO_ERRORS } from '@/core/domain/constants/api-errors';
import { logger } from '@/core/infrastructure/logging/logger';

export interface CreateGlovoOrderInput {
  empresaId: string;
  pedidoId: string;
  clientOrderId: string;      // use payment_order_ref or pedidoId
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  recipientLatitude: number;
  recipientLongitude: number;
  orderTotal: number;         // euros
  orderDescription: string;
}

export interface CreateGlovoOrderOutput {
  glovoOrderId: string;
}

export async function createGlovoOrderUseCase(
  input: CreateGlovoOrderInput
): Promise<Result<CreateGlovoOrderOutput, AppError>> {
  try {
    const supabase = getSupabaseClient();

    const { data: empresa, error: empresaError } = await supabase
      .from('empresas')
      .select('glovo_client_id, glovo_key_id, glovo_private_key, glovo_vendor_id, glovo_country_code')
      .eq('id', input.empresaId)
      .single();

    if (empresaError || !empresa) {
      return {
        success: false,
        error: {
          code: GLOVO_ERRORS.GLOVO_NOT_CONFIGURED.code,
          message: GLOVO_ERRORS.GLOVO_NOT_CONFIGURED.message,
          module: 'use-case',
          method: 'createGlovoOrderUseCase',
        },
      };
    }

    const isMock = process.env.GLOVO_MOCK_MODE === 'true'
      || !empresa.glovo_client_id
      || !empresa.glovo_key_id
      || !empresa.glovo_private_key
      || !empresa.glovo_vendor_id;

    if (isMock && process.env.NODE_ENV !== 'production') {
      // Mock mode — simulate Glovo order dispatch without real credentials
      await supabase
        .from('pedidos')
        .update({ glovo_order_id: `mock_${input.clientOrderId}`, glovo_status: 'ACCEPTED' })
        .eq('id', input.pedidoId);
      return { success: true, data: { glovoOrderId: `mock_${input.clientOrderId}` } };
    }

    if (!empresa.glovo_client_id || !empresa.glovo_key_id || !empresa.glovo_private_key || !empresa.glovo_vendor_id) {
      return {
        success: false,
        error: {
          code: GLOVO_ERRORS.GLOVO_NOT_CONFIGURED.code,
          message: GLOVO_ERRORS.GLOVO_NOT_CONFIGURED.message,
          module: 'use-case',
          method: 'createGlovoOrderUseCase',
        },
      };
    }

    // Verify pedido exists
    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .select('id, total, numero_pedido')
      .eq('id', input.pedidoId)
      .eq('empresa_id', input.empresaId)
      .single();

    if (pedidoError || !pedido) {
      return {
        success: false,
        error: {
          code: 'PEDIDO_NOT_FOUND',
          message: 'Pedido not found',
          module: 'use-case',
          method: 'createGlovoOrderUseCase',
        },
      };
    }

    const credentials = {
      clientId: empresa.glovo_client_id,
      keyId: empresa.glovo_key_id,
      privateKey: empresa.glovo_private_key,
      vendorId: empresa.glovo_vendor_id,
      countryCode: (empresa.glovo_country_code as string | null) ?? 'es',
    };

    const result = await createGlovoOrder(credentials, input.empresaId, {
      clientOrderId: input.clientOrderId,
      recipientName: input.recipientName,
      recipientPhone: input.recipientPhone,
      recipientAddress: input.recipientAddress,
      recipientLatitude: input.recipientLatitude,
      recipientLongitude: input.recipientLongitude,
      paymentMethod: 'PAID',
      amount: input.orderTotal,
      description: input.orderDescription,
    });

    // Update pedido with Glovo order info
    const { error: updateError } = await supabase
      .from('pedidos')
      .update({
        glovo_order_id: result.orderId,
        glovo_status: 'NEW',
        delivery_fee_cents: Math.round(result.deliveryFee * 100),
      })
      .eq('id', input.pedidoId)
      .eq('empresa_id', input.empresaId);

    if (updateError) {
      await logger.logAndReturnError(
        'DB_UPDATE_ERROR',
        updateError.message,
        'use-case',
        'createGlovoOrderUseCase',
        { empresaId: input.empresaId, details: { pedidoId: input.pedidoId } }
      );
      // Non-fatal: order was created in Glovo, log but still return success with ID
    }

    return { success: true, data: { glovoOrderId: result.orderId } };
  } catch (e) {
    const isGlovoError = e instanceof Error && e.message.includes('Glovo order creation failed');

    if (isGlovoError) {
      return {
        success: false,
        error: {
          code: GLOVO_ERRORS.GLOVO_ORDER_FAILED.code,
          message: GLOVO_ERRORS.GLOVO_ORDER_FAILED.message,
          module: 'use-case',
          method: 'createGlovoOrderUseCase',
        },
      };
    }

    const appError = await logger.logFromCatch(e, 'use-case', 'createGlovoOrderUseCase', {
      empresaId: input.empresaId,
      details: { pedidoId: input.pedidoId },
    });
    return { success: false, error: appError };
  }
}
