import { describe, it, expect } from 'vitest';
import { buildProductPageMetadata } from '@/lib/seo/tenant-seo';
import type { EmpresaPublic } from '@/core/domain/entities/types';
import type { MenuItemVM } from '@/core/application/dtos/menu-view-model';

function empresa(overrides: Partial<EmpresaPublic> = {}): EmpresaPublic {
  return {
    id: 'e1',
    nombre: 'Alma de Arena',
    tipo: 'tienda',
    descripcion: { es: 'x', en: 'x', fr: 'x', it: 'x', de: 'x' },
    urlImage: null,
    logoUrl: null,
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
    description: 'Un kit completo para 72 horas',
    ...overrides,
  };
}

describe('buildProductPageMetadata', () => {
  it('canonical de /producto/{slug} con hreflang en los 5 idiomas (spec: Language variant hreflang)', () => {
    const meta = buildProductPageMetadata({ empresa: empresa(), item: item(), langParam: undefined });

    expect(meta.alternates?.canonical).toBe('/producto/kit-basico');
    expect(Object.keys(meta.alternates?.languages ?? {})).toEqual(
      expect.arrayContaining(['es', 'en', 'fr', 'it', 'de', 'x-default'])
    );
  });

  it('?lang=en sirve el nombre y la descripción traducidos del producto', () => {
    const meta = buildProductPageMetadata({
      empresa: empresa(),
      item: item({ translations: { en: { name: 'Basic kit', description: 'A full 72h kit' } } }),
      langParam: 'en',
    });

    expect(meta.title).toEqual({ absolute: 'Basic kit | Alma de Arena' });
    expect(meta.description).toBe('A full 72h kit');
  });

  it('usa la imagen del producto como OG image, no el logo/imagen de la empresa', () => {
    const meta = buildProductPageMetadata({
      empresa: empresa({ urlImage: 'https://cdn.example.com/empresa.webp' }),
      item: item(),
      langParam: undefined,
    });

    expect(meta.openGraph?.images).toEqual([{ url: 'https://cdn.example.com/kit.webp', alt: 'Kit básico' }]);
  });

  it('canonicalExterno: canonical externo, noindex, sin variantes de idioma (spec: external-canonical excluded)', () => {
    const meta = buildProductPageMetadata({
      empresa: empresa(),
      item: item({ canonicalExterno: 'https://kitemergenciacanarias.es/kit-basico' }),
      langParam: undefined,
    });

    expect(meta.alternates).toEqual({ canonical: 'https://kitemergenciacanarias.es/kit-basico' });
    expect(meta.robots).toEqual({ index: false, follow: true });
  });
});
