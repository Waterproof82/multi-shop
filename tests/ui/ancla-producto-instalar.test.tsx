import { describe, it, expect, beforeEach } from 'vitest';
import { instalarIdAnclaProducto, idAnclaProducto, ATRIBUTO_ANCLA_PRODUCTO, hashDeProductoDesde, limpiarHashEnvenenado } from '@/lib/catalogo/ancla-producto';

/**
 * Rationale del mecanismo (por qué hace falta un `id` real además del `data-`):
 * el handler de scroll de la App Router de Next 16 resuelve el hash del
 * navegador con `document.getElementById(hash)` y, si NO lo encuentra, hace
 * fallback a `scrollIntoView()` sobre la raíz del segmento — es decir, un
 * scroll al top de la página. Con el ancla en un `data-` a secas, el "Volver a
 * la carta" aterrizaba a veces en el top en vez de en la card. `instalarIdAnclaProducto`
 * le da a ese `getElementById` un objetivo que sí encuentra.
 */

function crearCard(slug: string, texto: string): HTMLElement {
  const card = document.createElement('div');
  card.setAttribute(ATRIBUTO_ANCLA_PRODUCTO, slug);
  card.textContent = texto;
  document.body.appendChild(card);
  return card;
}

function irA(hash: string): void {
  // jsdom rechaza history.replaceState hacia otro origen; cambiar el hash en
  // la URL actual basta para reproducir el estado que ve el helper.
  window.location.hash = hash;
}

describe('instalarIdAnclaProducto', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  it('instala el id de producto-<slug> en la primera card coincidente', () => {
    const primera = crearCard('bateria-25ah', 'primera');
    crearCard('bateria-25ah', 'segunda'); // pintada también en un menú virtual
    irA('#producto-bateria-25ah');

    instalarIdAnclaProducto();

    expect(primera.id).toBe('producto-bateria-25ah');
    expect(document.querySelectorAll('[id="producto-bateria-25ah"]')).toHaveLength(1);
  });

  it('el id usa el slug DECODIFICADO (Next resuelve el hash ya decodificado)', () => {
    expect(idAnclaProducto('café-con-leche')).toBe('producto-café-con-leche');
    const card = crearCard('café con-leche', 'card');
    irA(`#${encodeURIComponent('producto-café con-leche')}`);

    instalarIdAnclaProducto();

    expect(document.getElementById(idAnclaProducto('café con-leche'))).toBe(card);
  });

  it('no toca nada cuando el hash no es de producto', () => {
    const card = crearCard('bateria-25ah', 'card');
    irA('#top');

    instalarIdAnclaProducto();

    expect(card.id).toBe('');
  });

  it('no invalida un id preexistente (no hay ids duplicados)', () => {
    const preexistente = document.createElement('div');
    preexistente.id = 'producto-bateria-25ah';
    document.body.appendChild(preexistente);
    const card = crearCard('bateria-25ah', 'card');
    irA('#producto-bateria-25ah');

    instalarIdAnclaProducto();

    expect(document.getElementById('producto-bateria-25ah')).toBe(preexistente);
    expect(card.id).toBe('');
  });

  it('si la card no está en el DOM no falla ni crea nada', () => {
    irA('#producto-bateria-25ah');
    expect(document.querySelectorAll(`[${ATRIBUTO_ANCLA_PRODUCTO}]`)).toHaveLength(0);

    expect(() => instalarIdAnclaProducto()).not.toThrow();
    expect(document.getElementById('producto-bateria-25ah')).toBeNull();
  });
});

/**
 * Residuo real del usuario (2026-11-06): la URL llego con DOBLE fragmento
 * (`#producto-uno#producto-dos`) y el slug con `#` no matcheaba ninguna card —
 * el aterrizaje quedaba en top para siempre, sobreviviendo a las recargas.
 */
describe('hash de producto con doble fragmento (residuo envenenado)', () => {
  it('toma el ULTIMO fragmento y reporta el hash limpio', () => {
    const { slug, hashLimpio } = hashDeProductoDesde('#producto-gafas-antivaho#producto-torniquete-tactico');
    expect(slug).toBe('torniquete-tactico');
    expect(hashLimpio).toBe('#producto-torniquete-tactico');
  });

  it('un fragmento simple no reporta limpieza (no es envenenado)', () => {
    const { slug, hashLimpio } = hashDeProductoDesde('#producto-torniquete-tactico');
    expect(slug).toBe('torniquete-tactico');
    expect(hashLimpio).toBeNull();
  });

  it('si el ultimo fragmento no es de producto, no hay objetivo', () => {
    const { slug, hashLimpio } = hashDeProductoDesde('#producto-gafas#top');
    expect(slug).toBeNull();
    expect(hashLimpio).toBeNull();
  });

  it('limpiarHashEnvenenado reescribe la URL a un solo fragmento conservando pathname, search y state', () => {
    // location.hash no sirve para esto: el setter codifica el segundo '#' como %23.
    history.replaceState({ marca: 'next' }, '', '/carta?lang=es#producto-gafas#producto-torniquete');

    limpiarHashEnvenenado();

    expect(location.pathname + location.search + location.hash).toBe('/carta?lang=es#producto-torniquete');
    expect(history.state).toEqual({ marca: 'next' });
  });

  it('con hash simple limpiarHashEnvenenado no toca nada', () => {
    history.replaceState({}, '', '/carta#producto-torniquete');

    limpiarHashEnvenenado();

    expect(location.hash).toBe('#producto-torniquete');
  });

  it('el fragmento codificado sobrevive limpio (%20 no se duplica)', () => {
    history.replaceState({}, '', '/carta#producto-gafas#producto-caf%C3%A9%20con%20leche');

    limpiarHashEnvenenado();

    expect(location.hash).toBe('#producto-caf%C3%A9%20con%20leche');
    expect(hashDeProductoDesde(location.hash).slug).toBe('café con leche');
  });

  it('instalarIdAnclaProducto instala el id del ULTIMO fragmento aunque la URL siga envenenada', () => {
    history.replaceState({}, '', '/carta#producto-bateria-25ah#producto-inversor-1kw');
    const card = crearCard('inversor-1kw', 'la card del ultimo fragmento');

    instalarIdAnclaProducto();

    expect(document.getElementById('producto-inversor-1kw')).toBe(card);
  });
});
