import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { SiteFooter } from '@/components/site-footer';
import type { EmpresaPublic } from '@/core/domain/entities/types';

function empresa(over: Partial<EmpresaPublic>): EmpresaPublic {
  return {
    id: 'e1', nombre: 'Demo', dominio: 'demo.test', tipo: 'tienda', mostrarCarrito: true, moneda: 'EUR',
    subdomainPedidos: null, logoUrl: null, mostrarLogo: false, urlImage: null, bannerFit: null,
    tipoBanner: 'imagen', bannerSlides: [], colores: null, descripcion: null, titulo: null, subtitulo: null,
    subtitulo2: null, footer1: null, footer2: null, fb: null, instagram: null, urlMapa: null, direccion: null,
    telefono: null, emailNotification: null, nif: null, razonSocial: null, descuentoBienvenidaActivo: false,
    descuentoBienvenidaPorcentaje: 0, deliveryHabilitado: false, envioDomicilioHabilitado: false,
    landingHabilitada: false, googleReviewsUrl: null,
    ...over,
  };
}

function enlacesLegales() {
  const nav = screen.getByRole('navigation', { name: 'Legal' });
  return within(nav).getAllByRole('link').map((a) => a.getAttribute('href'));
}

describe('SiteFooter — columna Legal', () => {
  it('restaurante: aviso legal, privacidad y condiciones', () => {
    render(<LanguageProvider><SiteFooter empresa={empresa({ tipo: 'restaurante', deliveryHabilitado: true })} /></LanguageProvider>);
    expect(enlacesLegales()).toEqual(['/aviso-legal', '/privacidad', '/condiciones']);
  });

  it('tienda con envío: las cinco páginas', () => {
    render(<LanguageProvider><SiteFooter empresa={empresa({ envioDomicilioHabilitado: true })} /></LanguageProvider>);
    expect(enlacesLegales()).toEqual(['/aviso-legal', '/privacidad', '/condiciones', '/envios-y-pagos', '/devoluciones']);
  });

  it('privacidad ya no se duplica en la navegación general', () => {
    render(<LanguageProvider><SiteFooter empresa={empresa({})} /></LanguageProvider>);
    expect(screen.getAllByRole('link', { name: /política de privacidad/i })).toHaveLength(1);
  });
});
