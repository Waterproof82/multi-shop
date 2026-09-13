import { ModalidadEntrega, Result } from "../entities/types";

export interface CreateModalidadEntregaData {
  empresaId: string;
  tipo: 'recogida' | 'domicilio';
  icono: string;
  nombre_es: string;
  nombre_en?: string;
  nombre_fr?: string;
  nombre_it?: string;
  nombre_de?: string;
  precioCents: number;
  tiempoMinMinutos?: number | null;
  tiempoMaxMinutos?: number | null;
  orden?: number;
}

export interface UpdateModalidadEntregaData extends Partial<CreateModalidadEntregaData> {
  activo?: boolean;
}

export interface IModalidadEntregaRepository {
  findAllByTenant(empresaId: string): Promise<Result<ModalidadEntrega[]>>;
  findActivasPublicas(empresaId: string): Promise<Result<ModalidadEntrega[]>>;
  findById(id: string, empresaId: string): Promise<Result<ModalidadEntrega | null>>;
  create(data: CreateModalidadEntregaData): Promise<Result<ModalidadEntrega>>;
  update(id: string, empresaId: string, data: UpdateModalidadEntregaData): Promise<Result<ModalidadEntrega>>;
  delete(id: string, empresaId: string): Promise<Result<void>>;
}
