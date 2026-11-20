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
