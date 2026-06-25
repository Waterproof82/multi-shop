import { z } from 'zod';
import { IValoracionRepository } from '@/core/domain/repositories/IValoracionRepository';
import { Result, Valoracion, ValoracionStats } from '@/core/domain/entities/types';
import { logger } from '@/core/infrastructure/logging/logger';

const createSchema = z.object({
  empresaId: z.string().uuid(),
  mesaId: z.string().uuid().nullable(),
  mesaSesionId: z.string().uuid().nullable(),
  raterId: z.string().uuid(),
  estrellas: z.number().min(0.5).max(5).multipleOf(0.5),
});

export class ValoracionUseCase {
  constructor(private readonly repo: IValoracionRepository) {}

  async create(input: unknown): Promise<Result<Valoracion>> {
    try {
      const parsed = createSchema.safeParse(input);
      if (!parsed.success) {
        return { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message, module: 'use-case', method: 'ValoracionUseCase.create' } };
      }
      return this.repo.create(parsed.data);
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'ValoracionUseCase.create', { details: input });
      return { success: false, error: appError };
    }
  }

  async getStats(empresaId: string): Promise<Result<ValoracionStats>> {
    try {
      return this.repo.getStatsByEmpresa(empresaId);
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'ValoracionUseCase.getStats', { details: { empresaId } });
      return { success: false, error: appError };
    }
  }

  async list(empresaId: string, page = 0): Promise<Result<Valoracion[]>> {
    try {
      return this.repo.listByEmpresa(empresaId, 20, page * 20);
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'ValoracionUseCase.list', { details: { empresaId, page } });
      return { success: false, error: appError };
    }
  }
}
