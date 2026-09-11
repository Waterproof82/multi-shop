import { describe, it, expect } from 'vitest';
import {
  mergeKeyFor,
  applyPendingDeleteOverlay,
  withPendingDelete,
  withoutPendingDelete,
  type OrderItem,
} from '@/components/mesa-orders-client';

describe('mergeKeyFor', () => {
  it('combina nombre + precio + complementos ordenados en una key estable', () => {
    expect(
      mergeKeyFor('Tortilla', 5, [
        { nombre: 'Queso', precio: 1 },
        { nombre: 'Bacon', precio: 1 },
      ]),
    ).toBe('Tortilla||5||Bacon,Queso');
  });

  it('el orden de los complementos de entrada no cambia la key', () => {
    const a = mergeKeyFor('Tortilla', 5, [{ nombre: 'Queso', precio: 1 }, { nombre: 'Bacon', precio: 1 }]);
    const b = mergeKeyFor('Tortilla', 5, [{ nombre: 'Bacon', precio: 1 }, { nombre: 'Queso', precio: 1 }]);
    expect(a).toBe(b);
  });

  it('sin complementos, la key termina en ||', () => {
    expect(mergeKeyFor('Agua', 2)).toBe('Agua||2||');
  });
});

describe('withPendingDelete', () => {
  it('agrega una key nueva al mapa', () => {
    const overlay = withPendingDelete(new Map(), 'Tortilla||5||', 2);
    expect(overlay.get('Tortilla||5||')).toBe(2);
  });

  it('acumula sobre una key existente', () => {
    const overlay = withPendingDelete(new Map([['Tortilla||5||', 1]]), 'Tortilla||5||', 2);
    expect(overlay.get('Tortilla||5||')).toBe(3);
  });

  it('no muta el mapa original', () => {
    const original = new Map<string, number>();
    withPendingDelete(original, 'Tortilla||5||', 2);
    expect(original.size).toBe(0);
  });
});

describe('withoutPendingDelete', () => {
  it('al quitar toda la cantidad pendiente, borra la key del mapa', () => {
    const overlay = withoutPendingDelete(new Map([['Tortilla||5||', 2]]), 'Tortilla||5||', 2);
    expect(overlay.has('Tortilla||5||')).toBe(false);
  });

  it('al quitar solo parte, deja el resto', () => {
    const overlay = withoutPendingDelete(new Map([['Tortilla||5||', 3]]), 'Tortilla||5||', 1);
    expect(overlay.get('Tortilla||5||')).toBe(2);
  });

  it('quitar de una key que no existe no rompe (queda en negativo, se trata como 0 en el render)', () => {
    const overlay = withoutPendingDelete(new Map(), 'Tortilla||5||', 1);
    expect(overlay.has('Tortilla||5||')).toBe(false);
  });
});

describe('applyPendingDeleteOverlay', () => {
  const items: OrderItem[] = [
    { nombre: 'Tortilla', precio: 5, cantidad: 3 },
    { nombre: 'Agua', precio: 2, cantidad: 1 },
  ];

  it('sin overlay, devuelve los items tal cual (misma cantidad)', () => {
    const result = applyPendingDeleteOverlay(items, new Map());
    expect(result.map(i => i.cantidad)).toEqual([3, 1]);
  });

  it('resta la cantidad pendiente al item que matchea', () => {
    const result = applyPendingDeleteOverlay(items, new Map([['Tortilla||5||', 1]]));
    expect(result.find(i => i.nombre === 'Tortilla')?.cantidad).toBe(2);
    expect(result.find(i => i.nombre === 'Agua')?.cantidad).toBe(1);
  });

  it('si la cantidad pendiente iguala o supera la cantidad real, el item desaparece', () => {
    const result = applyPendingDeleteOverlay(items, new Map([['Tortilla||5||', 3]]));
    expect(result.find(i => i.nombre === 'Tortilla')).toBeUndefined();
    expect(result).toHaveLength(1);
  });
});
