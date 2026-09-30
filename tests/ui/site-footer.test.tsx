import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { SiteFooter, type FooterNavegacion } from '@/components/site-footer';
import type { EmpresaPublic } from '@/core/domain/entities/types';

const empresa = {
  id: 'empresa-1',
  nombre: 'La Mermelada',
  dominio: 'lamermelada.com',
  urlMapa: null,
  googleReviewsUrl: null,
} as EmpresaPublic;

function renderFooter(navegacion?: FooterNavegacion) {
  render(
    <LanguageProvider>
      <SiteFooter empresa={empresa} navegacion={navegacion} />
    </LanguageProvider>
  );
  return screen.getByRole('navigation', { name: 'Navegación' });
}

describe('SiteFooter — navegación', () => {
  it('sin navegación explícita, solo enlaza la política de privacidad (obligatoria siempre)', () => {
    const nav = renderFooter();
    const enlaces = within(nav).getAllByRole('link');
    expect(enlaces).toHaveLength(1);
    expect(enlaces[0]).toHaveAttribute('href', '/privacidad');
    expect(enlaces[0]).toHaveTextContent('Política de privacidad');
  });

  it('en la landing enlaza la carta y solo los apartados que existen, en ese orden', () => {
    const nav = renderFooter({ enlaceCarta: true, anclas: ['nosotros', 'donde-estamos'] });
    const hrefs = within(nav).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/carta', '#nosotros', '#donde-estamos', '/privacidad']);
    expect(within(nav).queryByRole('link', { name: 'Galería' })).toBeNull();
  });

  it('enlaza la galería cuando existe', () => {
    const nav = renderFooter({ anclas: ['galeria'] });
    expect(within(nav).getByRole('link', { name: 'Galería' })).toHaveAttribute('href', '#galeria');
  });

  it('en la carta enlaza el inicio cuando la landing existe', () => {
    const nav = renderFooter({ enlaceInicio: true });
    expect(within(nav).getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/');
  });

  it('fuera de la landing, los apartados apuntan a la home (/#ancla), no a la página actual', () => {
    const nav = renderFooter({ enlaceInicio: true, anclas: ['nosotros', 'galeria', 'donde-estamos'] });
    const hrefs = within(nav).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/', '/#nosotros', '/#galeria', '/#donde-estamos', '/privacidad']);
  });
});
