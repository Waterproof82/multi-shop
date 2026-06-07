import { Result, AppError } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';

export interface DeliverySettings {
  delivery_min_order_cents: number;
  delivery_fee_surcharge_cents: number;
  glovo_client_id: string;
  glovo_key_id: string;
  glovo_vendor_id: string;
  glovo_country_code: string;
  glovo_private_key_set: boolean; // true = key is saved; never return the actual key
  redsys_merchant_code: string;
  redsys_terminal: string;
  redsys_secret_key_set: boolean; // true = key is saved; never return the actual key
}

export async function getDeliverySettingsUseCase(
  empresaId: string
): Promise<Result<DeliverySettings, AppError>> {
  try {
    const supabase = getSupabaseClient();

    const { data: empresa, error } = await supabase
      .from('empresas')
      .select(
        'delivery_min_order_cents, delivery_fee_surcharge_cents, glovo_client_id, glovo_key_id, glovo_vendor_id, glovo_country_code, glovo_private_key, redsys_merchant_code, redsys_terminal, redsys_secret_key'
      )
      .eq('id', empresaId)
      .single();

    if (error || !empresa) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Empresa not found',
          module: 'use-case',
          method: 'getDeliverySettingsUseCase',
        },
      };
    }

    const e = empresa as Record<string, unknown>;

    return {
      success: true,
      data: {
        delivery_min_order_cents: (e['delivery_min_order_cents'] as number | null) ?? 0,
        delivery_fee_surcharge_cents: (e['delivery_fee_surcharge_cents'] as number | null) ?? 0,
        glovo_client_id: (e['glovo_client_id'] as string | null) ?? '',
        glovo_key_id: (e['glovo_key_id'] as string | null) ?? '',
        glovo_vendor_id: (e['glovo_vendor_id'] as string | null) ?? '',
        glovo_country_code: (e['glovo_country_code'] as string | null) ?? 'es',
        glovo_private_key_set: !!(e['glovo_private_key'] as string | null),
        redsys_merchant_code: (e['redsys_merchant_code'] as string | null) ?? '',
        redsys_terminal: (e['redsys_terminal'] as string | null) ?? '001',
        redsys_secret_key_set: !!(e['redsys_secret_key'] as string | null),
      },
    };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'use-case', 'getDeliverySettingsUseCase', {
      empresaId,
    });
    return { success: false, error: appError };
  }
}
