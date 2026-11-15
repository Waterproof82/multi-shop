import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { CartProvider, useCart } from '@/lib/cart-context';
import { ProductDetailClient } from '@/components/producto/product-detail-client';
import type { EmpresaPublic, ModalidadEntrega } from '@/core/domain/entities/types';
import type { MenuItemVM } from '@/core/application/dtos/menu-view-model';
vi.mock('@/components/site-footer', () => ({ SiteFooter: () => null }));
vi.mock('@/components/cart-drawer', () => ({ CartDrawer: () => null }));

const empresa = {
  id: 'empresa-1',
  nombre: 'Tienda de prueba',
  dominio: 'tienda.test',
  tipo: 'tienda',
  mostrarCarrito: true,
  moneda: 'EUR',
  subdomainPedidos: null,
  logoUrl: null,
  mostrarLogo: false,
  urlImage: null,
  bannerFit: null,
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
  deliveryHabilitado: false,
  envioDomicilioHabilitado: false,
  landingHabilitada: false,
  googleReviewsUrl: null,
} as EmpresaPublic;

function buildItem(overrides: Partial<MenuItemVM> = {}): MenuItemVM {
  return {
    id: 'producto-1',
    name: 'Kit básico',
    price: 49.9,
    category: 'kits',
    slug: 'kit-basico',
    ...overrides,
  };
}

function CartProbe() {
  const { totalItems, items } = useCart();
  return (
    <>
      <span data-testid="cart-total">{totalItems}</span>
      <span data-testid="cart-line-personas">{items[0]?.personas ?? ''}</span>
      <span data-testid="cart-line-price">{items[0]?.item.price ?? ''}</span>
    </>
  );
}

function renderDetail(item: MenuItemVM, initialPersonas?: number) {
  return render(
    <LanguageProvider>
      <CartProvider>
        <ProductDetailClient
          empresa={empresa}
          item={item}
          showCart
          modalidadesEntrega={[] as ModalidadEntrega[]}
          initialPersonas={initialPersonas}
        />
        <CartProbe />
      </CartProvider>
    </LanguageProvider>
  );
}

describe('ProductDetailClient — añadir al carrito desde la ficha', () => {
  it('sin complementos, un solo clic añade el producto y no abre el selector', () => {
    renderDetail(buildItem());

    fireEvent.click(screen.getByRole('button', { name: /añadir al carrito/i }));

    expect(screen.getByTestId('cart-total')).toHaveTextContent('1');
    expect(screen.queryByText('Cantidad')).toBeNull();
  });

  it('con complementos, abre el selector para poder elegirlos', () => {
    renderDetail(
      buildItem({
        complementGroups: [
          {
            id: 'grupo-1',
            name: 'Extras',
            tipo: 'radio',
            obligatorio: true,
            opciones: [{ id: 'opcion-1', name: 'Extra', price: 1 }],
          },
        ],
      })
    );

    fireEvent.click(screen.getByRole('button', { name: /añadir al carrito/i }));

    expect(screen.getByText('Cantidad')).toBeInTheDocument();
    expect(screen.getByTestId('cart-total')).toHaveTextContent('0');
  });
});

// ─── Configurador de personas (kits) ─────────────────────────────────────────
// El shape exacto del kit Estándar 72H: base 199 € + 100 € por persona extra
// (paso 10000 céntimos), filas escaladas por la regla de cada una.
const KIT_PEOPLE_CONFIG = { min: 1, max: 10, pasoCents: 10000, filas: [null, null, null] };

describe('ProductDetailClient — configurador de personas (kits)', () => {
  it('stepper con precio vivo: +1 persona escala 199 € → 299 € y el carrito lleva el precio escalado + personas', () => {
    renderDetail(buildItem({ price: 199, peopleConfig: KIT_PEOPLE_CONFIG }));

    expect(screen.getByText(/199[,.]00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /aumentar personas/i }));
    expect(screen.getByText(/299[,.]00/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /añadir al carrito/i }));
    expect(screen.getByTestId('cart-total')).toHaveTextContent('1');
    expect(screen.getByTestId('cart-line-personas')).toHaveTextContent('2');
    // El ítem del carrito lleva el precio ESCALADO: el total mostrado
    // coincide con el que recalcula el server al cobrar.
    expect(screen.getByTestId('cart-line-price')).toHaveTextContent('299');
  });

  it('?personas=99 se clampa a max=10 en el render y el + queda deshabilitado', () => {
    renderDetail(buildItem({ price: 199, peopleConfig: KIT_PEOPLE_CONFIG }), 99);

    expect(screen.getByText(/1099[,.]00/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /aumentar personas/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /reducir personas/i })).toBeEnabled();
  });

  it('sin peopleConfig no hay stepper y el precio no cambia (render byte-igual al de siempre)', () => {
    renderDetail(buildItem({ price: 49.9 }));

    expect(screen.queryByRole('button', { name: /personas/i })).toBeNull();
    expect(screen.getByText(/49[,.]90/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /añadir al carrito/i }));
    expect(screen.getByTestId('cart-line-personas')).toHaveTextContent('');
    expect(screen.getByTestId('cart-line-price')).toHaveTextContent('49.9');
  });
});
