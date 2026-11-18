// src/core/application/dtos/kit-avisos.dto.ts
// kit-expiry-m2b — Zod en la frontera (ruta → caso de uso), nunca en el
// dominio. R-M2b.2.2 (alta), R-M2b.4.1 (enlace) y R-M2b.3.5 (gestión).
import { z } from 'zod';
import { esTokenGestion } from '@/lib/kit-caducidad/token-gestion';

const MAX_SERIE = 40;
const MAX_EMAIL = 254;
const MAX_TELEFONO = 20;

// R-M2b.2.2: el email se normaliza (trim + minúsculas) ANTES de validar su
// forma — así " Ana@Ejemplo.com " no falla por el espacio que va a limpiarse.
const emailSchema = z.string().trim().toLowerCase().max(MAX_EMAIL).pipe(z.email());

// R-M2b.2.2: del teléfono quedan solo "+" y dígitos; el máximo se comprueba
// DESPUÉS de limpiar, porque lo que cuenta de cara al CHECK de la migración
// M1 es el valor que se guarda, no lo que tecleó el titular.
const telefonoSchema = z
  .string()
  .trim()
  .transform((valor) => valor.replace(/[^\d+]/g, ''))
  .pipe(z.string().min(1).max(MAX_TELEFONO));

const serieSchema = z.string().trim().min(1).max(MAX_SERIE);

/**
 * R-M2b.2.2/D-M2b-1: `aceptaPrivacidad` y `avisosEmail` son literales `true`
 * — no "truthy", `true` exacto — y `avisosWhatsapp: true` exige teléfono
 * (CHECK `kits_registrados_whatsapp_con_telefono` de M1, defensa en profundidad).
 */
export const altaAvisosSchema = z
  .object({
    serie: serieSchema,
    email: emailSchema,
    telefono: telefonoSchema.optional(),
    aceptaPrivacidad: z.literal(true),
    avisosEmail: z.literal(true),
    avisosWhatsapp: z.boolean().optional().default(false),
  })
  .refine((data) => !data.avisosWhatsapp || Boolean(data.telefono), {
    message: 'El teléfono es obligatorio para recibir avisos por WhatsApp',
    path: ['telefono'],
  });
export type AltaAvisosDTO = z.infer<typeof altaAvisosSchema>;

/** R-M2b.4.1: `POST /api/kit-avisos/enlace` — pide solo el email. */
export const enlaceGestionSchema = z.object({
  serie: serieSchema,
  email: emailSchema,
});
export type EnlaceGestionDTO = z.infer<typeof enlaceGestionSchema>;

/** R-M2b.3.5: `POST /api/kit-avisos/gestion` — token + acción. */
export const gestionSchema = z.object({
  token: z.string().refine(esTokenGestion, 'Token con forma inválida'),
  accion: z.enum(['confirmar', 'baja']),
});
export type GestionDTO = z.infer<typeof gestionSchema>;
