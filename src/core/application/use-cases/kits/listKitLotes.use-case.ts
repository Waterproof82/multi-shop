// src/core/application/use-cases/kits/listKitLotes.use-case.ts
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type { Result, AppError } from '@/core/domain/entities/types';
import type { KitLote, Paginado } from '@/core/domain/entities/kit-caducidad-types';
import { paginaSchema } from '@/core/application/dtos/kit-caducidad.dto';

export async function listKitLotesUseCase(
  repo: IKitCaducidadRepository,
  empresaId: string,
  input: unknown,
): Promise<Result<Paginado<KitLote>, AppError>> {
  const parsed = paginaSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message, module: 'use-case' } };
  }

  return repo.findLotes(empresaId, parsed.data);
}
