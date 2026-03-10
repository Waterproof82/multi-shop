import { Empresa } from "../entities/types";

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
  loginWithPassword(email: string, password: string): Promise<string>;
  findById(id: string): Promise<AdminWithEmpresa | null>;
}
