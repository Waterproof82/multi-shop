import { z } from 'zod';

export const UpdateDeliverySettingsDtoSchema = z.object({
  // Delivery config
  delivery_min_order_cents: z.number().int().min(0).max(100000).optional(),
  delivery_fee_surcharge_cents: z.number().int().min(0).max(100000).optional(),
  // Glovo credentials
  glovo_client_id: z.string().max(200).optional(),
  glovo_key_id: z.string().max(200).optional(),
  glovo_private_key: z.string().max(8000).optional(), // RSA PEM — empty string = no change
  glovo_vendor_id: z.string().max(200).optional(),
  glovo_country_code: z.string().max(10).optional(),
  // Redsys credentials
  redsys_merchant_code: z.string().max(50).optional(),
  redsys_terminal: z.string().max(10).optional(),
  redsys_secret_key: z.string().max(500).optional(), // Base64 — empty string = no change
});

export type UpdateDeliverySettingsDto = z.infer<typeof UpdateDeliverySettingsDtoSchema>;
