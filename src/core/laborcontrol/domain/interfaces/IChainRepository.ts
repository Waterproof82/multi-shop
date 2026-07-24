import type { Result } from '@/core/domain/entities/types';
import type { ChainAnchor, ChainVerifyResult } from '../types';

export interface IChainRepository {
  sealMonthAnchors(year: number, month: number): Promise<Result<ChainAnchor[]>>;
  verifySegment(empresaId: string, year: number, month: number): Promise<Result<ChainVerifyResult>>;
  findAnchor(empresaId: string, year: number, month: number): Promise<Result<ChainAnchor | null>>;
  createNextPartition(): Promise<Result<string>>;
  dropExpiredPartition(partitionName: string): Promise<Result<string>>;
}
