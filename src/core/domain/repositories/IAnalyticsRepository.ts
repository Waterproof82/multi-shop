// src/core/domain/repositories/IAnalyticsRepository.ts

import type { Result } from '@/core/domain/entities/types';
import type {
  FoodCostTeoricoRow,
  FoodCostRealRow,
  MargenProductoRow,
  AnalyticsPeriodParams,
} from '@/core/domain/entities/analytics-types';

export interface IAnalyticsRepository {
  foodCostTeorico(
    params: AnalyticsPeriodParams
  ): Promise<Result<FoodCostTeoricoRow[]>>;

  foodCostReal(
    params: AnalyticsPeriodParams
  ): Promise<Result<FoodCostRealRow[]>>;

  margenProductos(
    params: AnalyticsPeriodParams
  ): Promise<Result<MargenProductoRow[]>>;
}
