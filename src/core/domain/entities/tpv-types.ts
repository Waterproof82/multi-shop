export interface TpvTurno {
  id: string;
  empresaId: string;
  userId: string;
  operadorNombre: string;
  aperturaAt: string;
  cierreAt: string | null;
  efectivoAperturaCents: number;
  efectivoCierreCents: number | null;
  totalEfectivoCents: number;
  totalTarjetaCents: number;
  diferenciaCents: number | null;
  requiereRevision: boolean;
  createdAt: string;
}

export type MetodoPago = 'efectivo' | 'tarjeta';

export interface TpvCobroPayload {
  empresaId: string;
  sesionId: string;
  metodoPago: MetodoPago;
  importeCobradoCents: number;
  propinaCents: number;
  turnoId: string;
  ivaPorcentaje?: number;
  cerrarSesion?: boolean;
}

export interface TpvTurnoStats {
  totalEfectivoCents: number;
  totalTarjetaCents: number;
  numOperaciones: number;
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
  ivaPorcentaje: number;
  baseImponibleCents: number;
  ivaCents: number;
  hashAnterior: string | null;
  hash: string;
  cobradoAt: string;
  rectificaCobroId?: string | null;
}

export interface TpvCobroCompletoPayload {
  empresaId: string;
  turnoId: string;
  sesionId: string | null;
  metodoPago: MetodoPago;
  importeCobradoCents: number;
  propinaCents: number;
  ivaPorcentaje?: number;
  rectificaCobroId?: string | null;
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
