import { Result } from '@/core/domain/entities/types';
import {
  Ingrediente,
  RecetaItem,
  MovimientoStock,
  Merma,
  TipoMovimiento,
  RegistrarMermaPayload,
} from '@/core/domain/entities/stock-types';

export interface FindMovimientosOpts {
  page: number;
  limit: number;
  ingredienteId?: string;
  tipo?: TipoMovimiento;
  startDate?: string;
  endDate?: string;
}

export interface IStockRepository {
  findIngredientes(empresaId: string): Promise<Result<Ingrediente[]>>;
  findIngredienteById(id: string): Promise<Result<Ingrediente>>;
  createIngrediente(
    data: Omit<Ingrediente, 'id' | 'createdAt'>
  ): Promise<Result<Ingrediente>>;
  updateIngrediente(
    id: string,
    data: Partial<Pick<Ingrediente, 'nombre' | 'unidad' | 'umbralAlerta'>>
  ): Promise<Result<Ingrediente>>;
  deleteIngrediente(id: string): Promise<Result<void>>;
  updateCantidad(ingredienteId: string, delta: number): Promise<Result<Ingrediente>>;

  findRecetaByProducto(productoId: string): Promise<Result<RecetaItem[]>>;
  replaceReceta(
    productoId: string,
    items: Array<{ ingredienteId: string; cantidadNecesaria: number }>
  ): Promise<Result<RecetaItem[]>>;

  findMovimientos(
    empresaId: string,
    opts: FindMovimientosOpts
  ): Promise<Result<MovimientoStock[]>>;

  findMermas(empresaId: string, turnoId?: string): Promise<Result<Merma[]>>;
  createMerma(payload: RegistrarMermaPayload): Promise<Result<Merma>>;
  createMovimiento(
    data: Omit<MovimientoStock, 'id' | 'createdAt'>
  ): Promise<Result<MovimientoStock>>;

  findLowStockAlerts(empresaId: string): Promise<Result<Ingrediente[]>>;
}
