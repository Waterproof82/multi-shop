import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { CartProvider } from '@/lib/cart-context';
import { MenuSection } from '@/components/menu-section';
import type { MenuCategoryVM } from '@/core/application/dtos/menu-view-model';

function buildCategory(itemOverrides: Partial<MenuCategoryVM['items'][number]> = {}): MenuCategoryVM {
  return {
    id: 'category-kits',
    label: 'Kits',
    items: [
      {
        id: 'p1',
        name: 'Kit básico',
        price: 49.9,
        category: 'category-kits',
        alergenos: ['gluten'],
        ...itemOverrides,
      },
    ],
  };
}

function renderMenuSection(category: MenuCategoryVM, props: { showCart?: boolean; isTienda?: boolean } = {}) {
  return render(
    <LanguageProvider>
      <CartProvider>
        <MenuSection category={category} showCart={props.showCart ?? false} isTienda={props.isTienda} />
      </CartProvider>
    </LanguageProvider>
  );
}

describe('MenuItemCard — enlace "Ver producto" y alergenos por tipo de tenant', () => {
  it('restaurante (isTienda=false, pinning): muestra alergenos y NO renderiza el enlace "Ver producto"', () => {
    const category = buildCategory({ slug: 'kit-basico' });
    renderMenuSection(category, { isTienda: false });

    expect(screen.getByRole('img', { name: /gluten/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /ver producto/i })).toBeNull();
  });

  it('tienda con slug: renderiza el enlace con href correcto y nombre accesible, y oculta los alergenos', () => {
    const category = buildCategory({ slug: 'kit-basico' });
    renderMenuSection(category, { isTienda: true });

    const link = screen.getByRole('link', { name: /ver producto.*kit básico/i });
    expect(link).toHaveAttribute('href', '/producto/kit-basico');
    expect(screen.queryByRole('img', { name: /gluten/i })).toBeNull();
  });

  it('tienda sin slug: NO renderiza el enlace "Ver producto"', () => {
    const category = buildCategory({ slug: undefined });
    renderMenuSection(category, { isTienda: true });

    expect(screen.queryByRole('link', { name: /ver producto/i })).toBeNull();
  });

  it('al pulsar el enlace "Ver producto" no se dispara el añadir al carrito', () => {
    const category = buildCategory({ slug: 'kit-basico' });
    renderMenuSection(category, { isTienda: true, showCart: true });

    const link = screen.getByRole('link', { name: /ver producto.*kit básico/i });
    fireEvent.click(link);

    expect(screen.queryByText('Cantidad')).toBeNull();
  });
});
