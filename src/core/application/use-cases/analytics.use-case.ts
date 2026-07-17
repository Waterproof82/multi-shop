import { IAnalyticsRepository } from '@/core/domain/repositories/IAnalyticsRepository';
import {
  AnalyticsPeriodParams,
  FoodCostAnalyticsResponse,
} from '@/core/domain/entities/analytics-types';
import { Result } from '@/core/domain/entities/types';

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
