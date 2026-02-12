import { z } from "zod";

export const createProductSchema = z.object({
  empresaId: z.string().uuid(),
  categoriaId: z.string().uuid().nullable(),
  titulo: z.string().min(3, "El título debe tener al menos 3 caracteres"),
  descripcion: z.string().nullable(),
  precio: z.number().min(0, "El precio no puede ser negativo"),
  fotoUrl: z.string().url().nullable().optional(),
  esEspecial: z.boolean().default(false),
  activo: z.boolean().default(true),
});

export type CreateProductDTO = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial().extend({
  id: z.string().uuid(),
});

export type UpdateProductDTO = z.infer<typeof updateProductSchema>;
