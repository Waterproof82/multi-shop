# Segunda imagen de producto (tiendas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let empresas `tipo = 'tienda'` add a second product photo in the admin panel, and show both photos (selectable via thumbnails) in the public menu's image zoom modal and the "add to cart" quantity popup.

**Architecture:** New nullable `foto_url_2` column on `productos`, threaded through the existing Clean Architecture layers (`Product` domain type → Zod DTOs → `IProductRepository`/`SupabaseProductRepository` → `MenuItemVM.image2` via `menu.mapper.ts`). A new shared presentational component `ProductImageGallery` (main image + optional thumbnail row) replaces the single-image markup in both public dialogs. The admin form gets a second `ImageUploader`, gated on `empresaTipo === 'tienda'`, reusing the existing single `foto_object_fit` control for both images.

**Tech Stack:** Next.js 15 / React, TypeScript, Zod, Supabase (Postgres + RLS), Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-22-segunda-imagen-producto-design.md`

---

## Task 1: Database migration — `foto_url_2` column

**Files:**
- Create: `supabase/migrations/20260922000002_productos_foto_url_2.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Second product photo, only used by empresas tipo 'tienda'. Reuses the
-- existing foto_object_fit column for both images (same 480x480 WebP
-- pipeline, so a shared fit is enough — see
-- docs/superpowers/specs/2026-09-22-segunda-imagen-producto-design.md).

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS foto_url_2 text NULL;
```

- [ ] **Step 2: Apply the migration the only correct way**

Run: `supabase db push --linked`

This is the only path that writes the version into
`supabase_migrations.schema_migrations` using the migration file's own
timestamp. Never use `mcp__supabase__apply_migration` or `execute_sql` for
this (see the "Migraciones" section of `CLAUDE.md` — that's how the
2026-09-11 migration-history drift happened).

- [ ] **Step 3: Run the DB smoke checklist**

Run: `pnpm db:smoke`
Expected: all checks pass (this migration doesn't touch any function with
`digest()`, so it should be a no-op confirmation).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260922000002_productos_foto_url_2.sql
git commit -m "feat(db): add foto_url_2 column to productos"
```

---

## Task 2: Domain type + Zod DTOs

**Files:**
- Modify: `src/core/domain/entities/types.ts:39`
- Modify: `src/core/application/dtos/product.dto.ts:27-53`
- Test: `tests/core/product-dto-foto-url-2.test.ts`

- [ ] **Step 1: Add `fotoUrl2` to the `Product` domain type**

In `src/core/domain/entities/types.ts`, change:

```ts
  precio: number;
  fotoUrl: string | null;
  fotoObjectFit: ImageFit | null;
```

to:

```ts
  precio: number;
  fotoUrl: string | null;
  fotoUrl2: string | null;
  fotoObjectFit: ImageFit | null;
```

- [ ] **Step 2: Write the failing DTO test**

```ts
// tests/core/product-dto-foto-url-2.test.ts
import { describe, it, expect } from 'vitest';
import { createProductSchema, updateProductSchema } from '@/core/application/dtos/product.dto';

const base = {
  empresaId: '11111111-1111-1111-8111-111111111111',
  titulo_es: 'Camiseta',
  precio: 19.99,
};

describe('createProductSchema — foto_url_2', () => {
  it('conserva foto_url_2 en el resultado parseado', () => {
    const parsed = createProductSchema.safeParse({ ...base, foto_url_2: 'https://cdn.example.com/foto2.webp' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.foto_url_2).toBe('https://cdn.example.com/foto2.webp');
    }
  });

  it('conserva foto_url_2 null en el resultado parseado', () => {
    const parsed = createProductSchema.safeParse({ ...base, foto_url_2: null });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.foto_url_2).toBeNull();
    }
  });

  it('rechaza una URL HTTP (no HTTPS)', () => {
    const parsed = createProductSchema.safeParse({ ...base, foto_url_2: 'http://cdn.example.com/foto2.webp' });
    expect(parsed.success).toBe(false);
  });
});

describe('updateProductSchema — foto_url_2', () => {
  it('permite actualizar solo foto_url_2', () => {
    const parsed = updateProductSchema.safeParse({
      id: '22222222-2222-2222-8222-222222222222',
      foto_url_2: 'https://cdn.example.com/foto2.webp',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.foto_url_2).toBe('https://cdn.example.com/foto2.webp');
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test tests/core/product-dto-foto-url-2.test.ts`
Expected: FAIL on the 3 "conserva"/"permite" assertions — Zod's default
`z.object()` mode strips unrecognized keys instead of rejecting them, so
`foto_url_2` silently disappears from `parsed.data` until the schema
recognizes it (only the "rechaza HTTP" test would pass by accident at this
point, since the invalid value gets stripped rather than validated — that's
exactly why the other assertions check `parsed.data`, not just
`parsed.success`).

