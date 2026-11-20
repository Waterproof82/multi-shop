// src/core/domain/entities/pet-chapa-types.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
// Fase 5 — admin backend: lotes y chapas. DD1/DD7 de design.md: el admin
// SOLO conoce `PetChapaLote`, `CreatePetChapaLoteInput` y `RecuentoPorEstado`
// — ningún tipo de este fichero lleva un campo de PII (email, teléfono,
// nombre de la mascota, foto, token de gestión). Esos campos solo existen en
// el dominio del perfil público (`IPetPerfilRepository`, Fase 9+).

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
