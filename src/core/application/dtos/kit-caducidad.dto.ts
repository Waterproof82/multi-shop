// src/core/application/dtos/kit-caducidad.dto.ts
// kit-expiry-reminders M4a2 — Zod en la frontera (ruta/caso de uso), nunca en
// el dominio. Las formas de salida son `CreateKitLoteInput`/`Pagina` de
// `kit-caducidad-types.ts`.
//
// `replaceCaducidadesSchema` (DD9: XOR por ítem + duplicado
// (ingredienteId, parte)) se añade en M4a2b junto con
// `replaceKitLoteCaducidades.use-case.ts` (ver nota en
// IKitCaducidadRepository.ts).
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
