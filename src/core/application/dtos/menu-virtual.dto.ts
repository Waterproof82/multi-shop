import { z } from 'zod';

export const createMenuVirtualSchema = z.object({
  empresaId: z.uuid(),
  padreId: z.uuid().nullable().optional(),
  nombre_es: z.string().min(1).max(200),
  nombre_en: z.string().max(200).nullable().optional(),
  nombre_fr: z.string().max(200).nullable().optional(),
  nombre_it: z.string().max(200).nullable().optional(),
  nombre_de: z.string().max(200).nullable().optional(),
  orden: z.number().int().default(0),
});

export const updateMenuVirtualSchema = createMenuVirtualSchema
  .omit({ empresaId: true, padreId: true })
  .partial();

export const setMenuVirtualProductosSchema = z.object({
  productoIds: z.array(z.uuid()),
});

export type CreateMenuVirtualDTO = z.infer<typeof createMenuVirtualSchema>;
export type UpdateMenuVirtualDTO = z.infer<typeof updateMenuVirtualSchema>;
export type SetMenuVirtualProductosDTO = z.infer<typeof setMenuVirtualProductosSchema>;
