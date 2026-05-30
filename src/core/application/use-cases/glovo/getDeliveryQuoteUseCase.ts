import { Result, AppError } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { estimateDeliveryFee } from '@/core/infrastructure/services/glovo.service';
import { GLOVO_ERRORS, DELIVERY_ERRORS } from '@/core/domain/constants/api-errors';
import { logger } from '@/core/infrastructure/logging/logger';

export interface GetDeliveryQuoteInput {
  empresaId: string;
  deliveryAddress: string;
  latitude: number;
  longitude: number;
  orderTotalCents: number;
}

export interface GetDeliveryQuoteOutput {
  estimatedDeliveryFee: number;      // euros
  estimatedDeliveryFeeCents: number; // cents
}

export async function getDeliveryQuoteUseCase(
  input: GetDeliveryQuoteInput
): Promise<Result<GetDeliveryQuoteOutput, AppError>> {
  try {
    const supabase = getSupabaseClient();

    const { data: empresa, error } = await supabase
      .from('empresas')
      .select('glovo_client_id, glovo_key_id, glovo_private_key, glovo_vendor_id, glovo_country_code, delivery_min_order_cents')
      .eq('id', input.empresaId)
      .single();

    if (error || !empresa) {
      return {
        success: false,
        error: {
          code: GLOVO_ERRORS.GLOVO_NOT_CONFIGURED.code,
          message: GLOVO_ERRORS.GLOVO_NOT_CONFIGURED.message,
          module: 'use-case',
          method: 'getDeliveryQuoteUseCase',
        },
      };
    }

    const isMock = process.env.GLOVO_MOCK_MODE === 'true'
      || !empresa.glovo_client_id
      || !empresa.glovo_key_id
      || !empresa.glovo_private_key
      || !empresa.glovo_vendor_id;

    if (isMock && process.env.NODE_ENV !== 'production') {
      // No credentials configured or mock mode explicitly enabled — return simulated fee
      return {
        success: true,
        data: { estimatedDeliveryFee: 3.5, estimatedDeliveryFeeCents: 350 },
      };
    }

    if (!empresa.glovo_client_id || !empresa.glovo_key_id || !empresa.glovo_private_key || !empresa.glovo_vendor_id) {
      return {
        success: false,
        error: {
          code: GLOVO_ERRORS.GLOVO_NOT_CONFIGURED.code,
          message: GLOVO_ERRORS.GLOVO_NOT_CONFIGURED.message,
          module: 'use-case',
          method: 'getDeliveryQuoteUseCase',
        },
      };
    }

    const minOrderCents = (empresa.delivery_min_order_cents as number | null) ?? 0;
    if (minOrderCents > 0 && input.orderTotalCents < minOrderCents) {
      return {
        success: false,
        error: {
          code: DELIVERY_ERRORS.DELIVERY_MIN_ORDER_NOT_MET.code,
          message: `${DELIVERY_ERRORS.DELIVERY_MIN_ORDER_NOT_MET.message}. Minimum: ${(minOrderCents / 100).toFixed(2)}€`,
          module: 'use-case',
          method: 'getDeliveryQuoteUseCase',
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

    const feeEstimate = await estimateDeliveryFee(credentials, input.empresaId, {
      latitude: input.latitude,
      longitude: input.longitude,
      address: input.deliveryAddress,
    });

    return {
      success: true,
      data: {
        estimatedDeliveryFee: feeEstimate.estimatedDeliveryFee,
        estimatedDeliveryFeeCents: Math.round(feeEstimate.estimatedDeliveryFee * 100),
      },
    };
  } catch (e) {
    const isGlovoError = e instanceof Error && e.message.includes('Glovo fee estimate failed');

    if (isGlovoError) {
      return {
        success: false,
        error: {
          code: GLOVO_ERRORS.GLOVO_QUOTE_FAILED.code,
          message: GLOVO_ERRORS.GLOVO_QUOTE_FAILED.message,
          module: 'use-case',
          method: 'getDeliveryQuoteUseCase',
        },
      };
    }

    const appError = await logger.logFromCatch(e, 'use-case', 'getDeliveryQuoteUseCase', {
      empresaId: input.empresaId,
    });
    return { success: false, error: appError };
  }
}
