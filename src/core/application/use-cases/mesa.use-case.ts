import { IMesaRepository, Mesa } from '@/core/domain/repositories/IMesaRepository';
import { Result } from '@/core/domain/entities/types';
import { logger } from '@/core/infrastructure/logging/logger';

export class MesaUseCase {
  constructor(private readonly mesaRepo: IMesaRepository) {}

  /**
   * Find a mesa by UUID. Returns null when not found.
   */
  async getMesa(mesaId: string): Promise<Result<Mesa | null>> {
    try {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(mesaId)) {
        return {
          success: false,
          error: {
            code: 'INVALID_UUID',
            message: 'El ID de mesa no tiene formato UUID válido',
            module: 'use-case',
            method: 'MesaUseCase.getMesa',
          },
        };
      }

      const result = await this.mesaRepo.findById(mesaId);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'MesaUseCase.getMesa' } };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'MesaUseCase.getMesa', { details: { mesaId } });
      return { success: false, error: appError };
    }
  }

  async getMesasByEmpresa(empresaId: string): Promise<Result<Mesa[]>> {
    try {
      const result = await this.mesaRepo.findByEmpresa(empresaId);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'MesaUseCase.getMesasByEmpresa' } };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'MesaUseCase.getMesasByEmpresa', { empresaId });
      return { success: false, error: appError };
    }
  }

  async createMesa(empresaId: string, numero: number, nombre?: string): Promise<Result<Mesa>> {
    try {
      const result = await this.mesaRepo.create(empresaId, numero, nombre);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'MesaUseCase.createMesa' } };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'MesaUseCase.createMesa', { empresaId });
      return { success: false, error: appError };
    }
  }

  async updateMesa(mesaId: string, empresaId: string, numero: number, nombre?: string): Promise<Result<Mesa>> {
    try {
      const result = await this.mesaRepo.update(mesaId, empresaId, numero, nombre);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'MesaUseCase.updateMesa' } };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'MesaUseCase.updateMesa', { empresaId, details: { mesaId } });
      return { success: false, error: appError };
    }
  }

  async deleteMesa(mesaId: string, empresaId: string): Promise<Result<void>> {
    try {
      const result = await this.mesaRepo.delete(mesaId, empresaId);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'MesaUseCase.deleteMesa' } };
      }
      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'MesaUseCase.deleteMesa', { empresaId, details: { mesaId } });
      return { success: false, error: appError };
    }
  }
}
