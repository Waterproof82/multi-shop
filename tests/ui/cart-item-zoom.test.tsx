/**
 * Dentro del carrito, pulsar un producto abre el mismo zoom de foto que la
 * carta (ImageZoomDialog). Lo pulsable es foto + nombre, NO la fila entera:
 * la fila tiene -, + y papelera, y un toque fallido en ellos no debe abrir la
 * foto. Sin foto (o con video) no hay nada que ampliar: no hay boton.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { CartDrawer } from '@/components/cart-drawer';
import { CartProvider, useCart } from '@/lib/cart-context';
import { LanguageProvider } from '@/lib/language-context';
import type { MenuItemVM } from '@/core/application/dtos/menu-view-model';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const CON_FOTO: MenuItemVM = {
  id: 'prod-foto',
  name: 'Bateria con foto',
  price: 10,
  category: 'cat-1',
  image: 'https://imagenes.example/bateria.webp',
};

const SIN_FOTO: MenuItemVM = {
  id: 'prod-sin-foto',
  name: 'Bateria sin foto',
  price: 5,
  category: 'cat-1',
};

const CON_VIDEO: MenuItemVM = {
  id: 'prod-video',
  name: 'Bateria en video',
  price: 7,
  category: 'cat-1',
  image: 'https://imagenes.example/bateria.mp4',
};

function SembrarCarrito({ items, children }: Readonly<{ items: MenuItemVM[]; children: ReactNode }>) {
  const { addItem, openCart } = useCart();
  useEffect(() => {
    for (const item of items) addItem(item, 1);
    openCart();
    // Solo al montar: sembrar el carrito una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{children}</>;
}

function pintarCarrito(items: MenuItemVM[]) {
  return render(
    <LanguageProvider>
      <CartProvider>
        <SembrarCarrito items={items}>
          <CartDrawer isRestaurant={false} />
        </SembrarCarrito>
      </CartProvider>
    </LanguageProvider>
  );
}

describe('CartDrawer — zoom de la foto de un item', () => {
  it('pulsar un item con foto abre el zoom con el nombre del producto', () => {
    pintarCarrito([CON_FOTO]);

    fireEvent.click(screen.getByRole('button', { name: 'Ver imagen ampliada: Bateria con foto' }));

    const zoom = screen.getByRole('dialog', { name: 'Bateria con foto' });
    expect(within(zoom).getByRole('img', { name: 'Bateria con foto' })).toBeInTheDocument();
  });

  it('un item sin foto no ofrece zoom', () => {
    pintarCarrito([SIN_FOTO]);

    expect(screen.getByText('Bateria sin foto')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ver imagen ampliada/ })).toBeNull();
  });

  it('un item con video no ofrece zoom (el zoom es de fotos)', () => {
    pintarCarrito([CON_VIDEO]);

    expect(screen.queryByRole('button', { name: /Ver imagen ampliada/ })).toBeNull();
  });

  it('pulsar "+" cambia la cantidad y NO abre el zoom', () => {
    pintarCarrito([CON_FOTO]);

    fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad' }));

    expect(screen.queryByRole('dialog', { name: 'Bateria con foto' })).toBeNull();
  });
});
