import { describe, it, expect } from 'vitest';
import { buildProductNode, buildProductJsonLdGraph, safeJsonStringify } from '@/lib/seo/json-ld';
import type { EmpresaPublic } from '@/core/domain/entities/types';
import type { MenuItemVM } from '@/core/application/dtos/menu-view-model';
import type { ModalidadDomicilioLegal } from '@/core/domain/entities/empresa-legal';

const BASE = 'https://alma-de-arena.com';

function empresa(overrides: Partial<EmpresaPublic> = {}): EmpresaPublic {
  return {
    id: 'e1',
    nombre: 'Alma de Arena',
    tipo: 'tienda',
    moneda: 'EUR',
    descripcion: null,
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

function item(overrides: Partial<MenuItemVM> = {}): MenuItemVM {
  return {
    id: 'p1',
    name: 'Kit básico',
    price: 24,
    category: 'kits',
    slug: 'kit-basico',
    image: 'https://cdn.example.com/kit.webp',
    ...overrides,
  };
}

const SIN_ENVIOS: ModalidadDomicilioLegal[] = [];
const PLAZO_POR_DEFECTO = 14;

describe('buildProductNode', () => {
  it('emite Product + Offer con seller enlazado al negocio por @id', () => {
    const node = buildProductNode(item(), empresa(), BASE, SIN_ENVIOS, PLAZO_POR_DEFECTO);
    expect(node).toMatchObject({
      '@type': 'Product',
      '@id': `${BASE}/producto/kit-basico#producto`,
      name: 'Kit básico',
      url: `${BASE}/producto/kit-basico`,
    });
    const offer = node?.offers as Record<string, unknown>;
    expect(offer).toMatchObject({
      '@type': 'Offer',
      price: 24,
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      seller: { '@id': `${BASE}/#negocio` },
    });
  });

  it('incluye description e image cuando existen', () => {
    const node = buildProductNode(
      item({ description: 'Kit de 72 horas', image: 'https://cdn.example.com/1.webp', image2: 'https://cdn.example.com/2.webp' }),
      empresa(),
      BASE,
      SIN_ENVIOS,
      PLAZO_POR_DEFECTO
    );
    expect(node?.description).toBe('Kit de 72 horas');
    expect(node?.image).toEqual(['https://cdn.example.com/1.webp', 'https://cdn.example.com/2.webp']);
  });

  it('nunca emite Review ni AggregateRating', () => {
    const node = buildProductNode(item(), empresa(), BASE, SIN_ENVIOS, PLAZO_POR_DEFECTO);
    expect(JSON.stringify(node)).not.toContain('Review');
    expect(JSON.stringify(node)).not.toContain('AggregateRating');
  });

  it('hasMerchantReturnPolicy sale de plazoDesistimientoDias y enlaza /devoluciones, nunca de garantiasVisibles (F3)', () => {
    const node = buildProductNode(item(), empresa(), BASE, SIN_ENVIOS, 30);
    expect(node?.offers).toMatchObject({
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'ES',
        merchantReturnDays: 30,
        merchantReturnLink: `${BASE}/devoluciones`,
      },
    });
  });

  it('el plazo de devolución nunca es inferior al mínimo legal (14 días, art. 104)', () => {
    const node = buildProductNode(item(), empresa(), BASE, SIN_ENVIOS, 7);
    const offer = node?.offers as Record<string, unknown>;
    const policy = offer.hasMerchantReturnPolicy as Record<string, unknown>;
    expect(policy.merchantReturnDays).toBe(14);
  });

  it('shippingDetails sale de modalidades_entrega de domicilio, con addressCountry ES', () => {
    const modalidades: ModalidadDomicilioLegal[] = [
      { nombre: 'Envío a domicilio', precioCents: 450, tiempoMin: 1440, tiempoMax: 2880 },
    ];
    const node = buildProductNode(item(), empresa(), BASE, modalidades, PLAZO_POR_DEFECTO);
    const offer = node?.offers as Record<string, unknown>;
    const shipping = (offer.shippingDetails as Record<string, unknown>[])[0];
    expect(shipping).toMatchObject({
      '@type': 'OfferShippingDetails',
      shippingRate: { '@type': 'MonetaryAmount', value: 4.5, currency: 'EUR' },
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'ES' },
    });
  });

  it('omite transitTime cuando la modalidad no tiene tiempoMin configurado', () => {
    const modalidades: ModalidadDomicilioLegal[] = [
      { nombre: 'Envío a domicilio', precioCents: 450, tiempoMin: null, tiempoMax: null },
    ];
    const node = buildProductNode(item(), empresa(), BASE, modalidades, PLAZO_POR_DEFECTO);
    const offer = node?.offers as Record<string, unknown>;
    const shipping = (offer.shippingDetails as Record<string, unknown>[])[0];
    expect(shipping.deliveryTime).toBeUndefined();
  });

  it('cuando canonicalExterno está presente NO emite Product (la página es noindex con canonical externo)', () => {
    const node = buildProductNode(
      item({ canonicalExterno: 'https://kitemergenciacanarias.es/kit-basico' }),
      empresa(),
      BASE,
      SIN_ENVIOS,
      PLAZO_POR_DEFECTO
    );
    expect(node).toBeNull();
  });

  it('sin slug no hay Product posible', () => {
    const node = buildProductNode(item({ slug: undefined }), empresa(), BASE, SIN_ENVIOS, PLAZO_POR_DEFECTO);
    expect(node).toBeNull();
  });
});

describe('buildProductJsonLdGraph', () => {
  it('enlaza Store, WebSite y Product en un único @graph', () => {
    const graph = buildProductJsonLdGraph(item(), empresa(), BASE, SIN_ENVIOS, PLAZO_POR_DEFECTO);
    const nodos = graph['@graph'] as Record<string, unknown>[];
    expect(nodos.map((n) => n['@type'])).toEqual(['Store', 'WebSite', 'Product']);
  });

  it('cuando canonicalExterno está presente el @graph no incluye Product', () => {
    const graph = buildProductJsonLdGraph(
      item({ canonicalExterno: 'https://kitemergenciacanarias.es/kit-basico' }),
      empresa(),
      BASE,
      SIN_ENVIOS,
      PLAZO_POR_DEFECTO
    );
    const nodos = graph['@graph'] as Record<string, unknown>[];
    expect(nodos.map((n) => n['@type'])).toEqual(['Store', 'WebSite']);
  });

  // XSS: integración real con safeJsonStringify, no solo el builder puro.
  it('un título con payload XSS queda escapado de punta a punta vía safeJsonStringify', () => {
    const graph = buildProductJsonLdGraph(
      item({ name: '</script><script>alert(1)</script>' }),
      empresa(),
      BASE,
      SIN_ENVIOS,
      PLAZO_POR_DEFECTO
    );
    const serializado = safeJsonStringify(graph);
    expect(serializado).not.toContain('<');
    expect(serializado).not.toContain('>');
    expect(JSON.parse(serializado.replaceAll('\\u003c', '<').replaceAll('\\u003e', '>').replaceAll('\\u0026', '&'))).toBeTruthy();
  });
});
