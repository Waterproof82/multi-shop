// src/core/domain/entities/compras-types.ts

export type PedidoCompraEstado = 'borrador' | 'enviado' | 'recibido' | 'cancelado';
export type AlbaranEstado = 'borrador' | 'recibido';
export type EstadoPago = 'pendiente' | 'pagado_caja' | 'pagado_banco';
// IVA: 0, 4, 10, 21 | IGIC: 0, 3, 7, 9.5, 15
export type PorcentajeIva = 0 | 3 | 4 | 7 | 9.5 | 10 | 15 | 21; // 0 = exento/intracomunitario/no sujeto

// ---- Entidades ----

export interface Proveedor {
  id: string;
  empresaId: string;
  nombre: string;
  cif: string | null;
  email: string | null;
  telefono: string | null;
  condicionesPago: string | null;
  direccionFiscal: string | null;
  observaciones: string | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogoCompraItem {
  id: string;
  empresaId: string;
  proveedorId: string;
  ingredienteId: string;
  referenciaProveedor: string | null;
  descripcion: string | null;
  precioCompraCents: number;
  unidadCompra: string;
  factorConversion: number;
  porcentajeIva: PorcentajeIva;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
  // Joined
  ingredienteNombre?: string;
  esPerecedero?: boolean;
}

export interface PedidoCompra {
  id: string;
  empresaId: string;
  proveedorId: string;
  numeroPedido: string;
  estado: PedidoCompraEstado;
  notas: string | null;
  fechaPedido: string;
  fechaEntregaEstimada: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined
  proveedorNombre?: string;
  items?: PedidoCompraItem[];
}

export interface PedidoCompraItem {
  id: string;
  pedidoCompraId: string;
  catalogoCompraId: string;
  cantidad: number;
  precioCompraCents: number;
  porcentajeIva: PorcentajeIva;
  createdAt: string;
  // Joined
  ingredienteNombre?: string;
  unidadCompra?: string;
}

export interface AlbaranCompra {
  id: string;
  empresaId: string;
  proveedorId: string;
  pedidoCompraId: string | null;
  numeroAlbaran: string;
  estado: AlbaranEstado;
  fechaRecepcion: string | null;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined
  proveedorNombre?: string;
  items?: AlbaranCompraItem[];
}

export interface AlbaranCompraItem {
  id: string;
  albaranCompraId: string;
  catalogoCompraId: string;
  cantidadRecibida: number;
  precioCompraCents: number;
  porcentajeIva: PorcentajeIva;
  numeroLote: string | null;
  fechaCaducidad: string | null;
  movimientoStockId: string | null;
  createdAt: string;
  // Joined
  ingredienteNombre?: string;
  esPerecedero?: boolean;
  unidadCompra?: string;
}

export interface FacturaProveedor {
  id: string;
  empresaId: string;
  proveedorId: string;
  numeroFactura: string;
  fechaFactura: string;
  baseImponible0Cents: number;
  baseImponible3Cents: number;
  baseImponible4Cents: number;
  baseImponible7Cents: number;
  baseImponible10Cents: number;
  baseImponible15Cents: number;
  baseImponible21Cents: number;
  baseImponible95Cents: number;   // 9.5%
  ivaSoportadoCents: number;
  totalFacturaCents: number;
  estadoPago: EstadoPago;
  notas: string | null;
  turnoId: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined
  proveedorNombre?: string;
  albaranes?: AlbaranCompra[];
}

// ---- DTOs ----

export interface CreateProveedorDTO {
  nombre: string;
  cif?: string;
  email?: string;
  telefono?: string;
  condicionesPago?: string;
  direccionFiscal?: string;
  observaciones?: string;
}

export type UpdateProveedorDTO = Partial<CreateProveedorDTO & { activo: boolean }>;

export interface CreateCatalogoItemDTO {
  proveedorId: string;
  ingredienteId: string;
  referenciaProveedor?: string;
  descripcion?: string;
  precioCompraCents: number;
  unidadCompra: string;
  factorConversion: number;
  porcentajeIva: PorcentajeIva;
}

export type UpdateCatalogoItemDTO = Partial<Omit<CreateCatalogoItemDTO, 'proveedorId' | 'ingredienteId'> & { activo: boolean }>;

export interface CreatePedidoCompraDTO {
  proveedorId: string;
  notas?: string;
  fechaEntregaEstimada?: string;
}

export interface AddItemToPedidoDTO {
  catalogoCompraId: string;
  cantidad: number;
}

export interface CreateAlbaranDTO {
  proveedorId: string;
  pedidoCompraId?: string;
  numeroAlbaran: string;
  notas?: string;
}

export interface AddItemToAlbaranDTO {
  catalogoCompraId: string;
  cantidadRecibida: number;
  precioCompraCents: number;
  porcentajeIva: PorcentajeIva;
  numeroLote?: string;
  fechaCaducidad?: string;
}

export interface CreateFacturaProveedorDTO {
  proveedorId: string;
  numeroFactura: string;
  fechaFactura: string;
  baseImponible0Cents: number;
  baseImponible3Cents?: number;
  baseImponible4Cents: number;
  baseImponible7Cents?: number;
  baseImponible10Cents: number;
  baseImponible15Cents?: number;
  baseImponible21Cents: number;
  baseImponible95Cents?: number;  // 9.5%
  ivaSoportadoCents: number;
  totalFacturaCents: number;
  notas?: string;
  albaranIds: string[];
}

export interface RegistrarPagoDTO {
  metodoPago: 'pagado_caja' | 'pagado_banco';
  turnoId?: string;
}
