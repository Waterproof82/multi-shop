import { Result } from '@/core/domain/entities/types';
import { TpvTurno, TpvCobroPayload, TpvTurnoStats, TpvCobro, TpvCobroCompletoPayload } from '@/core/domain/entities/tpv-types';

export interface ITpvRepository {
  findTurnoActivo(empresaId: string): Promise<Result<TpvTurno | null>>;
  abrirTurno(params: {
    empresaId: string;
    userId: string;
    operadorNombre: string;
    efectivoAperturaCents: number;
  }): Promise<Result<TpvTurno>>;
  cerrarTurno(params: {
    turnoId: string;
    efectivoCierreCents: number;
    diferenciaCents: number;
  }): Promise<Result<void>>;
  registrarCobro(payload: TpvCobroPayload): Promise<Result<void>>;
  crearCobroCompleto(payload: TpvCobroCompletoPayload): Promise<Result<TpvCobro>>;
  getTurnoStats(turnoId: string): Promise<Result<TpvTurnoStats>>;
}
