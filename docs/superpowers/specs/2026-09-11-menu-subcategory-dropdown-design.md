# Diseño: desplegable de subcategorías en la navegación del menú

**Fecha:** 2026-09-11
**Disparador:** almadarena.es (tipo `tienda`) organiza su catálogo en colecciones con subcategorías (ej. "Mermeladas" → "Frutas rojas", "Cítricos", "Tradicionales", "Sin azúcar añadido"). Hoy, tocar la pastilla "Mermeladas" en la barra de navegación superior scrollea al inicio de toda la colección; el usuario tiene que seguir bajando a mano para llegar a la subcategoría que le interesa.

## Objetivo

Al tocar una pastilla de categoría que tiene subcategorías con productos, mostrar un diálogo con la lista de subcategorías para saltar directo a la que el usuario elija. Las categorías sin subcategorías mantienen el comportamiento actual (scroll instantáneo, sin diálogo).

## Fuera de alcance

- El modo camarero de `CategoryNav` (`isWaiterMode`, `<select>` nativo) no se toca. almadarena.es es tipo `tienda` y no tiene sistema de camareros (ver fix del 2026-09-11 en `layout.tsx`); el select del modo camarero queda como está.
- No se agrega tracking de "subcategoría activa" al scroll (el `IntersectionObserver` existente sigue observando solo categorías de nivel superior, sin cambios).

## Comportamiento

1. Pastilla de categoría **sin** subcategorías con productos → comportamiento actual sin cambios: click = `scrollTo(cat.id)` inmediato.
2. Pastilla de categoría **con** subcategorías con productos → se renderiza con una flechita `▾` de sufijo. Al click:
   - Se captura la posición del botón en pantalla (`getBoundingClientRect()`).
   - Se abre un `Dialog` (controlado, compartido — uno solo para todas las categorías, no uno por categoría) centrado en la pantalla.
   - Título del diálogo: nombre de la categoría (con traducción según idioma activo, mismo criterio que `catLabel` ya existente).
   - Primera fila: "Ver toda la colección" → `scrollTo(cat.id)` (comportamiento de hoy) + cierra el diálogo.
   - Una fila por cada subcategoría con productos (mismo filtro `products.length > 0` que ya aplica `menu-section.tsx`) → `scrollTo(subcat.id)` + cierra el diálogo.
3. El diálogo se cierra igual que cualquier otro `Dialog` de la app: click en el backdrop, `Escape`, o al elegir una fila.

## Animación — "nace del botón"

El `Dialog` base (`src/components/ui/dialog.tsx`) no se modifica — sigue centrado (`top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%]`) para todos sus usos existentes (confirmaciones, detalle de producto, etc.).

Para esta instancia puntual, `CategoryNav` calcula un `transform-origin` inline y lo pasa como `style` al `DialogContent` de este diálogo:

```
originX = clickX_viewport - window.innerWidth / 2
originY = clickY_viewport - window.innerHeight / 2
style={{ transformOrigin: `${originX}px ${originY}px` }}
```

Esto funciona porque `top:50%; left:50%` posiciona la caja (antes del `translate`) con su esquina superior-izquierda exactamente en el centro del viewport — el `transform-origin` en píxeles es relativo a esa esquina, así que la resta contra el centro del viewport da la coordenada local correcta sin necesidad de medir el tamaño del panel. Verificado interactivamente con el usuario en un prototipo funcional (demo HTML con el mismo mecanismo) antes de escribir este spec.

**Nota de implementación:** la animación por defecto del `Dialog` (`zoom-in-95` → `zoom-in-100`, vía `tailwindcss-animate`) es sutil; para que el efecto "nace del botón" se note hace falta un punto de partida más chico que el 95% por defecto. Se ajusta a ojo durante la implementación (CSS puro, sin lógica adicional) — no bloquea el resto del diseño.

Solo esta apertura concreta usa el `transform-origin` dinámico; el resto de los diálogos de la app no se ven afectados.

## Cambios de código