- [ ] **Step 4: Add `foto_url_2` to both schemas**

In `src/core/application/dtos/product.dto.ts`, change:

```ts
  foto_url: z.url().refine(
    (url) => url.startsWith('https://'),
    { message: 'foto_url must use HTTPS' }
  ).nullable().optional(),
  foto_object_fit: z.enum(imageFitValues).nullable().optional(),
```

to:

```ts
  foto_url: z.url().refine(
    (url) => url.startsWith('https://'),
    { message: 'foto_url must use HTTPS' }
  ).nullable().optional(),
  foto_url_2: z.url().refine(
    (url) => url.startsWith('https://'),
    { message: 'foto_url_2 must use HTTPS' }
  ).nullable().optional(),
  foto_object_fit: z.enum(imageFitValues).nullable().optional(),
```

(`updateProductSchema` already inherits this via `createProductSchema.partial()` — no change needed there.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test tests/core/product-dto-foto-url-2.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/core/domain/entities/types.ts src/core/application/dtos/product.dto.ts tests/core/product-dto-foto-url-2.test.ts
git commit -m "feat(domain): add fotoUrl2 to Product type and DTOs"
```

---

## Task 3: Repository — interface + Supabase implementation

**Files:**
- Modify: `src/core/domain/repositories/IProductRepository.ts:16`
- Modify: `src/core/infrastructure/database/SupabaseProductRepository.ts`
- Test: `tests/core/supabase-product-repository-foto-url-2.test.ts`

- [ ] **Step 1: Add `foto_url_2` to `CreateProductData`**

In `src/core/domain/repositories/IProductRepository.ts`, change:

```ts
  precio: number;
  foto_url?: string | null;
  foto_object_fit?: ImageFit | null;
```

to:

```ts
  precio: number;
  foto_url?: string | null;
  foto_url_2?: string | null;
  foto_object_fit?: ImageFit | null;
```

- [ ] **Step 2: Write the failing test for the empty-string-to-null helper**

This introduces `emptyStringToNull`, a module-level pure function extracted
from the existing `foto_url` logic in `mapUpdateProductPayload` so both
`foto_url` and `foto_url_2` share it (removes the duplication this task
would otherwise add, and makes the null-coercion rule unit-testable without
mocking Supabase).

```ts
// tests/core/supabase-product-repository-foto-url-2.test.ts
import { describe, it, expect } from 'vitest';
import { emptyStringToNull } from '@/core/infrastructure/database/SupabaseProductRepository';

describe('emptyStringToNull', () => {
  it('convierte string vacío en null', () => {
    expect(emptyStringToNull('')).toBeNull();
  });

  it('deja pasar una URL tal cual', () => {
    expect(emptyStringToNull('https://cdn.example.com/foto.webp')).toBe('https://cdn.example.com/foto.webp');
  });

  it('deja pasar undefined tal cual (campo no enviado)', () => {
    expect(emptyStringToNull(undefined)).toBeUndefined();
  });

  it('deja pasar null tal cual', () => {
    expect(emptyStringToNull(null)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test tests/core/supabase-product-repository-foto-url-2.test.ts`
Expected: FAIL — `emptyStringToNull` is not exported yet.

- [ ] **Step 4: Extract the helper and wire up `foto_url_2` in the repository**

In `src/core/infrastructure/database/SupabaseProductRepository.ts`, add
this exported function right after the `TRANSIENT_ERROR_PATTERN` constant
(before the class):

```ts
export function emptyStringToNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  return value === "" ? null : value;
}
```

In `mapToDomain`, change:

```ts
      precio: Number.parseFloat(row.precio as string),
      fotoUrl: row.foto_url as string | null,
      fotoObjectFit: (row.foto_object_fit as string | null) as Product['fotoObjectFit'],
```

to:

```ts
      precio: Number.parseFloat(row.precio as string),
      fotoUrl: row.foto_url as string | null,
      fotoUrl2: row.foto_url_2 as string | null,
      fotoObjectFit: (row.foto_object_fit as string | null) as Product['fotoObjectFit'],
```

In `create()`, change:

```ts
          precio: data.precio,
          foto_url: data.foto_url || null,
          foto_object_fit: data.foto_object_fit || 'contain',
```

to:

```ts
          precio: data.precio,
          foto_url: data.foto_url || null,
          foto_url_2: data.foto_url_2 || null,
          foto_object_fit: data.foto_object_fit || 'contain',
```

In `mapUpdateProductPayload`, change:

```ts
    if (data.foto_url !== undefined) {
      updatePayload.foto_url = data.foto_url === "" ? null : data.foto_url;
    }
```

to:

```ts
    if (data.foto_url !== undefined) {
      updatePayload.foto_url = emptyStringToNull(data.foto_url);
    }

    if (data.foto_url_2 !== undefined) {
      updatePayload.foto_url_2 = emptyStringToNull(data.foto_url_2);
    }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test tests/core/supabase-product-repository-foto-url-2.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/core/domain/repositories/IProductRepository.ts src/core/infrastructure/database/SupabaseProductRepository.ts tests/core/supabase-product-repository-foto-url-2.test.ts
git commit -m "feat(repo): read/write foto_url_2 in SupabaseProductRepository"
```

---

## Task 4: Public view model — `MenuItemVM.image2`

**Files:**
- Modify: `src/core/application/dtos/menu-view-model.ts:51`
- Modify: `src/core/application/mappers/menu.mapper.ts:79`
- Test: `tests/core/menu-mapper-image2.test.ts`

- [ ] **Step 1: Add `image2` to `MenuItemVM`**

In `src/core/application/dtos/menu-view-model.ts`, change:

```ts
  category: string;
  image?: string;
  imageFit?: ImageFit;
```

to:

```ts
  category: string;
  image?: string;
  image2?: string;
  imageFit?: ImageFit;
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/core/menu-mapper-image2.test.ts
import { describe, it, expect } from 'vitest';
import { MenuMapper } from '@/core/application/mappers/menu.mapper';
import type { Product, Category } from '@/core/domain/entities/types';

function buildCategory(): Category {
  return {
    id: 'cat-1', empresaId: 'e1', nombre: 'Ropa', descripcion: null, orden: 0,
    tipoProducto: 'comida', categoriaComplementoDe: null, complementoObligatorio: false,
    categoriaPadreId: null, activo: true,
  } as Category;
}

function buildProduct(overrides: Partial<Product>): Product {
  return {
    id: 'p1', empresaId: 'e1', categoriaId: 'cat-1',
    titulo_es: 'Remera', titulo_en: null, titulo_fr: null, titulo_it: null, titulo_de: null,
    descripcion_es: null, descripcion_en: null, descripcion_fr: null, descripcion_it: null, descripcion_de: null,
    precio: 10, fotoUrl: 'https://cdn.example.com/1.webp', fotoUrl2: null, fotoObjectFit: 'cover',
    esEspecial: false, activo: true, tipoProducto: 'comida', createdAt: new Date(),
    alergenos: [], tabla: null,
    ...overrides,
  } as Product;
}

describe('MenuMapper — image2', () => {
  it('mapea fotoUrl2 a image2 cuando existe', () => {
    const vm = MenuMapper.toSubcategoryVM(buildCategory(), [
      buildProduct({ fotoUrl2: 'https://cdn.example.com/2.webp' }),
    ]);
    expect(vm.products[0].image2).toBe('https://cdn.example.com/2.webp');
  });

  it('image2 queda undefined cuando fotoUrl2 es null', () => {
    const vm = MenuMapper.toSubcategoryVM(buildCategory(), [buildProduct({})]);
    expect(vm.products[0].image2).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test tests/core/menu-mapper-image2.test.ts`
Expected: FAIL — `image2` is `undefined` in both cases (mapper doesn't set it yet), so the first assertion fails.

- [ ] **Step 4: Map `fotoUrl2` in `mapProductToItem`**

In `src/core/application/mappers/menu.mapper.ts`, change:

```ts
    category: categoryName.toLowerCase().replaceAll(" ", "-"),
    image: product.fotoUrl || undefined,
    imageFit: product.fotoObjectFit || undefined,
```

to:

```ts
    category: categoryName.toLowerCase().replaceAll(" ", "-"),
    image: product.fotoUrl || undefined,
    image2: product.fotoUrl2 || undefined,
    imageFit: product.fotoObjectFit || undefined,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test tests/core/menu-mapper-image2.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/core/application/dtos/menu-view-model.ts src/core/application/mappers/menu.mapper.ts tests/core/menu-mapper-image2.test.ts
git commit -m "feat(menu): expose product image2 in MenuItemVM"
```

---

## Task 5: Admin form — second `ImageUploader` for `tienda`

**Files:**
- Modify: `src/components/admin/product-form-dialog.tsx`
- Modify: `src/app/admin/(protected)/productos/page.tsx`

- [ ] **Step 1: Add `foto_url_2` to `ProductoFormData`**

In `src/components/admin/product-form-dialog.tsx`, change:

```ts
  precio: string;
  foto_url: string;
  foto_object_fit: ImageFit;
```

to:

```ts
  precio: string;
  foto_url: string;
  foto_url_2: string;
  foto_object_fit: ImageFit;
```

- [ ] **Step 2: Render the second uploader, gated on `empresaTipo === 'tienda'`**

In `src/components/admin/product-form-dialog.tsx`, right after the existing
`<ImageUploader>` block (the one bound to `formData.foto_url`), add:

```tsx
            <div className="col-span-2">
              <ImageUploader
                value={formData.foto_url}
                onChange={(url) => onFormChange({ ...formData, foto_url: url })}
                objectFit={formData.foto_object_fit}
                onObjectFitChange={(fit) => onFormChange({ ...formData, foto_object_fit: fit })}
                label={t("productImage", language)}
                helpText={t("productImageHelp", language)}
              />
            </div>

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

(replacing just the original single `<div className="col-span-2"><ImageUploader .../></div>` block — the first uploader's own props are unchanged, only the second block is new.)

- [ ] **Step 3: Wire `foto_url_2` through `productos/page.tsx`**

In `src/app/admin/(protected)/productos/page.tsx`:

Change the `Producto` interface:

```ts
  precio: number;
  foto_url: string | null;
  foto_object_fit: ImageFit | null;
```

to:

```ts
  precio: number;
  foto_url: string | null;
  foto_url_2: string | null;
  foto_object_fit: ImageFit | null;
```

Change `emptyForm`:

```ts
  precio: '',
  foto_url: '',
  foto_object_fit: 'contain',
```

to:

```ts
  precio: '',
  foto_url: '',
  foto_url_2: '',
  foto_object_fit: 'contain',
```

Change the submit payload (inside `handleSubmit`):

```ts
        foto_url: formData.foto_url || null,
        foto_object_fit: formData.foto_object_fit || 'contain',
```

to:

```ts
        foto_url: formData.foto_url || null,
        foto_url_2: formData.foto_url_2 || null,
        foto_object_fit: formData.foto_object_fit || 'contain',
```

Change `openEditModal`:

```ts
      foto_url: producto.foto_url || '',
      foto_object_fit: producto.foto_object_fit || 'contain',
```

to:

```ts
      foto_url: producto.foto_url || '',
      foto_url_2: producto.foto_url_2 || '',
      foto_object_fit: producto.foto_object_fit || 'contain',
```

- [ ] **Step 4: Typecheck**

Run: `pnpm build`
Expected: no TypeScript errors (this task is UI wiring with no dedicated
unit test — `ProductoFormData` type-checks across both files, which is the
real safety net here).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/product-form-dialog.tsx "src/app/admin/(protected)/productos/page.tsx"
git commit -m "feat(admin): second product image uploader for tienda"
```

---

## Task 6: Translations — `productImage2` / `productImage2Help`

**Files:**
- Modify: `src/lib/translations.ts`

- [ ] **Step 1: Add the Spanish keys (required — `TranslationObject` is derived from `translations.es`)**

In `src/lib/translations.ts`, in the `es` block, change:

```ts
    productImage: "Imagen del producto",
    productImageHelp: "Proporción recomendada: 4:3. Se verá completa sin recortes.",
```

to:

```ts
    productImage: "Imagen del producto",
    productImageHelp: "Proporción recomendada: 4:3. Se verá completa sin recortes.",
    productImage2: "Imagen del producto (2)",
    productImage2Help: "Segunda foto opcional. Se muestra junto a la primera en la tienda.",
```

- [ ] **Step 2: Add the English keys (matching the existing `productImage`/`productImageHelp` precedent — `fr`/`it`/`de` fall back to `es` automatically via `t()`, same as today)**

In `src/lib/translations.ts`, in the `en` block, change:

```ts
    productImage: "Product image",
    productImageHelp: "Recommended ratio: 4:3. Displayed in full without cropping.",
```

to:

```ts
    productImage: "Product image",
    productImageHelp: "Recommended ratio: 4:3. Displayed in full without cropping.",
    productImage2: "Product image (2)",
    productImage2Help: "Optional second photo. Shown alongside the first one in the shop.",
```

- [ ] **Step 3: Typecheck**

Run: `pnpm build`
Expected: no TypeScript errors — `t("productImage2", language)` (used in
Task 5) now resolves against `TranslationObject`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/translations.ts
git commit -m "feat(i18n): add productImage2 translation keys"
```

---

## Task 7: Shared `ProductImageGallery` component

**Files:**
- Create: `src/components/product-image-gallery.tsx`
- Modify: `tests/compliance/imagenes-sin-doble-optimizacion.test.ts:36-53`

- [ ] **Step 1: Write the component**

```tsx
// src/components/product-image-gallery.tsx
'use client';

import { useState } from 'react';
import { ImagenSubida } from '@/components/ui/imagen-subida';
import type { ImageFit } from '@/core/application/dtos/menu-view-model';

interface ProductImageGalleryProps {
  images: string[];
  alt: string;
  objectFit?: ImageFit;
  mainImageClassName: string;
  sizes: string;
}

/**
 * Imagen grande + tira de miniaturas para elegir entre las (hasta 2) fotos
 * de un producto. Con una sola imagen no renderiza miniaturas — el output
 * es idéntico a un <ImagenSubida> suelto.
 */
export function ProductImageGallery({
  images,
  alt,
  objectFit,
  mainImageClassName,
  sizes,
}: Readonly<ProductImageGalleryProps>) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeSrc = images[selectedIndex] ?? images[0];

  return (
    <div>
      <div className={mainImageClassName}>
        <ImagenSubida
          src={activeSrc}
          alt={alt}
          fill
          className={`object-${objectFit || 'cover'}`}
          sizes={sizes}
        />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 justify-center py-2 bg-background/95">
          {images.map((src, index) => (
            <button
              key={src}
              type="button"
              onClick={() => setSelectedIndex(index)}
              aria-label={`${alt} ${index + 1}`}
              aria-current={index === selectedIndex}
              className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
                index === selectedIndex ? 'border-primary' : 'border-border'
              }`}
            >
              <ImagenSubida src={src} alt="" fill className="object-cover" sizes="48px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the new file to the anti-double-optimization compliance list**

In `tests/compliance/imagenes-sin-doble-optimizacion.test.ts`, change:

```ts
const DEBEN_USAR_ENVOLTORIO = [
  'src/components/menu-section.tsx',
  'src/components/cart-drawer.tsx',
  'src/components/quantity-selector-dialog.tsx',
```

to:

```ts
const DEBEN_USAR_ENVOLTORIO = [
  'src/components/menu-section.tsx',
  'src/components/cart-drawer.tsx',
  'src/components/quantity-selector-dialog.tsx',
  'src/components/product-image-gallery.tsx',
```

- [ ] **Step 3: Run the compliance test**

Run: `pnpm test tests/compliance/imagenes-sin-doble-optimizacion.test.ts`
Expected: PASS — the new file already imports from `imagen-subida` and never imports `next/image` directly.

- [ ] **Step 4: Commit**

```bash
git add src/components/product-image-gallery.tsx tests/compliance/imagenes-sin-doble-optimizacion.test.ts
git commit -m "feat(ui): add ProductImageGallery shared component"
```

---

## Task 8: Wire the zoom modal in `menu-section.tsx`

**Files:**
- Modify: `src/components/menu-section.tsx`

- [ ] **Step 1: Import the new component**

Add, near the other local imports:

```ts
import { ProductImageGallery } from "@/components/product-image-gallery"
```

- [ ] **Step 2: Replace the single-image zoom block**

Change:

```tsx
      {item.image && !item.image.endsWith(".mp4") && (
        <Dialog open={isImageZoomOpen} onOpenChange={setIsImageZoomOpen}>
          <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-2xl p-0 overflow-hidden border-none bg-transparent shadow-none">
            <DialogHeader className="sr-only">
              <DialogTitle>{displayName}</DialogTitle>
              <DialogDescription>{displayName}</DialogDescription>
            </DialogHeader>
            <div className="relative aspect-square w-full sm:aspect-[4/3]">
              <Image
                src={item.image}
                alt={displayName}
                fill
                className="object-contain"
                sizes="(max-width: 768px) 100vw, 700px"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
```

to:

```tsx
      {item.image && !item.image.endsWith(".mp4") && (
        <Dialog open={isImageZoomOpen} onOpenChange={setIsImageZoomOpen}>
          <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-2xl p-0 overflow-hidden border-none bg-transparent shadow-none">
            <DialogHeader className="sr-only">
              <DialogTitle>{displayName}</DialogTitle>
              <DialogDescription>{displayName}</DialogDescription>
            </DialogHeader>
            <ProductImageGallery
              images={item.image2 ? [item.image, item.image2] : [item.image]}
              alt={displayName}
              objectFit="contain"
              mainImageClassName="relative aspect-square w-full sm:aspect-[4/3]"
              sizes="(max-width: 768px) 100vw, 700px"
            />
          </DialogContent>
        </Dialog>
      )}
```

(`objectFit="contain"` is hardcoded here on purpose — this matches the
existing zoom-modal behavior, which always shows the full image uncropped
regardless of the card's configured `imageFit`.)

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm build && pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/menu-section.tsx
git commit -m "feat(menu): show both product images in the zoom modal"
```

---

## Task 9: Wire the "add to cart" popup in `quantity-selector-dialog.tsx`

**Files:**
- Modify: `src/components/quantity-selector-dialog.tsx`

- [ ] **Step 1: Swap the `ImagenSubida` import for `ProductImageGallery`**

Change:

```ts
import { ImagenSubida } from "@/components/ui/imagen-subida"
```

to:

```ts
import { ProductImageGallery } from "@/components/product-image-gallery"
```

- [ ] **Step 2: Replace `DialogMedia` with a video-only helper**

Change:

```tsx
/**
 * Imagen (o video) de cabecera del dialogo. Los productos con `.mp4` en
 * `image` (mismo campo que usan las tarjetas del catalogo) no tienen un
 * fotograma fijo utilizable como imagen: se reproducen igual que en
 * `menu-section.tsx` en vez de mostrarse rotos.
 */
function DialogMedia({ item, alt }: Readonly<{ item: MenuItemVM; alt: string }>) {
  if (item.image?.endsWith('.mp4')) {
    return (
      <video
        src={item.image}
        autoPlay
        loop
        muted
        playsInline
        className="h-full w-full object-cover"
        aria-label={alt}
      />
    );
  }
  return (
    <ImagenSubida
      src={item.image!}
      alt={alt}
      fill
      sizes="100vw"
      className={`object-${item.imageFit || 'cover'}`}
      loading="eager"
    />
  );
}
```

to:

```tsx
/**
 * Video de cabecera del dialogo para productos con `.mp4` en `image` (mismo
 * campo que usan las tarjetas del catalogo): no tienen un fotograma fijo
 * utilizable como imagen, así que se reproducen igual que en
 * `menu-section.tsx` en vez de mostrarse rotos. El slot de segunda imagen
 * (`image2`) no aplica a video.
 */
function DialogVideo({ src, alt }: Readonly<{ src: string; alt: string }>) {
  return (
    <video
      src={src}
      autoPlay
      loop
      muted
      playsInline
      className="h-full w-full object-cover"
      aria-label={alt}
    />
  );
}
```

- [ ] **Step 3: Update the call site**

Change:

```tsx
        {item.image && (
          <div className="relative h-40 sm:h-48 w-full shrink-0 overflow-hidden bg-muted">
            <DialogMedia item={item} alt={displayName} />
          </div>
        )}
```

to:

```tsx
        {item.image?.endsWith('.mp4') && (
          <div className="relative h-40 sm:h-48 w-full shrink-0 overflow-hidden bg-muted">
            <DialogVideo src={item.image} alt={displayName} />
          </div>
        )}
        {item.image && !item.image.endsWith('.mp4') && (
          <div className="shrink-0 bg-muted">
            <ProductImageGallery
              images={item.image2 ? [item.image, item.image2] : [item.image]}
              alt={displayName}
              objectFit={item.imageFit}
              mainImageClassName="relative h-40 sm:h-48 w-full overflow-hidden"
              sizes="100vw"
            />
          </div>
        )}
```

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm build && pnpm lint`
Expected: no errors. In particular, confirm no unused-import warning for the
old `ImagenSubida` import (removed in Step 1) and that `DialogMedia` has no
leftover references.

- [ ] **Step 5: Commit**

```bash
git add src/components/quantity-selector-dialog.tsx
git commit -m "feat(cart): show both product images in the add-to-cart popup"
```

---

## Task 10: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass, including every test added in Tasks 2-4 and 7.

- [ ] **Step 2: Run the REGLA DE ORO checks**

Run: `pnpm lint && pnpm build`
Expected: both succeed with zero errors (per `CLAUDE.md`, no task is done
until this passes).

- [ ] **Step 3: Manual QA — tienda empresa**

1. `pnpm dev`, log into an admin account for an empresa with `tipo =
   'tienda'`.
2. Open `/admin/productos`, create or edit a product: confirm a second
   "Imagen del producto (2)" uploader appears below the first, upload an
   image, save.
3. On the public menu for that empresa, click the product card's image:
   confirm the zoom modal shows the enlarged image plus 2 thumbnails below
   it, and clicking the second thumbnail swaps the enlarged image.
4. Click "Añadir al carrito" for the same product: confirm the popup header
   shows the same 2-thumbnail selector and swapping works there too.
5. Repeat steps 3-4 for a product with only one image: confirm no
   thumbnails render and nothing looks different from before this change.

- [ ] **Step 4: Manual QA — restaurante empresa**

1. Log into an admin account for an empresa with `tipo = 'restaurante'`.
2. Open `/admin/productos`, create or edit a product: confirm there is
   **no** second image uploader.
3. Confirm the public menu (zoom modal, add-to-cart popup) for this
   empresa's products is visually unchanged from before this change.

- [ ] **Step 5: Final commit (if manual QA required fixes)**

```bash
git add -A
git status
```

Only commit if Steps 3-4 above surfaced something that needed a code fix;
otherwise this task produces no new changes to commit.
