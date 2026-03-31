import { z } from 'zod';

const tgtgItemSchema = z.object({
  titulo: z.string().min(1).max(200),
  descripcion: z.string().max(500).optional().nullable(),
  imagen_url: z
    .string()
    .url()
    .refine((url) => url.startsWith('https://'), { message: 'imagen_url must use HTTPS' })
    .optional()
    .nullable(),
  precio_original: z.number().positive().max(9999.99),
  precio_descuento: z.number().positive().max(9999.99),
  cupones_total: z.number().int().min(1).max(9999),
});

export const createTgtgSchema = z.object({
  hora_recogida_inicio: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido'),
  hora_recogida_fin: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido'),
  fecha_activacion: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido')
    .optional(),
  items: z.array(tgtgItemSchema).min(1).max(20),
});

export const claimCuponSchema = z.object({
  itemId: z.string().uuid(),
  tgtgPromoId: z.string().uuid(),
  email: z.string().email().max(255),
  token: z.string().min(10).max(500),
});

export const adjustCuponesSchema = z.object({
  delta: z.number().int().min(-100).max(100).refine((d) => d !== 0),
});

export type CreateTgtgInput = z.infer<typeof createTgtgSchema>;
export type ClaimCuponInput = z.infer<typeof claimCuponSchema>;
export type AdjustCuponesInput = z.infer<typeof adjustCuponesSchema>;
