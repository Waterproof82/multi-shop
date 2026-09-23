# Segunda imagen de producto (empresas tipo tienda)

Estado: aprobado. 2026-09-22.

## Objetivo

Para empresas con `tipo = 'tienda'`, permitir subir una segunda imagen por
producto desde el panel de administración. En la carta pública, las dos
imágenes deben poder verse y seleccionarse:

1. En el modal de zoom (al pulsar la imagen de la tarjeta del producto).
2. En el popup de "Añadir al carrito" (`QuantitySelectorDialog`).

La tarjeta de producto en la grilla del menú **no cambia** — sigue mostrando
solo la primera imagen, igual que hoy.

## Alcance

- Empresas `tipo = 'restaurante'`: sin cambios. El campo `foto_url_2` puede
  existir en el dominio pero el admin no lo expone si `empresaTipo !==
  'tienda'`.
- Productos con una sola imagen (el caso de hoy, y todo `restaurante`): cero
  cambio visual. El selector de miniaturas solo aparece cuando hay
  `image2`.
- Video como imagen principal (`item.image` termina en `.mp4`): sin cambios,
  no se ofrece selector — el slot 2 es solo para fotos estáticas.
- Un solo `foto_object_fit` compartido para las dos imágenes del producto (no
  se duplica ese campo). Justificación: ambas pasan por el mismo pipeline de
  optimización (`optimizeImage()`, 480×480 WebP cuadrado), así que en la
  práctica no van a necesitar ajustes de encuadre distintos.

## Arquitectura y flujo de datos

Seguimos la Clean Architecture existente del proyecto: `API Route (Zod) →
Use Case → Repository`.

### 1. Base de datos

Migración nueva en `supabase/migrations/`, aplicada con `supabase db push
--linked` (nunca `apply_migration`/`execute_sql` sueltos):

```sql
ALTER TABLE public.productos
  ADD COLUMN foto_url_2 text NULL;
```

Sin bloque de RLS nuevo — es una columna sobre una tabla existente, ya
gobernada por las policies de `productos`. Sin GRANTs nuevos por el mismo
motivo.

### 2. Domain (`core/domain/entities/types.ts`)

```ts
export interface Product {
  // ...
  fotoUrl: string | null;
  fotoUrl2: string | null; // nuevo
  fotoObjectFit: ImageFit | null;
  // ...
}
```

### 3. Application

- `product.dto.ts`: `foto_url_2` en `createProductSchema`, misma validación
  que `foto_url` (`z.url()` + `refine` HTTPS, `.nullable().optional()`).
  `updateProductSchema` lo hereda vía `.partial()`.
- `IProductRepository.ts`: `CreateProductData.foto_url_2?: string | null`.

### 4. Infrastructure (`SupabaseProductRepository.ts`)

- `mapToDomain`: `fotoUrl2: row.foto_url_2 as string | null`.
- `create()`: insertar `foto_url_2: data.foto_url_2 || null`.
- `mapUpdateProductPayload()`: **no** añadir `foto_url_2` al array
  `fieldsToMap` (ese array no distingue `""` de `null`). Replicar el mismo
  bloque explícito que ya existe para `foto_url`:

  ```ts
  if (data.foto_url_2 !== undefined) {
    updatePayload.foto_url_2 = data.foto_url_2 === "" ? null : data.foto_url_2;
  }
  ```

  Motivo: si se mete en el allowlist genérico, borrar la segunda imagen desde
  el `ImageUploader` (que emite `""`) guardaría un string vacío en vez de
  `NULL` — mismo bug class que ya se evitó para `foto_url`.

### 5. Admin (`product-form-dialog.tsx`)

`ProductoFormData` gana `foto_url_2: string`. Segundo `<ImageUploader>`,
mismo patrón que el actual, renderizado solo cuando `empresaTipo ===
'tienda'`:

```tsx
{empresaTipo === 'tienda' && (
  <div className="col-span-2">
    <ImageUploader
      value={formData.foto_url_2}
      onChange={(url) => onFormChange({ ...formData, foto_url_2: url })}
      objectFit={formData.foto_object_fit}
      onObjectFitChange={(fit) => onFormChange({ ...formData, foto_object_fit: fit })}
      label={t("productImage2", language)}
      helpText={t("productImage2Help", language)}
    />
  </div>
)}
```

Comparte el mismo control de `foto_object_fit` que la primera imagen (no hay
`onObjectFitChange` duplicado con estado separado).

