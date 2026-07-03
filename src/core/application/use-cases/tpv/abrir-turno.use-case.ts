import { ITpvRepository } from '@/core/domain/repositories/ITpvRepository';
import { TpvTurno } from '@/core/domain/entities/tpv-types';
import { Result, AppError } from '@/core/domain/entities/types';

interface AbrirTurnoInput {
  empresaId: string;
  userId: string;
  operadorNombre: string;
  efectivoAperturaCents: number;
}

export async function abrirTurnoUseCase(
  repo: ITpvRepository,
  input: AbrirTurnoInput,
): Promise<Result<TpvTurno, AppError>> {
  // Validate operator name
  if (!input.operadorNombre.trim()) {
    return {
      success: false,
      error: {
        code: 'TPV_OPERADOR_REQUERIDO',
        message: 'El nombre del operador es obligatorio',
        module: 'use-case',
        method: 'abrirTurnoUseCase',
      },
    };
  }

  // Check if there's already an active shift
  const activo = await repo.findTurnoActivo(input.empresaId);
  if (!activo.success) {
    return activo as Result<TpvTurno, AppError>;
  }

  if (activo.data !== null) {
    return {
      success: false,
      error: {
        code: 'TPV_TURNO_YA_ABIERTO',
        message: 'Ya hay un turno activo para esta empresa',
        module: 'use-case',
        method: 'abrirTurnoUseCase',
      },
    };
  }

  // Open the shift
  return repo.abrirTurno({
    empresaId: input.empresaId,
    userId: input.userId,
    operadorNombre: input.operadorNombre.trim(),
    efectivoAperturaCents: input.efectivoAperturaCents,
  });
}
