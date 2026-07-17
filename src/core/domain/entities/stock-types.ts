export type UnidadMedida = 'kg' | 'l' | 'ud';
export type TipoMovimiento = 'entrada' | 'deduccion' | 'ajuste' | 'merma' | 'sin_receta';
export type MotivoMerma = 'caducidad' | 'rotura' | 'error_preparacion' | 'otro';

export interface Ingrediente {
  id: string;
  empresaId: string;
  nombre: string;
  unidad: UnidadMedida;
  cantidadActual: number;
  umbralAlerta: number;
  precioCmpCents: number; // Weighted average cost (CMP) in cents. 0 = never received.
  createdAt: string;
}

export interface RecetaItem {
  id: string;
  productoId: string;
  ingredienteId: string;
  cantidadNecesaria: number;
}

export interface MovimientoStock {
  id: string;
  empresaId: string;
  ingredienteId: string | null;
  tipo: TipoMovimiento;
  cantidad: number;
  referenciaId: string | null;
  turnoId: string | null;
  precioUnitarioCmpCents: number | null; // CMP snapshot at insert time. null for pre-migration rows.
  createdAt: string;
}

export interface Merma {
  id: string;
  empresaId: string;
  ingredienteId: string;
  cantidad: number;
  motivo: MotivoMerma;
  turnoId: string | null;
  operadorNombre: string;
  notas: string | null;
  createdAt: string;
}

export interface RegistrarMermaPayload {
  empresaId: string;
  ingredienteId: string;
  cantidad: number;
  motivo: MotivoMerma;
  turnoId: string | null;
  operadorNombre: string;
  notas?: string;
}

export interface AjustarStockPayload {
  empresaId: string;
  ingredienteId: string;
  delta: number;
  tipo: 'entrada' | 'ajuste';
  turnoId?: string;
}
