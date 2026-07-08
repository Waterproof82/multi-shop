import { ITpvRepository } from '@/core/domain/repositories/ITpvRepository';
import { Result, AppError } from '@/core/domain/entities/types';

interface CerrarTurnoInput {
  turnoId: string;
  efectivoCierreCents: number;
  totalEfectivoTeoricoCents: number;
}

export async function cerrarTurnoUseCase(
  repo: ITpvRepository,
  input: CerrarTurnoInput,
): Promise<Result<void, AppError>> {
  const diferenciaCents = input.efectivoCierreCents - input.totalEfectivoTeoricoCents;

  return repo.cerrarTurno({
    turnoId: input.turnoId,
    efectivoCierreCents: input.efectivoCierreCents,
    diferenciaCents,
  });
}
