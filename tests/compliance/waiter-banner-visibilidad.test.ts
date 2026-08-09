/**
 * Caracterizacion de las reglas de visibilidad del WaiterBanner.
 *
 * Estas reglas vivian como ocho `if (...) return null` sueltos dentro del
 * componente. Cada uno respondia a un caso distinto y ninguno decia su nombre;
 * el conjunto era la mayor parte de la complejidad cognitiva del fichero.
 *
 * Lo que se congela aqui es el comportamiento QUE YA HABIA, incluidas dos
 * asimetrias que parecen erratas y no lo son (ver los tests del final).
 */
import { describe, it, expect } from 'vitest';
import {
  motivoParaOcultarBanner,
  seccionDeRuta,
  type ContextoBanner,
} from '@/lib/waiter/banner-visibilidad';

/** Camarero autenticado, en la tienda, con mesa: el caso en que SI se pinta. */
const VISIBLE: ContextoBanner = {
  authChecked: true,
  isWaiter: true,
  pathname: '/',
  hasMesa: true,
};

const ctx = (parcial: Partial<ContextoBanner>): ContextoBanner => ({ ...VISIBLE, ...parcial });

describe('motivoParaOcultarBanner', () => {
  it('no oculta nada en el caso base', () => {
    expect(motivoParaOcultarBanner(VISIBLE)).toBeNull();
  });

  it('oculta mientras la auth no se ha comprobado, aunque el resto encaje', () => {
    // Importa el orden: sin este corte el banner parpadearia en cada carga.
    expect(motivoParaOcultarBanner(ctx({ authChecked: false }))).toBe('auth-sin-comprobar');
  });

  it('oculta a quien no es camarero', () => {
    expect(motivoParaOcultarBanner(ctx({ isWaiter: false }))).toBe('no-es-camarero');
  });

  it('prioriza "auth sin comprobar" sobre "no es camarero"', () => {
    // isWaiter arranca en false; sin esta prioridad, el primer render de cada
    // carga contaria como "no es camarero" y dispararia el redirect a /waiter.
    expect(motivoParaOcultarBanner(ctx({ authChecked: false, isWaiter: false })))
      .toBe('auth-sin-comprobar');
  });

  it.each([
    '/admin',
    '/admin/productos',
    '/superadmin',
    '/superadmin/empresas',
    '/tpv',
    '/tpv/mostrador',
  ])('oculta en el panel de gestion %s', (pathname) => {
    expect(motivoParaOcultarBanner(ctx({ pathname }))).toBe('panel-de-gestion');
  });

  it('oculta en /kitchen, que tiene cabecera propia', () => {
    expect(motivoParaOcultarBanner(ctx({ pathname: '/kitchen' }))).toBe('cocina-tiene-cabecera-propia');
  });

  it('NO confunde /waiter/kitchen con /kitchen', () => {
    // La pantalla de cocina DEL CAMARERO si lleva banner: es su unica navegacion.
    expect(motivoParaOcultarBanner(ctx({ pathname: '/waiter/kitchen' }))).toBeNull();
  });

  it('oculta en el seguimiento de pedido, que mira el cliente', () => {
    expect(motivoParaOcultarBanner(ctx({ pathname: '/tracking/abc-123' }))).toBe('pagina-de-cliente');
  });

  it.each([
    ['/waiter', 'la lista de mesas'],
    ['/waiter/pendientes', 'las validaciones'],
    ['/waiter/bar', 'la barra'],
  ])('se pinta en %s (%s) aunque no haya mesa', (pathname) => {
    expect(motivoParaOcultarBanner(ctx({ pathname, hasMesa: false }))).toBeNull();
  });

  describe('paginas de cliente: solo con mesa seleccionada', () => {
    it('oculta /mesa/:id sin mesa', () => {
      expect(motivoParaOcultarBanner(ctx({ pathname: '/mesa/7', hasMesa: false })))
        .toBe('mesa-de-cliente-sin-impersonar');
    });

    it('muestra /mesa/:id cuando el camarero esta impersonando esa mesa', () => {
      expect(motivoParaOcultarBanner(ctx({ pathname: '/mesa/7', hasMesa: true }))).toBeNull();
    });

    it('oculta la tienda sin mesa: ahi el contexto es de cliente', () => {
      expect(motivoParaOcultarBanner(ctx({ pathname: '/', hasMesa: false }))).toBe('tienda-sin-mesa');
    });

    it('muestra la tienda con mesa', () => {
      expect(motivoParaOcultarBanner(ctx({ pathname: '/', hasMesa: true }))).toBeNull();
    });
  });

  describe('asimetrias heredadas — verificadas, no erratas', () => {
    it('/administracion tambien queda oculta: la guarda es por prefijo, sin barra', () => {
      // No hay tal ruta hoy. Si alguien la crea, el banner desaparecera ahi sin
      // que falle nada. Queda escrito para que no cueste un dia averiguarlo.
      expect(motivoParaOcultarBanner(ctx({ pathname: '/administracion' }))).toBe('panel-de-gestion');
    });

    it('/tracking SIN barra final si muestra el banner: esa guarda lleva barra', () => {
      expect(motivoParaOcultarBanner(ctx({ pathname: '/tracking' }))).toBeNull();
    });
  });
});

describe('seccionDeRuta', () => {
  it('nombra la cocina', () => {
    expect(seccionDeRuta('/waiter/kitchen')).toBe('waiterKitchen');
  });

  it('nombra la barra', () => {
    expect(seccionDeRuta('/waiter/bar')).toBe('waiterBar');
  });

  it('no nombra nada en el resto de rutas', () => {
    expect(seccionDeRuta('/waiter')).toBeNull();
    expect(seccionDeRuta('/')).toBeNull();
  });

  it('exige la ruta exacta, no un prefijo', () => {
    expect(seccionDeRuta('/waiter/kitchen/historial')).toBeNull();
  });
});
