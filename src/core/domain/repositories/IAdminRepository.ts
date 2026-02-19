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
  findById(id: string): Promise<AdminWithEmpresa | null>;
  findByEmail(email: string): Promise<AdminProfile | null>;
  getEmpresaByAdminId(adminId: string): Promise<Empresa | null>;
}
