# Desplegable de subcategorías en el menú — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al tocar una pastilla de categoría del menú que tiene subcategorías con productos, abrir un diálogo centrado (en vez de scrollear directo) para elegir a cuál subcategoría saltar.

**Architecture:** `CategoryNav` bifurca su `onClick` por categoría: sin subcategorías (o todas vacías) sigue scrolleando directo; con subcategorías abre un único `<Dialog>` compartido cuyo contenido depende de la categoría clickeada. La animación de apertura usa un `transform-origin` calculado a partir de la posición del botón tocado, pasado como `style` inline solo a esa instancia — el `Dialog` base no cambia. Dos módulos de reglas puras nuevos (`subcategorias.ts`, `transform-origin.ts`) siguen el patrón ya establecido en `src/lib/waiter/banner-visibilidad.ts`.

**Tech Stack:** Next.js (React 19), Radix `Dialog` (ya en `src/components/ui/dialog.tsx`), Vitest + React Testing Library, Tailwind.

**Spec de referencia:** `docs/superpowers/specs/2026-09-11-menu-subcategory-dropdown-design.md`

---

## Notas de validación previa (spike ya ejecutado)

Antes de escribir este plan se verificó con código real, no por inspección:
- `CategoryNav` nunca tuvo tests — montarla en jsdom revienta con `ReferenceError: IntersectionObserver is not defined` (usada en un `useEffect` para resaltar la categoría visible). Necesita un stub en `tests/ui/setup.ts`.
- `Element.prototype.scrollIntoView` tampoco existe en jsdom; `category-nav.tsx` la llama para mantener la pastilla activa visible. Necesita el mismo tratamiento.
- El `<Dialog>` de Radix (`src/components/ui/dialog.tsx`) monta y abre limpio en jsdom sin polyfills de `hasPointerCapture` — no hace falta nada extra ahí.
- `scrollTo()` en `category-nav.tsx` difiere el `window.scrollTo` real dentro de un `requestAnimationFrame`. Los tests que verifiquen scroll DEBEN usar `await waitFor(() => expect(window.scrollTo).toHaveBeenCalled())`, nunca una aserción síncrona tras `fireEvent.click`.

Estos tres hallazgos ya están incorporados en las tareas de abajo — no hace falta redescubrirlos.

---

### Task 1: Módulo de reglas — subcategorías con productos

**Files:**
- Create: `src/lib/menu/subcategorias.ts`
- Test: `tests/compliance/menu-subcategorias.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/compliance/menu-subcategorias.test.ts
import { describe, it, expect } from 'vitest';
import { subcategoriasConProductos, tieneSubcategoriasConProductos } from '../../src/lib/menu/subcategorias';
import type { MenuCategoryVM, MenuSubcategoryVM } from '../../src/core/application/dtos/menu-view-model';

function subcat(id: string, productCount: number): MenuSubcategoryVM {
  return {
    id,
    nombre: id,
    products: Array.from({ length: productCount }, (_, i) => ({
      id: `${id}-p${i}`,
      name: `producto ${i}`,
      price: 1,
      category: id,
    })),
  };
}

function categoria(subcategories?: MenuSubcategoryVM[]): MenuCategoryVM {
  return { id: 'category-1', label: 'Mermeladas', items: [], subcategories };
}

describe('subcategoriasConProductos', () => {
  it('devuelve vacío si la categoría no tiene subcategorías', () => {
    expect(subcategoriasConProductos(categoria(undefined))).toEqual([]);
  });

  it('filtra las subcategorías sin productos', () => {
    const conProductos = subcat('sub-a', 2);
    const vacia = subcat('sub-b', 0);
    expect(subcategoriasConProductos(categoria([conProductos, vacia]))).toEqual([conProductos]);
  });
});

describe('tieneSubcategoriasConProductos', () => {
  it('es false sin subcategorías', () => {
    expect(tieneSubcategoriasConProductos(categoria(undefined))).toBe(false);
  });

  it('es false si TODAS las subcategorías están vacías', () => {
    expect(tieneSubcategoriasConProductos(categoria([subcat('sub-a', 0), subcat('sub-b', 0)]))).toBe(false);
  });

  it('es true si al menos una subcategoría tiene productos', () => {
    expect(tieneSubcategoriasConProductos(categoria([subcat('sub-a', 0), subcat('sub-b', 1)]))).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run tests/compliance/menu-subcategorias.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/menu/subcategorias'`

