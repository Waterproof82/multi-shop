import type { Result } from '@/core/domain/entities/types';
import type { FichajeEvento } from '../../domain/types';
import type { IFichajeRepository } from '../../domain/interfaces/IFichajeRepository';
import type { IAuditRepository } from '../../domain/interfaces/IAuditRepository';

const DRIFT_THRESHOLD_SECONDS = 300; // 5 minutes — configurable per empresa in future

export interface RegistrarFichajeInput {
  empresaId: string;
  centroId: string;
  empleadoId: string;
  actorId: string;
  tipo: Exclude<FichajeEvento['tipo'], 'correccion'>;
  timestampEvento: Date;
  origenOffline: boolean;
  driftSegundos?: number;
}

export interface RegistrarFichajeOutput {
  recordId: string;
  chainHash: string;
  timestampServidor: Date;
}

export class RegistrarFichajeUseCase {
  constructor(
    private readonly fichajeRepo: IFichajeRepository,
    private readonly auditRepo: IAuditRepository,
  ) {}

  async execute(input: RegistrarFichajeInput): Promise<Result<RegistrarFichajeOutput>> {
    // Verify employee belongs to empresa
    const perfilResult = await this.fichajeRepo.existePerfilLaboral(input.empresaId, input.empleadoId);
    if (!perfilResult.success) return perfilResult;
    if (!perfilResult.data) {
      return {
        success: false,
        error: {
          code: 'LC_PROFILE_NOT_FOUND',
          message: 'El empleado no tiene perfil laboral activo en esta empresa',
          module: 'use-case',
          method: 'RegistrarFichaje.execute',
        },
      };
    }

    const hasDrift = (input.driftSegundos ?? 0) > DRIFT_THRESHOLD_SECONDS;

    const result = await this.fichajeRepo.registrar({
      empresaId:       input.empresaId,
      centroId:        input.centroId,
      empleadoId:      input.empleadoId,
      actorId:         input.actorId,
      tipo:            input.tipo,
      timestampEvento: input.timestampEvento,
      origenOffline:   input.origenOffline,
      motivo:          hasDrift ? `drift:${input.driftSegundos}s` : undefined,
    });
    if (!result.success) return result;

    await this.auditRepo.insert({
      empresaId:  input.empresaId,
      actorId:    input.actorId,
      actionType: `fichaje.${input.tipo}`,
      entityType: 'lc_fichajes',
      entityId:   result.data.recordId,
      metadata: {
        origen_offline: input.origenOffline,
        drift_segundos: input.driftSegundos ?? 0,
        drift_flag:     hasDrift,
      },
    });

    return { success: true, data: result.data };
  }
}
