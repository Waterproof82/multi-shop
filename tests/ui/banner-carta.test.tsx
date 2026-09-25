import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { BannerCarta } from '@/components/banner-carta';
import type { EmpresaPublic } from '@/core/domain/entities/types';

// SEO: la carta debe tener exactamente un <h1> sea cual sea el banner. Antes,
// con banner slider o sin `titulo` configurado, no tenia ninguno.

function empresa(overrides: Partial<EmpresaPublic>): EmpresaPublic {
  return {
    id: 'empresa-1',
    nombre: 'La Mermelada',
    tipoBanner: 'imagen',
    bannerSlides: [],
    bannerFit: 'contain',
    logoUrl: null,
    urlImage: null,
    titulo: null,
    subtitulo: null,
    subtitulo2: null,
    descripcion: null,
    ...overrides,
  } as unknown as EmpresaPublic;
}

function renderBanner(e: EmpresaPublic) {
  return render(
    <LanguageProvider>
      <BannerCarta empresa={e} />
    </LanguageProvider>
  );
}

describe('BannerCarta — un unico <h1>', () => {
  it('banner imagen con titulo: el <h1> visible es el titulo', () => {
    renderBanner(empresa({ titulo: 'Cocina de mercado' }));
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Cocina de mercado');
    expect(h1s[0]).not.toHaveClass('sr-only');
  });

  it('banner imagen sin titulo: <h1> oculto con el nombre del negocio', () => {
    renderBanner(empresa({ titulo: '' }));
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('La Mermelada');
    expect(h1s[0]).toHaveClass('sr-only');
  });

  it('banner slider: <h1> oculto con el nombre del negocio', () => {
    renderBanner(empresa({ tipoBanner: 'slider', bannerSlides: ['https://cdn.example.com/1.webp'] }));
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('La Mermelada');
  });

  it('banner slider sin imagenes: el <h1> sigue estando', () => {
    renderBanner(empresa({ tipoBanner: 'slider', bannerSlides: [] }));
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
