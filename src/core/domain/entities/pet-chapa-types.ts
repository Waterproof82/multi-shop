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
