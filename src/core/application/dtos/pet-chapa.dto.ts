// src/core/application/dtos/pet-chapa.dto.ts
// sdd pet-id-qr-profile, Fase 5 — Zod en la frontera (ruta/caso de uso),
// nunca en el dominio. Calco de `kit-caducidad.dto.ts` (createKitLoteSchema /
// generarSeriesSchema) con el nombre de mascotas.
import { z } from 'zod';

export const crearLoteChapasSchema = z.object({
  productoId: z.uuid(),
  codigo: z.string().trim().min(1).max(64),
});
export type CrearLoteChapasDTO = z.infer<typeof crearLoteChapasSchema>;

/** R-QR.1.1: tope de 500 por tanda, igual que `generarSeriesSchema`. */
export const generarCodigosChapaSchema = z.object({
  cantidad: z.number().int().min(1).max(500),
});
export type GenerarCodigosChapaDTO = z.infer<typeof generarCodigosChapaSchema>;

/** Fase 7 (admin UI): mismos límites que `paginaSchema` de `kit-caducidad.dto.ts`. */
export const paginaLotesChapaSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type PaginaLotesChapaDTO = z.infer<typeof paginaLotesChapaSchema>;

/**
 * `?pagina=` de `GET /api/admin/mascotas/lotes/[id]/etiquetas` (Fase 8,
 * R-QR.14.1): mismo rango que `etiquetasQuerySchema` de
 * `kit-caducidad.dto.ts`. El tope real de páginas lo impone
 * `generarEtiquetasLote.use-case.ts` según `POR_PDF` y el nº de códigos del lote.
 */
export const etiquetasChapaQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
});
export type EtiquetasChapaQueryDTO = z.infer<typeof etiquetasChapaQuerySchema>;
