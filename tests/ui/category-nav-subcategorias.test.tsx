import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { CategoryNav } from '@/components/category-nav';
import type { MenuCategoryVM } from '@/core/application/dtos/menu-view-model';

const CON_SUBCATEGORIAS: MenuCategoryVM = {
  id: 'category-mermeladas',
  label: 'Mermeladas',
  items: [],
  subcategories: [
    {
      id: 'subcat-citricos',
      nombre: 'Cítricos',
      products: [{ id: 'p1', name: 'x', price: 1, category: 'category-mermeladas' }],
    },
    { id: 'subcat-vacia', nombre: 'Vacía', products: [] },
  ],
};

const SIN_SUBCATEGORIAS: MenuCategoryVM = {
  id: 'category-salsas',
  label: 'Salsas',
  items: [{ id: 'p2', name: 'y', price: 2, category: 'category-salsas' }],
};

const TODAS_VACIAS: MenuCategoryVM = {
  id: 'category-todas-vacias',
  label: 'Todas vacías',
  items: [],
  subcategories: [{ id: 'sub-x', nombre: 'X', products: [] }],
};

function renderNav(categories: MenuCategoryVM[]) {
  return render(
    <LanguageProvider>
      <CategoryNav categories={categories} />
    </LanguageProvider>
  );
}

// scrollTo() dentro de CategoryNav consulta document.getElementById antes de
// scrollear — sin un elemento real con ese id, no hace nada.
function stubAnchor(id: string) {
  const el = document.createElement('div');
  el.id = id;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
  window.scrollTo = vi.fn();
});

describe('CategoryNav — categorías sin subcategorías (sin cambios)', () => {
  it('click scrollea directo, sin diálogo', async () => {
    stubAnchor('category-salsas');
    renderNav([SIN_SUBCATEGORIAS]);

    fireEvent.click(screen.getByRole('button', { name: 'Salsas' }));

    await waitFor(() => expect(window.scrollTo).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('CategoryNav — categorías con subcategorías', () => {
  it('click abre el diálogo y NO scrollea todavía', () => {
    stubAnchor('category-mermeladas');
    renderNav([CON_SUBCATEGORIAS]);

    fireEvent.click(screen.getByRole('button', { name: /Mermeladas/ }));

    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).not.toBeNull();
  });

  it('"Ver toda la colección" scrollea a la categoría y cierra el diálogo', async () => {
    stubAnchor('category-mermeladas');
    renderNav([CON_SUBCATEGORIAS]);
    fireEvent.click(screen.getByRole('button', { name: /Mermeladas/ }));

    fireEvent.click(screen.getByText('Ver toda la colección'));

    await waitFor(() => expect(window.scrollTo).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('elegir una subcategoría scrollea a SU id y cierra el diálogo', async () => {
    stubAnchor('subcat-citricos');
    renderNav([CON_SUBCATEGORIAS]);
    fireEvent.click(screen.getByRole('button', { name: /Mermeladas/ }));

    fireEvent.click(screen.getByText('Cítricos'));

    await waitFor(() => expect(window.scrollTo).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('subcategorías sin productos NO aparecen listadas en el diálogo', () => {
    stubAnchor('category-mermeladas');
    renderNav([CON_SUBCATEGORIAS]);

    fireEvent.click(screen.getByRole('button', { name: /Mermeladas/ }));

    expect(screen.queryByText('Vacía')).toBeNull();
  });

  it('tras elegir una subcategoría, la pastilla PADRE queda marcada como activa', async () => {
    stubAnchor('subcat-citricos');
    renderNav([CON_SUBCATEGORIAS, SIN_SUBCATEGORIAS]);
    fireEvent.click(screen.getByRole('button', { name: /Mermeladas/ }));

    fireEvent.click(screen.getByText('Cítricos'));
    await waitFor(() => expect(window.scrollTo).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: /Mermeladas/ }).className).toMatch(/bg-primary/);
  });
});

describe('CategoryNav — categoría con subcategorías pero TODAS vacías', () => {
  it('se comporta como si no tuviera subcategorías: scrollea directo, sin diálogo', async () => {
    stubAnchor('category-todas-vacias');
    renderNav([TODAS_VACIAS]);

    fireEvent.click(screen.getByRole('button', { name: 'Todas vacías' }));

    await waitFor(() => expect(window.scrollTo).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
