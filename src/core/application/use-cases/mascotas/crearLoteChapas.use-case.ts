// src/core/application/use-cases/mascotas/crearLoteChapas.use-case.ts
// sdd pet-id-qr-profile, Fase 5 — R-QR.1.1: el admin crea un lote asociado a
// un `producto_id`. El trigger `pet_chapa_lotes_validar_producto()` (23503)
// es quien comprueba que el producto es de esta empresa; el caso de uso solo
// valida la forma del DTO.
import type { IPetChapaAdminRepository } from '@/core/domain/repositories/IPetChapaAdminRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { PetChapaLote } from '@/core/domain/entities/pet-chapa-types';
import { crearLoteChapasSchema } from '@/core/application/dtos/pet-chapa.dto';

export async function crearLoteChapasUseCase(
  repo: IPetChapaAdminRepository,
  empresaId: string,
  input: unknown,
): Promise<Result<PetChapaLote, AppError>> {
  const parsed = crearLoteChapasSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message, module: 'use-case' } };
  }

  return repo.createLote(empresaId, parsed.data);
}
