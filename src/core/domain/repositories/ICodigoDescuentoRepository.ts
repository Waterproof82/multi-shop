import { CodigoDescuento, Result } from '../entities/types';

export interface CreateCodigoDescuentoData {
  empresaId: string;
  clienteEmail: string;
  codigo: string;
  porcentajeDescuento: number;
  fechaExpiracion: Date;
}

export interface ICodigoDescuentoRepository {
  create(data: CreateCodigoDescuentoData): Promise<Result<CodigoDescuento>>;
  findByCodigo(codigo: string, empresaId: string): Promise<Result<CodigoDescuento | null>>;
  findByEmail(email: string, empresaId: string): Promise<Result<CodigoDescuento | null>>;
  markAsUsed(id: string, pedidoId: string): Promise<Result<void>>;
}
