import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { CartProvider } from '@/lib/cart-context';
import { MenuSection } from '@/components/menu-section';
import type { MenuCategoryVM } from '@/core/application/dtos/menu-view-model';

const category: MenuCategoryVM = {
  id: 'category-mermeladas',
  label: 'Mermeladas',
  items: [],
  subcategories: [
    {
      id: 'subcat-citricos',
      nombre: 'Cítricos',
      products: [
        { id: 'p1', name: 'Mermelada de naranja', price: 4.5, category: 'category-mermeladas' },
      ],
    },
    {
      id: 'subcat-vacia',
      nombre: 'Vacía',
      products: [],
    },
  ],
};

describe('MenuSection — anclas de subcategoría', () => {
  it('renderiza un id propio por subcategoría con productos, distinto del id de la categoría', () => {
    const { container } = render(
      <LanguageProvider>
        <CartProvider>
          <MenuSection category={category} showCart={false} />
        </CartProvider>
      </LanguageProvider>
    );
    expect(container.querySelector('#category-mermeladas')).not.toBeNull();
    expect(container.querySelector('#subcat-citricos')).not.toBeNull();
  });

  it('NO renderiza la subcategoría sin productos', () => {
    const { queryByText } = render(
      <LanguageProvider>
        <CartProvider>
          <MenuSection category={category} showCart={false} />
        </CartProvider>
      </LanguageProvider>
    );
    expect(queryByText('Vacía')).toBeNull();
  });
});
