import type { Result } from '@/core/domain/entities/types';
import type { IExportRepository } from '../../domain/interfaces/IExportRepository';
import type { Readable } from 'stream';

export interface GenerarResumenParcialOutput {
  stream: Readable;
  contentType: string;
  filename: string;
}

// Art. 12.4.c ET — monthly summary for part-time employees, delivered with payslip
export class GenerarResumenParcialUseCase {
  constructor(private readonly exportRepo: IExportRepository) {}

  async execute(
    empresaId: string,
    year: number,
    month: number,
  ): Promise<Result<GenerarResumenParcialOutput>> {
    return this.exportRepo.generateResumenParcialStream(empresaId, year, month);
  }
}
