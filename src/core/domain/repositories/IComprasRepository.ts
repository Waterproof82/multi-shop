// src/core/domain/repositories/IComprasRepository.ts
import type { Result } from '@/core/domain/entities/types';
import type {
  Proveedor, CreateProveedorDTO, UpdateProveedorDTO,
  CatalogoCompraItem, CreateCatalogoItemDTO, UpdateCatalogoItemDTO,
  PedidoCompra, PedidoCompraItem, CreatePedidoCompraDTO, AddItemToPedidoDTO,
  AlbaranCompra, AlbaranCompraItem, CreateAlbaranDTO, AddItemToAlbaranDTO,
  FacturaProveedor, CreateFacturaProveedorDTO, RegistrarPagoDTO,
} from '@/core/domain/entities/compras-types';

export interface PedidoCompraFilters {
  estado?: string;
  proveedorId?: string;
}

export interface AlbaranFilters {
  estado?: string;
  proveedorId?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}

export interface FacturaFilters {
  estadoPago?: string;
  proveedorId?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}

export interface IComprasRepository {
  // --- Proveedores ---
  findProveedores(empresaId: string): Promise<Result<Proveedor[]>>;
  findProveedorById(empresaId: string, id: string): Promise<Result<Proveedor>>;
  createProveedor(empresaId: string, data: CreateProveedorDTO): Promise<Result<Proveedor>>;
  updateProveedor(empresaId: string, id: string, data: UpdateProveedorDTO): Promise<Result<Proveedor>>;
  softDeleteProveedor(empresaId: string, id: string): Promise<Result<void>>;
  hasActiveTransactions(empresaId: string, proveedorId: string): Promise<Result<boolean>>;

  // --- Catalogo ---
  findCatalogoByProveedor(empresaId: string, proveedorId: string): Promise<Result<CatalogoCompraItem[]>>;
  findCatalogoItemById(empresaId: string, id: string): Promise<Result<CatalogoCompraItem>>;
  createCatalogoItem(empresaId: string, data: CreateCatalogoItemDTO): Promise<Result<CatalogoCompraItem>>;
  updateCatalogoItem(empresaId: string, id: string, data: UpdateCatalogoItemDTO): Promise<Result<CatalogoCompraItem>>;
  softDeleteCatalogoItem(empresaId: string, id: string): Promise<Result<void>>;

  // --- Pedidos ---
  findPedidos(empresaId: string, filters?: PedidoCompraFilters): Promise<Result<PedidoCompra[]>>;
  findPedidoById(empresaId: string, id: string): Promise<Result<PedidoCompra>>;
  createPedido(empresaId: string, data: CreatePedidoCompraDTO, numeroPedido: string): Promise<Result<PedidoCompra>>;
  updatePedidoEstado(empresaId: string, id: string, estado: string): Promise<Result<PedidoCompra>>;
  addItemToPedido(empresaId: string, pedidoId: string, item: AddItemToPedidoDTO & { precioCompraCents: number; porcentajeIva: number }): Promise<Result<PedidoCompraItem>>;
  updatePedidoItem(empresaId: string, pedidoId: string, itemId: string, cantidad: number): Promise<Result<PedidoCompraItem>>;
  removePedidoItem(empresaId: string, pedidoId: string, itemId: string): Promise<Result<void>>;

  // --- Albaranes ---
  findAlbaranes(empresaId: string, filters?: AlbaranFilters): Promise<Result<AlbaranCompra[]>>;
  findAlbaranById(empresaId: string, id: string): Promise<Result<AlbaranCompra>>;
  createAlbaran(empresaId: string, data: CreateAlbaranDTO): Promise<Result<AlbaranCompra>>;
  addItemToAlbaran(empresaId: string, albaranId: string, item: AddItemToAlbaranDTO): Promise<Result<AlbaranCompraItem>>;
  updateAlbaranItem(empresaId: string, albaranId: string, itemId: string, data: Partial<AddItemToAlbaranDTO>): Promise<Result<AlbaranCompraItem>>;
  removeAlbaranItem(empresaId: string, albaranId: string, itemId: string): Promise<Result<void>>;
  marcarAlbaranRecibido(empresaId: string, albaranId: string, empleadoId: string): Promise<Result<AlbaranCompra>>;

  // --- Facturas ---
  findFacturas(empresaId: string, filters?: FacturaFilters): Promise<Result<FacturaProveedor[]>>;
  findFacturaById(empresaId: string, id: string): Promise<Result<FacturaProveedor>>;
  createFactura(empresaId: string, data: CreateFacturaProveedorDTO): Promise<Result<FacturaProveedor>>;
  registrarPagoFactura(empresaId: string, id: string, data: RegistrarPagoDTO): Promise<Result<FacturaProveedor>>;
}