El componente padre (`productos/page.tsx`) necesita:
- Incluir `foto_url_2: ''` en el estado inicial de `ProductoFormData`.
- Mapear `foto_url_2` al construir el payload de create/update.
- Precargar `foto_url_2` al editar un producto existente.

### 6. Público — View Model

`menu-view-model.ts`: `MenuItemVM.image2?: string`.

`menu.mapper.ts` → `mapProductToItem`:
```ts
image2: product.fotoUrl2 || undefined,
```

### 7. Público — componente compartido `ProductImageGallery`

Nuevo componente en `src/components/product-image-gallery.tsx`. Encapsula:
imagen grande + tira de miniaturas (solo si hay `image2`) + estado local de
cuál está seleccionada.

```ts
interface ProductImageGalleryProps {
  images: string[];       // 1 o 2 URLs
  alt: string;
  objectFit?: ImageFit;
  mainImageClassName: string;   // el caller define el contenedor (aspect-ratio/alto)
  sizes: string;
}
```

Comportamiento:
- `images.length === 1`: solo renderiza la imagen grande, sin tira de
  miniaturas — output idéntico al actual, no hay diferencia de DOM/CSS para
  el caso de una sola foto.
- `images.length === 2`: imagen grande + fila de 2 botones-miniatura debajo.
  Click en una miniatura cambia cuál se ve ampliada (estado local
  `selectedIndex`, arranca en 0 cada vez que el diálogo se abre).
- Usa `ImagenSubida` internamente (nunca `next/image` directo — regla del
  proyecto, ver `docs/context/imagenes.md`).

Consumido en dos puntos:

**a) Modal de zoom — `menu-section.tsx`**
Reemplaza el `<Image>` suelto dentro del `Dialog` de zoom (líneas ~451-468)
por `<ProductImageGallery images={item.image2 ? [item.image, item.image2] : [item.image]} .../>`,
conservando el contenedor `aspect-square sm:aspect-[4/3]` actual como
`mainImageClassName`.

**b) Popup "Añadir al carrito" — `quantity-selector-dialog.tsx`**
`DialogMedia` gana una rama: si `item.image` no es video y existe
`item.image2`, usa `ProductImageGallery` con `mainImageClassName` igual al
contenedor actual (`h-40 sm:h-48 w-full`). La tira de miniaturas se agrega
**debajo** de ese contenedor (no superpuesta), así que el diálogo crece
~40px solo para productos con segunda imagen — para productos con una sola
imagen, la altura del diálogo no cambia.

Si `item.image` es `.mp4`, sigue usando la rama de `<video>` actual sin
tocar — el slot 2 nunca aplica a video.

### 8. Traducciones

Nuevas claves en `src/lib/translations.ts`, en los 5 bloques de idioma
(es/en/fr/it/de), junto a las existentes `productImage`/`productImageHelp`:

- `productImage2` (label del segundo uploader en el admin)
- `productImage2Help` (texto de ayuda del segundo uploader)
- Aria-label de cada miniatura en la galería pública (reutiliza el patrón de
  `viewImage`, ej. `${t('viewImage', lang)} ${index + 1}`) — no hace falta
  clave nueva para esto.

## Testing

- `tests/compliance/imagenes-sin-doble-optimizacion.test.ts`: el nuevo
  componente `ProductImageGallery` usa `ImagenSubida`, no `next/image`
  directo — no debería requerir tocar el test, pero si el test enumera
  ficheros explícitos, añadir `product-image-gallery.tsx` a esa lista.
- Test unitario para `mapProductToItem` (menu.mapper): confirma que
  `image2` se mapea desde `fotoUrl2` y queda `undefined` cuando es `null`.
- Test de `mapUpdateProductPayload` (o el existente que cubre `foto_url`):
  añadir caso equivalente para `foto_url_2` verificando que `""` → `null`.
- Manual/E2E: crear producto en empresa tipo tienda con 2 imágenes, verificar
  zoom y popup muestran ambas y permiten alternar; crear producto en empresa
  tipo restaurante, verificar que el segundo uploader no aparece.

## Fuera de alcance (YAGNI)

- Más de 2 imágenes por producto (el usuario pidió "hasta dos").
- `foto_object_fit` independiente por imagen.
- Cambios en `MenuItemCard` (grilla) para mostrar ambas imágenes o un
  indicador de "2 fotos".
- JSON-LD / structured data con array de imágenes (mejora de SEO posible a
  futuro, no pedida).
