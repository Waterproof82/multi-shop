import { z } from "zod";

// Schema for API validation (with i18n fields - snake_case)
export const createCategorySchema = z.object({
  empresaId: z.string().uuid(),
  nombre_es: z.string().min(1, "El nombre en español es requerido").max(200),
  nombre_en: z.string().max(200).optional(),
  nombre_fr: z.string().max(200).optional(),
  nombre_it: z.string().max(200).optional(),
  nombre_de: z.string().max(200).optional(),
  descripcion_es: z.string().max(2000).optional(),
  descripcion_en: z.string().max(2000).optional(),
  descripcion_fr: z.string().max(2000).optional(),
  descripcion_it: z.string().max(2000).optional(),
  descripcion_de: z.string().max(2000).optional(),
  orden: z.number().int().default(0),
  categoria_complemento_de: z.string().uuid().nullable().optional(),
  complemento_obligatorio: z.boolean().default(false),
  categoria_padre_id: z.string().uuid().nullable().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const categoryIdSchema = z.object({
  id: z.string().uuid(),
});

export type CreateCategoryDTO = z.infer<typeof createCategorySchema>;
export type UpdateCategoryDTO = z.infer<typeof updateCategorySchema>;
