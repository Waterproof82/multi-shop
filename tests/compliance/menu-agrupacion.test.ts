/**
 * Agrupaciones de la carta pública.
 *
 * POR QUÉ ESTE TEST EXISTE
 * `GetMenuUseCase` tenía complejidad 26 construyendo seis mapas a mano. Las dos
 * piezas que se extrajeron son las que deciden qué ve el comensal:
 *
 *   - `agruparComplementosPorProducto` fija el ORDEN de los grupos. Que aparezca
 *     antes "Punto de la carne" o "Guarnición" lo configura el restaurante en
 *     `asignacion.orden`, no el orden en que la base devuelva las filas.
 *   - `indexarCategoriasComplemento` decide qué complementos se pueden pedir.
 *     Colar aquí un producto desactivado significa vender algo que no hay.
 */
import { describe, it, expect, vi } from 'vitest';

// El módulo importa el logger, que a su vez construye el cliente de Supabase al
// cargarse. Estas pruebas son de funciones puras y no deben depender de que haya
// credenciales ni red: sin este doble, el import arrastra medio sistema.
vi.mock('@/core/infrastructure/logging/logger', () => ({
  logger: { logAndReturnError: vi.fn(), logFromCatch: vi.fn() },
}));

import {
  agruparComplementosPorProducto,
  indexarCategoriasComplemento,
} from '../../src/core/application/use-cases/get-menu.use-case';
import type { Category, Product } from '../../src/core/domain/entities/types';
import type { ComplementoGrupo, ProductoComplementoAsignacion } from '../../src/core/domain/entities/complemento-types';

// Fixtures deliberadamente PARCIALES: `agruparComplementosPorProducto` solo lee
// estos campos, y construir los 11 restantes seria ruido que esconde lo que el
// test mira de verdad. El doble `as unknown as` es feo a proposito — dice en voz
// alta "esto no es un ComplementoGrupo completo", en vez de un `as` simple que
// aparenta que si lo es.
const grupo = (id: string, nombre = id) => ({ id, nombre }) as unknown as ComplementoGrupo;
const asignacion = (productoId: string, grupoId: string, orden: number) =>
  ({ productoId, grupoId, orden }) as unknown as ProductoComplementoAsignacion;

describe('agruparComplementosPorProducto', () => {
  it('respeta el orden configurado, no el de llegada', () => {
    const resultado = agruparComplementosPorProducto(
      [asignacion('p1', 'g-guarnicion', 2), asignacion('p1', 'g-punto', 1)],
      [grupo('g-punto'), grupo('g-guarnicion')],
    );

    expect(resultado.get('p1')?.map(g => g.id)).toEqual(['g-punto', 'g-guarnicion']);
  });

  it('no altera el array de asignaciones que recibe', () => {
    // Ordenar in situ mutaría lo que devolvió el repositorio, que puede estar
    // cacheado y compartido con otras llamadas.
    const asignaciones = [asignacion('p1', 'g2', 2), asignacion('p1', 'g1', 1)];
    agruparComplementosPorProducto(asignaciones, [grupo('g1'), grupo('g2')]);

    expect(asignaciones.map(a => a.grupoId)).toEqual(['g2', 'g1']);
  });

  it('separa los grupos por producto', () => {
    const resultado = agruparComplementosPorProducto(
      [asignacion('p1', 'g1', 1), asignacion('p2', 'g2', 1)],
      [grupo('g1'), grupo('g2')],
    );

    expect(resultado.get('p1')?.map(g => g.id)).toEqual(['g1']);
    expect(resultado.get('p2')?.map(g => g.id)).toEqual(['g2']);
  });

  it('ignora asignaciones a grupos que ya no existen', () => {
    // Borrar un grupo puede dejar asignaciones colgando; sin este descarte se
    // colaría un `undefined` en la lista de complementos del producto.
    const resultado = agruparComplementosPorProducto(
      [asignacion('p1', 'g-borrado', 1), asignacion('p1', 'g1', 2)],
      [grupo('g1')],
    );

    expect(resultado.get('p1')?.map(g => g.id)).toEqual(['g1']);
  });

  it('devuelve un mapa vacío si no hay asignaciones', () => {
    expect(agruparComplementosPorProducto([], [grupo('g1')]).size).toBe(0);
  });
});

const categoriaComplemento = (id: string, padreId: string, extra: Partial<Category> = {}) =>
  ({ id, categoriaComplementoDe: padreId, complementoObligatorio: false, nombre: null, translations: null, ...extra } as Category);

const producto = (id: string, categoriaId: string, activo = true) =>
  ({ id, categoriaId, activo } as Product);

describe('indexarCategoriasComplemento', () => {
  it('asocia los complementos a su categoría padre', () => {
    const indice = indexarCategoriasComplemento(
      [categoriaComplemento('c-salsas', 'c-carnes')],
      [producto('p1', 'c-salsas'), producto('p2', 'c-otra')],
    );

    expect(indice.productos.get('c-carnes')?.map(p => p.id)).toEqual(['p1']);
  });

  it('EXCLUYE los complementos desactivados', () => {
    // Ofrecerlos sería vender algo que el restaurante ha quitado de la carta.
    const indice = indexarCategoriasComplemento(
      [categoriaComplemento('c-salsas', 'c-carnes')],
      [producto('p1', 'c-salsas', true), producto('p2', 'c-salsas', false)],
    );

    expect(indice.productos.get('c-carnes')?.map(p => p.id)).toEqual(['p1']);
  });

  it('acumula complementos de varias categorías sobre el mismo padre', () => {
    const indice = indexarCategoriasComplemento(
      [categoriaComplemento('c-salsas', 'c-carnes'), categoriaComplemento('c-guarnicion', 'c-carnes')],
      [producto('p1', 'c-salsas'), producto('p2', 'c-guarnicion')],
    );

    expect(indice.productos.get('c-carnes')?.map(p => p.id)).toEqual(['p1', 'p2']);
  });

  it('propaga la obligatoriedad, el nombre y las traducciones', () => {
    const indice = indexarCategoriasComplemento(
      [categoriaComplemento('c-salsas', 'c-carnes', {
        complementoObligatorio: true,
        nombre: 'Elige salsa',
        // `Category['translations']` es `{ en?: string }`, NO `{ en?: { nombre } }`
        // (esa es la forma del ítem de carrito, otro tipo). El test pasaba con la
        // forma equivocada porque la función copia el valor sin mirarlo: verificaba
        // la propagación con un valor imposible en producción.
        translations: { en: 'Choose sauce' },
      })],
      [],
    );

    expect(indice.obligatorio.get('c-carnes')).toBe(true);
    expect(indice.nombre.get('c-carnes')).toBe('Elige salsa');
    expect(indice.traducciones.get('c-carnes')).toEqual({ en: 'Choose sauce' });
  });

  it('deja fuera del índice de nombres las categorías sin nombre', () => {
    const indice = indexarCategoriasComplemento([categoriaComplemento('c-salsas', 'c-carnes')], []);

    expect(indice.nombre.has('c-carnes')).toBe(false);
    expect(indice.traducciones.has('c-carnes')).toBe(false);
  });

  it('ignora categorías sin padre declarado', () => {
    const indice = indexarCategoriasComplemento(
      [categoriaComplemento('c-huerfana', '' as string)],
      [producto('p1', 'c-huerfana')],
    );

    expect(indice.productos.size).toBe(0);
  });
});
