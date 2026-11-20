// src/core/domain/repositories/IPetChapaAdminRepository.ts
// sdd pet-id-qr-profile, Fase 5 (design.md DD1/DD7): puerto del admin del
// tenant sobre lotes y chapas. DD7: en `pet_chapas`, `authenticated` no
// tiene ningún GRANT — el admin nunca ve PII, solo recuentos y códigos vía
// casos de uso con `service_role`.
import type { Result } from '@/core/domain/entities/types';
import type { PetChapaLote, CreatePetChapaLoteInput, RecuentoPorEstado, Paginado, Pagina } from '@/core/domain/entities/pet-chapa-types';

export interface IPetChapaAdminRepository {
  createLote(empresaId: string, input: CreatePetChapaLoteInput): Promise<Result<PetChapaLote>>;
  findLoteById(empresaId: string, loteId: string): Promise<Result<PetChapaLote | null>>;
  /**
   * Fase 7 (admin UI, PR7): listado paginado de lotes de la empresa, con el
   * nombre del producto (join de solo lectura, sin PII) para la tabla y el
   * selector — calco de `IKitCaducidadRepository.findLotes`.
   */
  findLotes(empresaId: string, pagina: Pagina): Promise<Result<Paginado<PetChapaLote>>>;
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
  /**
   * R-QR.1.3/DD1: «Borrar datos» del admin — una sola `update()` pone a NULL
   * las 13 columnas de perfil (email incluido), igual que
   * `pet_chapas_libre_sin_datos` exige para volver a "libre". Solo afecta a
   * una chapa pendiente o activa (`email IS NOT NULL`); `data: null` si el
   * código no existe o ya estaba libre. Nunca devuelve un dato personal:
   * solo el `codigo`, que no es PII (va impreso en la chapa física).
   */
  borrarDatos(empresaId: string, codigo: string): Promise<Result<{ codigo: string } | null>>;
}
