import { describe, it, expect, vi } from 'vitest';
import { buildLlmsTxt, lineaPlana, MAX_ITEMS_LLMS } from '@/lib/seo/llms-txt';
import { buildJsonLdGraph, rangoDePrecios } from '@/lib/seo/json-ld';
import { CRAWLERS_IA_BUSQUEDA, CRAWLERS_IA_ENTRENAMIENTO } from '@/lib/seo/crawlers-ia';
import type { EmpresaPublic, LandingSeccion } from '@/core/domain/entities/types';
import type { MenuCategoryVM } from '@/core/application/dtos/menu-view-model';

vi.mock('@/lib/domain-utils', () => ({ getDomainFromHeaders: async () => 'lamermelada.com' }));

const BASE = 'https://lamermelada.com';

const empresa = {
  id: 'e1',
  nombre: 'La Mermelada',
  tipo: 'restaurante',
  moneda: 'EUR',
  descripcion: { es: 'Cocina canaria\nde mercado', en: 'Canarian food' },
  direccion: 'Calle Mayor 1, Las Palmas',
  telefono: '+34 600 11 22 33',
  emailNotification: 'privado@lamermelada.com',
  instagram: 'https://instagram.com/lamermelada',
  fb: null,
  logoUrl: null,
  urlImage: null,
  urlMapa: null,
} as unknown as EmpresaPublic;

const secciones: LandingSeccion[] = [
  { id: 's1', empresaId: 'e1', tipo: 'visitanos', activo: true, orden: 0, contenido: { horario: { es: 'L-V 9:00-17:00\nS 10-14' } } },
  { id: 's2', empresaId: 'e1', tipo: 'nosotros', activo: true, orden: 1, contenido: { descripcion: { es: 'Familia desde *1970*' } } },
];

const menu = [
  { id: 'c1', label: 'Entrantes', items: [
    { id: 'p1', name: 'Papas arrugadas', description: 'Con mojo', price: 5, category: 'c1' },
    { id: 'p2', name: 'Queso asado', price: 8.5, category: 'c1' },
  ] },
] as unknown as MenuCategoryVM[];

describe('llms.txt', () => {
  const txt = buildLlmsTxt({ empresa, secciones, menu, baseUrl: BASE });

  it('sigue el formato llmstxt.org: H1, resumen en blockquote, secciones H2 con enlaces', () => {
    const lineas = txt.split('\n');
    expect(lineas[0]).toBe('# La Mermelada');
    expect(lineas[2]).toBe('> Cocina canaria de mercado');
    expect(txt).toContain(`- [Inicio](${BASE}/)`);
    expect(txt).toContain(`(${BASE}/carta)`);
    expect(txt).toContain('## Optional');
  });

  it('incluye los datos que un asistente necesita citar', () => {
    expect(txt).toContain('- Dirección: Calle Mayor 1, Las Palmas');
    expect(txt).toContain('- Teléfono: +34 600 11 22 33');
    expect(txt).toContain('- Horario: L-V 9:00-17:00 S 10-14');
    expect(txt).toContain('Familia desde 1970');
    expect(txt).toContain('- Idiomas de la web: español, English');
  });

  it('lista la carta con precios formateados', () => {
    expect(txt).toContain('### Entrantes');
    expect(txt).toMatch(/- Papas arrugadas — 5,00\s€: Con mojo/);
    expect(txt).toMatch(/- Queso asado — 8,50\s€/);
  });

  it('no expone el email interno del negocio', () => {
    expect(txt).not.toContain('privado@lamermelada.com');
  });

  it('no afirma el impuesto aplicado (IVA vs IGIC depende del tenant)', () => {
    expect(txt).not.toMatch(/IVA|IGIC/);
  });

  it(`recorta la carta a ${MAX_ITEMS_LLMS} productos`, () => {
    const enorme = [{ id: 'c', label: 'Todo', items: Array.from({ length: MAX_ITEMS_LLMS + 50 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, price: 1, category: 'c' })) }] as unknown as MenuCategoryVM[];
    const out = buildLlmsTxt({ empresa, secciones: [], menu: enorme, baseUrl: BASE });
    expect(out.match(/^- P\d+ —/gm)).toHaveLength(MAX_ITEMS_LLMS);
    expect(out).toContain('Carta resumida');
  });

  it('lineaPlana quita saltos y asteriscos de resaltado', () => {
    expect(lineaPlana('Una  *finca*\ncanaria')).toBe('Una finca canaria');
  });
});

describe('JSON-LD — datos citables (GEO)', () => {
  it('priceRange sale de la carta real', () => {
    expect(rangoDePrecios(menu, 'EUR')).toMatch(/^5,00\s€ – 8,50\s€$/);
    expect(rangoDePrecios([], 'EUR')).toBeNull();
  });

  it('el negocio lleva hasMap, moneda y rango de precios cuando hay carta', () => {
    const graph = buildJsonLdGraph(empresa, menu, BASE) as { '@graph': Record<string, unknown>[] };
    const negocio = graph['@graph'][0];
    expect(negocio.hasMap).toContain('https://www.google.com/maps/search/');
    expect(negocio.currenciesAccepted).toBe('EUR');
    expect(negocio.priceRange).toBeDefined();
  });
});

describe('robots.txt — crawlers de IA', () => {
  it('cada bot de IA tiene grupo propio CON las mismas zonas bloqueadas que `*`', async () => {
    const { default: robots } = await import('@/app/robots');
    const { rules } = await robots();
    const grupos = Array.isArray(rules) ? rules : [rules];
    const general = grupos.find((g) => g.userAgent === '*');
    const ia = grupos.find((g) => Array.isArray(g.userAgent) && g.userAgent.includes('GPTBot'));
    expect(ia?.userAgent).toEqual([...CRAWLERS_IA_BUSQUEDA, ...CRAWLERS_IA_ENTRENAMIENTO]);
    // Un grupo con user-agent propio sustituye al de `*`: sin esto los bots
    // de IA podrian rastrear /admin/, /api/, URLs de mesa...
    expect(ia?.disallow).toEqual(general?.disallow);
    expect(ia?.allow).toContain('/llms.txt');
  });
});
