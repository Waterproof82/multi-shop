import { describe, it, expect } from 'vitest';
import { reordenarPorArrastre } from '../../src/lib/menu-virtual-reorder';

describe('reordenarPorArrastre', () => {
  it('mueve el nodo arrastrado a la posición del nodo soltado y reindexa orden 0..n-1', () => {
    const nodos = [
      { id: 'a', orden: 0 },
      { id: 'b', orden: 1 },
      { id: 'c', orden: 2 },
    ];

    const resultado = reordenarPorArrastre(nodos, 'a', 'c');

    expect(resultado.map(n => n.id)).toEqual(['b', 'c', 'a']);
    expect(resultado.map(n => n.orden)).toEqual([0, 1, 2]);
  });

  it('devuelve el array sin cambios si activeId y overId son el mismo nodo', () => {
    const nodos = [{ id: 'a', orden: 0 }, { id: 'b', orden: 1 }];

    const resultado = reordenarPorArrastre(nodos, 'a', 'a');

    expect(resultado).toBe(nodos);
  });

  it('devuelve el array sin cambios si algún id no existe en la lista', () => {
    const nodos = [{ id: 'a', orden: 0 }, { id: 'b', orden: 1 }];

    const resultado = reordenarPorArrastre(nodos, 'a', 'inexistente');

    expect(resultado).toBe(nodos);
  });

  it('preserva campos extra de cada nodo (no solo id/orden)', () => {
    const nodos = [
      { id: 'a', orden: 0, nombre: 'Bebidas' },
      { id: 'b', orden: 1, nombre: 'Postres' },
    ];

    const resultado = reordenarPorArrastre(nodos, 'a', 'b');

    expect(resultado.find(n => n.id === 'a')?.nombre).toBe('Bebidas');
  });
});