- [ ] **Step 3: Implementación mínima**

```ts
// src/lib/menu/subcategorias.ts
import type { MenuCategoryVM, MenuSubcategoryVM } from "@/core/application/dtos/menu-view-model";

/** Subcategorías con al menos un producto activo — las vacías no se pintan. */
export function subcategoriasConProductos(cat: MenuCategoryVM): MenuSubcategoryVM[] {
  return cat.subcategories?.filter((s) => s.products.length > 0) ?? [];
}

/**
 * Si la categoría tiene subcategorías visibles. Decide, en `CategoryNav`, si
 * la pastilla lleva chevron y abre el diálogo en vez de scrollear directo.
 */
export function tieneSubcategoriasConProductos(cat: MenuCategoryVM): boolean {
  return subcategoriasConProductos(cat).length > 0;
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run tests/compliance/menu-subcategorias.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/menu/subcategorias.ts tests/compliance/menu-subcategorias.test.ts
git commit -m "feat(menu): extraer subcategoriasConProductos como funcion pura"
```

---

### Task 2: Módulo de reglas — origen de la animación del diálogo

**Files:**
- Create: `src/lib/menu/transform-origin.ts`
- Test: `tests/compliance/menu-transform-origin.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/compliance/menu-transform-origin.test.ts
import { describe, it, expect } from 'vitest';
import { transformOriginFromClick } from '../../src/lib/menu/transform-origin';

describe('transformOriginFromClick', () => {
  it('da "0px 0px" cuando el click está en el centro exacto del viewport', () => {
    expect(transformOriginFromClick(500, 400, 1000, 800)).toBe('0px 0px');
  });

  it('da coordenadas negativas cuando el click está arriba a la izquierda del centro', () => {
    expect(transformOriginFromClick(100, 50, 1000, 800)).toBe('-400px -350px');
  });

  it('da coordenadas positivas cuando el click está abajo a la derecha del centro', () => {
    expect(transformOriginFromClick(900, 700, 1000, 800)).toBe('300px 300px');
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run tests/compliance/menu-transform-origin.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/menu/transform-origin'`

- [ ] **Step 3: Implementación mínima**

```ts
// src/lib/menu/transform-origin.ts

/**
 * Punto de origen (en píxeles, relativo al propio `DialogContent`) para que
 * la animación de apertura del diálogo de subcategorías "nazca" desde el
 * botón tocado en vez de crecer siempre desde el centro.
 *
 * `DialogContent` se posiciona con `top:50%; left:50%` ANTES de aplicar su
 * propio `translate(-50%,-50%)` — su esquina superior-izquierda (sin
 * transformar) cae exactamente en el centro del viewport. `transform-origin`
 * en píxeles es relativo a ESA esquina, así que restar el centro del
 * viewport a la posición del click da la coordenada local correcta sin
 * necesidad de medir el tamaño del panel.
 */
export function transformOriginFromClick(
  clickX: number,
  clickY: number,
  viewportWidth: number,
  viewportHeight: number,
): string {
  const originX = clickX - viewportWidth / 2;
  const originY = clickY - viewportHeight / 2;
  return `${originX}px ${originY}px`;
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run tests/compliance/menu-transform-origin.test.ts`
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/menu/transform-origin.ts tests/compliance/menu-transform-origin.test.ts
git commit -m "feat(menu): funcion pura para el transform-origin del dialogo"
```

---

### Task 3: Polyfills de jsdom para montar CategoryNav/MenuSection en tests

**Files:**
- Modify: `tests/ui/setup.ts`

- [ ] **Step 1: Agregar los stubs, al final del archivo**

Archivo completo actual (para ubicar el punto de inserción — se agrega DESPUÉS del bloque de `matchMedia`, que termina en `}` seguido de línea en blanco):

```ts
// tests/ui/setup.ts (agregar al final, después del bloque de matchMedia)

