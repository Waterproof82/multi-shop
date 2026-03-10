import { Cliente } from "../entities/types";

export interface IClienteRepository {
  findAllByTenant(empresaId: string): Promise<Cliente[]>;
  findByEmail(email: string, empresaId: string): Promise<Cliente | null>;
  findByTelefono(telefono: string, empresaId: string): Promise<Cliente | null>;
  create(data: { empresaId: string; nombre?: string | null; email?: string | null; telefono?: string | null; direccion?: string | null }): Promise<Cliente>;
  update(id: string, empresaId: string, data: Partial<{ nombre?: string | null; email?: string | null; telefono?: string | null; direccion?: string | null; aceptar_promociones?: boolean | null }>): Promise<void>;
  delete(id: string, empresaId: string): Promise<void>;
}
