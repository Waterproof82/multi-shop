import { z } from 'zod';

export const createComplementoGrupoSchema = z.object({
  empresaId: z.string().uuid(),
  nombre_es: z.string().min(1).max(200),
  nombre_en: z.string().max(200).nullable().optional(),
  nombre_fr: z.string().max(200).nullable().optional(),
  nombre_it: z.string().max(200).nullable().optional(),
  nombre_de: z.string().max(200).nullable().optional(),
  tipo: z.enum(['radio', 'checkbox']),
  obligatorio: z.boolean().default(false),
  orden: z.number().int().default(0),
});

export const updateComplementoGrupoSchema = createComplementoGrupoSchema.omit({ empresaId: true }).partial();

export const createComplementoOpcionSchema = z.object({
  nombre_es: z.string().min(1).max(200),
  nombre_en: z.string().max(200).nullable().optional(),
  nombre_fr: z.string().max(200).nullable().optional(),
  nombre_it: z.string().max(200).nullable().optional(),
  nombre_de: z.string().max(200).nullable().optional(),
  precio_adicional: z.number().min(0).default(0),
  orden: z.number().int().default(0),
});

export const updateComplementoOpcionSchema = createComplementoOpcionSchema.partial();

export const setProductoGruposSchema = z.object({
  grupoIds: z.array(z.string().uuid()),
});

export type CreateComplementoGrupoDTO = z.infer<typeof createComplementoGrupoSchema>;
export type UpdateComplementoGrupoDTO = z.infer<typeof updateComplementoGrupoSchema>;
export type CreateComplementoOpcionDTO = z.infer<typeof createComplementoOpcionSchema>;
export type SetProductoGruposDTO = z.infer<typeof setProductoGruposSchema>;
