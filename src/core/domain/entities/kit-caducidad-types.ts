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

// `KitLoteCaducidad`/`CaducidadInput` se añaden en M4a2b (editor de
// caducidades) y `LineaCandidata` en M4b1 (ver nota en
// IKitCaducidadRepository.ts).

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
