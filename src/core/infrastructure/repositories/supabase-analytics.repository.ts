import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { IAnalyticsRepository } from '@/core/domain/repositories/IAnalyticsRepository';
import {
  FoodCostTeoricoRow,
  FoodCostRealRow,
  MargenProductoRow,
  AnalyticsPeriodParams,
  OcupacionHeatmapRow,
  CierreTurnoReport,
  CierreTurnoTopProducto,
  CierreTurnoMovimientoStock,
} from '@/core/domain/entities/analytics-types';
import { Result } from '@/core/domain/entities/types';
import { logger } from '../logging/logger';

export class SupabaseAnalyticsRepository implements IAnalyticsRepository {
  async foodCostTeorico(
    params: AnalyticsPeriodParams
  ): Promise<Result<FoodCostTeoricoRow[]>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc('analytics_food_cost_teorico', {
        p_empresa_id: params.empresaId,
        p_desde: params.desde,
        p_hasta: params.hasta,
      });

      if (error) {
        return {
          success: false,
          error: await logger.logFromCatch(error, 'repository', 'foodCostTeorico'),
        };
      }

      const rows = (data as Record<string, unknown>[]) ?? [];
      return {
        success: true,
        data: rows.map((row) => ({
          productoId: row.producto_id as string,
          nombreProducto: row.nombre as string,
          unidadesVendidas: Number(row.unidades_vendidas),
          costeRecetaCents: Number(row.coste_receta_cents),
          costeTotalTeoricoCents: Number(row.coste_total_teorico_cents),
          itemsSinProducto: Number(row.items_sin_producto),
        })),
      };
    } catch (e) {
      return {
        success: false,
        error: await logger.logFromCatch(e, 'repository', 'foodCostTeorico'),
      };
    }
  }

  async foodCostReal(
    params: AnalyticsPeriodParams
  ): Promise<Result<FoodCostRealRow[]>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc('analytics_food_cost_real', {
        p_empresa_id: params.empresaId,
        p_desde: params.desde,
        p_hasta: params.hasta,
      });

      if (error) {
        return {
          success: false,
          error: await logger.logFromCatch(error, 'repository', 'foodCostReal'),
        };
      }

      const rows = (data as Record<string, unknown>[]) ?? [];
      return {
        success: true,
        data: rows.map((row) => ({
          ingredienteId: row.ingrediente_id as string,
          nombre: row.nombre as string,
          consumoQty: Number(row.consumo_qty),
          costeTotalCents: Number(row.coste_total_cents),
        })),
      };
    } catch (e) {
      return {
        success: false,
        error: await logger.logFromCatch(e, 'repository', 'foodCostReal'),
      };
    }
  }

  async margenProductos(
    params: AnalyticsPeriodParams
  ): Promise<Result<MargenProductoRow[]>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc('analytics_margen_productos', {
        p_empresa_id: params.empresaId,
        p_desde: params.desde,
        p_hasta: params.hasta,
      });

      if (error) {
        return {
          success: false,
          error: await logger.logFromCatch(error, 'repository', 'margenProductos'),
        };
      }

      const rows = (data as Record<string, unknown>[]) ?? [];
      return {
        success: true,
        data: rows.map((row) => ({
          productoId: row.producto_id as string,
          nombre: row.nombre as string,
          precioVentaCents: Number(row.precio_venta_cents),
          costeRecetaCents: Number(row.coste_receta_cents),
          margenBrutoCents: Number(row.margen_bruto_cents),
          margenPorcentaje: Number(row.margen_porcentaje) || 0,
          unidadesVendidas: Number(row.unidades_vendidas),
          contribucionTotalCents: Number(row.contribucion_total_cents),
        })),
      };
    } catch (e) {
      return {
        success: false,
        error: await logger.logFromCatch(e, 'repository', 'margenProductos'),
      };
    }
  }

  async ocupacionHeatmap(
    params: AnalyticsPeriodParams
  ): Promise<Result<OcupacionHeatmapRow[]>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc('analytics_ocupacion_heatmap', {
        p_empresa_id: params.empresaId,
        p_desde: params.desde,
        p_hasta: params.hasta,
      });

      if (error) {
        return {
          success: false,
          error: await logger.logFromCatch(error, 'repository', 'ocupacionHeatmap'),
        };
      }

      const rows = (data as Record<string, unknown>[]) ?? [];
      return {
        success: true,
        data: rows.map((row) => ({
          dow: Number(row.dow),
          hour: Number(row.hour),
          count: Number(row.count),
          avgDurationMin: Number(row.avg_duration_min) || 0,
        })),
      };
    } catch (e) {
      return {
        success: false,
        error: await logger.logFromCatch(e, 'repository', 'ocupacionHeatmap'),
      };
    }
  }

  async cierreReporte(turnoId: string): Promise<Result<CierreTurnoReport>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc('analytics_cierre_turno', {
        p_turno_id: turnoId,
      });

      if (error) {
        return {
          success: false,
          error: await logger.logFromCatch(error, 'repository', 'cierreReporte'),
        };
      }

      const rows = (data as Record<string, unknown>[]) ?? [];
      if (rows.length === 0) {
        return {
          success: false,
          error: await logger.logFromCatch(
            new Error(`Turno ${turnoId} no encontrado`),
            'repository',
            'cierreReporte'
          ),
        };
      }

      const row = rows[0];
      const topProductos = (row.top_productos as CierreTurnoTopProducto[] | null) ?? [];
      const movimientosStock =
        (row.movimientos_stock as CierreTurnoMovimientoStock[] | null) ?? [];

      return {
        success: true,
        data: {
          turnoId: row.turno_id as string,
          abiertaAt: row.abierta_at as string,
          cerradaAt: (row.cerrada_at as string | null) ?? null,
          operadorNombre: row.operador_nombre as string,
          totalVentasCents: Number(row.total_ventas_cents),
          totalEfectivoCents: Number(row.total_efectivo_cents),
          totalTarjetaCents: Number(row.total_tarjeta_cents),
          totalPropinaCents: Number(row.total_propina_cents),
          numCovers: Number(row.num_covers),
          ticketMedioCents: Number(row.ticket_medio_cents),
          topProductos,
          movimientosStock,
          totalMermasCents: Number(row.total_mermas_cents),
        },
      };
    } catch (e) {
      return {
        success: false,
        error: await logger.logFromCatch(e, 'repository', 'cierreReporte'),
      };
    }
  }
}
