import type { Result } from '@/core/domain/entities/types';
import type { FichajeEvento } from '../../domain/types';
import type { IFichajeRepository } from '../../domain/interfaces/IFichajeRepository';
import type { IAuditRepository } from '../../domain/interfaces/IAuditRepository';
import type { IReviewQueueRepository } from '../../domain/interfaces/IReviewQueueRepository';

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
  orphanDetected: boolean;
}

function derivarEstado(ultimo: FichajeEvento | null): 'fuera' | 'dentro' | 'pausa' {
  if (ultimo === null) return 'fuera';
  const t = ultimo.tipo;
  if (t === 'entrada' || t === 'fin_pausa') return 'dentro';
  if (t === 'inicio_pausa') return 'pausa';
  return 'fuera';
}

function isOrphan(
  tipo: Exclude<FichajeEvento['tipo'], 'correccion'>,
  estadoAnterior: 'fuera' | 'dentro' | 'pausa',
): boolean {
  if (tipo === 'salida')       return estadoAnterior !== 'dentro';
  if (tipo === 'inicio_pausa') return estadoAnterior !== 'dentro';
  if (tipo === 'fin_pausa')    return estadoAnterior !== 'pausa';
  return false; // 'entrada' is always valid
}

export class RegistrarFichajeUseCase {
  constructor(
    private readonly fichajeRepo: IFichajeRepository,
    private readonly auditRepo: IAuditRepository,
    private readonly reviewQueueRepo: IReviewQueueRepository,
  ) {}

  async execute(input: RegistrarFichajeInput): Promise<Result<RegistrarFichajeOutput>> {
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

    // LC-F-008: Read previous state BEFORE inserting for orphan detection
    const ultimoResult = await this.fichajeRepo.findUltimoByEmpleado(input.empresaId, input.empleadoId);
    const estadoAnterior = derivarEstado(ultimoResult.success ? ultimoResult.data : null);
    const orphanDetected = isOrphan(input.tipo, estadoAnterior);

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
        origen_offline:  input.origenOffline,
        drift_segundos:  input.driftSegundos ?? 0,
        drift_flag:      hasDrift,
        orphan_detected: orphanDetected,
      },
    });

    // LC-F-008: Populate review queue for orphan (non-blocking — insert already succeeded)
    if (orphanDetected) {
      void this.reviewQueueRepo.create({
        empresaId:    input.empresaId,
        centroId:     input.centroId,
        empleadoId:   input.empleadoId,
        recordId:     result.data.recordId,
        tipoRevision: 'orphan',
        detalle: {
          tipo_fichaje:    input.tipo,
          estado_anterior: estadoAnterior,
          mensaje:         `Evento "${input.tipo}" sin el evento previo esperado (estado: ${estadoAnterior})`,
        },
      });
    }

    // LC-F-006: Populate review queue for drift (non-blocking)
    if (hasDrift) {
      void this.reviewQueueRepo.create({
        empresaId:    input.empresaId,
        centroId:     input.centroId,
        empleadoId:   input.empleadoId,
        recordId:     result.data.recordId,
        tipoRevision: 'drift',
        detalle: {
          drift_segundos: input.driftSegundos,
          tipo_fichaje:   input.tipo,
          mensaje:        `Desfase de reloj de ${input.driftSegundos}s supera el umbral de ${DRIFT_THRESHOLD_SECONDS}s`,
        },
      });
    }

    return { success: true, data: { ...result.data, orphanDetected } };
  }
}
