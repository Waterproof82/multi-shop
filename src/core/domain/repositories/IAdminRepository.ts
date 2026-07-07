import { Empresa, Result } from "../entities/types";

export type RolAdmin = 'superadmin' | 'admin' | 'encargado' | 'cajero';

export interface AdminProfile {
  id: string;
  empresaId: string | null;
  nombreCompleto: string | null;
  rol: RolAdmin;
  email: string;
}

export interface AdminWithEmpresa extends AdminProfile {
  empresa: Empresa | null;
}

export interface IAdminRepository {
  loginWithPassword(email: string, password: string): Promise<Result<string>>;
  findById(id: string): Promise<Result<AdminWithEmpresa | null>>;
}

export const SUPERADMIN_ROLE = 'superadmin' as const satisfies RolAdmin;
export const ADMIN_ROLE = 'admin' as const satisfies RolAdmin;
export const ENCARGADO_ROLE = 'encargado' as const satisfies RolAdmin;
export const CAJERO_ROLE = 'cajero' as const satisfies RolAdmin;

export function isSuperAdmin(profile: AdminProfile): boolean {
  return profile.rol === SUPERADMIN_ROLE;
}
