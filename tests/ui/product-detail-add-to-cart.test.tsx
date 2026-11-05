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
  const { totalItems } = useCart();
  return <span data-testid="cart-total">{totalItems}</span>;
}

function renderDetail(item: MenuItemVM) {
  return render(
    <LanguageProvider>
      <CartProvider>
        <ProductDetailClient
          empresa={empresa}
          item={item}
          showCart
          modalidadesEntrega={[] as ModalidadEntrega[]}
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
