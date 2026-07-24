import type { Result } from '@/core/domain/entities/types';
import type { PerfilLaboral, TipoContrato } from '../types';

export interface CreatePerfilLaboralInput {
  empresaId: string;
  empleadoId: string;
  centroId: string;
  jornadaTeoricaHoras: number;
  tipoContrato: TipoContrato;
  tiempoParcial: boolean;
  convenio?: string;
  timezone?: string;
}

export interface UpdatePerfilLaboralInput {
  jornadaTeoricaHoras?: number;
  tipoContrato?: TipoContrato;
  tiempoParcial?: boolean;
  convenio?: string | null;
  timezone?: string;
  activo?: boolean;
}

export interface IPerfilLaboralRepository {
  create(input: CreatePerfilLaboralInput): Promise<Result<PerfilLaboral>>;
  findByEmpleado(empresaId: string, empleadoId: string): Promise<Result<PerfilLaboral | null>>;
  findAllByEmpresa(empresaId: string, soloActivos?: boolean): Promise<Result<PerfilLaboral[]>>;
  findParcialesByEmpresa(empresaId: string): Promise<Result<PerfilLaboral[]>>;
  update(empresaId: string, empleadoId: string, input: UpdatePerfilLaboralInput): Promise<Result<PerfilLaboral>>;
  softDelete(empresaId: string, empleadoId: string): Promise<Result<void>>;
}
