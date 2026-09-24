import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { LandingPage } from '@/components/landing-page';
import type { EmpresaPublic } from '@/core/domain/entities/types';

const baseEmpresa: EmpresaPublic = {
  id: 'empresa-1',
  nombre: 'La Mermelada',
  dominio: 'lamermelada.com',
  tipo: 'restaurante',
  mostrarCarrito: true,
  moneda: 'EUR',
  subdomainPedidos: 'pedidos',
  logoUrl: null,
  mostrarLogo: true,
  urlImage: null,
  bannerFit: 'contain',
  tipoBanner: 'imagen',
  bannerSlides: [],
  colores: null,
  descripcion: null,
  titulo: null,
  subtitulo: null,
  subtitulo2: null,
  footer1: null,
  footer2: null,
  fb: null,
  instagram: null,
  urlMapa: null,
  direccion: null,
  telefono: null,
  emailNotification: null,
  nif: null,
  razonSocial: null,
  descuentoBienvenidaActivo: false,
  descuentoBienvenidaPorcentaje: 0,
  descuentoBienvenidaDuracion: null,
  mesasHabilitadas: true,
  pagosPickupHabilitados: false,
  deliveryHabilitado: false,
  envioDomicilioHabilitado: false,
};

function renderLanding(overrides: Partial<EmpresaPublic> = {}) {
  return render(
    <LanguageProvider>
      <LandingPage empresa={{ ...baseEmpresa, ...overrides }} />
    </LanguageProvider>
  );
}

describe('LandingPage', () => {
  it('muestra el nombre de la empresa y el CTA a la carta', () => {
    renderLanding();
    expect(screen.getByRole('heading', { level: 1, name: 'La Mermelada' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Ver catálogo' })[0]).toHaveAttribute('href', '/carta');
  });

  it('muestra titulo y subtitulo cuando existen', () => {
    renderLanding({ titulo: 'BENVENUTI', subtitulo: 'Buon appetito!' });
    expect(screen.getByText('BENVENUTI')).toBeInTheDocument();
    expect(screen.getByText('Buon appetito!')).toBeInTheDocument();
  });

  it('no renderiza la sección Nosotros sin descripcion', () => {
    renderLanding({ descripcion: null });
    expect(screen.queryByRole('heading', { name: 'Nosotros' })).not.toBeInTheDocument();
  });

  it('renderiza la sección Nosotros con el texto en español', () => {
    renderLanding({ descripcion: { es: 'Somos una empresa familiar desde 1990' } });
    expect(screen.getByRole('heading', { name: 'Nosotros' })).toBeInTheDocument();
    expect(screen.getByText('Somos una empresa familiar desde 1990')).toBeInTheDocument();
  });

  it('no renderiza la sección Dónde estamos sin direccion/telefono/urlMapa', () => {
    renderLanding({ direccion: null, telefono: null, urlMapa: null });
    expect(screen.queryByRole('heading', { name: 'Dónde estamos' })).not.toBeInTheDocument();
  });

  it('renderiza la dirección en la sección Dónde estamos cuando existe', () => {
    renderLanding({ direccion: 'Calle Falsa 123', telefono: null, urlMapa: null });
    expect(screen.getByRole('heading', { name: 'Dónde estamos' })).toBeInTheDocument();
    // SiteFooter también pinta la dirección en su columna de contacto — puede haber más de un match.
    expect(screen.getAllByText('Calle Falsa 123').length).toBeGreaterThan(0);
  });

  it('renderiza el teléfono en la sección Dónde estamos cuando existe', () => {
    renderLanding({ direccion: null, telefono: '912345678', urlMapa: null });
    expect(screen.getByRole('heading', { name: 'Dónde estamos' })).toBeInTheDocument();
    expect(screen.getAllByText('912345678').length).toBeGreaterThan(0);
  });

  it('renderiza el mapa en la sección Dónde estamos cuando hay urlMapa', () => {
    renderLanding({ direccion: null, telefono: null, urlMapa: 'https://maps.google.com/embed?x' });
    // SiteFooter también renderiza un mapa — el primero es del LandingPage
    expect(screen.getAllByTitle('Ubicación del negocio')[0]).toHaveAttribute('src', 'https://maps.google.com/embed?x');
  });
});
