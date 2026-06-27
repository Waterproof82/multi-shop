import { Result } from '@/core/domain/entities/types';
import type { DeferredItem } from './IMesaSesionRepository';

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
  sesionPagada: boolean;
  pagoEnCurso: boolean;
  divisionActiva: boolean;
  itemsDiferidos: DeferredItem[];
  clienteActivo: boolean;
  preparadoPedidoNumbers: number[];
  llamadaActiva: boolean;
}

export interface IMesaRepository {
  findById(mesaId: string): Promise<Result<Mesa | null>>;
  findByEmpresa(empresaId: string): Promise<Result<Mesa[]>>;
  create(empresaId: string, numero: number, nombre?: string): Promise<Result<Mesa>>;
  update(mesaId: string, empresaId: string, numero: number, nombre?: string): Promise<Result<Mesa>>;
  delete(mesaId: string, empresaId: string): Promise<Result<void>>;
  findAllWithSession(empresaId: string): Promise<Result<MesaWithSession[]>>;
}
