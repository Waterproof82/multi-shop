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

// BCG Matrix
export type BcgQuadrant = 'star' | 'plow' | 'question' | 'dog';

export interface BcgItem extends MargenProductoRow {
  quadrant: BcgQuadrant;
}

// Occupancy Heatmap
export interface OcupacionHeatmapRow {
  dow: number;          // 0 = Sunday … 6 = Saturday
  hour: number;         // 0–23
  count: number;
  avgDurationMin: number;
}

// Close Report
export interface CierreTurnoTopProducto {
  nombre: string;
  unidades: number;
  ventaCents: number;
}

export interface CierreTurnoMovimientoStock {
  ingrediente: string;
  cantidadMerma: number;
  coste: number;
}

export interface CierreTurnoReport {
  turnoId: string;
  abiertaAt: string;
  cerradaAt: string | null;
  operadorNombre: string;
  totalVentasCents: number;
  totalEfectivoCents: number;
  totalTarjetaCents: number;
  totalPropinaCents: number;
  numCovers: number;
  ticketMedioCents: number;
  topProductos: CierreTurnoTopProducto[];
  movimientosStock: CierreTurnoMovimientoStock[];
  totalMermasCents: number;
}

// Period Comparison
export interface ComparisonPeriodParams {
  empresaId: string;
  periodoA: { desde: string; hasta: string };
  periodoB: { desde: string; hasta: string };
}

export interface DeltaKpi {
  label: string;
  currentCents: number;
  previousCents: number;
  deltaPercent: number | null; // null = N/A (division by zero)
}
