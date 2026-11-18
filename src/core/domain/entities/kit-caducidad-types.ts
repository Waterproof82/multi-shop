// src/core/domain/entities/kit-caducidad-types.ts
// kit-expiry-reminders M4a2 (sdd en kitemergenciacanarias,
// docs/sdd/kit-expiry-reminders/m4/): dominio de lotes de kit, sus fechas de
// caducidad reales y las líneas de albarán candidatas a ser su fuente.

export interface ProductoKit {
  id: string;
  nombre: string;
}

export interface ConsumibleKit {
  ingredienteId: string;
  nombre: string;
  esPerecedero: boolean;
}

export interface KitLote {
  id: string;
  empresaId: string;
  productoId: string;
  codigo: string;
  fechaMontaje: string;
  createdAt: string;
  // Joined
  productoNombre?: string;
}

/** DD5/DD9: fila ya guardada del editor de caducidades de un lote. */
export interface KitLoteCaducidad {
  ingredienteId: string;
  parte: string;
  albaranCompraItemId: string | null;
  caducaEl: string | null;
}

/** Forma que acepta la RPC `kit_lote_reemplazar_caducidades` (DD5/DD9). */
export interface CaducidadInput {
  ingredienteId: string;
  parte: string;
  albaranCompraItemId: string | null;
  caducaEl: string | null;
}

/** Combinación que necesita el editor de un lote (M4a2b). */
export interface KitLoteEditor {
  lote: KitLote;
  consumibles: ConsumibleKit[];
  caducidades: KitLoteCaducidad[];
}

/** DD8/R-M4.3.5: línea de albarán candidata a fuente de fecha de un ingrediente. */
export interface LineaCandidata {
  albaranCompraItemId: string;
  ingredienteId: string;
  numeroLote: string | null;
  fechaCaducidad: string;
  numeroAlbaran: string;
  fechaRecepcion: string;
}

/** Combinación que necesita el editor para el autocompletado (M4b1). */
export interface CandidatasLote {
  lineas: LineaCandidata[];
  partesUsadas: string[];
}

/** DD10: fila de `kits_registrados` sin PII — una serie generada para un lote (M4c). */
export interface KitSerie {
  serie: string;
  loteId: string;
  empresaId: string;
  pedidoId: string | null;
  registradoAt: string | null;
  createdAt: string;
}

/**
 * R-M4.5.2/R-M4.5.3/DD12: fila del listado de «kits registrados». El email y
 * el teléfono SIEMPRE llegan ya enmascarados desde el mapper del repositorio
 * (`src/lib/kit-caducidad/pii.ts`) — este tipo no tiene campos para el valor
 * completo, así que no hay forma de que el listado los filtre por accidente.
 */
export interface KitRegistradoListado {
  serie: string;
  loteId: string;
  pedidoId: string | null;
  emailMasked: string | null;
  telefonoMasked: string | null;
  registradoAt: string | null;
  createdAt: string;
}

/** R-M4.5.2: forma que devuelve `GET registrados/[serie]/contacto` — único sitio con el valor completo. */
export interface ContactoKit {
  serie: string;
  email: string | null;
  telefono: string | null;
}

export interface Paginado<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---- Inputs de repositorio (forma plana, validada en el caso de uso) ----

export interface CreateKitLoteInput {
  productoId: string;
  codigo: string;
  fechaMontaje: string;
}

export interface Pagina {
  page: number;
  pageSize: number;
}

// ---- Etiquetas PDF con QR (kit-expiry-m5) ----

/** Una fila de la hoja de etiquetas: su serie y la URL de su QR 1 (R-M5.2.1/R-M5.2.2). */
export interface EtiquetaKit {
  serie: string;
  urlEstado: string;
}

/**
 * Página del PDF de etiquetas de un lote (R-M5.1.3/R-M5.1.4/R-M5.4.1). El
 * email/telefono de `kits_registrados` nunca llegan aquí (R-M5.2.4) — solo
 * la serie, ya emparejada con su URL de estado.
 */
export interface EtiquetasLote {
  codigoLote: string;
  etiquetas: EtiquetaKit[];
  urlLista: string;
  muestra: boolean;
  pagina: number;
  totalPaginas: number;
}
