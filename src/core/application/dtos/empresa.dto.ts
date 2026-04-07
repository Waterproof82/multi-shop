import { z } from "zod";

// Validates a URL accepting only https:// scheme to prevent javascript: and http: URIs
const httpsUrl = z.string().url().refine(val => val.startsWith('https://'), { message: 'URL must use https://' });
const httpsUrlMax500 = z.string().max(500).url().refine(val => val.startsWith('https://'), { message: 'URL must use https://' });

export const updateEmpresaSchema = z.object({
  email_notification: z.string().email().max(254).optional().or(z.literal('')),
  telefono_whatsapp: z.string().max(30).regex(/^\+?[0-9\s\-()+]+$/).optional().or(z.literal('')).optional(),
  fb: httpsUrl.optional().or(z.literal('')),
  instagram: httpsUrl.optional().or(z.literal('')),
  url_mapa: httpsUrlMax500.optional().or(z.literal('')),
  direccion: z.string().max(300).optional().nullable(),
  logo_url: httpsUrl.optional().or(z.literal('')).or(z.null()),
  url_image: httpsUrl.optional().or(z.literal('')).or(z.null()),
  descripcion_es: z.string().max(1000).optional().nullable(),
  descripcion_en: z.string().max(1000).optional().nullable(),
  descripcion_fr: z.string().max(1000).optional().nullable(),
  descripcion_it: z.string().max(1000).optional().nullable(),
  descripcion_de: z.string().max(1000).optional().nullable(),
  mostrar_promociones: z.boolean().optional(),
  mostrar_tgtg: z.boolean().optional(),
  descuento_bienvenida_activo: z.boolean().optional(),
  descuento_bienvenida_porcentaje: z.number().min(1).max(50).optional(),
});

export type UpdateEmpresaDTO = z.infer<typeof updateEmpresaSchema>;
