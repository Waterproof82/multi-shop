import { IClienteRepository, CreateClienteData, UpdateClienteData } from "@/core/domain/repositories/IClienteRepository";
import { Cliente, Result } from "@/core/domain/entities/types";
import { CreateClienteDTO, UpdateClienteDTO } from "@/core/application/dtos/cliente.dto";
import { logger } from "@/core/infrastructure/logging/logger";

export class ClienteUseCase {
  constructor(private readonly clienteRepo: IClienteRepository) {}

  async getAll(empresaId: string): Promise<Result<Cliente[]>> {
    try {
      const result = await this.clienteRepo.findAllByTenant(empresaId);
      if (!result.success) {
        return {
          success: false,
          error: { ...result.error, method: 'ClienteUseCase.getAll' },
        };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'ClienteUseCase.getAll', { empresaId });
      return { success: false, error: appError };
    }
  }

  async create(data: CreateClienteDTO): Promise<Result<Cliente>> {
    try {
      const result = await this.clienteRepo.create(data);
      if (!result.success) {
        return {
          success: false,
          error: { ...result.error, method: 'ClienteUseCase.create' },
        };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'ClienteUseCase.create', { empresaId: data.empresaId });
      return { success: false, error: appError };
    }
  }

  async update(id: string, empresaId: string, data: Partial<UpdateClienteDTO>): Promise<Result<Cliente>> {
    try {
      const result = await this.clienteRepo.update(id, empresaId, data);
      if (!result.success) {
        return {
          success: false,
          error: { ...result.error, method: 'ClienteUseCase.update' },
        };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'ClienteUseCase.update', { empresaId });
      return { success: false, error: appError };
    }
  }

  async delete(id: string, empresaId: string): Promise<Result<void>> {
    try {
      const result = await this.clienteRepo.delete(id, empresaId);
      if (!result.success) {
        return {
          success: false,
          error: { ...result.error, method: 'ClienteUseCase.delete' },
        };
      }
      return { success: true, data: undefined };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'ClienteUseCase.delete', { empresaId });
      return { success: false, error: appError };
    }
  }

  async togglePromoSubscription(email: string, empresaId: string, action?: 'alta' | 'baja'): Promise<Result<boolean | null>> {
    console.log('[togglePromoSubscription] email:', email, 'empresaId:', empresaId, 'action:', action);
    try {
      const clienteResult = await this.clienteRepo.findByEmail(email, empresaId);
      if (!clienteResult.success) {
        return { success: false, error: clienteResult.error };
      }
      
      const cliente = clienteResult.data;
      if (!cliente) return { success: true, data: null };

      let nuevoValor: boolean;
      if (action === 'alta') {
        nuevoValor = true;
      } else if (action === 'baja') {
        nuevoValor = false;
      } else {
        nuevoValor = !cliente.aceptar_promociones;
      }

      const updateResult = await this.clienteRepo.update(cliente.id, empresaId, { aceptar_promociones: nuevoValor });
      if (!updateResult.success) {
        return { success: false, error: updateResult.error };
      }

      return { success: true, data: nuevoValor };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'ClienteUseCase.togglePromoSubscription', { 
        empresaId, 
        details: { email } 
      });
      return { success: false, error: appError };
    }
  }
}
