import type { Result } from '@/core/domain/entities/types';
import type { FichajeEvento } from '../../domain/types';
import type { IFichajeRepository } from '../../domain/interfaces/IFichajeRepository';
import type { IAuditRepository } from '../../domain/interfaces/IAuditRepository';
import type { IReviewQueueRepository } from '../../domain/interfaces/IReviewQueueRepository';

export interface RegistrarCorreccionInput {
  empresaId: string;
  centroId: string;
  empleadoId: string;
  actorId: string;
  refCorreccion: string; // record_id being corrected
  accion: FichajeEvento['accion'] & string;
  timestampEvento?: Date; // required for 'rectificar', optional for 'anular'
  motivo: string;
}

export class RegistrarCorreccionUseCase {
  constructor(
    private readonly fichajeRepo: IFichajeRepository,
    private readonly auditRepo: IAuditRepository,
    private readonly reviewQueueRepo: IReviewQueueRepository,
  ) {}

  async execute(input: RegistrarCorreccionInput): Promise<Result<{ recordId: string; chainHash: string }>> {
    const perfilResult = await this.fichajeRepo.existePerfilLaboral(input.empresaId, input.empleadoId);
    if (!perfilResult.success) return perfilResult;
    if (!perfilResult.data) {
      return {
        success: false,
        error: { code: 'LC_PROFILE_NOT_FOUND', message: 'Perfil laboral no encontrado', module: 'use-case', method: 'RegistrarCorreccion.execute' },
      };
    }

    const result = await this.fichajeRepo.registrarCorreccion({
      empresaId:       input.empresaId,
      centroId:        input.centroId,
      empleadoId:      input.empleadoId,
      actorId:         input.actorId,
      accion:          input.accion,
      refCorreccion:   input.refCorreccion,
      timestampEvento: input.timestampEvento ?? new Date(),
      motivo:          input.motivo,
      origenOffline:   false,
    });
    if (!result.success) return result;

    await this.auditRepo.insert({
      empresaId:  input.empresaId,
      actorId:    input.actorId,
      actionType: 'fichaje.correccion',
      entityType: 'lc_fichajes',
      entityId:   result.data.recordId,
      reason:     input.motivo,
      metadata:   { accion: input.accion, ref_correccion: input.refCorreccion },
    });

    // LC-K-005: anular one half of a pair → flag possible orphan for supervisor review
    if (input.accion === 'anular') {
      void this.reviewQueueRepo.create({
        empresaId:    input.empresaId,
        centroId:     input.centroId,
        empleadoId:   input.empleadoId,
        recordId:     input.refCorreccion,
        tipoRevision: 'ack_pendiente',
        detalle: {
          mensaje:        `Registro ${input.refCorreccion} anulado. Verificar si el evento par quedó huérfano.`,
          ref_correccion: input.refCorreccion,
          motivo:         input.motivo,
          actor_id:       input.actorId,
        },
      });
    }

    return { success: true, data: result.data };
  }
}
