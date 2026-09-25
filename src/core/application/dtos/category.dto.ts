import { z } from "zod";

// Schema base SIN defaults a propósito (mismo incidente que I5 en
// modalidad-entrega.dto.ts): en Zod un `.default()` del schema base
// SOBREVIVE a `.partial()`. Un PUT que solo manda `{ orden }` (el
// drag-and-drop de categorías manda exactamente eso) rellenaría
// `activo`, `complemento_obligatorio` y `tipo_producto` con sus defaults
// aunque el caller no los mandara — reactivando categorías inactivas y
// pisando su tipo/complemento reales en cada reordenamiento. Los defaults
// viven solo en `createCategorySchema`, donde sí tiene sentido (una fila
// nueva sin esos campos explícitos).
const baseCategorySchema = z.object({
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
  orden: z.number().int(),
  categoria_complemento_de: z.uuid().nullable().optional(),
  complemento_obligatorio: z.boolean(),
  categoria_padre_id: z.uuid().nullable().optional(),
  tipo_producto: z.enum(['comida', 'bebida']).optional(),
  activo: z.boolean().optional(),
});

// Schema for API validation (with i18n fields - snake_case)
export const createCategorySchema = baseCategorySchema.extend({
  empresaId: z.uuid(),
  orden: z.number().int().default(0),
  complemento_obligatorio: z.boolean().default(false),
  tipo_producto: z.enum(['comida', 'bebida']).default('comida').optional(),
  activo: z.boolean().default(true).optional(),
});

export const updateCategorySchema = baseCategorySchema.partial();

export const categoryIdSchema = z.object({
  id: z.uuid(),
});

export type CreateCategoryDTO = z.infer<typeof createCategorySchema>;
export type UpdateCategoryDTO = z.infer<typeof updateCategorySchema>;
