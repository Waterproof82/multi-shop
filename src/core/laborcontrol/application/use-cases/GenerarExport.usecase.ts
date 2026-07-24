import type { Result } from '@/core/domain/entities/types';
import type { ExportQuery } from '../../domain/types';
import type { IExportRepository } from '../../domain/interfaces/IExportRepository';
import type { Readable } from 'stream';

export interface GenerarExportOutput {
  stream: Readable;
  contentType: string;
  filename: string;
}

export class GenerarExportUseCase {
  constructor(private readonly exportRepo: IExportRepository) {}

  async execute(
    empresaId: string,
    query: Omit<ExportQuery, 'empresaId'>,
  ): Promise<Result<GenerarExportOutput>> {
    return this.exportRepo.generateStream({ ...query, empresaId });
  }
}
