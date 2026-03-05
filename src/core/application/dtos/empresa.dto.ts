import { z } from "zod";

export const updateEmpresaSchema = z.object({
  email_notification: z.string().email().optional().or(z.literal('')),
  telefono_whatsapp: z.string().optional(),
  fb: z.string().url().optional().or(z.literal('')),
  instagram: z.string().url().optional().or(z.literal('')),
  url_mapa: z.string().optional(),
  direccion: z.string().optional(),
});

export type UpdateEmpresaDTO = z.infer<typeof updateEmpresaSchema>;
