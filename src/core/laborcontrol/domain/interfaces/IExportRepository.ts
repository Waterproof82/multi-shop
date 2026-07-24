import type { Result } from '@/core/domain/entities/types';
import type { ExportQuery } from '../types';
import type { Readable } from 'stream';

export interface IExportRepository {
  generateStream(query: ExportQuery): Promise<Result<{ stream: Readable; contentType: string; filename: string }>>;
  generateResumenParcialStream(empresaId: string, year: number, month: number): Promise<Result<{ stream: Readable; contentType: string; filename: string }>>;
}