### 1. `src/lib/menu/subcategorias.ts` (nuevo)

Función pura, mismo patrón de módulo de reglas que `src/lib/waiter/banner-visibilidad.ts`:

```ts
export function subcategoriasConProductos(cat: MenuCategoryVM): MenuSubcategoryVM[] {
  return cat.subcategories?.filter(s => s.products.length > 0) ?? [];
}

export function tieneSubcategoriasConProductos(cat: MenuCategoryVM): boolean {
  return subcategoriasConProductos(cat).length > 0;
}
```

`menu-section.tsx` reemplaza su filtro inline (`category.subcategories.filter(s => s.products.length > 0)`) por `subcategoriasConProductos(category)` — elimina la duplicación de la regla, no cambia el resultado.

### 2. `src/components/category-nav.tsx`

- Nuevo estado: `subcatDialogFor: string | null` (id de la categoría cuyo diálogo está abierto) y `origin: { x: number; y: number } | null`.
- El `map` de pastillas bifurca por `tieneSubcategoriasConProductos(cat)`:
  - `false` → `onClick={() => scrollTo(cat.id)}` (sin cambios).
  - `true` → chevron `▾` de sufijo; `onClick` captura coordenadas del click, fija `subcatDialogFor`/`origin`, NO scrollea todavía.
- Un único `<Dialog open={subcatDialogFor !== null} onOpenChange={(open) => !open && setSubcatDialogFor(null)}>` debajo del `<nav>`, cuyo contenido se resuelve buscando `categories.find(c => c.id === subcatDialogFor)`.
- Dentro: `DialogHeader`/`DialogTitle` con el nombre de categoría; lista de `<button type="button">` (S6819 — nunca `div` con `onClick`), una por "ver toda" + una por subcategoría, todas llamando `scrollTo(id)` y cerrando el diálogo.
- El `select` del modo camarero (`isWaiterMode`) no cambia.

### 3. `src/components/menu-section.tsx`

- El contenedor de `SubcategorySection` (hoy `<div className="space-y-3">`) pasa a `<div id={subcategory.id} className="space-y-3 scroll-mt-20 sm:scroll-mt-32">` — mismas clases de `scroll-mt` que ya usa la `<section>` de categoría, para que el offset del header sticky sea idéntico apuntando a categoría o a subcategoría.
- Reemplazo del filtro inline por `subcategoriasConProductos(category)` (ver punto 1).

### 4. `src/lib/translations.ts`

Nuevas claves (ES/EN/FR/IT/DE, sin texto hardcodeado — regla del proyecto):
- `viewAllCollection` → "Ver toda la colección" / "View all" / etc.
- `categorySubcategoriesMenu` (aria-label del diálogo/botón, ej. "Subcategorías de {categoria}").

## Testing

- **Unit (Vitest)** — `tests/.../subcategorias.test.ts`: casos con subcategorías vacías (`products: []` en todas), con alguna vacía y otra no, sin `subcategories` en absoluto, y con todas con productos.
- **Componente (React Testing Library)** — `CategoryNav`:
  - Pastilla sin subcategorías → click dispara scroll (mock de `getElementById`/`scrollTo`), sin diálogo.
  - Pastilla con subcategorías → click abre el diálogo, NO dispara scroll todavía.
  - Elegir "Ver toda la colección" → scrollea a `cat.id` y cierra el diálogo.
  - Elegir una subcategoría → scrollea a `subcat.id` y cierra el diálogo.
  - Categoría con subcategorías pero TODAS sin productos → se comporta como si no tuviera subcategorías (sin chevron, sin diálogo) — mismo criterio que ya aplica hoy `menu-section.tsx` al ocultarlas del render.

## Riesgos / notas

- El `id` de subcategoría es el UUID crudo de `categorias` (sin prefijo), distinto del `category-${id}` de las categorías padre — sin riesgo de colisión de anchors en el DOM (confirmado en `menu.mapper.ts`).
- Nada de esto toca RLS, auth, ni datos sensibles — es navegación pura del lado del cliente.
