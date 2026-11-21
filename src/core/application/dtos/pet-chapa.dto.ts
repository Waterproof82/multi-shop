// src/core/application/dtos/pet-chapa.dto.ts
// sdd pet-id-qr-profile, Fase 5 — Zod en la frontera (ruta/caso de uso),
// nunca en el dominio. Calco de `kit-caducidad.dto.ts` (createKitLoteSchema /
// generarSeriesSchema) con el nombre de mascotas.
//
// Fase 10 (R-QR.4): `altaChapaSchema` valida `POST /api/mascota/alta`. El
// tipo que consume el repositorio (`AltaChapaInput`) NO vive aquí — vive en
// `pet-chapa-types.ts` (dominio), para que `IPetPerfilRepository` no
// dependa de este fichero de aplicación. Ver la nota de cabecera de
// `pet-chapa-types.ts` para el porqué (misma razón que M2b).
import { z } from 'zod';
import { esCodigoChapaValido } from '@/lib/pet-id/codigo';
import { validarTextoPerfil } from '@/lib/pet-id/validacion';

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

// ---- Alta de una chapa (Fase 10, `POST /api/mascota/alta`) ----

const MAX_NOMBRE_MASCOTA = 40;
const MAX_NOTAS_SALUD = 280;
const MAX_EMAIL = 254;

// R-QR.4.1: el email se normaliza (trim + minúsculas) ANTES de validar su
// forma, igual que `altaAvisosSchema` (M2b).
const emailSchema = z.string().trim().toLowerCase().max(MAX_EMAIL).pipe(z.email());

const codigoSchema = z.string().trim().refine(esCodigoChapaValido, 'Código de chapa no válido');

const notasSchema = z
  .string()
  .trim()
  .max(MAX_NOTAS_SALUD)
  .refine((v) => validarTextoPerfil(v, MAX_NOTAS_SALUD) === 'ok', {
    message: 'Las notas no pueden incluir un email o un teléfono (R-QR.9.2)',
  })
  .optional();

/**
 * R-QR.4.1/DD6: el alta recoge el email, el nombre y la especie, y —si se
 * quiere— las notas de salud. `aceptaPrivacidad` y `aceptaPublicacion` son
 * literales `true` (no "truthy"): ambas casillas de
 * `TEXTOS_CONSENTIMIENTO_PERFIL` (`pet-id/consentimiento.ts`) son
 * obligatorias para el alta — sin la segunda, la chapa no publicaría nada.
 */
export const altaChapaSchema = z.object({
  codigo: codigoSchema,
  email: emailSchema,
  nombre: z.string().trim().min(1).max(MAX_NOMBRE_MASCOTA),
  especie: z.enum(['perro', 'gato']),
  notas: notasSchema,
  aceptaPrivacidad: z.literal(true),
  aceptaPublicacion: z.literal(true),
});
export type AltaChapaDTO = z.infer<typeof altaChapaSchema>;
