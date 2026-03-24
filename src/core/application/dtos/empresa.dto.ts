import { z } from "zod";

export const updateEmpresaSchema = z.object({
  email_notification: z.string().email().optional().or(z.literal('')),
  telefono_whatsapp: z.string().max(30).regex(/^\+?[0-9\s\-()+]+$/).optional().or(z.literal('')).optional(),
  fb: z.string().url().optional().or(z.literal('')),
  instagram: z.string().url().optional().or(z.literal('')),
  url_mapa: z.string().optional(),
  direccion: z.string().max(300).optional().nullable(),
  logo_url: z.string().url().optional().or(z.literal('')).or(z.null()),
  url_image: z.string().url().optional().or(z.literal('')).or(z.null()),
  descripcion_es: z.string().max(1000).optional().nullable(),
  descripcion_en: z.string().max(1000).optional().nullable(),
  descripcion_fr: z.string().max(1000).optional().nullable(),
  descripcion_it: z.string().max(1000).optional().nullable(),
  descripcion_de: z.string().max(1000).optional().nullable(),
});

export type UpdateEmpresaDTO = z.infer<typeof updateEmpresaSchema>;
