# Banner con modo slider — Diseño

**Fecha:** 2026-09-23
**Estado:** Aprobado, pendiente de plan de implementación

## Contexto

Hoy la sección "Apariencia" del admin (`EmpresaAparienciaForm`) solo permite configurar un banner estático: logo, imagen de fondo, ajuste (`contain`/`cover`/`fill`) y descripción. Esos campos se pintan en `HeroBanner` en la página pública del menú.

Se pide agregar un segundo modo: un slider de hasta 5 imágenes que rota automáticamente, como alternativa completa al banner estático (no un complemento).

## Decisiones tomadas

1. **El slider reemplaza TODO** — cuando está activo no hay logo, título, subtítulo ni descripción encima; solo las imágenes rotando con flechas y dots.
2. **El modo se elige con un pill switch** ("Imagen fija" | "Slider") arriba de la sección Apariencia. Al activar Slider se ocultan logo/imagen/ajuste/descripción (quedan guardados en DB, no se borran) y aparece el gestor de imágenes del slider.
3. **Alt text genérico**, no traducible: `Banner de {empresa.nombre}` para todas las imágenes. Sin campo nuevo en el admin.
4. **Reorden con drag and drop**, reutilizando `@dnd-kit/core` + `@dnd-kit/sortable` (ya usados en `categorias/page.tsx`).
5. **Tope de 5 imágenes.**
6. **Navegación pública:** flechas `‹ ›` (visibles en hover/tap) + dots clickeables.
7. **Autoplay cada 5 segundos**, se pausa con hover/focus y al navegar manualmente; se desactiva del todo si el sistema tiene `prefers-reduced-motion` (mismo criterio que ya usa `HeroBanner` vía `useReducedMotion`).

## Arquitectura de datos

No se crea tabla nueva — dos columnas nuevas en `empresas`, que hereda el RLS existente de esa tabla (no aplica el checklist de migración de tabla nueva, que es solo para tablas nuevas):

```sql
ALTER TABLE public.empresas
  ADD COLUMN tipo_banner text NOT NULL DEFAULT 'imagen'
    CHECK (tipo_banner IN ('imagen', 'slider')),
  ADD COLUMN banner_slides jsonb NOT NULL DEFAULT '[]'::jsonb;
```

- `tipo_banner` decide qué componente renderiza la página pública.
- `banner_slides` es `string[]` (URLs), tope 5, guardado por **reemplazo total** en cada PUT — mismo patrón que `replaceReceta` / `setProductoGrupos`. No hay altas/bajas incrementales en el backend.

### Capas afectadas

| Capa | Cambio |
|---|---|
| `core/domain/entities/types.ts` | `Empresa` y `EmpresaPublic` ganan `tipoBanner: 'imagen' \| 'slider'` y `bannerSlides: string[]` |
| `core/application/dtos/empresa.dto.ts` | `tipo_banner: z.enum(['imagen','slider']).optional()`, `banner_slides: z.array(httpsUrl).max(5).optional()` |
| `core/infrastructure/database/supabase-empresa.repository.ts` | Ambos campos van a `CAMPOS_DIRECTOS` (no `CAMPOS_TEXTO`): `tipo_banner` nunca debe caer a `null` (enum con default obligatorio) y `banner_slides: []` es un valor legítimo que `camposTextoPresentes` convertiría mal con su `|| null` |
| `app/api/admin/empresa/route.ts` | Agregar ambos campos al payload de `GET` y aceptarlos en `PUT` (ya cubierto por el schema) |

## Admin — `EmpresaAparienciaForm`

- Pill switch arriba de la sección, controla `tipo_banner`. Guardado inmediato al cambiar, mismo patrón que `handleBannerFitChange`.
- **Modo "Imagen fija"**: UI actual sin cambios (logo, imagen, ajuste, descripción).
- **Modo "Slider"**: reemplaza esa UI por un gestor de imágenes:
  - Grid de hasta 5 miniaturas, cada una con botón de borrar.
  - Slot para agregar imagen vía `ImageUploader` (`isBannerImage` → optimización 1920px WebP, misma que la imagen de fondo actual), oculto/deshabilitado al llegar a 5.
  - Reorden con `@dnd-kit`: `arrayMove` local sobre el array en memoria + un solo PUT con el array completo al soltar (no hace falta el patrón "PUT por fila" de categorías, porque acá no hay filas independientes en DB, es un solo campo `jsonb`).

## Página pública — `SliderBanner`

Componente nuevo `src/components/slider-banner.tsx`:

- Mismo alto fijo que `HeroBanner` (`h-[200px] md:h-[280px]`) para no saltar el layout al cambiar de modo.
- Solo imágenes — sin logo/título/subtítulo/descripción.
- Autoplay 5s vía `setInterval`; pausa en hover/focus y tras navegación manual (reinicia el timer); desactivado por completo si `useReducedMotion()` es `true`.
- Flechas `<button type="button">` con `aria-label` traducido (visibles en hover/tap) + dots clickeables. Touch targets ≥44px (regla de accesibilidad del proyecto).
- `alt` de cada imagen: `Banner de {empresa.nombre}` vía `t()`/interpolación simple, no traducible por imagen.
- `client-menu-page.tsx` (línea 346) elige entre `HeroBanner` y `SliderBanner` según `empresa?.tipoBanner`.
- Si `tipoBanner === 'slider'` y `bannerSlides` está vacío, no se renderiza nada — mismo criterio que `HeroBanner` hoy con `urlImage` null.

## Calidad y accesibilidad (reglas del proyecto)

- Props del componente nuevo siempre `Readonly<Props>` (S6759).
- Botones de navegación: `<button type="button">`, nunca `<div role="button">` (S6819/S6848).
- Sin ternarios anidados (S3358) — la lógica de "qué botón/imagen mostrar" va en funciones de módulo con `if/return`.
- `pnpm lint && pnpm build` obligatorio tras el cambio, sin marcar nada como completado si fallan.
- Tras aplicar la migración: `pnpm db:smoke` y `pnpm e2e:db`.
- Agregar el componente nuevo a la lista de `tests/compliance/imagenes-sin-doble-optimizacion.test.ts` si pinta imágenes subidas por `ImageUploader` (usar `ImagenSubida`, nunca `next/image`, para las imágenes del slider en la página pública).

## Fuera de alcance

- Alt text traducible por imagen.
- Intervalo de autoplay configurable por el admin.
- Migración/import de banners existentes de otras empresas.
- Más de 5 imágenes.
