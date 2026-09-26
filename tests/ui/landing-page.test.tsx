import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
  landingHabilitada: true,
  googleReviewsUrl: null,
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
    expect(screen.getByText('Un lugar increíble')).toBeInTheDocument();
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
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'Nosotros' })).toHaveAttribute('href', '#nosotros');
  });

  it('el hero se renderiza siempre primero, sin importar el orden de las demás secciones', () => {
    renderLanding([
      seccion({ id: 's-testi', tipo: 'testimonio', orden: 0, contenido: { texto: { es: 'Cita' } } }),
      seccion({ id: 's-hero', tipo: 'hero', orden: 99, contenido: { titulo: { es: 'Título hero' } } }),
    ]);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Título hero');
  });

  it('la galería muestra un título por defecto cuando el admin no lo rellena', () => {
    renderLanding([
      seccion({ id: 's-gal', tipo: 'galeria', contenido: { imagenes: ['https://cdn.example.com/1.webp'] } }),
    ]);
    expect(screen.getByRole('heading', { level: 2, name: 'El local' })).toBeInTheDocument();
  });

  it('resalta en cursiva el tramo del título entre asteriscos, sin mostrar los asteriscos', () => {
    renderLanding([
      seccion({ id: 's-hero', tipo: 'hero', contenido: { titulo: { es: 'Cocina *de verdad*' } } }),
    ]);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Cocina de verdad');
    expect(within(heading).getByText('de verdad').tagName).toBe('EM');
  });

  // 'Síguenos' ya no incluye WhatsApp (10f92040): quedan 3 accesos.
  it('con teléfono muestra los accesos a WhatsApp', () => {
    renderLanding([seccion({ id: 's-visit', tipo: 'visitanos' })], { telefono: '+34 600 11 22 33' });
    const enlaces = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === 'https://wa.me/34600112233');
    expect(enlaces.length).toBeGreaterThanOrEqual(3);
  });

  it('sin teléfono no pinta ningún enlace de WhatsApp', () => {
    renderLanding([seccion({ id: 's-visit', tipo: 'visitanos' })]);
    const enlaces = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('https://wa.me/'));
    expect(enlaces).toHaveLength(0);
  });

  it('la cinta animada sale con las palabras del hero separadas por comas', () => {
    const { container } = renderLanding([
      seccion({ id: 's-hero', tipo: 'hero', contenido: { marquee: { es: 'Tandoori, Biryani ,, Naan' } } }),
    ]);
    const cinta = container.querySelector('.animate-landing-marquee');
    expect(cinta).not.toBeNull();
    // dos copias de la pista para el bucle continuo
    expect(within(cinta as HTMLElement).getAllByText('Biryani')).toHaveLength(2);
    // 3 palabras (la vacía entre comas se descarta) + 3 separadores, por 2 copias
    expect(cinta?.children).toHaveLength(12);
  });

  it('la cinta en modo imágenes pinta las imágenes (dos copias) y no las palabras', () => {
    const { container } = renderLanding([
      seccion({
        id: 's-hero',
        tipo: 'hero',
        contenido: {
          marquee: { es: 'Tandoori, Biryani' },
          marqueeModo: 'imagenes',
          marqueeImagenes: ['https://cdn.example.com/a.webp', '', 'https://cdn.example.com/b.webp'],
        },
      }),
    ]);
    const cinta = container.querySelector('.animate-landing-marquee') as HTMLElement;
    expect(cinta).not.toBeNull();
    // 2 imágenes (la vacía se descarta) por 2 copias; decorativas → alt vacío
    const imgs = cinta.querySelectorAll('img');
    expect(imgs).toHaveLength(4);
    expect(imgs[0]).toHaveAttribute('alt', '');
    expect(within(cinta).queryByText('Biryani')).toBeNull();
  });

  it('la cinta en modo imágenes sin imágenes no se pinta', () => {
    const { container } = renderLanding([
      seccion({ id: 's-hero', tipo: 'hero', contenido: { marquee: { es: 'Naan' }, marqueeModo: 'imagenes' } }),
    ]);
    expect(container.querySelector('.animate-landing-marquee')).toBeNull();
  });

  it('usa el mismo pie de página que la carta (SiteFooter)', () => {
    renderLanding([], { direccion: 'Calle Falsa 123' });
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('heading', { name: 'Contacto' })).toBeInTheDocument();
    expect(within(footer).getByText('Calle Falsa 123')).toBeInTheDocument();
  });
});
