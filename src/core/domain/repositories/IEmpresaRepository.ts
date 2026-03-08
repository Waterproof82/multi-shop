import { Empresa, EmpresaColores, EmpresaPublic } from "../entities/types";

export interface UpdateEmpresaData {
  email_notification?: string;
  telefono_whatsapp?: string;
  fb?: string;
  instagram?: string;
  url_mapa?: string;
  direccion?: string;
  url_image?: string | null;
  descripcion_es?: string;
  descripcion_en?: string;
  descripcion_fr?: string;
  descripcion_it?: string;
  descripcion_de?: string;
}

export interface IEmpresaRepository {
  getById(empresaId: string): Promise<Partial<Empresa> | null>;
  findByDomain(dominio: string): Promise<{ id: string; nombre: string; email_notification: string | null; telefono_whatsapp: string | null } | null>;
  findByDomainPublic(domain: string): Promise<EmpresaPublic | null>;
  update(empresaId: string, data: UpdateEmpresaData): Promise<void>;
  updateColores(empresaId: string, colores: EmpresaColores): Promise<boolean>;
}
