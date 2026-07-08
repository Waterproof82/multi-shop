import type { Result } from '@/core/domain/entities/types';

export interface EmpleadoTpv {
  id: string;
  empresaId: string;
  nombre: string;
  rol: 'cajero' | 'encargado';
  pinHash: string;
  activo: boolean;
  createdAt: string;
}

export interface CreateEmpleadoTpvDto {
  empresaId: string;
  nombre: string;
  rol: 'cajero' | 'encargado';
  pinHash: string;
}

export interface IEmpleadoTpvRepository {
  findActiveByPinHash(empresaId: string, pinHash: string): Promise<Result<EmpleadoTpv | null>>;
  findAllByEmpresa(empresaId: string): Promise<Result<EmpleadoTpv[]>>;
  create(dto: CreateEmpleadoTpvDto): Promise<Result<EmpleadoTpv>>;
  updatePin(id: string, empresaId: string, pinHash: string): Promise<Result<void>>;
  setActivo(id: string, empresaId: string, activo: boolean): Promise<Result<void>>;
  delete(id: string, empresaId: string): Promise<Result<void>>;
  isActivo(id: string): Promise<Result<boolean>>;
}
