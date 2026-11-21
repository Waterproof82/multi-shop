// src/core/domain/entities/pet-chapa-types.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
// Fase 5 — admin backend: lotes y chapas. DD1/DD7 de design.md: el admin
// SOLO conoce `PetChapaLote`, `CreatePetChapaLoteInput` y `RecuentoPorEstado`
// — ningún tipo de este fichero lleva un campo de PII (email, teléfono,
// nombre de la mascota, foto, token de gestión). Esos campos solo existen en
// el dominio del perfil público (`IPetPerfilRepository`, Fase 9+).
//
// `AltaChapaInput`/`ContactoDueno` (Fase 10, DD5/DD17) viven aquí, NO en
// `application/dtos/pet-chapa.dto.ts`, por la misma razón que
// `AltaAvisosInput`/`ContactoAvisos` viven en `kit-avisos-types.ts` y no en
// `kit-avisos.dto.ts` (M2b, DD1 de su design.md): `IPetPerfilRepository` es
// dominio y no puede depender de un tipo de la capa de aplicación (Zod). El
// Zod de la ruta (`altaChapaSchema`) sigue en `pet-chapa.dto.ts`; el caso de
// uso traduce ese DTO a este `AltaChapaInput`.
import type { Language } from '@/lib/language-context';

/** R-QR.3.1: tres estados sin columnas extra — libre (sin email), pendiente
 * (con email, sin confirmar) y activa (confirmada). */
export type EstadoChapa = 'libre' | 'pendiente' | 'activa';

export interface PetChapaLote {
  id: string;
  empresaId: string;
  productoId: string;
  codigo: string;
  createdAt: string;
  // Joined (solo el nombre del producto, nunca un dato de la mascota).
  productoNombre?: string;
}

export interface CreatePetChapaLoteInput {
  productoId: string;
  codigo: string;
}

/** R-QR.1.2: recuento del lote por estado, nunca un dato personal. */
export interface RecuentoPorEstado {
  libre: number;
  pendiente: number;
  activa: number;
}

/**
 * Paginación del listado de lotes (Fase 7, UI admin). Tipo propio en vez de
 * reutilizar `Paginado`/`Pagina` de `kit-caducidad-types.ts` (DD1: dos
 * módulos independientes, sin acoplar `mascotas` a `kits` por un contenedor
 * genérico que no lleva ningún dato del dominio).
 */
export interface Paginado<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Pagina {
  page: number;
  pageSize: number;
}

// ---- Etiquetas PDF y CSV con QR (Fase 8) ----

/** R-QR.14.2: una fila de la hoja/CSV: su código y la URL de su perfil — nunca teléfono ni otro dato de contacto. */
export interface EtiquetaChapa {
  codigo: string;
  url: string;
}

/**
 * Página del PDF de etiquetas de un lote (R-QR.14.1/R-QR.14.4). Solo lleva
 * `codigo`/`url` por etiqueta — ningún campo de perfil de `pet_chapas`
 * (email, nombre, foto...) llega aquí, igual que `EtiquetasLote` de
 * `kit-caducidad-types.ts`.
 */
export interface EtiquetasLotePet {
  codigoLote: string;
  etiquetas: EtiquetaChapa[];
  muestra: boolean;
  pagina: number;
  totalPaginas: number;
}

/** R-QR.14.3: todos los códigos/URLs del lote de una vez, para el CSV del proveedor (sin paginar). */
export interface CsvLotePet {
  codigoLote: string;
  etiquetas: EtiquetaChapa[];
}

// ---- Perfil público (Fase 9+) ----

/**
 * R-QR.6.1/DD1: lo único que ve el perfil público de una chapa activa.
 * Nunca domicilio, historial clínico ni ningún dato del dueño salvo el
 * teléfono con consentimiento expreso (R-QR.7) — nunca `email` ni
 * `gestion_token`, que son del `IPetPerfilRepository` pero jamás llegan a
 * este tipo (lo aplica el repositorio, no el componente que lo pinta).
 */
export interface PerfilPublico {
  nombre: string;
  especie: 'perro' | 'gato';
  notas: string | null;
  fotoUrl: string | null;
  /** R-QR.7.1: `null` salvo que `telefono_consentido_at` esté marcado — lo decide el repositorio. */
  telefono: string | null;
}

// ---- Alta y doble opt-in (Fase 10) ----

/**
 * R-QR.4/DD5: entrada de `IPetPerfilRepository.reservarAlta`, ya validada
 * por el DTO (`altaChapaSchema` en `pet-chapa.dto.ts`) y completada por el
 * caso de uso (idioma resuelto, token, hora actual, versión del texto de
 * consentimiento y el límite de caducidad de un pendiente) — calco de
 * `AltaAvisosInput` (M2b).
 */
export interface AltaChapaInput {
  codigo: string;
  email: string;
  nombre: string;
  especie: 'perro' | 'gato';
  notas: string | null;
  idioma: Language;
  version: string;
  token: string;
  ahora: string;
  /** D-M2b-10 (reutilizado)/R-QR.12.4: un pendiente anterior a este ISO ya caducó y puede sobrescribirse. */
  pendienteCaducaAntesDe: string;
}

/**
 * R-QR.4.4/R-QR.10: contacto actual del DUEÑO de una chapa pendiente o
 * activa — nunca sale de la capa de aplicación (ni al admin ni a una
 * respuesta HTTP). `estado` reutiliza `EstadoChapa`; una chapa `libre` nunca
 * produce un `ContactoDueno` (no tiene email).
 */
export interface ContactoDueno {
  email: string;
  idioma: Language;
  nombre: string;
  token: string;
}