// jsdom tampoco implementa IntersectionObserver, y CategoryNav la usa para
// resaltar la categoría visible mientras se hace scroll. Sin este doble
// revienta con "IntersectionObserver is not defined" al montar — nunca se
// había topado nadie porque CategoryNav no tenía tests hasta ahora.
if (!window.IntersectionObserver) {
  class IntersectionObserverStub {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = () => [];
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    value: IntersectionObserverStub,
  });
}

// jsdom no implementa scrollIntoView. category-nav.tsx lo llama para mantener
// la pastilla activa visible dentro de la barra con scroll horizontal.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}
```

- [ ] **Step 2: Confirmar que no rompe nada existente**

Run: `npx vitest run tests/ui/`
Expected: PASS — todos los tests existentes en `tests/ui/` (incluido `carrito-por-mesa.test.tsx`) siguen en verde. Esta tarea no tiene test propio porque es infraestructura pura; la validan las Tasks 4 y 6 al montar componentes reales.

- [ ] **Step 3: Commit**

```bash
git add tests/ui/setup.ts
git commit -m "test(ui): agregar stubs de IntersectionObserver y scrollIntoView para jsdom"
```

---

### Task 4: Ancla DOM propia por subcategoría en `MenuSection`

**Files:**
- Modify: `src/components/menu-section.tsx:8` (import), `:18` (import), `:119-135` (uso del filtro), `:216` (contenedor de `SubcategorySection`)
- Test: `tests/ui/menu-section-subcategory-anchor.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```tsx
// tests/ui/menu-section-subcategory-anchor.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
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
        <MenuSection category={category} showCart={false} />
      </LanguageProvider>
    );
    expect(container.querySelector('#category-mermeladas')).not.toBeNull();
    expect(container.querySelector('#subcat-citricos')).not.toBeNull();
  });

  it('NO renderiza la subcategoría sin productos', () => {
    const { queryByText } = render(
      <LanguageProvider>
        <MenuSection category={category} showCart={false} />
      </LanguageProvider>
    );
    expect(queryByText('Vacía')).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run tests/ui/menu-section-subcategory-anchor.test.tsx`
Expected: FAIL — el primer test falla porque `#subcat-citricos` no existe todavía en el DOM (`SubcategorySection` no le pone `id`).

- [ ] **Step 3: Agregar el import del módulo nuevo**

Modificar `src/components/menu-section.tsx:18` — agregar la línea justo después del import existente de `menu-view-model`:

```ts
import { MenuCategoryVM, MenuItemVM, MenuSubcategoryVM } from "@/core/application/dtos/menu-view-model"
import { subcategoriasConProductos } from "@/lib/menu/subcategorias"
```

- [ ] **Step 4: Reemplazar el filtro inline por la función pura**

Buscar en `src/components/menu-section.tsx` (dentro de `MenuSection`, alrededor de la línea 119):

```tsx
      {category.subcategories && category.subcategories.length > 0 ? (
        <div className="space-y-8">
          {category.subcategories.filter(s => s.products.length > 0).map((subcat) => (
```

Reemplazar por:

```tsx
      {subcategoriasConProductos(category).length > 0 ? (
        <div className="space-y-8">
          {subcategoriasConProductos(category).map((subcat) => (
```

- [ ] **Step 5: Agregar el `id` y el `scroll-mt` al contenedor de la subcategoría**

Buscar dentro de `SubcategorySection` (alrededor de la línea 216):

```tsx
  return (
    <div className="space-y-3">
      <h3 className="font-serif text-lg font-semibold text-foreground flex items-center gap-2 min-w-0">
```

Reemplazar por:

```tsx
  return (
    <div id={subcategory.id} className="space-y-3 scroll-mt-20 sm:scroll-mt-32">
      <h3 className="font-serif text-lg font-semibold text-foreground flex items-center gap-2 min-w-0">
```

- [ ] **Step 6: Correr el test y confirmar que pasa**

Run: `npx vitest run tests/ui/menu-section-subcategory-anchor.test.tsx`
Expected: PASS — 2 tests

