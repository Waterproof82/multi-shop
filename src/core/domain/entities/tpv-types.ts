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
  sesionId: string;
  metodoPago: MetodoPago;
  importeCobradoCents: number;
  propinaCents: number;
  turnoId: string;
}

export interface TpvTurnoStats {
  totalEfectivoCents: number;
  totalTarjetaCents: number;
  numOperaciones: number;
}
