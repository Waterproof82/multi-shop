import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { CartProvider } from '@/lib/cart-context';
import { LandingPage } from '@/components/landing-page';
import type { EmpresaPublic, LandingSeccion } from '@/core/domain/entities/types';

// Estructura semantica de la landing: landmarks, nombres accesibles y
// enlaces externos. Cada caso corresponde a un fallo real corregido.

const empresa = {
  id: 'empresa-1',
  nombre: 'La Mermelada',
  dominio: 'lamermelada.com',
  tipo: 'restaurante',
  logoUrl: null,
  urlImage: null,
  colores: null,
  descripcion: null,
  fb: 'https://facebook.com/lamermelada',
  instagram: null,
  urlMapa: null,
  direccion: 'Calle Falsa 123',
  telefono: '+34 600 11 22 33',
  emailNotification: null,
} as unknown as EmpresaPublic;

function seccion(tipo: LandingSeccion['tipo'], contenido: Record<string, unknown> = {}): LandingSeccion {
  return { id: `s-${tipo}`, empresaId: 'empresa-1', tipo, activo: true, orden: 0, contenido };
}

const TODAS: LandingSeccion[] = [
  seccion('hero', { titulo: { es: 'Cocina *de verdad*' }, horario: { es: 'L-V 9-17' }, imagenUrl: 'https://cdn.example.com/h.webp' }),
  seccion('nosotros', { titulo: { es: 'Quiénes somos' } }),
  seccion('cta_carta', { titulo: { es: 'Mira la carta' } }),
  seccion('testimonio', { texto: { es: 'Increíble' }, autor: { es: 'Ana' } }),
  seccion('galeria', { imagenes: ['https://cdn.example.com/1.webp', 'https://cdn.example.com/2.webp'] }),
  seccion('visitanos'),
];

function renderLanding(sections: LandingSeccion[] = TODAS) {
  return render(
    <LanguageProvider>
      <LandingPage empresa={empresa} sections={sections} />
    </LanguageProvider>
  );
}

describe('Landing — landmarks', () => {
  it('un unico <main>, con el id del enlace "saltar al contenido"', () => {
    renderLanding();
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', 'main-content');
  });

  it('header y footer quedan FUERA de main (siguen siendo banner / contentinfo)', () => {
    renderLanding();
    const main = screen.getByRole('main');
    expect(main).not.toContainElement(screen.getByRole('banner'));
    expect(main).not.toContainElement(screen.getByRole('contentinfo'));
  });

  it('la navegacion principal tiene nombre', () => {
    renderLanding();
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
  });

  it('el logo/nombre enlaza a la home real, no a "#"', () => {
    renderLanding();
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'La Mermelada' })).toHaveAttribute('href', '/');
  });

  it('cada seccion es una region con nombre (su titulo)', () => {
    renderLanding();
    for (const nombre of ['Cocina de verdad', 'Quiénes somos', 'Mira la carta', 'Opinión de un cliente', 'El local', 'Dónde estamos']) {
      expect(screen.getByRole('region', { name: nombre })).toBeInTheDocument();
    }
  });

  it('un solo h1', () => {
    renderLanding();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('Landing — contenido', () => {
  it('la imagen del hero describe el negocio (no alt vacio)', () => {
    renderLanding();
    const hero = screen.getByRole('region', { name: 'Cocina de verdad' });
    expect(within(hero).getByRole('img', { name: 'La Mermelada' })).toBeInTheDocument();
  });

  it('el telefono del hero es marcable', () => {
    renderLanding();
    const hero = screen.getByRole('region', { name: 'Cocina de verdad' });
    expect(within(hero).getByRole('link', { name: '600112233' })).toHaveAttribute('href', 'tel:+34600112233');
  });

  it('horario/telefono/direccion son listas de descripcion (dt/dd), no titulos', () => {
    const { container } = renderLanding();
    expect(container.querySelectorAll('dl').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('heading', { level: 3, name: 'Dirección' })).not.toBeInTheDocument();
  });

  it('la galeria es una lista y el alt de cada foto dice de que es', () => {
    renderLanding();
    const galeria = screen.getByRole('region', { name: 'El local' });
    expect(within(galeria).getAllByRole('listitem')).toHaveLength(2);
    expect(within(galeria).getByRole('img', { name: 'El local · La Mermelada (2/2)' })).toBeInTheDocument();
  });

  it('el autor del testimonio va en <figcaption>, fuera del <blockquote>', () => {
    renderLanding();
    const figcaption = screen.getByText('— Ana');
    expect(figcaption.tagName).toBe('FIGCAPTION');
    expect(figcaption.closest('blockquote')).toBeNull();
  });
});

describe('Landing — enlaces externos', () => {
  it('todo enlace target=_blank avisa de que abre pestaña nueva', () => {
    renderLanding();
    const externos = screen.getAllByRole('link').filter((a) => a.getAttribute('target') === '_blank');
    expect(externos.length).toBeGreaterThan(0);
    for (const enlace of externos) {
      const nombre = enlace.getAttribute('aria-label') ?? enlace.textContent ?? '';
      expect(nombre).toMatch(/pestaña nueva/);
      expect(enlace.getAttribute('rel')).toMatch(/noopener/);
    }
  });
});

describe('LanguageProvider — ?lang=', () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.history.replaceState(null, '', '/');
  });

  it('?lang=en pinta la landing en ingles (URL hreflang indexable)', async () => {
    globalThis.history.replaceState(null, '', '/?lang=en');
    renderLanding([]);
    expect(await screen.findByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(localStorage.getItem('preferred-language')).toBe('en');
  });

  it('un ?lang= no soportado se ignora (tampoco claves heredadas como "constructor")', async () => {
    globalThis.history.replaceState(null, '', '/?lang=constructor');
    renderLanding([]);
    expect(await screen.findByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
  });
});

describe('Landing — FAB del carrito (tienda)', () => {
  function renderTienda() {
    return render(
      <LanguageProvider>
        <CartProvider>
          <LandingPage
            empresa={{ ...empresa, tipo: 'tienda', mostrarCarrito: true } as EmpresaPublic}
            sections={[]}
          />
        </CartProvider>
      </LanguageProvider>
    );
  }

  it('enlaza a la carta con el carrito abierto, sin pasar autoridad a una URL de estado', () => {
    renderTienda();
    const fab = screen.getByRole('link', { name: 'Abrir carrito' });
    expect(fab).toHaveAttribute('href', '/carta?carrito=abierto');
    expect(fab).toHaveAttribute('rel', 'nofollow');
  });

  it('WhatsApp sigue avisando de pestaña nueva cuando se apila sobre el carrito', () => {
    renderTienda();
    expect(screen.getByRole('link', { name: 'Escríbenos por WhatsApp (se abre en una pestaña nueva)' })).toBeInTheDocument();
  });

  it('restaurante: sin FAB de carrito (la carta no tendria carrito)', () => {
    renderLanding([]);
    expect(screen.queryByRole('link', { name: /Abrir carrito/ })).not.toBeInTheDocument();
  });
});
