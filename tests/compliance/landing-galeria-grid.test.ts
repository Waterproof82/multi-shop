import { describe, it, expect } from 'vitest';
import { gridGaleriaClass, itemGaleriaClass } from '@/components/landing/galeria-section';

// La rejilla de la galería se adapta al número de fotos para que la última
// fila quede siempre completa (el admin admite hasta 20 fotos).

function celdas(clase: string, prefijo: '' | 'md:'): number {
  const tokens = clase.split(' ');
  const ancho = tokens.includes(`${prefijo}col-span-2`) ? 2 : 1;
  const alto = tokens.includes(`${prefijo}row-span-2`) ? 2 : 1;
  return ancho * alto;
}

function columnasEscritorio(grid: string): number {
  if (grid.includes('md:grid-cols-4') || grid.includes('lg:grid-cols-4')) return 4;
  if (grid.includes('md:grid-cols-3')) return 3;
  if (grid.includes('grid-cols-1')) return 1;
  return 2;
}

// En escritorio: la clase de movil `col-span-2` no cuenta si hay override md:
function celdasEscritorio(clase: string): number {
  if (clase.includes('md:col-span-1')) return 1;
  return celdas(clase, 'md:');
}

describe('galería de la landing — rejilla sin huecos', () => {
  for (let total = 1; total <= 20; total++) {
    it(`${total} foto(s): filas completas en móvil y escritorio`, () => {
      const grid = gridGaleriaClass(total);
      const items = Array.from({ length: total }, (_, idx) => itemGaleriaClass(total, idx));

      const colsMovil = total === 1 ? 1 : 2;
      const movil = items.reduce((acc, c) => acc + celdas(c.split(' ').filter((t) => !t.includes(':')).join(' '), ''), 0);
      expect(movil % colsMovil).toBe(0);

      const cols = columnasEscritorio(grid);
      const escritorio = items.reduce((acc, c) => acc + celdasEscritorio(c), 0);
      expect(escritorio % cols).toBe(0);
    });
  }

  it('5 fotos: la primera destacada 2x2 en escritorio', () => {
    expect(itemGaleriaClass(5, 0)).toContain('md:row-span-2');
  });

  it('6 fotos: 3 columnas limpias en escritorio', () => {
    expect(gridGaleriaClass(6)).toContain('md:grid-cols-3');
  });
});
