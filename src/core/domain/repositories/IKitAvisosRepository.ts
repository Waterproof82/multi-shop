// src/core/domain/repositories/IKitAvisosRepository.ts
// kit-expiry-m2b, DD1 de design.md: repositorio NUEVO (no amplía
// `IKitCaducidadRepository` — ampliar el de M4 obligó en M2a2a a tocar 10
// `fakeRepo()`; así cada caso de uso declara solo lo que usa).
import type { Result } from '@/core/domain/entities/types';
import type { AltaAvisosInput, ContactoAvisos, GestionPorToken } from '@/core/domain/entities/kit-avisos-types';

export interface IKitAvisosRepository {
  /**
   * DD2: actualización condicional atómica — `true` si reservó la fila
   * (serie libre o pendiente caducado), `false` si estaba ocupada
   * (registrada o pendiente vigente) o la serie no existe en esta empresa.
   */
  reservarAlta(empresaId: string, input: AltaAvisosInput): Promise<Result<boolean>>;
  /** R-M2b.2.4: contacto actual (pendiente o registrada); `null` si la serie está libre o no existe. */
  findContacto(empresaId: string, serie: string): Promise<Result<ContactoAvisos | null>>;
  /** R-M2b.3.2: `null` si el token no existe en esta empresa, o si el alta sigue pendiente y ya caducó. */
  findPorToken(empresaId: string, token: string, pendienteCaducaAntesDe: string): Promise<Result<GestionPorToken | null>>;
  /** R-M2b.3.5: solo confirma si sigue pendiente y no ha pasado `pendienteCaducaAntesDe`; `null` si no aplica. */
  confirmar(empresaId: string, token: string, pendienteCaducaAntesDe: string): Promise<Result<GestionPorToken | null>>;
  /** R-M2b.3.5/D-M2b-4: borra email, teléfono, consentimientos, versión, token y `registrado_at` en un solo `update`. */
  borrar(empresaId: string, token: string): Promise<Result<{ serie: string } | null>>;
}
