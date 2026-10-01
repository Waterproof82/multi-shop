import { Result } from "@/core/domain/entities/types";
import type { FilaRetencion } from "@/lib/empresa/retencion";
import type { PedidoHistorial } from "@/lib/empresa/historial-csv";

export interface FilaRetencionEmpresa extends FilaRetencion {
  empresaId: string;
}

export interface IHistorialRepository {
  /** Conteos por empresa, apartado y ejercicio. `null` = todas las empresas (solo superadmin). */
  resumenRetencion(empresaId: string | null): Promise<Result<FilaRetencionEmpresa[]>>;
  pedidosDeEjercicio(empresaId: string, ejercicio: number): Promise<Result<PedidoHistorial[]>>;
}
