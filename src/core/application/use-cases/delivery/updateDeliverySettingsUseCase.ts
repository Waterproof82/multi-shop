import { Result, AppError } from '@/core/domain/entities/types';
import { UpdateDeliverySettingsDto } from '@/core/application/dtos/delivery-settings.dto';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';

export async function updateDeliverySettingsUseCase(
  empresaId: string,
  dto: UpdateDeliverySettingsDto
): Promise<Result<void, AppError>> {
  try {
    const supabase = getSupabaseClient();

    // Build update payload — skip secret fields when empty (treat empty = no change)
    const payload: Record<string, unknown> = {};

    if (dto.delivery_min_order_cents !== undefined)
      payload['delivery_min_order_cents'] = dto.delivery_min_order_cents;
    if (dto.delivery_fee_surcharge_cents !== undefined)
      payload['delivery_fee_surcharge_cents'] = dto.delivery_fee_surcharge_cents;
    if (dto.glovo_client_id !== undefined) payload['glovo_client_id'] = dto.glovo_client_id;
    if (dto.glovo_key_id !== undefined) payload['glovo_key_id'] = dto.glovo_key_id;
    if (dto.glovo_vendor_id !== undefined) payload['glovo_vendor_id'] = dto.glovo_vendor_id;
    if (dto.glovo_country_code !== undefined)
      payload['glovo_country_code'] = dto.glovo_country_code;
    // Only update private key when non-empty (empty = keep existing)
    if (dto.glovo_private_key) payload['glovo_private_key'] = dto.glovo_private_key;
    if (dto.redsys_merchant_code !== undefined)
      payload['redsys_merchant_code'] = dto.redsys_merchant_code;
    if (dto.redsys_terminal !== undefined) payload['redsys_terminal'] = dto.redsys_terminal;
    // Only update secret key when non-empty (empty = keep existing)
    if (dto.redsys_secret_key) payload['redsys_secret_key'] = dto.redsys_secret_key;

    if (Object.keys(payload).length === 0) {
      return { success: true, data: undefined };
    }

    const { error } = await supabase
      .from('empresas')
      .update(payload)
      .eq('id', empresaId);

    if (error) {
      await logger.logAndReturnError(
        'DB_UPDATE_ERROR',
        error.message,
        'use-case',
        'updateDeliverySettingsUseCase',
        { empresaId, details: { code: error.code } }
      );
      return {
        success: false,
        error: {
          code: 'DB_ERROR',
          message: 'Error al guardar configuración de entrega',
          module: 'use-case',
          method: 'updateDeliverySettingsUseCase',
        },
      };
    }

    return { success: true, data: undefined };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'use-case', 'updateDeliverySettingsUseCase', {
      empresaId,
    });
    return { success: false, error: appError };
  }
}
