# Diseño: mejora visual del diálogo de subcategorías

**Fecha:** 2026-09-12
**Disparador:** el diálogo de subcategorías (`CategoryNav`, implementado el 2026-09-11, ver `docs/superpowers/specs/2026-09-11-menu-subcategory-dropdown-design.md`) funciona pero se ve como una lista de texto plano sin jerarquía visual — cuesta distinguir de un vistazo "Ver toda la colección" de las subcategorías puntuales.

## Objetivo

Reforzar la jerarquía visual del listado dentro del diálogo con elementos puramente visuales (ícono + tipografía + espaciado), sin tocar la lógica de navegación ni el modelo de datos.

## Fuera de alcance

Explorado con mockups interactivos (`.superpowers/brainstorm/`) y descartado explícitamente por el usuario:

- **Emoji representativo por subcategoría** (ej. 🍓 para "Frutas rojas"). Requeriría un mapeo palabra→emoji poco confiable con nombres nuevos o en otros idiomas. Se prefiere un ícono neutro fijo.
- **Contador de productos** (badge con el número, en cualquier formato — con o sin la palabra "productos"). El usuario lo probó en un mockup y pidió explícitamente sacarlo: solo interesa la mejora de diseño, no información adicional.
- **Foto real por subcategoría**. Implicaría una feature nueva (columna de imagen en `categorias` + carga en el admin) — alcance muy superior al de este cambio.
- **Grilla de tarjetas 2×2**. Descartada en favor de mantener el formato de lista actual.

## Cambios visuales

Todo dentro de `src/components/category-nav.tsx`, en el `<ul>` del `<DialogContent>` del diálogo de subcategorías (líneas ~243-264 al momento de este diseño):

1. Cada `<li>` (incluida la fila "Ver toda la colección") suma un ícono neutro `▸` a la izquierda del texto, con `aria-hidden="true"` — es decorativo, no requiere clave de traducción ni cambia el árbol de accesibilidad (el `<button>` sigue anunciando solo su texto).
2. La fila "Ver toda la colección" sube de `font-medium` a `font-semibold`, reforzando que es la opción general, distinta de las subcategorías puntuales.
3. Se agrega un separador (`border-b border-border`) entre la fila "Ver toda la colección" y la lista de subcategorías, para que el grupo se lea de un vistazo: una opción general arriba, subcategorías específicas abajo.
4. El padding vertical de cada fila pasa de `py-2.5` a `py-3`.

**Mismo símbolo para todas las filas** (incluida "Ver toda la colección") — se descartó diferenciarla con un símbolo distinto (ej. `▾`) porque el criterio elegido en el mockup fue justamente "un ícono neutro fijo, sin depender de adivinar nada", y usar dos símbolos distintos reintroduciría esa dependencia de criterio caso por caso.

## Lo que NO cambia

- Lógica de `scrollTo` / `pickAndClose` / `openSubcategoryDialog`.
- El cálculo de `transform-origin` ("nace del botón") del diseño anterior.
- Claves de traducción existentes (`viewAllCollection`, `chooseSubcategory`) — no se agregan claves nuevas.
- El modo camarero (`isWaiterMode`, `<select>` nativo) — fuera de alcance, como en el diseño del 2026-09-11.
- El modelo de datos (`MenuCategoryVM`, `MenuSubcategoryVM`) y el esquema de `categorias`.

## Testing

- Los tests existentes de `CategoryNav` (`tests/ui/category-nav-subcategorias.test.tsx`) verifican comportamiento (qué se scrollea, cuándo se abre/cierra el diálogo), no el marcado exacto de cada fila — no deberían requerir cambios. Verificar al implementar que ningún test dependa de la ausencia del ícono o del `className` exacto de las filas.
- No se agregan tests nuevos: es un cambio puramente de presentación sin nueva lógica que verificar.

## Riesgos / notas

- Cambio de bajo riesgo: no toca datos, RLS, ni i18n. Solo clases de Tailwind y un `<span aria-hidden>` extra por fila.
- Verificar `pnpm lint && pnpm build` tras el cambio, por la regla del proyecto (`CLAUDE.md`).
