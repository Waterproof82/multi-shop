import { IModalidadEntregaRepository } from "@/core/domain/repositories/IModalidadEntregaRepository";
import { ModalidadEntrega, Result } from "@/core/domain/entities/types";
import { CreateModalidadEntregaDTO, UpdateModalidadEntregaDTO } from "@/core/application/dtos/modalidad-entrega.dto";
import { logger } from "@/core/infrastructure/logging/logger";

function propagarError<T>(result: { success: false; error: { code: string; message: string; details?: unknown } }, method: string): Result<T> {
  return {
    success: false,
    error: { code: result.error.code, message: result.error.message, module: 'use-case', method, details: result.error.details as Record<string, unknown> | undefined },
  };
}

export class ModalidadEntregaUseCase {
  constructor(private readonly repo: IModalidadEntregaRepository) {}

  async getAll(empresaId: string): Promise<Result<ModalidadEntrega[]>> {
    try {
      const result = await this.repo.findAllByTenant(empresaId);
      if (!result.success) return propagarError(result, 'ModalidadEntregaUseCase.getAll');
      return { success: true, data: result.data };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'ModalidadEntregaUseCase.getAll', { empresaId }) };
    }
  }

  async getActivasPublicas(empresaId: string): Promise<Result<ModalidadEntrega[]>> {
    try {
      const result = await this.repo.findActivasPublicas(empresaId);
      if (!result.success) return propagarError(result, 'ModalidadEntregaUseCase.getActivasPublicas');
      return { success: true, data: result.data };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'ModalidadEntregaUseCase.getActivasPublicas', { empresaId }) };
    }
  }

  async create(data: CreateModalidadEntregaDTO): Promise<Result<ModalidadEntrega>> {
    try {
      const result = await this.repo.create(data);
      if (!result.success) return propagarError(result, 'ModalidadEntregaUseCase.create');
      return { success: true, data: result.data };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'ModalidadEntregaUseCase.create', { empresaId: data.empresaId }) };
    }
  }

  async update(id: string, empresaId: string, data: Partial<UpdateModalidadEntregaDTO>): Promise<Result<ModalidadEntrega>> {
    try {
      const result = await this.repo.update(id, empresaId, data);
      if (!result.success) return propagarError(result, 'ModalidadEntregaUseCase.update');
      return { success: true, data: result.data };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'ModalidadEntregaUseCase.update', { empresaId }) };
    }
  }

  async delete(id: string, empresaId: string): Promise<Result<void>> {
    try {
      const result = await this.repo.delete(id, empresaId);
      if (!result.success) return propagarError(result, 'ModalidadEntregaUseCase.delete');
      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'ModalidadEntregaUseCase.delete', { empresaId }) };
    }
  }

  /**
   * Revalida servidor-side el precio de una modalidad antes de crear un
   * pedido — nunca confiar en el precio que manda el cliente. Falla si la
   * modalidad no existe, no es de esta empresa, o está `activo=false`.
   */
  async validarPrecioVigente(modalidadId: string, empresaId: string): Promise<Result<{ precioCents: number; tipo: 'recogida' | 'domicilio' }>> {
    try {
      const result = await this.repo.findById(modalidadId, empresaId);
      if (!result.success) return propagarError(result, 'ModalidadEntregaUseCase.validarPrecioVigente');
      if (!result.data || !result.data.activo) {
        return {
          success: false,
          error: { code: 'MODALIDAD_ENTREGA_INVALIDA', message: 'La modalidad de entrega seleccionada ya no está disponible', module: 'use-case', method: 'ModalidadEntregaUseCase.validarPrecioVigente' },
        };
      }
      return { success: true, data: { precioCents: result.data.precioCents, tipo: result.data.tipo } };
    } catch (e) {
      return { success: false, error: await logger.logFromCatch(e, 'use-case', 'ModalidadEntregaUseCase.validarPrecioVigente', { empresaId }) };
    }
  }
}
