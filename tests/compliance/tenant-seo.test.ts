import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildAlternates,
  buildTenantPageMetadata,
  debeDesindexar,
  getDescriptionForLang,
  parseLangParam,
  recortarDescripcion,
  resolverIdiomaPagina,
} from '@/lib/seo/tenant-seo';
import type { EmpresaPublic } from '@/core/domain/entities/types';

const empresa = {
  id: 'e1',
  nombre: 'La Mermelada',
  tipo: 'restaurante',
  descripcion: { es: 'Cocina canaria de mercado', en: 'Canarian market cuisine' },
  urlImage: 'https://cdn.example.com/hero.webp',
  logoUrl: null,
} as unknown as EmpresaPublic;

describe('parseLangParam', () => {
  it('acepta solo idiomas soportados', () => {
    expect(parseLangParam('en')).toBe('en');
    expect(parseLangParam(['fr', 'de'])).toBe('fr');
    expect(parseLangParam('pt')).toBeNull();
    expect(parseLangParam(undefined)).toBeNull();
  });
});

describe('resolverIdiomaPagina', () => {
  it('ignora un ?lang= que el tenant no tiene traducido (no crea canonicals nuevos)', () => {
    expect(resolverIdiomaPagina('de', ['es', 'en'], 'es')).toBe('es');
    expect(resolverIdiomaPagina('en', ['es', 'en'], 'es')).toBe('en');
  });
});

describe('recortarDescripcion', () => {
  it('no toca textos cortos, pero colapsa saltos de linea', () => {
    expect(recortarDescripcion('Hola\n\n  mundo')).toBe('Hola mundo');
  });

  it('corta en limite de palabra, con elipsis y sin pasarse de 160', () => {
    const largo = 'palabra '.repeat(40);
    const r = recortarDescripcion(largo);
    expect(r.length).toBeLessThanOrEqual(160);
    expect(r.endsWith('palabra…')).toBe(true);
  });

  it('usa la descripcion generica del idioma si el tenant no tiene la suya', () => {
    expect(getDescriptionForLang(empresa, 'fr')).toMatch(/Menu numérique/);
  });
});

describe('buildAlternates', () => {
  it('cada variante de idioma es canonical de si misma', () => {
    expect(buildAlternates('/carta', ['es', 'en'], 'es', 'es').canonical).toBe('/carta');
    expect(buildAlternates('/carta', ['es', 'en'], 'es', 'en').canonical).toBe('/carta?lang=en');
  });

  it('enlaza todas las variantes con hreflang + x-default', () => {
    expect(buildAlternates('/', ['es', 'en'], 'es', 'es').languages).toEqual({
      es: '/',
      en: '/?lang=en',
      'x-default': '/',
    });
  });

  it('con un solo idioma no emite hreflang', () => {
    expect(buildAlternates('/', ['es'], 'es', 'es').languages).toEqual({});
  });
});

describe('debeDesindexar', () => {
  it('URL limpia o solo con ?lang= → indexable', () => {
    expect(debeDesindexar({})).toBe(false);
    expect(debeDesindexar({ lang: 'en' })).toBe(false);
  });

  it('?mesa= (carta de una mesa) → noindex', () => {
    expect(debeDesindexar({ mesa: 'm-1' })).toBe(true);
  });

  it('?carrito=abierto (FAB de la landing, estado de UI) → noindex', () => {
    expect(debeDesindexar({ carrito: 'abierto' })).toBe(true);
    expect(debeDesindexar({ carrito: 'abierto', lang: 'en' })).toBe(true);
  });

  it('parametro vacio no cuenta; repetido si', () => {
    expect(debeDesindexar({ mesa: '', carrito: '' })).toBe(false);
    expect(debeDesindexar({ carrito: ['abierto', 'abierto'] })).toBe(true);
  });
});

describe('buildTenantPageMetadata', () => {
  it('la home usa el nombre del negocio como titulo absoluto', () => {
    const meta = buildTenantPageMetadata({ empresa, path: '/', langParam: undefined });
    expect(meta.title).toEqual({ absolute: 'La Mermelada' });
    expect(meta.alternates?.canonical).toBe('/');
    expect(meta.description).toBe('Cocina canaria de mercado');
  });

  it('otra pagina declara SU canonical, titulo y descripcion en el idioma pedido', () => {
    const meta = buildTenantPageMetadata({
      empresa,
      path: '/carta',
      langParam: 'en',
      titulo: (lang) => (lang === 'en' ? 'Our Catalog' : 'Nuestro Catálogo'),
    });
    expect(meta.alternates?.canonical).toBe('/carta?lang=en');
    expect(meta.title).toEqual({ absolute: 'Our Catalog | La Mermelada' });
    expect(meta.description).toBe('Canarian market cuisine');
    expect(meta.openGraph).toMatchObject({ url: '/carta?lang=en', locale: 'en_US', alternateLocale: ['es_ES'] });
  });

  it('noIndex (URL de mesa) desindexa pero deja seguir enlaces', () => {
    const meta = buildTenantPageMetadata({ empresa, path: '/', langParam: undefined, noIndex: true });
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it('la imagen OG no inventa dimensiones (la foto no es 1200x630)', () => {
    const meta = buildTenantPageMetadata({ empresa, path: '/', langParam: undefined });
    expect(meta.openGraph?.images).toEqual([{ url: 'https://cdn.example.com/hero.webp', alt: 'La Mermelada' }]);
  });
});

describe('layout raiz', () => {
  // Un canonical en el layout se hereda en TODAS las paginas: /carta y
  // /privacidad se declaraban duplicados de la home y salian del indice.
  it('no declara canonical ni hreflang (los pone cada pagina)', () => {
    const src = readFileSync('src/app/layout.tsx', 'utf8');
    expect(src).not.toMatch(/canonical\s*:/);
    expect(src).not.toMatch(/alternates\s*:/);
  });

  // Envolver {children} en <main> metia header/footer de landing y carta
  // dentro de main y anidaba el <main> de admin/superadmin/TPV.
  it('no envuelve las paginas en <main>', () => {
    const src = readFileSync('src/app/layout.tsx', 'utf8');
    expect(src).not.toMatch(/<main[\s>]/);
  });
});