- [ ] **Step 7: Correr el resto de tests afectados por el cambio de filtro**

Run: `npx vitest run tests/compliance/menu-agrupacion.test.ts`
Expected: PASS — sin cambios de comportamiento, solo se cambió de dónde viene el filtro.

- [ ] **Step 8: Commit**

```bash
git add src/components/menu-section.tsx tests/ui/menu-section-subcategory-anchor.test.tsx
git commit -m "feat(menu): ancla DOM propia por subcategoria para poder scrollear directo"
```

---

### Task 5: Traducciones nuevas

**Files:**
- Modify: `src/lib/translations.ts:54` (bloque `es`), `:1054` (bloque `en`)

Nota: los strings vecinos de este mismo componente (`menuCategories`, `filterFood`, `filterDrinks`) solo existen en `es`/`en` — `fr`/`it`/`de` ya dependen del fallback a español que hace `t()` (`langObject[key] || translations.es[key]`, línea final del archivo). Esta tarea sigue ese mismo precedente en vez de inventar traducciones sin revisión nativa.

- [ ] **Step 1: Agregar las claves al bloque `es`**

Buscar en `src/lib/translations.ts:52-54`:

```ts
    menuCategories: "Categorías del catálogo",
    filterFood: "Comida",
    filterDrinks: "Bebidas",
```

Reemplazar por:

```ts
    menuCategories: "Categorías del catálogo",
    filterFood: "Comida",
    filterDrinks: "Bebidas",
    viewAllCollection: "Ver toda la colección",
    chooseSubcategory: "Elegí una subcategoría para ir directo",
```

- [ ] **Step 2: Agregar las claves al bloque `en`**

Buscar en `src/lib/translations.ts:1052-1054`:

```ts
    menuCategories: "Catalog categories",
    filterFood: "Food",
    filterDrinks: "Drinks",
```

Reemplazar por:

```ts
    menuCategories: "Catalog categories",
    filterFood: "Food",
    filterDrinks: "Drinks",
    viewAllCollection: "View all",
    chooseSubcategory: "Choose a subcategory to jump straight there",
```

- [ ] **Step 3: Verificar que TypeScript reconoce las claves nuevas**

