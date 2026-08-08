import { IClienteRepository } from "@/core/domain/repositories/IClienteRepository";
import { Cliente, Result } from "@/core/domain/entities/types";
import { CreateClienteDTO, UpdateClienteDTO } from "@/core/application/dtos/cliente.dto";
import { logger } from "@/core/infrastructure/logging/logger";

function anonymizeEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.substring(0, 2)}***@${domain ?? '***'}`;
}

/**
 * Fusiona los datos entrantes con la ficha que ya existe.
 *
 * Lo entrante manda, pero SOLO si viene: lo que no llega en esta petición se
 * conserva. Es la diferencia entre actualizar una ficha y machacarla — un
 * pedido de mesa, por ejemplo, no trae dirección, y sin este `??` se la borraría
 * a un cliente que sí la tenía guardada.
 */
export function fusionarCliente(
  entrantes: Partial<Pick<Cliente, 'nombre' | 'email' | 'telefono' | 'direccion'>>,
  existente: Cliente,
): Partial<UpdateClienteDTO> {
  return {
    nombre: entrantes.nombre ?? existente.nombre,
    email: entrantes.email ?? existente.email,
    telefono: entrantes.telefono ?? existente.telefono,
    direccion: entrantes.direccion ?? existente.direccion,
  };
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
  /**
   * Busca por un identificador y, si hay ficha, la actualiza fusionando datos.
   *
   * Devuelve `null` cuando no hay coincidencia, para que quien llama siga
   * probando el siguiente identificador.
   */
  private async fusionarSiExiste(
    valor: string | null | undefined,
    buscar: (v: string, empresaId: string) => Promise<Result<Cliente | null>>,
    data: CreateClienteDTO,
  ): Promise<Result<{ cliente: Cliente; isUpdate: boolean }> | null> {
    if (!valor) return null;

    const encontrado = await buscar(valor, data.empresaId);
    if (!encontrado.success) {
      return { success: false, error: { ...encontrado.error, method: 'ClienteUseCase.createOrUpdate' } };
    }
    if (!encontrado.data) return null;

    const actualizado = await this.clienteRepo.update(encontrado.data.id, data.empresaId, fusionarCliente(data, encontrado.data));
    if (!actualizado.success) {
      return { success: false, error: { ...actualizado.error, method: 'ClienteUseCase.createOrUpdate' } };
    }
    return { success: true, data: { cliente: actualizado.data, isUpdate: true } };
  }

  async createOrUpdate(data: CreateClienteDTO): Promise<Result<{ cliente: Cliente; isUpdate: boolean }>> {
    try {
      // El teléfono manda: es el identificador primario del cliente. El email
      // solo se consulta si no hubo ficha con ese teléfono.
      const porTelefono = await this.fusionarSiExiste(
        data.telefono,
        (v, empresaId) => this.clienteRepo.findByTelefono(v, empresaId),
        data,
      );
      if (porTelefono) return porTelefono;

      const porEmail = await this.fusionarSiExiste(
        data.email,
        (v, empresaId) => this.clienteRepo.findByEmail(v, empresaId),
        data,
      );
      if (porEmail) return porEmail;

      const creado = await this.clienteRepo.create(data);
      if (!creado.success) {
        return { success: false, error: { ...creado.error, method: 'ClienteUseCase.createOrUpdate' } };
      }
      return { success: true, data: { cliente: creado.data, isUpdate: false } };
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
