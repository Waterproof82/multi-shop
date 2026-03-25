import { IClienteRepository, CreateClienteData, UpdateClienteData } from "@/core/domain/repositories/IClienteRepository";
import { Cliente, Result } from "@/core/domain/entities/types";
import { CreateClienteDTO, UpdateClienteDTO } from "@/core/application/dtos/cliente.dto";
import { logger } from "@/core/infrastructure/logging/logger";

function anonymizeEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.substring(0, 2)}***@${domain ?? '***'}`;
}

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

  /**
   * Creates a new client or updates an existing one if a match is found by phone or email.
   * Priority: telefono match first, then email match.
   * Returns { data, isUpdate } to indicate whether it was an update or creation.
   */
  async createOrUpdate(data: CreateClienteDTO): Promise<Result<{ cliente: Cliente; isUpdate: boolean }>> {
    try {
      // 1. Look up by telefono (primary identifier)
      if (data.telefono) {
        const byPhone = await this.clienteRepo.findByTelefono(data.telefono, data.empresaId);
        if (!byPhone.success) {
          return { success: false, error: { ...byPhone.error, method: 'ClienteUseCase.createOrUpdate' } };
        }
        if (byPhone.data) {
          const updateResult = await this.clienteRepo.update(byPhone.data.id, data.empresaId, {
            nombre: data.nombre ?? byPhone.data.nombre,
            email: data.email ?? byPhone.data.email,
            direccion: data.direccion ?? byPhone.data.direccion,
          });
          if (!updateResult.success) {
            return { success: false, error: { ...updateResult.error, method: 'ClienteUseCase.createOrUpdate' } };
          }
          return { success: true, data: { cliente: updateResult.data, isUpdate: true } };
        }
      }

      // 2. Look up by email (secondary identifier)
      if (data.email) {
        const byEmail = await this.clienteRepo.findByEmail(data.email, data.empresaId);
        if (!byEmail.success) {
          return { success: false, error: { ...byEmail.error, method: 'ClienteUseCase.createOrUpdate' } };
        }
        if (byEmail.data) {
          const updateResult = await this.clienteRepo.update(byEmail.data.id, data.empresaId, {
            nombre: data.nombre ?? byEmail.data.nombre,
            telefono: data.telefono ?? byEmail.data.telefono,
            direccion: data.direccion ?? byEmail.data.direccion,
          });
          if (!updateResult.success) {
            return { success: false, error: { ...updateResult.error, method: 'ClienteUseCase.createOrUpdate' } };
          }
          return { success: true, data: { cliente: updateResult.data, isUpdate: true } };
        }
      }

      // 3. No match found — create new client
      const createResult = await this.clienteRepo.create(data);
      if (!createResult.success) {
        return { success: false, error: { ...createResult.error, method: 'ClienteUseCase.createOrUpdate' } };
      }
      return { success: true, data: { cliente: createResult.data, isUpdate: false } };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'ClienteUseCase.createOrUpdate', { empresaId: data.empresaId });
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
        details: { email: anonymizeEmail(email) }
      });
      return { success: false, error: appError };
    }
  }
}
