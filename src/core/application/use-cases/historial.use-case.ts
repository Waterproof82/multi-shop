import { Result } from "@/core/domain/entities/types";
import { IHistorialRepository, FilaRetencionEmpresa } from "@/core/domain/repositories/IHistorialRepository";
import { pedidosACsv } from "@/lib/empresa/historial-csv";
import { logger } from "@/core/infrastructure/logging/logger";

/** Conservación de registros por ejercicio: cuenta atrás y descarga. */
export class HistorialUseCase {
  constructor(private readonly historialRepo: IHistorialRepository) {}

  /** `null` = todas las empresas. Solo debe llamarlo el superadmin. */
  async resumenRetencion(empresaId: string | null): Promise<Result<FilaRetencionEmpresa[]>> {
    try {
      const result = await this.historialRepo.resumenRetencion(empresaId);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'HistorialUseCase.resumenRetencion' } };
      }
      return { success: true, data: result.data };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'HistorialUseCase.resumenRetencion', { empresaId: empresaId ?? undefined });
      return { success: false, error: appError };
    }
  }

  async exportarPedidosCsv(empresaId: string, ejercicio: number): Promise<Result<string>> {
    try {
      const result = await this.historialRepo.pedidosDeEjercicio(empresaId, ejercicio);
      if (!result.success) {
        return { success: false, error: { ...result.error, method: 'HistorialUseCase.exportarPedidosCsv' } };
      }
      return { success: true, data: pedidosACsv(result.data) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'HistorialUseCase.exportarPedidosCsv', { empresaId, details: { ejercicio } });
      return { success: false, error: appError };
    }
  }
}