Run: `pnpm typecheck`
Expected: PASS — sin errores (las claves nuevas quedan disponibles vía `keyof TranslationObject`, derivado del bloque `es`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/translations.ts
git commit -m "feat(i18n): agregar viewAllCollection y chooseSubcategory (es/en)"
```

---

### Task 6: `CategoryNav` — diálogo de subcategorías

**Files:**
- Modify: `src/components/category-nav.tsx` (completo — ver Step 3)
- Test: `tests/ui/category-nav-subcategorias.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```tsx
// tests/ui/category-nav-subcategorias.test.tsx
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
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run tests/ui/category-nav-subcategorias.test.tsx`
Expected: FAIL — el test de "click abre el diálogo" falla porque hoy el click scrollea directo sin importar si hay subcategorías; `screen.getByRole('dialog')` no encuentra nada.

- [ ] **Step 3: Reescribir `category-nav.tsx` completo**

Contenido completo del archivo (reemplaza el archivo entero):

```tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { MenuCategoryVM } from "@/core/application/dtos/menu-view-model"
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"
import { subcategoriasConProductos, tieneSubcategoriasConProductos } from "@/lib/menu/subcategorias"
import { transformOriginFromClick } from "@/lib/menu/transform-origin"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

interface CategoryNavProps {
  categories: MenuCategoryVM[]
  showTabs?: boolean
  tab?: 'comida' | 'bebidas'
  onTabChange?: (tab: 'comida' | 'bebidas') => void
  isWaiterMode?: boolean
}

export function CategoryNav(props: Readonly<CategoryNavProps>) {
  const { categories, showTabs, tab, onTabChange, isWaiterMode } = props;
  const [activeId, setActiveId] = useState(categories[0]?.id ?? "")
  const [subcatDialogFor, setSubcatDialogFor] = useState<string | null>(null)
  const [dialogOrigin, setDialogOrigin] = useState<string>("50% 50%")

  // Reset active category when the visible categories list changes (e.g. tab switch)
  useEffect(() => {
    setActiveId(categories[0]?.id ?? "")
  }, [categories])
  const { language } = useLanguage()
  const navRef = useRef<HTMLDivElement>(null)
  const isManualScrolling = useRef(false)
  const timeoutRef = useRef<NodeJS.Timeout>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (isManualScrolling.current) return

        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length > 0) {
          const sorted = [...visible].sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
          )
          setActiveId(sorted[0].target.id)
        }
      },
      { rootMargin: "-100px 0px -70% 0px", threshold: 0 }
    )

    for (const cat of categories) {
      const el = document.getElementById(cat.id)
      if (el) observer.observe(el)
    }

    return () => {
      observer.disconnect()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [categories])

  useEffect(() => {
    if (activeId && navRef.current) {
      const activeBtn = navRef.current.querySelector(`button[data-id="${activeId}"]`)
      if (activeBtn) {
        activeBtn.scrollIntoView({
          behavior: "instant",
          block: "nearest",
          inline: "center",
        })
      }
    }
  }, [activeId])

  // `activeCategoryId` es la pastilla que debe quedar resaltada — por
  // defecto la misma que el ancla de scroll, pero al saltar a una
  // SUBCATEGORÍA debe seguir siendo la de la categoría PADRE (ninguna
  // pastilla tiene el id de una subcategoría, así que sin este segundo
  // parámetro el resaltado desaparecería tras elegir una).
  const scrollTo = (id: string, activeCategoryId: string = id) => {
    const el = document.getElementById(id)
    if (el) {
      isManualScrolling.current = true
      setActiveId(activeCategoryId)

      requestAnimationFrame(() => {
        const offset = 140
        const elementPosition = el.getBoundingClientRect().top + window.scrollY
        const offsetPosition = elementPosition - offset

        window.scrollTo({ top: offsetPosition, behavior: "instant" })

        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => {
          isManualScrolling.current = false
        }, 300)
      })
    }
  }

  const openSubcategoryDialog = (catId: string, e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = rect.left + rect.width / 2
    const clickY = rect.top + rect.height / 2
    setDialogOrigin(transformOriginFromClick(clickX, clickY, window.innerWidth, window.innerHeight))
    setSubcatDialogFor(catId)
  }

  const pickAndClose = (targetId: string, activeCategoryId: string) => {
    setSubcatDialogFor(null)
    scrollTo(targetId, activeCategoryId)
  }

  const catLabel = (cat: MenuCategoryVM) =>
    (language !== "es" && cat.translations?.[language]?.name) || cat.label

  if (isWaiterMode) {
    return (
      <nav
        className="sticky top-[calc(3rem+56px)] z-40 w-full border-b border-border bg-background/95 backdrop-blur-sm"
        aria-label={t("menuCategories", language)}
      >
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="flex items-center gap-2 py-2">
            {showTabs && onTabChange && (
              <>
                {tab === 'bebidas' && (
                  <button
                    type="button"
                    onClick={() => onTabChange('comida')}
                    className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[36px] text-muted-foreground bg-secondary"
                  >
                    🍳 {t("filterFood", language)}
                  </button>
                )}
                {tab === 'comida' && (
                  <button
                    type="button"
                    onClick={() => onTabChange('bebidas')}
                    className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[36px] text-muted-foreground bg-secondary"
                  >
                    🥤 {t("filterDrinks", language)}
                  </button>
                )}
                <span className="h-5 w-px bg-border shrink-0" aria-hidden />
              </>
            )}
            <select
              value={activeId}
              onChange={(e) => scrollTo(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-ring cursor-pointer min-h-[36px] max-w-[200px]"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {catLabel(cat)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </nav>
    )
  }

  const activeDialogCategory = categories.find((c) => c.id === subcatDialogFor) ?? null

  return (
    <>
      <nav
        ref={navRef}
        className="sticky top-16 z-40 w-full overflow-x-auto border-b border-border bg-background/95 backdrop-blur-sm md:top-20 lg:top-20 [-webkit-overflow-scrolling:touch]"
        style={{ scrollMarginTop: 'var(--scroll-offset, 4rem)' }}
        aria-label={t("menuCategories", language)}
      >
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="flex flex-nowrap gap-1 py-2 items-center min-w-max">
            {showTabs && onTabChange && (
              <>
                {tab === 'bebidas' && (
                  <button
                    type="button"
                    onClick={() => onTabChange('comida')}
                    className="whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
                  >
                    🍳 {t("filterFood", language)}
                  </button>
                )}
                {tab === 'comida' && (
                  <button
                    type="button"
                    onClick={() => onTabChange('bebidas')}
                    className="whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
                  >
                    🥤 {t("filterDrinks", language)}
                  </button>
                )}
                <span className="h-5 w-px bg-border mx-1 shrink-0" aria-hidden />
              </>
            )}
            {categories.map((cat) => {
              const conSubcategorias = tieneSubcategoriasConProductos(cat)
              return (
                <button
                  key={cat.id}
                  data-id={cat.id}
                  type="button"
                  aria-haspopup={conSubcategorias ? "dialog" : undefined}
                  onClick={(e) => conSubcategorias ? openSubcategoryDialog(cat.id, e) : scrollTo(cat.id)}
                  className={cn(
                    "whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] min-w-[44px]",
                    activeId === cat.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
                  )}
                >
                  {catLabel(cat)}
                  {conSubcategorias && <span aria-hidden="true" className="ml-1">▾</span>}
                </button>
              )
            })}
          </div>
        </div>
      </nav>

      <Dialog
        open={subcatDialogFor !== null}
        onOpenChange={(open) => { if (!open) setSubcatDialogFor(null) }}
      >
        <DialogContent style={{ transformOrigin: dialogOrigin }} className="sm:max-w-sm">
          {activeDialogCategory && (
            <>
              <DialogHeader>
                <DialogTitle>{catLabel(activeDialogCategory)}</DialogTitle>
                <DialogDescription>{t("chooseSubcategory", language)}</DialogDescription>
              </DialogHeader>
              <ul className="max-h-72 overflow-y-auto -mx-1">
                <li>
                  <button
                    type="button"
                    onClick={() => pickAndClose(activeDialogCategory.id, activeDialogCategory.id)}
                    className="w-full text-left px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-secondary"
                  >
                    {t("viewAllCollection", language)}
                  </button>
                </li>
                {subcategoriasConProductos(activeDialogCategory).map((subcat) => (
                  <li key={subcat.id}>
                    <button
                      type="button"
                      onClick={() => pickAndClose(subcat.id, activeDialogCategory.id)}
                      className="w-full text-left px-3 py-2.5 rounded-md text-sm hover:bg-secondary"
                    >
                      {(language !== "es" && subcat.translations?.[language]?.name) || subcat.nombre}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run tests/ui/category-nav-subcategorias.test.tsx`
Expected: PASS — 7 tests

- [ ] **Step 5: Correr lint y typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS — sin warnings (S6819: todos los items del diálogo son `<button type="button">`, no `<div onClick>`; S6759: `Readonly<Props>` ya estaba en la firma original y se mantiene).

- [ ] **Step 6: Commit**

```bash
git add src/components/category-nav.tsx tests/ui/category-nav-subcategorias.test.tsx
git commit -m "feat(menu): dialogo de subcategorias en CategoryNav en vez de scroll directo"
```

---

### Task 7: Verificación final (REGLA DE ORO del proyecto)

**Files:** ninguno nuevo — solo verificación.

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: PASS — 0 errores, 0 warnings.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: PASS — compila sin errores (ignorar el aviso de "Skipping validation of types", es esperado en este proyecto).

- [ ] **Step 4: Suite completa de unit tests**

Run: `npx vitest run`
Expected: PASS — todos los tests, incluidos los 5 + 3 + 2 + 7 = 17 nuevos de este plan, en verde.

- [ ] **Step 5: Commit final si algo quedó sin commitear**

```bash
git status --short
```

Expected: sin salida (working tree limpio) — todos los commits ya se hicieron en las tareas anteriores.
