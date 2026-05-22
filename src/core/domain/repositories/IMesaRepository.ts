import { Result } from '@/core/domain/entities/types';

export interface Mesa {
  id: string;
  empresaId: string;
  numero: number;
  nombre: string | null;
  createdAt: string;
}

export interface MesaWithSession {
  id: string;
  empresaId: string;
  numero: number;
  nombre: string | null;
  sesionId: string | null;
  activeOrderCount: number;
  sessionTotal: number;
}

export interface IMesaRepository {
  findById(mesaId: string): Promise<Result<Mesa | null>>;
  findByEmpresa(empresaId: string): Promise<Result<Mesa[]>>;
  create(empresaId: string, numero: number, nombre?: string): Promise<Result<Mesa>>;
  update(mesaId: string, empresaId: string, numero: number, nombre?: string): Promise<Result<Mesa>>;
  delete(mesaId: string, empresaId: string): Promise<Result<void>>;
  findAllWithSession(empresaId: string): Promise<Result<MesaWithSession[]>>;
}
