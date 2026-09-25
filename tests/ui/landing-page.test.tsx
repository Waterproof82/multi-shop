import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { LandingPage } from '@/components/landing-page';
import type { EmpresaPublic, LandingSeccion } from '@/core/domain/entities/types';

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

function seccion(overrides: Partial<LandingSeccion> & Pick<LandingSeccion, 'id' | 'tipo'>): LandingSeccion {
  return {
    empresaId: 'empresa-1',
    activo: true,
    orden: 0,
    contenido: {},
    ...overrides,
  };
}

function renderLanding(sections: LandingSeccion[], empresaOverrides: Partial<EmpresaPublic> = {}) {
  return render(
    <LanguageProvider>
      <LandingPage empresa={{ ...baseEmpresa, ...empresaOverrides }} sections={sections} />
    </LanguageProvider>
  );
}

describe('LandingPage', () => {
  it('sin secciones activas, muestra el fallback: nombre de empresa + CTA a la carta', () => {
    renderLanding([]);
    expect(screen.getByRole('heading', { level: 1, name: 'La Mermelada' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Ver catálogo' })[0]).toHaveAttribute('href', '/carta');
  });

  it('con una sección hero activa, usa su título en vez del nombre de la empresa', () => {
    renderLanding([seccion({ id: 's-hero', tipo: 'hero', contenido: { titulo: { es: 'Bienvenidos' } } })]);
    expect(screen.getByRole('heading', { level: 1, name: 'Bienvenidos' })).toBeInTheDocument();
  });

  it('renderiza la sección Nosotros cuando está activa', () => {
    renderLanding([
      seccion({
        id: 's-nosotros',
        tipo: 'nosotros',
        contenido: { titulo: { es: 'Nosotros' }, descripcion: { es: 'Somos una empresa familiar' } },
      }),
    ]);
    expect(screen.getByText('Somos una empresa familiar')).toBeInTheDocument();
  });

  it('no renderiza nada de Nosotros si no hay una fila activa de ese tipo', () => {
    renderLanding([]);
    expect(screen.queryByRole('heading', { name: 'Nosotros' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nosotros' })).not.toBeInTheDocument();
  });

  it('renderiza el testimonio cuando está activo', () => {
    renderLanding([
      seccion({
        id: 's-testi',
        tipo: 'testimonio',
        contenido: { texto: { es: 'Un lugar increíble' }, autor: { es: 'Juan Pérez' } },
      }),
    ]);
    expect(screen.getByText('“Un lugar increíble”')).toBeInTheDocument();
    expect(screen.getByText('— Juan Pérez')).toBeInTheDocument();
  });

  it('renderiza la galería cuando está activa', () => {
    renderLanding([
      seccion({
        id: 's-gal',
        tipo: 'galeria',
        contenido: { imagenes: ['https://cdn.example.com/1.webp', 'https://cdn.example.com/2.webp'] },
      }),
    ]);
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('renderiza Dónde estamos cuando la sección visitanos está activa, usando datos de empresa', () => {
    renderLanding(
      [seccion({ id: 's-visit', tipo: 'visitanos', contenido: {} })],
      { direccion: 'Calle Falsa 123' }
    );
    expect(screen.getByRole('heading', { name: 'Dónde estamos' })).toBeInTheDocument();
    expect(screen.getAllByText('Calle Falsa 123').length).toBeGreaterThan(0);
  });

  it('el header solo muestra el link Nosotros si esa sección está activa', () => {
    renderLanding([seccion({ id: 's-nosotros', tipo: 'nosotros' })]);
    expect(screen.getByRole('link', { name: 'Nosotros' })).toHaveAttribute('href', '#nosotros');
  });

  it('el hero se renderiza siempre primero, sin importar el orden de las demás secciones', () => {
    renderLanding([
      seccion({ id: 's-testi', tipo: 'testimonio', orden: 0, contenido: { texto: { es: 'Cita' } } }),
      seccion({ id: 's-hero', tipo: 'hero', orden: 99, contenido: { titulo: { es: 'Título hero' } } }),
    ]);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Título hero');
  });
});
