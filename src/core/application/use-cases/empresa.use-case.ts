import { IEmpresaRepository } from "@/core/domain/repositories/IEmpresaRepository";
import { UpdateEmpresaDTO } from "@/core/application/dtos/empresa.dto";
import { Empresa, EmpresaColores, Result } from "@/core/domain/entities/types";
import { logger } from "@/core/infrastructure/logging/logger";

export class EmpresaUseCase {
  constructor(private readonly empresaRepo: IEmpresaRepository) {}

  async getById(empresaId: string): Promise<Result<Partial<Empresa> | null>> {
    try {
      const result = await this.empresaRepo.getById(empresaId);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'EmpresaUseCase.getById' } };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'EmpresaUseCase.getById', { empresaId });
      return { success: false, error: appError };
    }
  }

  async update(empresaId: string, data: UpdateEmpresaDTO): Promise<Result<void>> {
    try {
      const result = await this.empresaRepo.update(empresaId, data);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'EmpresaUseCase.update' } };
      }
      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'EmpresaUseCase.update', { empresaId });
      return { success: false, error: appError };
    }
  }

  async updateColores(empresaId: string, colores: EmpresaColores): Promise<Result<boolean>> {
    try {
      const result = await this.empresaRepo.updateColores(empresaId, colores);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'EmpresaUseCase.updateColores' } };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'EmpresaUseCase.updateColores', { empresaId });
      return { success: false, error: appError };
    }
  }
}
