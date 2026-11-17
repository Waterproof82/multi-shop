// src/core/application/dtos/kit-caducidad.dto.ts
// kit-expiry-reminders M4a2 — Zod en la frontera (ruta/caso de uso), nunca en
// el dominio. Las formas de salida son `CreateKitLoteInput`/`Pagina` de
// `kit-caducidad-types.ts`.
//
import { z } from 'zod';

export const createKitLoteSchema = z.object({
  productoId: z.uuid(),
  codigo: z.string().trim().min(1).max(64),
  fechaMontaje: z.iso.date(),
});
export type CreateKitLoteDTO = z.infer<typeof createKitLoteSchema>;

export const paginaSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type PaginaDTO = z.infer<typeof paginaSchema>;

/** @public — consumido por `generarSeriesLote.use-case.ts` en M4c. */
export const generarSeriesSchema = z.object({
  cantidad: z.number().int().min(1).max(500),
});
/** @public — consumido por `generarSeriesLote.use-case.ts` en M4c. */
export type GenerarSeriesDTO = z.infer<typeof generarSeriesSchema>;

/**
 * DD9: por ítem, el `.refine()` exige exactamente una fuente de fecha
 * (`albaranCompraItemId` xor `caducaEl`) y que una fecha manual lleve
 * `parte` no vacía (R-M4.3.1/R-M4.3.2). El CHECK `kit_lote_caducidades_una_fuente`
 * de la migración M1 es la segunda barrera (defensa en profundidad, DD5).
 */
const caducidadItemSchema = z
  .object({
    ingredienteId: z.uuid(),
    parte: z.string().trim().max(120).default(''),
    albaranCompraItemId: z.uuid().nullable().optional(),
    caducaEl: z.iso.date().nullable().optional(),
  })
  .refine(
    (item) => Boolean(item.albaranCompraItemId) !== Boolean(item.caducaEl),
    {
      message: 'Cada ingrediente lleva exactamente una fuente de fecha: una línea de albarán o una fecha manual, no ambas ni ninguna',
      path: ['caducaEl'],
    },
  )
  .refine(
    (item) => !item.caducaEl || item.parte.length > 0,
    { message: 'La fecha manual requiere indicar la parte (p. ej. botiquín)', path: ['parte'] },
  );

/** DD9: `superRefine` rechaza un `(ingredienteId, parte)` duplicado en el mismo payload. */
export const replaceCaducidadesSchema = z
  .object({ items: z.array(caducidadItemSchema).max(100) })
  .superRefine((data, ctx) => {
    const vistos = new Set<string>();
    data.items.forEach((item, index) => {
      const clave = `${item.ingredienteId}::${item.parte}`;
      if (vistos.has(clave)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Combinación de ingrediente y parte duplicada',
          path: ['items', index, 'parte'],
        });
        return;
      }
      vistos.add(clave);
    });
  });
export type ReplaceCaducidadesDTO = z.infer<typeof replaceCaducidadesSchema>;
export type CaducidadItemDTO = z.infer<typeof caducidadItemSchema>;

/** `?loteId=` de `GET /api/admin/kits/candidatas` (M4b1). */
export const loteIdQuerySchema = z.object({ loteId: z.uuid() });
export type LoteIdQueryDTO = z.infer<typeof loteIdQuerySchema>;
