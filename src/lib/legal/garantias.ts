import { GARANTIA_NUEVO_MESES, MIN_SEGUNDA_MANO_MESES } from '@/core/domain/legal/constantes';
import type { GarantiaFila } from '@/core/domain/entities/empresa-legal';

const FILA_POR_DEFECTO: GarantiaFila = {
  ambito: 'Todos los productos',
  estado: 'nuevo',
  mesesLegales: GARANTIA_NUEVO_MESES,
  mesesComercialesExtra: 0,
};

function normalizar(fila: GarantiaFila): GarantiaFila {
  if (fila.estado === 'nuevo') return { ...fila, mesesLegales: GARANTIA_NUEVO_MESES };
  return { ...fila, mesesLegales: Math.max(fila.mesesLegales, MIN_SEGUNDA_MANO_MESES) };
}

/**
 * Filas que pinta la página de devoluciones. Normaliza de nuevo aunque el DTO
 * ya valide: una fila escrita antes de un cambio de ley o a mano en la BD no
 * debe llegar nunca al consumidor por debajo del mínimo legal.
 */
export function garantiasVisibles(filas: readonly GarantiaFila[]): GarantiaFila[] {
  if (filas.length === 0) return [FILA_POR_DEFECTO];
  return filas.map(normalizar);
}

export function formatMeses(meses: number): string {
  if (meses <= 0) return '—';
  if (meses % 12 === 0) {
    const anios = meses / 12;
    return anios === 1 ? '1 año' : `${anios} años`;
  }
  return meses === 1 ? '1 mes' : `${meses} meses`;
}
