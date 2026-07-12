import type { Result } from '@/core/domain/entities/types';
import type { ComplementoGrupo, ProductoComplementoAsignacion } from '@/core/domain/entities/complemento-types';

export interface CreateComplementoGrupoData {
  empresaId: string;
  nombre_es: string;
  nombre_en?: string | null;
  nombre_fr?: string | null;
  nombre_it?: string | null;
  nombre_de?: string | null;
  tipo: 'radio' | 'checkbox';
  obligatorio: boolean;
  orden?: number;
}

export interface UpdateComplementoGrupoData extends Partial<Omit<CreateComplementoGrupoData, 'empresaId'>> {}

export interface CreateComplementoOpcionData {
  grupoId: string;
  empresaId: string;
  nombre_es: string;
  nombre_en?: string | null;
  nombre_fr?: string | null;
  nombre_it?: string | null;
  nombre_de?: string | null;
  precioAdicional?: number;
  orden?: number;
}

export interface IComplementoGrupoRepository {
  findAllByTenant(empresaId: string): Promise<Result<ComplementoGrupo[]>>;
  findByIds(grupoIds: string[], empresaId: string): Promise<Result<ComplementoGrupo[]>>;
  findByProducto(productoId: string, empresaId: string): Promise<Result<ComplementoGrupo[]>>;
  findAssignmentsByProductos(productoIds: string[], empresaId: string): Promise<Result<ProductoComplementoAsignacion[]>>;
  createGrupo(data: CreateComplementoGrupoData): Promise<Result<ComplementoGrupo>>;
  updateGrupo(id: string, empresaId: string, data: UpdateComplementoGrupoData): Promise<Result<ComplementoGrupo>>;
  deleteGrupo(id: string, empresaId: string): Promise<Result<void>>;
  createOpcion(data: CreateComplementoOpcionData): Promise<Result<{ id: string }>>;
  updateOpcion(id: string, grupoId: string, data: Partial<CreateComplementoOpcionData>): Promise<Result<void>>;
  deleteOpcion(id: string, grupoId: string): Promise<Result<void>>;
  setProductoGrupos(productoId: string, grupoIds: string[], empresaId: string): Promise<Result<void>>;
}
