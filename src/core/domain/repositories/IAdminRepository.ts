import { Empresa, Result } from "../entities/types";

export interface AdminProfile {
  id: string;
  empresaId: string | null;
  nombreCompleto: string | null;
  rol: string;
  email: string;
}

export interface AdminWithEmpresa extends AdminProfile {
  empresa: Empresa | null;
}

export interface IAdminRepository {
  loginWithPassword(email: string, password: string): Promise<Result<string>>;
  findById(id: string): Promise<Result<AdminWithEmpresa | null>>;
}

export const SUPERADMIN_ROLE = 'superadmin';
export const ADMIN_ROLE = 'admin';

export function isSuperAdmin(profile: AdminProfile): boolean {
  return profile.rol === SUPERADMIN_ROLE;
}
