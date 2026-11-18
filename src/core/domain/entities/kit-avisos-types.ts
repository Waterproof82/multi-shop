// src/core/domain/entities/kit-avisos-types.ts
// kit-expiry-m2b (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2b/)
// Contratos de design.md: el alta/confirmación/baja de avisos de caducidad
// de `kits_registrados` (D-M2b-2, sin DDL — los tres estados ya caben en
// las columnas de M1).

/** D-M2b-2: `pendiente` = hay email pero `registrado_at IS NULL`; `registrada` = confirmada. */
export type EstadoAvisos = 'pendiente' | 'registrada';

/**
 * Entrada de `IKitAvisosRepository.reservarAlta` — ya normalizada por el
 * DTO (`kit-avisos.dto.ts`) y completada por el caso de uso (token, hora
 * actual, versión del texto y el límite de caducidad de un pendiente).
 */
export interface AltaAvisosInput {
  serie: string;
  email: string;
  telefono: string | null;
  whatsapp: boolean;
  version: string;
  token: string;
  ahora: string;
  /** D-M2b-10/R-M2b.2.3: un pendiente anterior a este ISO ya caducó y puede sobrescribirse. */
  pendienteCaducaAntesDe: string;
}

/** R-M2b.2.4: contacto actual de una serie (pendiente o registrada) — nunca sale de la capa de aplicación. */
export interface ContactoAvisos {
  estado: EstadoAvisos;
  email: string;
  token: string;
}

/** R-M2b.3.3/R-M2b.3.5: lo que resuelve un token de gestión — sin email (R-M2b.6.1). */
export interface GestionPorToken {
  serie: string;
  estado: EstadoAvisos;
  version: string | null;
}

// ---- Puertos del caso de uso (design.md, "Enfoque técnico") ----
// Los casos de uso NO conocen Next ni Brevo: reciben estos puertos ya
// resueltos por la ruta, para poder probarse con dobles síncronos.

/**
 * kit-expiry-m3 (M3a/D-M3-6): cabeceras opcionales del envío (p. ej.
 * `List-Unsubscribe` RFC 8058, `IdempotencyKey`). M2b no las usa — por eso
 * son opcionales y `opciones` también lo es, para no romper sus llamadas.
 */
export interface OpcionesEnvioEmailAvisos {
  cabeceras?: Record<string, string>;
}

/** Envío real de un email de avisos — lo implementa `email-kit-avisos.brevo.ts` (M2b6a). */
export interface EmailKitAvisos {
  enviar(
    to: string,
    contenido: { asunto: string; html: string; texto: string },
    opciones?: OpcionesEnvioEmailAvisos,
  ): Promise<void>;
}

/** La ruta lo implementa con `after()` de `next/server` (DD5: responder 202 antes de enviar). */
export type Programar = (tarea: () => Promise<void>) => void;
