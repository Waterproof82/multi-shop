export interface TpvTurno {
  id: string;
  empresaId: string;
  userId: string;
  operadorNombre: string;
  aperturaAt: string;
  cierreAt: string | null;
  efectivoAperturaCents: number;
  efectivoCierreCents: number | null;
  efectivoCierreTeoricoCents: number | null;
  totalEfectivoCents: number;
  totalTarjetaCents: number;
  diferenciaCents: number | null;
  requiereRevision: boolean;
  hashEncadenado: string | null;
  empleadoCierreId: string | null;
  createdAt: string;
}

export type MetodoPago = 'efectivo' | 'tarjeta';

export interface TpvCobroPayload {
  empresaId: string;
  sesionId: string;
  metodoPago: MetodoPago;
  importeCobradoCents: number;
  propinaCents: number;
  descuentoCents: number;
  turnoId: string;
  ivaPorcentaje?: number;
  cerrarSesion?: boolean;
  detalleItems?: TpvDetalleItem[];
  empleadoId?: string | null;
}

export interface TpvTurnoStats {
  totalEfectivoCents: number;
  totalTarjetaCents: number;
  numOperaciones: number;
  efectivoAperturaCents: number;
  movimientosNetoCents: number;
}

export type TipoEventoTurno =
  | 'apertura'
  | 'cierre'
  | 'entrada_caja'
  | 'salida_caja'
  | 'apertura_cajon_sin_venta'
  | 'arqueo_parcial'
  | 'descuadre';

export interface TpvTurnoEvento {
  id: string;
  turnoId: string;
  empresaId: string;
  tipoEvento: TipoEventoTurno;
  empleadoId: string | null;
  montoCents: number | null;
  descripcion: string | null;
  createdAt: string;
}

export interface TpvMovimientoCajaPayload {
  turnoId: string;
  empresaId: string;
  tipoEvento: 'entrada_caja' | 'salida_caja';
  montoCents: number;
  descripcion: string;
  empleadoId?: string;
}

export interface TpvIvaDesgloseItem {
  porcentaje: number;
  baseImponibleCents: number;
  ivaCents: number;
}

export interface TpvDetalleItem {
  nombre: string;
  cantidad: number;
  precioUnitarioCents: number;
  ivaPorcentaje?: number;
}

export interface TpvCobro {
  id: string;
  empresaId: string;
  turnoId: string;
  sesionId: string | null;
  numeroTicket: number;
  serie: string;
  metodoPago: MetodoPago;
  importeCobradoCents: number;
  propinaCents: number;
  descuentoCents: number;
  ivaPorcentaje: number;
  baseImponibleCents: number;
  ivaCents: number;
  hashAnterior: string | null;
  hash: string;
  cobradoAt: string;
  rectificaCobroId?: string | null;
  detalleItems: TpvDetalleItem[] | null;
  desgloseIva?: TpvIvaDesgloseItem[] | null;
  empleadoId?: string | null;
}

export interface TpvCobroCompletoPayload {
  empresaId: string;
  turnoId: string;
  sesionId: string | null;
  metodoPago: MetodoPago;
  importeCobradoCents: number;
  propinaCents: number;
  descuentoCents?: number;
  ivaPorcentaje?: number;
  rectificaCobroId?: string | null;
  detalleItems?: TpvDetalleItem[];
  empleadoId?: string | null;
}

export type TipoImpuesto = 'iva' | 'igic';

export interface TpvTurnoResumen {
  id: string;
  operadorNombre: string;
  aperturaAt: string;
  cierreAt: string | null;
  totalCents: number;
  numCobros: number;
  activo: boolean;
}

export interface TpvAnalytics {
  totalFacturadoCents: number;
  numCobros: number;
  ticketMedioCents: number;
  totalIvaCents: number;
  baseImponibleCents: number;
  totalPropinaCents: number;
  splitEfectivoCents: number;
  splitTarjetaCents: number;
  ventasPorHora: number[]; // 24 posiciones, índice = hora del día (0-23), zona Europe/Madrid
  /** Heatmap 7×24: DOW 0=domingo…6=sábado (PostgreSQL), hora 0-23, zona Europe/Madrid */
  heatmap: { dow: number; hora: number; totalCents: number }[];
  topProductos: { nombre: string; cantidad: number }[];
  historialTurnos: TpvTurnoResumen[];
  numTurnos: number;
  duracionMediaMinutos: number | null;
}

export interface GetAnalyticsParams {
  empresaId: string;
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
}

export interface InformeZDesglosePago {
  metodoPago: MetodoPago;
  totalCents: number;
  numOperaciones: number;
}

export interface InformeZData {
  // Turno
  turnoId: string;
  numeroZ: number;
  operadorNombre: string;
  aperturaAt: string;
  cierreAt: string;
  hashEncadenado: string;
  // Empresa
  empresaNombre: string;
  empresaNif: string | null;
  tipoImpuesto: TipoImpuesto;
  // Totales del turno
  efectivoAperturaCents: number;
  efectivoCierreCents: number;
  efectivoCierreTeoricoCents: number;
  diferenciaCents: number;
  // Agregados de cobros
  totalFacturadoCents: number;
  baseImponibleCents: number;
  ivaCents: number;
  propinaCents: number;
  numCobros: number;
  desglosePagos: InformeZDesglosePago[];
  // Desglose por tipo de impuesto (multi-rate; undefined = legacy turno sin desglose)
  desgloseImpuesto?: TpvIvaDesgloseItem[];
  // Movimientos de caja del turno
  movimientos: TpvTurnoEvento[];
}
