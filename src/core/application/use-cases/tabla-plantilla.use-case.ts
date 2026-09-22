import { ITablaPlantillaRepository } from "@/core/domain/repositories/ITablaPlantillaRepository";
import { TablaPlantilla, Result } from "@/core/domain/entities/types";
import { CreateTablaPlantillaDTO } from "@/core/application/dtos/tabla-plantilla.dto";
import { logger } from "@/core/infrastructure/logging/logger";

function propagarError<T>(result: { success: false; error: { code: string; message: string; details?: Record<string, unknown> } }, method: string): Result<T> {
  return {
    success: false,
    error: { code: result.error.code, message: result.error.message, module: 'use-case', method, details: result.error.details },
  };
}

export class TablaPlantillaUseCase {
  constructor(private readonly repo: ITablaPlantillaRepository) {}

  async getAll(empresaId: string): Promise<Result<TablaPlantilla[]>> {
    try {
      const result = await this.repo.findAllByTenant(empresaId);
      if (!result.success) return propagarError(result, 'TablaPlantillaUseCase.getAll');
      return { success: true, data: result.data };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'TablaPlantillaUseCase.getAll', { empresaId }) };
    }
  }

  async create(data: CreateTablaPlantillaDTO): Promise<Result<TablaPlantilla>> {
    try {
      const result = await this.repo.create({ empresaId: data.empresaId, nombre: data.nombre, columnas: data.columnas });
      if (!result.success) return propagarError(result, 'TablaPlantillaUseCase.create');
      return { success: true, data: result.data };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'TablaPlantillaUseCase.create', { empresaId: data.empresaId }) };
    }
  }

  async delete(id: string, empresaId: string): Promise<Result<void>> {
    try {
      const result = await this.repo.delete(id, empresaId);
      if (!result.success) return propagarError(result, 'TablaPlantillaUseCase.delete');
      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'TablaPlantillaUseCase.delete', { empresaId }) };
    }
  }
}
