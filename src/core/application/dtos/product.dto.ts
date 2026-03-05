import { z } from "zod";

// Schema for API validation (with i18n fields)
export const createProductSchema = z.object({
  empresaId: z.string().uuid(),
  titulo_es: z.string().min(1, "El título en español es requerido"),
  titulo_en: z.string().optional(),
  titulo_fr: z.string().optional(),
  titulo_it: z.string().optional(),
  titulo_de: z.string().optional(),
  descripcion_es: z.string().optional(),
  descripcion_en: z.string().optional(),
  descripcion_fr: z.string().optional(),
  descripcion_it: z.string().optional(),
  descripcion_de: z.string().optional(),
  precio: z.union([z.number(), z.string()])
    .transform(val => Number.parseFloat(String(val)))
    .pipe(z.number().min(0, "El precio no puede ser negativo")),
  foto_url: z.string().url().nullable().optional().optional(),
  categoria_id: z.string().uuid().nullable().optional(),
  es_especial: z.boolean().default(false),
  activo: z.boolean().default(true),
});

export type CreateProductDTO = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial().extend({
  id: z.string().uuid(),
});

export type UpdateProductDTO = z.infer<typeof updateProductSchema>;

export const productIdSchema = z.object({
  id: z.string().uuid(),
});
