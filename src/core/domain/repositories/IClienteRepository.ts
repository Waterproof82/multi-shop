import { Cliente, Result } from "../entities/types";

export interface CreateClienteData {
  empresaId: string;
  nombre?: string | null;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  idioma?: string | null;
}

export interface UpdateClienteData {
  nombre?: string | null;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  aceptar_promociones?: boolean | null;
  idioma?: string | null;
}

export interface IClienteRepository {
  findAllByTenant(empresaId: string): Promise<Result<Cliente[]>>;
  findByEmail(email: string, empresaId: string): Promise<Result<Cliente | null>>;
  findByTelefono(telefono: string, empresaId: string): Promise<Result<Cliente | null>>;
  create(data: CreateClienteData): Promise<Result<Cliente>>;
  update(id: string, empresaId: string, data: Partial<UpdateClienteData>): Promise<Result<Cliente>>;
  delete(id: string, empresaId: string): Promise<Result<void>>;
}
