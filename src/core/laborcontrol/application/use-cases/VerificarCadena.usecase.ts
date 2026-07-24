import type { Result } from '@/core/domain/entities/types';
import type { ChainVerifyResult } from '../../domain/types';
import type { IChainRepository } from '../../domain/interfaces/IChainRepository';
import type { IAuditRepository } from '../../domain/interfaces/IAuditRepository';

export class VerificarCadenaUseCase {
  constructor(
    private readonly chainRepo: IChainRepository,
    private readonly auditRepo: IAuditRepository,
  ) {}

  async execute(
    empresaId: string,
    year: number,
    month: number,
    actorId: string,
  ): Promise<Result<ChainVerifyResult>> {
    const result = await this.chainRepo.verifySegment(empresaId, year, month);
    if (!result.success) return result;

    await this.auditRepo.insert({
      empresaId,
      actorId,
      actionType: 'chain.verify',
      metadata: {
        year,
        month,
        status:     result.data.status,
        total_rows: result.data.totalRows,
        broken_at:  result.data.brokenAt,
      },
    });

    return result;
  }
}
