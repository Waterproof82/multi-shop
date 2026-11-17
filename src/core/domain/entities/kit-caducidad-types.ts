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

// `LineaCandidata` se añade en M4b1 (ver nota en IKitCaducidadRepository.ts).

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
