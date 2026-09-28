import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { LandingHeader } from '@/components/landing-header';
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
  landingHabilitada: true,
  googleReviewsUrl: null,
};

function renderHeader(props: {
  empresa?: EmpresaPublic;
  showNosotros?: boolean;
  showDondeEstamos?: boolean;
} = {}) {
  return render(
    <LanguageProvider>
      <LandingHeader
        empresa={props.empresa ?? baseEmpresa}
        showNosotros={props.showNosotros ?? false}
        showDondeEstamos={props.showDondeEstamos ?? false}
      />
    </LanguageProvider>
  );
}

describe('LandingHeader', () => {
  it('siempre muestra el link a la carta', () => {
    renderHeader();
    expect(screen.getByRole('link', { name: 'Ver catálogo' })).toHaveAttribute('href', '/carta');
  });

  it('muestra el link Nosotros solo si showNosotros es true', () => {
    renderHeader({ showNosotros: true });
    expect(screen.getByRole('link', { name: 'Nosotros' })).toHaveAttribute('href', '#nosotros');
  });

  it('no muestra el link Nosotros si showNosotros es false', () => {
    renderHeader({ showNosotros: false });
    expect(screen.queryByRole('link', { name: 'Nosotros' })).not.toBeInTheDocument();
  });

  it('muestra el link Dónde estamos solo si showDondeEstamos es true', () => {
    renderHeader({ showDondeEstamos: true });
    expect(screen.getByRole('link', { name: 'Dónde estamos' })).toHaveAttribute('href', '#donde-estamos');
  });

  it('no muestra el link Dónde estamos si showDondeEstamos es false', () => {
    renderHeader({ showDondeEstamos: false });
    expect(screen.queryByRole('link', { name: 'Dónde estamos' })).not.toBeInTheDocument();
  });

  it('muestra el logo cuando la empresa tiene logoUrl', () => {
    renderHeader({
      empresa: { ...baseEmpresa, logoUrl: 'https://cdn.example.com/logo.webp' },
    });
    expect(screen.getByRole('img', { name: 'La Mermelada' })).toBeInTheDocument();
  });
});
