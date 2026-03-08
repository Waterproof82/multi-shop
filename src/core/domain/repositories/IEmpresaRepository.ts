import { Empresa, EmpresaColores, EmpresaPublic } from "../entities/types";
import { UpdateEmpresaDTO } from "../../application/dtos/empresa.dto";

export interface IEmpresaRepository {
  getById(empresaId: string): Promise<Partial<Empresa> | null>;
  findByDomain(dominio: string): Promise<{ id: string; nombre: string; email_notification: string | null; telefono_whatsapp: string | null } | null>;
  findByDomainPublic(domain: string): Promise<EmpresaPublic | null>;
  update(empresaId: string, data: UpdateEmpresaDTO): Promise<void>;
  updateColores(empresaId: string, colores: EmpresaColores): Promise<boolean>;
}
