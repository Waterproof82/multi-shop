import type { IComplementoGrupoRepository, CreateComplementoGrupoData, UpdateComplementoGrupoData, CreateComplementoOpcionData } from '@/core/domain/repositories/IComplementoGrupoRepository';
import type { ComplementoGrupo } from '@/core/domain/entities/complemento-types';
import type { Result } from '@/core/domain/entities/types';

export class ComplementoGrupoUseCase {
  constructor(private readonly repo: IComplementoGrupoRepository) {}

  getAll(empresaId: string): Promise<Result<ComplementoGrupo[]>> {
    return this.repo.findAllByTenant(empresaId);
  }

  getByProducto(productoId: string, empresaId: string): Promise<Result<ComplementoGrupo[]>> {
    return this.repo.findByProducto(productoId, empresaId);
  }

  create(data: CreateComplementoGrupoData): Promise<Result<ComplementoGrupo>> {
    return this.repo.createGrupo(data);
  }

  update(id: string, empresaId: string, data: UpdateComplementoGrupoData): Promise<Result<ComplementoGrupo>> {
    return this.repo.updateGrupo(id, empresaId, data);
  }

  delete(id: string, empresaId: string): Promise<Result<void>> {
    return this.repo.deleteGrupo(id, empresaId);
  }

  createOpcion(data: CreateComplementoOpcionData): Promise<Result<{ id: string }>> {
    return this.repo.createOpcion(data);
  }

  updateOpcion(id: string, grupoId: string, data: Partial<CreateComplementoOpcionData>): Promise<Result<void>> {
    return this.repo.updateOpcion(id, grupoId, data);
  }

  deleteOpcion(id: string, grupoId: string): Promise<Result<void>> {
    return this.repo.deleteOpcion(id, grupoId);
  }

  setProductoGrupos(productoId: string, grupoIds: string[], empresaId: string): Promise<Result<void>> {
    return this.repo.setProductoGrupos(productoId, grupoIds, empresaId);
  }
}
