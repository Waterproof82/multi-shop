import type { Result } from '@/core/domain/entities/types';
import type { FichajeEvento } from '../../domain/types';
import type { IFichajeRepository } from '../../domain/interfaces/IFichajeRepository';

// Returns fichajes with supersede resolution applied:
// - Records annulled by a 'correccion' with accion='anular' are marked as superseded
// - Records rectified by a 'correccion' with accion='rectificar' are replaced by the correction
export interface FichajeConEstado extends FichajeEvento {
  superseded: boolean;
}

export class ObtenerMisFichajesUseCase {
  constructor(private readonly fichajeRepo: IFichajeRepository) {}

  async execute(
    empresaId: string,
    empleadoId: string,
    from: Date,
    to: Date,
  ): Promise<Result<FichajeConEstado[]>> {
    const result = await this.fichajeRepo.findByEmpleado(empresaId, empleadoId, from, to, true);
    if (!result.success) return result;

    const annulledIds = new Set<string>();
    const rectifiedIds = new Set<string>();

    for (const f of result.data) {
      if (f.tipo === 'correccion' && f.refCorreccion) {
        if (f.accion === 'anular')     annulledIds.add(f.refCorreccion);
        if (f.accion === 'rectificar') rectifiedIds.add(f.refCorreccion);
      }
    }

    const withEstado: FichajeConEstado[] = result.data.map(f => ({
      ...f,
      superseded: annulledIds.has(f.recordId) || rectifiedIds.has(f.recordId),
    }));

    return { success: true, data: withEstado };
  }
}
