// src/core/application/use-cases/mascotas/listarLotesChapa.use-case.ts
// sdd pet-id-qr-profile, Fase 7 (admin UI) — calco de `listKitLotes.use-case.ts`:
// valida la paginación en la frontera (Zod) y delega el resto en el repositorio.
import type { IPetChapaAdminRepository } from '@/core/domain/repositories/IPetChapaAdminRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { PetChapaLote, Paginado } from '@/core/domain/entities/pet-chapa-types';
import { paginaLotesChapaSchema } from '@/core/application/dtos/pet-chapa.dto';

export async function listarLotesChapaUseCase(
  repo: IPetChapaAdminRepository,
  empresaId: string,
  input: unknown,
): Promise<Result<Paginado<PetChapaLote>, AppError>> {
  const parsed = paginaLotesChapaSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message, module: 'use-case' } };
  }

  return repo.findLotes(empresaId, parsed.data);
}
