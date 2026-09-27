import { describe, it, expect } from 'vitest';
import {
  CADUCIDAD_CARRITO_MS,
  claveCarritoGuardado,
  debePersistirCarrito,
  restaurarCarrito,
  serializarCarrito,
} from '@/lib/carrito-guardado';
import type { MenuItemVM } from '@/core/application/dtos/menu-view-model';
import type { CartItem } from '@/lib/cart-context';

const AHORA = Date.UTC(2026, 8, 27, 12, 0, 0);

function producto(over: Partial<MenuItemVM> = {}): MenuItemVM {
  return { id: 'p1', name: 'Bateria A', price: 100, category: 'c1', ...over };
}

const conComplementos = producto({
  id: 'p2',
  name: 'Pizza',
  price: 10,
  complements: [{ id: 'c-legacy', name: 'Extra queso', price: 1 }],
  complementGroups: [
    { id: 'g1', name: 'Masa', tipo: 'radio', obligatorio: true, opciones: [{ id: 'o-fina', name: 'Fina', price: 0.5 }] },
  ],
});

function linea(item: MenuItemVM, over: Partial<CartItem> = {}): CartItem {
  return { cartId: 'x', item, quantity: 1, ...over };
}

describe('debePersistirCarrito — solo la tienda publica', () => {
  const base = { showCart: true, isWaiterMode: false, esRestaurante: false, mesaId: null, search: '' };

  it('tienda normal con carrito: si', () => {
    expect(debePersistirCarrito(base)).toBe(true);
  });

  it('sin carrito (carta solo informativa): no', () => {
    expect(debePersistirCarrito({ ...base, showCart: false })).toBe(false);
  });

  // En un restaurante el pedido se hace en el momento (mesa, barra, recogida):
  // resucitar un carrito de otro dia no tiene sentido (decision del usuario).
  it('empresa restaurante: NUNCA, aunque no haya mesa', () => {
    expect(debePersistirCarrito({ ...base, esRestaurante: true })).toBe(false);
  });

  it('camarero: NUNCA (el carrito es de una mesa; resucitarlo lo llevaria a otra)', () => {
    expect(debePersistirCarrito({ ...base, isWaiterMode: true })).toBe(false);
  });

  it('comensal en mesa via contexto: no', () => {
    expect(debePersistirCarrito({ ...base, mesaId: 'm1' })).toBe(false);
  });

  // useMesaId lee ?mesa= en un efecto: en el primer render da null. Si solo
  // miraramos mesaId, restaurariamos un carrito de tienda dentro de una mesa.
  it('comensal en mesa via ?mesa= aunque mesaId aun sea null: no', () => {
    expect(debePersistirCarrito({ ...base, search: '?mesa=m1' })).toBe(false);
  });
});

describe('claveCarritoGuardado', () => {
  it('es por empresa (no se mezclan carritos entre tenants)', () => {
    expect(claveCarritoGuardado('e1')).not.toBe(claveCarritoGuardado('e2'));
  });
});

describe('serializarCarrito — guarda lo minimo', () => {
  it('no guarda precio, nombre ni imagen: solo ids, cantidad y nota', () => {
    const raw = serializarCarrito(
      [linea(conComplementos, { quantity: 2, selectedComplements: [{ id: 'o-fina', name: 'Fina', price: 0.5 }], note: 'sin cebolla' })],
      AHORA,
    );
    expect(raw).not.toContain('Pizza');
    expect(raw).not.toContain('"price"');
    expect(JSON.parse(raw)).toEqual({
      v: 1,
      guardadoEn: AHORA,
      lineas: [{ productoId: 'p2', cantidad: 2, complementoIds: ['o-fina'], nota: 'sin cebolla' }],
    });
  });

  it('no guarda lineas que se estan borrando (animacion de salida)', () => {
    const raw = serializarCarrito([linea(producto(), { justRemoved: true })], AHORA);
    expect(JSON.parse(raw).lineas).toEqual([]);
  });
});

describe('restaurarCarrito — reconstruye contra la carta ACTUAL', () => {
  const guardar = (items: CartItem[], cuando = AHORA) => serializarCarrito(items, cuando);

  it('ida y vuelta con el producto y precio vigentes', () => {
    const raw = guardar([linea(producto(), { quantity: 3 })]);
    const actual = producto({ price: 120 });
    expect(restaurarCarrito(raw, [actual], AHORA)).toEqual([
      { item: actual, cantidad: 3, complementos: undefined, nota: undefined },
    ]);
  });

  it('resuelve complementos por id (legacy y grupos) con su precio vigente', () => {
    const raw = guardar([linea(conComplementos, {
      selectedComplements: [{ id: 'c-legacy', name: 'x', price: 99 }, { id: 'o-fina', name: 'y', price: 99 }],
    })]);
    const [l] = restaurarCarrito(raw, [conComplementos], AHORA);
    expect(l.complementos).toEqual([
      { id: 'c-legacy', name: 'Extra queso', price: 1 },
      { id: 'o-fina', name: 'Fina', price: 0.5 },
    ]);
  });

  it('descarta la linea si el producto ya no esta en la carta (inactivo o borrado)', () => {
    const raw = guardar([linea(producto()), linea(conComplementos)]);
    expect(restaurarCarrito(raw, [conComplementos], AHORA).map(l => l.item.id)).toEqual(['p2']);
  });

  it('descarta la linea si un complemento elegido ya no existe (no cambiar la eleccion en silencio)', () => {
    const raw = guardar([linea(conComplementos, { selectedComplements: [{ id: 'o-borrada', name: 'z', price: 0 }] })]);
    expect(restaurarCarrito(raw, [conComplementos], AHORA)).toEqual([]);
  });

  it('caduca a los 7 dias', () => {
    const raw = guardar([linea(producto())], AHORA - CADUCIDAD_CARRITO_MS - 1);
    expect(restaurarCarrito(raw, [producto()], AHORA)).toEqual([]);
    const reciente = guardar([linea(producto())], AHORA - CADUCIDAD_CARRITO_MS + 1000);
    expect(restaurarCarrito(reciente, [producto()], AHORA)).toHaveLength(1);
  });

  it.each([
    ['null', null],
    ['vacio', ''],
    ['JSON roto', '{no json'],
    ['version desconocida', JSON.stringify({ v: 99, guardadoEn: AHORA, lineas: [] })],
    ['forma rara', JSON.stringify({ v: 1, guardadoEn: AHORA, lineas: 'nope' })],
  ])('entrada invalida (%s): carrito vacio, sin lanzar', (_n, raw) => {
    expect(restaurarCarrito(raw, [producto()], AHORA)).toEqual([]);
  });

  it('descarta cantidades manipuladas (no enteras, <1 o absurdas)', () => {
    const raw = JSON.stringify({
      v: 1, guardadoEn: AHORA,
      lineas: [
        { productoId: 'p1', cantidad: 0, complementoIds: [] },
        { productoId: 'p1', cantidad: 1.5, complementoIds: [] },
        { productoId: 'p1', cantidad: 1000, complementoIds: [] },
        { productoId: 'p1', cantidad: 2, complementoIds: [] },
      ],
    });
    expect(restaurarCarrito(raw, [producto()], AHORA).map(l => l.cantidad)).toEqual([2]);
  });
});
