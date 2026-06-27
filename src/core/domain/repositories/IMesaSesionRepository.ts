import { Result } from '@/core/domain/entities/types';

export interface PendingItem {
  nombre: string;
  precio: number;
  cantidad: number;
  translations?: Record<string, { name?: string } | undefined>;
}

export interface DeferredItem {
  itemId: string;
  itemName: string;
  price: number;
  quantity: number;
  tipo?: 'comida' | 'bebida';
  translations?: Record<string, { name: string }>;
  selectedComplements?: Array<{ id: string; name: string; price: number }>;
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
  sesionPagada: boolean;
  pagoEnCurso: boolean;
}

export interface IMesaSesionRepository {
  openSesion(mesaId: string, empresaId: string): Promise<Result<string>>;
  closeSesion(sesionId: string): Promise<Result<void>>;
  findActiveSesionByMesa(mesaId: string): Promise<Result<MesaSesion | null>>;
  findSesionWithOrders(sesionId: string): Promise<Result<MesaSesion | null>>;
  appendItems(sesionId: string, items: PendingItem[], itemsTotal: number): Promise<Result<void>>;
  getDeferredItems(mesaId: string): Promise<Result<DeferredItem[]>>;
  setDeferredItems(mesaId: string, items: DeferredItem[]): Promise<Result<void>>;
}
