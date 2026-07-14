import { Result } from '@/core/domain/entities/types';
import {
  TpvTurno,
  TpvCobroPayload,
  TpvTurnoStats,
  TpvCobro,
  TpvCobroCompletoPayload,
  TpvAnalytics,
  GetAnalyticsParams,
  TpvTurnoEvento,
  TpvMovimientoCajaPayload,
  InformeZData,
} from '@/core/domain/entities/tpv-types';

export interface ITpvRepository {
  findTurnoActivo(empresaId: string): Promise<Result<TpvTurno | null>>;
  abrirTurno(params: {
    empresaId: string;
    userId?: string;          // auth.users UUID — null for employee sessions
    operadorId?: string;      // empleados_tpv UUID — null for admin sessions
    operadorNombre: string;
    efectivoAperturaCents: number;
  }): Promise<Result<TpvTurno>>;
  cerrarTurno(params: {
    turnoId: string;
    efectivoCierreCents: number;
    efectivoCierreTeoricoCents: number;
    diferenciaCents: number;
    empleadoCierreId?: string;
  }): Promise<Result<void>>;
  registrarCobro(payload: TpvCobroPayload): Promise<Result<void>>;
  crearCobroCompleto(payload: TpvCobroCompletoPayload): Promise<Result<TpvCobro>>;
  getTurnoStats(turnoId: string): Promise<Result<TpvTurnoStats>>;
  getAnalytics(params: GetAnalyticsParams): Promise<Result<TpvAnalytics>>;
  registrarMovimientoCaja(payload: TpvMovimientoCajaPayload): Promise<Result<TpvTurnoEvento>>;
  getMovimientosCaja(turnoId: string): Promise<Result<TpvTurnoEvento[]>>;
  getInformeZ(turnoId: string, empresaId: string): Promise<Result<InformeZData>>;
}
