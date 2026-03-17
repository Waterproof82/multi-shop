import { Empresa, Result } from "../entities/types";

export interface AdminProfile {
  id: string;
  empresaId: string;
  nombreCompleto: string | null;
  rol: string;
  email: string;
}

export interface AdminWithEmpresa extends AdminProfile {
  empresa: Empresa;
}

export interface IAdminRepository {
  loginWithPassword(email: string, password: string): Promise<Result<string>>;
  findById(id: string): Promise<Result<AdminWithEmpresa | null>>;
}
