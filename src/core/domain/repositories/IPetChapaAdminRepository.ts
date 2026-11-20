// src/core/domain/repositories/IPetChapaAdminRepository.ts
// sdd pet-id-qr-profile, Fase 5 (design.md DD1/DD7): puerto del admin del
// tenant sobre lotes y chapas. DD7: en `pet_chapas`, `authenticated` no
// tiene ningún GRANT — el admin nunca ve PII, solo recuentos y códigos vía
// casos de uso con `service_role`.
import type { Result } from '@/core/domain/entities/types';
import type { PetChapaLote, CreatePetChapaLoteInput, RecuentoPorEstado } from '@/core/domain/entities/pet-chapa-types';

export interface IPetChapaAdminRepository {
  createLote(empresaId: string, input: CreatePetChapaLoteInput): Promise<Result<PetChapaLote>>;
  findLoteById(empresaId: string, loteId: string): Promise<Result<PetChapaLote | null>>;
  /**
   * DD10 de M4c, reutilizado aquí: `upsert(..., { onConflict: 'codigo',
   * ignoreDuplicates: true }).select('codigo')` — `ON CONFLICT DO NOTHING
   * RETURNING`. Devuelve solo los códigos que se insertaron de verdad; el
   * caso de uso reintenta lo que falte ante una colisión.
   */
  insertCodigosIgnorandoDuplicados(empresaId: string, loteId: string, codigos: string[]): Promise<Result<string[]>>;
  /**
   * R-QR.1.2/DD7: tres recuentos con `head: true` — ninguna fila sale nunca
   * de Postgres, solo la cabecera `count`. Jamás un `select` con PII.
   */
  countPorEstado(empresaId: string, loteId: string): Promise<Result<RecuentoPorEstado>>;
}
