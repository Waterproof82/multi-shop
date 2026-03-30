import { ISuperAdminRepository, EmpresaWithStats, SuperAdminGlobalStats } from "@/core/domain/repositories/ISuperAdminRepository";
import { Result } from "@/core/domain/entities/types";
import { logger } from "@/core/infrastructure/logging/logger";

export class SuperAdminUseCase {
  constructor(private readonly superAdminRepo: ISuperAdminRepository) {}

  async getAllEmpresas(): Promise<Result<EmpresaWithStats[]>> {
    try {
      const result = await this.superAdminRepo.findAllEmpresas();
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'SuperAdminUseCase.getAllEmpresas' } };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'SuperAdminUseCase.getAllEmpresas');
      return { success: false, error: appError };
    }
  }

  async getEmpresaById(id: string): Promise<Result<EmpresaWithStats | null>> {
    try {
      const result = await this.superAdminRepo.findEmpresaById(id);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'SuperAdminUseCase.getEmpresaById' } };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'SuperAdminUseCase.getEmpresaById', { empresaId: id });
      return { success: false, error: appError };
    }
  }

  async updateEmpresa(id: string, data: Record<string, unknown>): Promise<Result<void>> {
    try {
      const result = await this.superAdminRepo.updateEmpresa(id, data);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'SuperAdminUseCase.updateEmpresa' } };
      }
      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'SuperAdminUseCase.updateEmpresa', { empresaId: id });
      return { success: false, error: appError };
    }
  }

  async getGlobalStats(): Promise<Result<SuperAdminGlobalStats>> {
    try {
      const result = await this.superAdminRepo.getGlobalStats();
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'SuperAdminUseCase.getGlobalStats' } };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'SuperAdminUseCase.getGlobalStats');
      return { success: false, error: appError };
    }
  }
}
