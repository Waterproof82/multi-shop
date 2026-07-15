import { ITpvRepository } from '@/core/domain/repositories/ITpvRepository';
import { TpvTurnoEvento, TpvMovimientoCajaPayload } from '@/core/domain/entities/tpv-types';
import { Result, AppError } from '@/core/domain/entities/types';

export async function registrarMovimientoCajaUseCase(
  repo: ITpvRepository,
  payload: TpvMovimientoCajaPayload,
): Promise<Result<TpvTurnoEvento, AppError>> {
  if (payload.montoCents <= 0) {
    return {
      success: false,
      error: {
        code: 'TPV_MOVIMIENTO_MONTO_INVALIDO',
        message: 'El monto del movimiento debe ser mayor a 0',
        module: 'use-case',
        method: 'registrarMovimientoCajaUseCase',
      },
    };
  }

  if (!payload.descripcion.trim()) {
    return {
      success: false,
      error: {
        code: 'TPV_MOVIMIENTO_DESCRIPCION_REQUERIDA',
        message: 'La descripción es obligatoria para movimientos de caja (RD 1007/2023)',
        module: 'use-case',
        method: 'registrarMovimientoCajaUseCase',
      },
    };
  }

  return repo.registrarMovimientoCaja({
    ...payload,
    descripcion: payload.descripcion.trim(),
  });
}
