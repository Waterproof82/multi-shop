import { describe, it, expect } from 'vitest';
import { buildJsonLdGraph, parseGeoFromUrl, safeJsonStringify } from '@/lib/seo/json-ld';
import type { EmpresaPublic } from '@/core/domain/entities/types';
import type { MenuCategoryVM } from '@/core/application/dtos/menu-view-model';

const BASE = 'https://lamermelada.com';

function empresa(overrides: Partial<EmpresaPublic> = {}): EmpresaPublic {
  return {
    id: 'e1',
    nombre: 'La Mermelada',
    tipo: 'restaurante',
    moneda: 'EUR',
    descripcion: { es: 'Cocina canaria' },
    logoUrl: null,
    urlImage: null,
    telefono: null,
    direccion: null,
    urlMapa: null,
    fb: null,
    instagram: null,
    ...overrides,
  } as unknown as EmpresaPublic;
}

type Nodo = Record<string, unknown>;
function nodos(graph: Record<string, unknown>): Nodo[] {
  return graph['@graph'] as Nodo[];
}
function nodo(graph: Record<string, unknown>, tipo: string): Nodo | undefined {
  return nodos(graph).find((n) => n['@type'] === tipo);
}

describe('parseGeoFromUrl', () => {
  it('lee el centro de un iframe "Insertar un mapa" (!2d lng !3d lat)', () => {
    const embed =
      'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3518.2!2d-15.4362574!3d28.1235459!2m3!1f0!2f0!3f0';
    expect(parseGeoFromUrl(embed)).toEqual({ latitude: 28.1235459, longitude: -15.4362574 });
  });

  it('prefiere el pin exacto (!3d lat !4d lng) al centro de la vista (@)', () => {
    const place = 'https://www.google.com/maps/place/X/@28.1,-15.4,17z/data=!4m6!3m5!8m2!3d28.1239!4d-15.4371';
    expect(parseGeoFromUrl(place)).toEqual({ latitude: 28.1239, longitude: -15.4371 });
  });

  it('lee @lat,lng y ?q=lat,lng', () => {
    expect(parseGeoFromUrl('https://www.google.com/maps/@40.4168,-3.7038,15z')).toEqual({
      latitude: 40.4168,
      longitude: -3.7038,
    });
    expect(parseGeoFromUrl('https://maps.google.com/?q=40.4168,-3.7038')).toEqual({
      latitude: 40.4168,
      longitude: -3.7038,
    });
  });

  it('descarta coordenadas fuera de rango o ausentes', () => {
    expect(parseGeoFromUrl('https://www.google.com/maps/@95.1,-3.7,15z')).toBeNull();
    expect(parseGeoFromUrl('https://www.google.com/maps/search/restaurante')).toBeNull();
    expect(parseGeoFromUrl(null)).toBeNull();
  });
});

describe('buildJsonLdGraph', () => {
  it('restaurante → Restaurant; tienda → Store', () => {
    expect(nodo(buildJsonLdGraph(empresa(), [], BASE), 'Restaurant')).toBeDefined();
    const tienda = buildJsonLdGraph(empresa({ tipo: 'tienda' }), [], BASE);
    expect(nodo(tienda, 'Store')).toBeDefined();
    expect(nodo(tienda, 'Restaurant')).toBeUndefined();
  });

  // Google exige que el marcado describa contenido VISIBLE: las FAQ genericas
  // no se pintaban en la pagina y afirmaban cosas falsas para algunos tenants.
  it('no emite FAQPage', () => {
    expect(JSON.stringify(buildJsonLdGraph(empresa(), [], BASE))).not.toContain('FAQPage');
  });

  it('incluye WebSite enlazado al negocio por @id', () => {
    const graph = buildJsonLdGraph(empresa(), [], BASE);
    const negocio = nodo(graph, 'Restaurant');
    expect(nodo(graph, 'WebSite')).toMatchObject({ publisher: { '@id': negocio?.['@id'] }, inLanguage: ['es'] });
  });

  it('la imagen no depende de que haya logo', () => {
    const graph = buildJsonLdGraph(empresa({ urlImage: 'https://cdn.example.com/local.webp' }), [], BASE);
    const negocio = nodo(graph, 'Restaurant');
    expect(negocio?.image).toBe('https://cdn.example.com/local.webp');
    expect(negocio?.logo).toBeUndefined();
  });

  it('en la landing (sin carta cargada) enlaza la carta por URL', () => {
    expect(nodo(buildJsonLdGraph(empresa(), [], BASE), 'Restaurant')?.hasMenu).toBe(`${BASE}/carta`);
  });

  it('con carta, añade el nodo Menu y lo enlaza por @id', () => {
    const menu = [
      { id: 'c1', label: 'Entrantes', items: [{ id: 'p1', name: 'Papas', price: 5, category: 'c1' }] },
    ] as unknown as MenuCategoryVM[];
    const graph = buildJsonLdGraph(empresa(), menu, BASE);
    const menuNode = nodo(graph, 'Menu');
    expect(nodo(graph, 'Restaurant')?.hasMenu).toEqual({ '@id': menuNode?.['@id'] });
    expect(JSON.stringify(menuNode)).toContain('"priceCurrency":"EUR"');
  });

  it('ignora URLs sociales no http(s)', () => {
    const graph = buildJsonLdGraph(empresa({ instagram: 'javascript:alert(1)', fb: 'https://facebook.com/x' }), [], BASE);
    expect(nodo(graph, 'Restaurant')?.sameAs).toEqual(['https://facebook.com/x']);
  });
});

describe('safeJsonStringify', () => {
  it('no permite cerrar la etiqueta <script>', () => {
    const out = safeJsonStringify({ name: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
  });
});
