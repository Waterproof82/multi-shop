import { SupabaseClient } from "@supabase/supabase-js";
import { Result, PedidoItem } from "@/core/domain/entities/types";
import { IHistorialRepository, FilaRetencionEmpresa } from "@/core/domain/repositories/IHistorialRepository";
import type { PedidoHistorial } from "@/lib/empresa/historial-csv";
import { logger } from "@/core/infrastructure/logging/logger";

interface FilaRetencionDb {
  empresa_id: string;
  apartado: string;
  ejercicio: number;
  registros: number | string;
}

interface PedidoHistorialDb {
  numero_pedido: number;
  created_at: string;
  estado: string;
  origen: string | null;
  modalidad_entrega_nombre: string | null;
  total: number | string;
  total_sin_descuento: number | string | null;
  descuento_porcentaje: number | string | null;
  moneda: string | null;
  payment_status: string | null;
  detalle_pedido: PedidoItem[] | null;
}

function numeroONull(v: number | string | null): number | null {
  return v === null ? null : Number(v);
}

function toPedidoHistorial(row: PedidoHistorialDb): PedidoHistorial {
  return {
    numeroPedido: row.numero_pedido,
    createdAt: row.created_at,
    estado: row.estado,
    origen: row.origen,
    modalidadEntregaNombre: row.modalidad_entrega_nombre,
    total: Number(row.total),
    totalSinDescuento: numeroONull(row.total_sin_descuento),
    descuentoPorcentaje: numeroONull(row.descuento_porcentaje),
    moneda: row.moneda ?? 'EUR',
    paymentStatus: row.payment_status,
    detalle: (row.detalle_pedido ?? []).map((i) => ({ nombre: i.nombre, precio: i.precio, cantidad: i.cantidad })),
  };
}

/** Inicio del ejercicio en hora de Madrid, como instante ISO (mismo criterio que `retencion_resumen`). */
function inicioEjercicioMadrid(ejercicio: number): string {
  // 1 de enero a las 00:00 en Madrid es siempre 23:00 UTC del 31/12 (CET, sin horario de verano).
  return new Date(Date.UTC(ejercicio - 1, 11, 31, 23, 0, 0)).toISOString();
}

const PAGINA = 1000;

export class SupabaseHistorialRepository implements IHistorialRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async resumenRetencion(empresaId: string | null): Promise<Result<FilaRetencionEmpresa[]>> {
    try {
      const { data, error } = await this.supabase.rpc('retencion_resumen', { p_empresa_id: empresaId });
      if (error) {
        await logger.logAndReturnError(
          'DB_SELECT_ERROR',
          error.message,
          'repository',
          'SupabaseHistorialRepository.resumenRetencion',
          { details: { empresaId, code: error.code } }
        );
        return {
          success: false,
          error: { code: 'DB_ERROR', message: 'Error al obtener el resumen de conservación', module: 'repository', method: 'resumenRetencion' },
        };
      }
      const filas = ((data ?? []) as FilaRetencionDb[]).map((f) => ({
        empresaId: f.empresa_id,
        apartado: f.apartado,
        ejercicio: f.ejercicio,
        registros: Number(f.registros),
      }));
      return { success: true, data: filas };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseHistorialRepository.resumenRetencion', { empresaId: empresaId ?? undefined });
      return { success: false, error: appError };
    }
  }

  async pedidosDeEjercicio(empresaId: string, ejercicio: number): Promise<Result<PedidoHistorial[]>> {
    try {
      const filas: PedidoHistorialDb[] = [];
      for (let desde = 0; ; desde += PAGINA) {
        const { data, error } = await this.paginaDePedidos(empresaId, ejercicio, desde);
        if (error) return await this.errorPedidos(error, empresaId, ejercicio);
        filas.push(...data);
        if (data.length < PAGINA) break;
      }
      return { success: true, data: filas.map(toPedidoHistorial) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'repository', 'SupabaseHistorialRepository.pedidosDeEjercicio', { empresaId, details: { ejercicio } });
      return { success: false, error: appError };
    }
  }

  // PostgREST corta en 1000 filas: sin paginar, el CSV de un año saldría truncado sin aviso.
  private async paginaDePedidos(empresaId: string, ejercicio: number, desde: number) {
    const { data, error } = await this.supabase
      .from('pedidos')
      .select('numero_pedido, created_at, estado, origen, modalidad_entrega_nombre, total, total_sin_descuento, descuento_porcentaje, moneda, payment_status, detalle_pedido')
      .eq('empresa_id', empresaId)
      .eq('es_prueba', false)
      .gte('created_at', inicioEjercicioMadrid(ejercicio))
      .lt('created_at', inicioEjercicioMadrid(ejercicio + 1))
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(desde, desde + PAGINA - 1);
    return { data: (data ?? []) as PedidoHistorialDb[], error };
  }

  private async errorPedidos(
    error: { message: string; code?: string },
    empresaId: string,
    ejercicio: number,
  ): Promise<Result<PedidoHistorial[]>> {
    await logger.logAndReturnError(
      'DB_SELECT_ERROR',
      error.message,
      'repository',
      'SupabaseHistorialRepository.pedidosDeEjercicio',
      { details: { empresaId, ejercicio, code: error.code } }
    );
    return {
      success: false,
      error: { code: 'DB_ERROR', message: 'Error al obtener los pedidos del ejercicio', module: 'repository', method: 'pedidosDeEjercicio' },
    };
  }
}
