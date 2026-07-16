// src/core/domain/entities/analytics-types.ts

export interface FoodCostTeoricoRow {
  productoId: string;
  nombreProducto: string;
  unidadesVendidas: number;
  costeRecetaCents: number;
  costeTotalTeoricoCents: number;
  itemsSinProducto: number;
}

export interface FoodCostRealRow {
  ingredienteId: string;
  nombre: string;
  consumoQty: number;
  costeTotalCents: number;
}

export interface MargenProductoRow {
  productoId: string;
  nombre: string;
  precioVentaCents: number;
  costeRecetaCents: number;
  margenBrutoCents: number;
  margenPorcentaje: number;
  unidadesVendidas: number;
  contribucionTotalCents: number;
}

export interface AnalyticsPeriodParams {
  empresaId: string;
  desde: string; // ISO timestamp
  hasta: string; // ISO timestamp
}

export interface FoodCostAnalyticsResponse {
  teorico: FoodCostTeoricoRow[];
  real: FoodCostRealRow[];
  itemsSinProducto: number;
}

export interface RentabilidadResponse {
  items: MargenProductoRow[];
}
