import { Result } from '@/core/domain/entities/types';

export interface PendingItem {
  nombre: string;
  precio: number;
  cantidad: number;
  translations?: Record<string, { name?: string } | undefined>;
}

export interface MesaSesion {
  id: string;
  mesaId: string;
  empresaId: string;
  total: number;
  pendingItems: PendingItem[];
  pendingTotal: number;
  cerradaAt: string | null;
  createdAt: string;
}

export interface IMesaSesionRepository {
  openSesion(mesaId: string, empresaId: string): Promise<Result<string>>; // returns sesion_id
  closeSesion(sesionId: string): Promise<Result<void>>;
  findActiveSesionByMesa(mesaId: string): Promise<Result<MesaSesion | null>>;
  findSesionWithOrders(sesionId: string): Promise<Result<MesaSesion | null>>;
  appendItems(sesionId: string, items: PendingItem[], itemsTotal: number): Promise<Result<void>>;
}
