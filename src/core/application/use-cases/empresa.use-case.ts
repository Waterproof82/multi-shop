import { IEmpresaRepository, EmpresaColoresDTO } from "@/core/infrastructure/database/SupabaseClienteEmpresaRepository";
import { UpdateEmpresaDTO } from "@/core/application/dtos/empresa.dto";
import { Empresa } from "@/core/domain/entities/types";

export class EmpresaUseCase {
  constructor(private readonly empresaRepo: IEmpresaRepository) {}

  async getById(empresaId: string): Promise<Partial<Empresa> | null> {
    return this.empresaRepo.getById(empresaId);
  }

  async update(empresaId: string, data: UpdateEmpresaDTO): Promise<void> {
    return this.empresaRepo.update(empresaId, data);
  }

  async updateColores(empresaId: string, colores: EmpresaColoresDTO): Promise<boolean> {
    return this.empresaRepo.updateColores(empresaId, colores);
  }
}
