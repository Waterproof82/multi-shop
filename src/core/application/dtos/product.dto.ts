import { z } from "zod";

// Schema for API validation (with i18n fields)
export const createProductSchema = z.object({
  empresaId: z.string().uuid(),
  titulo_es: z.string().min(1, "El título en español es requerido"),
  titulo_en: z.string().optional().nullable(),
  titulo_fr: z.string().optional().nullable(),
  titulo_it: z.string().optional().nullable(),
  titulo_de: z.string().optional().nullable(),
  descripcion_es: z.string().optional().nullable(),
  descripcion_en: z.string().optional().nullable(),
  descripcion_fr: z.string().optional().nullable(),
  descripcion_it: z.string().optional().nullable(),
  descripcion_de: z.string().optional().nullable(),
  precio: z.union([z.number(), z.string()])
    .transform(val => {
      const num = Number.parseFloat(String(val));
      return isNaN(num) ? 0 : num;
    })
    .pipe(z.number().min(0, "El precio no puede ser negativo")),
  foto_url: z.string().url().nullable().optional().nullable(),
  categoria_id: z.string().uuid().nullable().optional().nullable(),
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
