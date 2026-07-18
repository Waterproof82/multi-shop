import { IAnalyticsRepository } from '@/core/domain/repositories/IAnalyticsRepository';
import {
  AnalyticsPeriodParams,
  FoodCostAnalyticsResponse,
  OcupacionHeatmapRow,
  CierreTurnoReport,
  ComparisonPeriodParams,
  DeltaKpi,
  MargenProductoRow,
} from '@/core/domain/entities/analytics-types';
import { Result } from '@/core/domain/entities/types';

function computeDeltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100 * 10) / 10;
}

function aggregateKpis(items: MargenProductoRow[]): {
  totalVentasCents: number;
  numCovers: number;
  ticketMedioCents: number;
  margenPorcentaje: number;
} {
  const totalVentasCents = items.reduce(
    (sum, i) => sum + i.contribucionTotalCents + i.costeRecetaCents * i.unidadesVendidas,
    0
  );
  const numCovers = items.reduce((sum, i) => sum + i.unidadesVendidas, 0);
  const ticketMedioCents = numCovers > 0 ? Math.round(totalVentasCents / numCovers) : 0;
  const totalCost = items.reduce((sum, i) => sum + i.costeRecetaCents * i.unidadesVendidas, 0);
  const margenPorcentaje =
    totalVentasCents > 0
      ? Math.round(((totalVentasCents - totalCost) / totalVentasCents) * 100 * 10) / 10
      : 0;
  return { totalVentasCents, numCovers, ticketMedioCents, margenPorcentaje };
}

export class AnalyticsUseCase {
  constructor(private readonly repo: IAnalyticsRepository) {}

  async getFoodCostTeorico(params: AnalyticsPeriodParams) {
    return this.repo.foodCostTeorico(params);
  }

  async getFoodCostReal(params: AnalyticsPeriodParams) {
    return this.repo.foodCostReal(params);
  }

  async getMargenProductos(params: AnalyticsPeriodParams) {
    return this.repo.margenProductos(params);
  }

  async getOcupacionHeatmap(
    params: AnalyticsPeriodParams
  ): Promise<Result<OcupacionHeatmapRow[]>> {
    return this.repo.ocupacionHeatmap(params);
  }

  async getCierreReporte(turnoId: string): Promise<Result<CierreTurnoReport>> {
    return this.repo.cierreReporte(turnoId);
  }

  async getComparativa(params: ComparisonPeriodParams): Promise<Result<DeltaKpi[]>> {
    const [resultA, resultB] = await Promise.all([
      this.repo.margenProductos({
        empresaId: params.empresaId,
        desde: params.periodoA.desde,
        hasta: params.periodoA.hasta,
      }),
      this.repo.margenProductos({
        empresaId: params.empresaId,
        desde: params.periodoB.desde,
        hasta: params.periodoB.hasta,
      }),
    ]);

    if (!resultA.success) return resultA;
    if (!resultB.success) return resultB;

    const kpisA = aggregateKpis(resultA.data);
    const kpisB = aggregateKpis(resultB.data);

    const kpis: DeltaKpi[] = [
      {
        label: 'Ventas totales',
        currentCents: kpisA.totalVentasCents,
        previousCents: kpisB.totalVentasCents,
        deltaPercent: computeDeltaPercent(kpisA.totalVentasCents, kpisB.totalVentasCents),
      },
      {
        label: 'Covers',
        currentCents: kpisA.numCovers,
        previousCents: kpisB.numCovers,
        deltaPercent: computeDeltaPercent(kpisA.numCovers, kpisB.numCovers),
      },
      {
        label: 'Ticket medio',
        currentCents: kpisA.ticketMedioCents,
        previousCents: kpisB.ticketMedioCents,
        deltaPercent: computeDeltaPercent(kpisA.ticketMedioCents, kpisB.ticketMedioCents),
      },
      {
        label: 'Margen %',
        currentCents: kpisA.margenPorcentaje,
        previousCents: kpisB.margenPorcentaje,
        deltaPercent: computeDeltaPercent(kpisA.margenPorcentaje, kpisB.margenPorcentaje),
      },
    ];

    return { success: true, data: kpis };
  }

  async getFoodCostAnalytics(
    params: AnalyticsPeriodParams
  ): Promise<Result<FoodCostAnalyticsResponse>> {
    const [teoricoResult, realResult] = await Promise.all([
      this.repo.foodCostTeorico(params),
      this.repo.foodCostReal(params),
    ]);

    if (!teoricoResult.success) return teoricoResult;
    if (!realResult.success) return realResult;

    const itemsSinProducto = teoricoResult.data[0]?.itemsSinProducto ?? 0;

    return {
      success: true,
      data: {
        teorico: teoricoResult.data,
        real: realResult.data,
        itemsSinProducto,
      },
    };
  }
}
