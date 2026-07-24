import type { Result } from '@/core/domain/entities/types';
import type { LegalHold } from '../../domain/types';
import type { IHoldRepository, CreateHoldInput } from '../../domain/interfaces/IHoldRepository';
import type { IAuditRepository } from '../../domain/interfaces/IAuditRepository';

export interface CrearHoldInput {
  empresaId: string;
  actorId: string;
  empleadoId?: string;
  fechaInicio: string;
  fechaFin: string;
  motivo: string;
}

export class GestionarHoldUseCase {
  constructor(
    private readonly holdRepo: IHoldRepository,
    private readonly auditRepo: IAuditRepository,
  ) {}

  async crear(input: CrearHoldInput): Promise<Result<LegalHold>> {
    const holdInput: CreateHoldInput = {
      empresaId:  input.empresaId,
      actorId:    input.actorId,
      empleadoId: input.empleadoId,
      fechaInicio: input.fechaInicio,
      fechaFin:    input.fechaFin,
      motivo:      input.motivo,
    };

    const result = await this.holdRepo.create(holdInput);
    if (!result.success) return result;

    await this.auditRepo.insert({
      empresaId:  input.empresaId,
      actorId:    input.actorId,
      actionType: 'hold.created',
      entityType: 'lc_legal_holds',
      entityId:   result.data.id,
      reason:     input.motivo,
      metadata: {
        empleado_id:  input.empleadoId ?? null,
        fecha_inicio: input.fechaInicio,
        fecha_fin:    input.fechaFin,
      },
    });

    return result;
  }

  async levantar(holdId: string, empresaId: string, actorId: string): Promise<Result<void>> {
    const result = await this.holdRepo.lift(holdId, empresaId, actorId);
    if (!result.success) return result;

    await this.auditRepo.insert({
      empresaId,
      actorId,
      actionType: 'hold.lifted',
      entityType: 'lc_legal_holds',
      entityId:   holdId,
    });

    return result;
  }

  async listar(empresaId: string): Promise<Result<LegalHold[]>> {
    return this.holdRepo.findByEmpresa(empresaId);
  }
}
