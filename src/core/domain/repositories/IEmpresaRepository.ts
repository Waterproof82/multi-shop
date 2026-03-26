import { Empresa, EmpresaColores, EmpresaPublic, Result } from "../entities/types";

export interface UpdateEmpresaData {
  email_notification?: string;
  telefono_whatsapp?: string;
  fb?: string;
  instagram?: string;
  url_mapa?: string;
  direccion?: string | null;
  logo_url?: string | null;
  url_image?: string | null;
  descripcion_es?: string | null;
  descripcion_en?: string | null;
  descripcion_fr?: string | null;
  descripcion_it?: string | null;
  descripcion_de?: string | null;
}

export interface IEmpresaRepository {
  getById(empresaId: string): Promise<Result<Partial<Empresa> | null>>;
  findByDomain(dominio: string): Promise<Result<{ id: string; nombre: string; email_notification: string | null; telefono_whatsapp: string | null } | null>>;
  findByDomainPublic(domain: string): Promise<Result<EmpresaPublic | null>>;
  update(empresaId: string, data: UpdateEmpresaData): Promise<Result<void>>;
  updateColores(empresaId: string, colores: EmpresaColores): Promise<Result<boolean>>;
}
