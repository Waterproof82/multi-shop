# Banner con modo slider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un segundo modo de banner ("slider") que el admin puede elegir en vez del banner estático actual: hasta 5 imágenes que rotan solas cada 5s en la página pública del menú, sin logo/título/descripción.

**Architecture:** Dos columnas nuevas en `empresas` (`tipo_banner`, `banner_slides jsonb`) recorren las capas existentes (domain → DTO Zod → repositorio → API → admin form → página pública) siguiendo el mismo patrón que ya usan `logo_url`/`url_image`/`banner_fit`. Dos componentes nuevos: `BannerSliderManager` (admin, gestor drag-and-drop de imágenes) y `SliderBanner` (público, carrusel con autoplay).

**Tech Stack:** Next.js App Router, TypeScript, Zod, Supabase, `@dnd-kit/core`+`@dnd-kit/sortable` (ya en el repo), `framer-motion` (ya en el repo), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-23-banner-slider-design.md`

---

## Convenciones a seguir (ya presentes en el repo, no las reinventes)

- Payload de update: `camposPresentes`/`camposTextoPresentes` en `src/core/infrastructure/database/update-payload.ts`. Campos booleanos/arrays/enums van SIEMPRE a `camposPresentes` (nunca a `camposTextoPresentes`, que convierte falsy a `null`).
- Drag and drop: `@dnd-kit/core` + `@dnd-kit/sortable`, mismo setup que `src/app/admin/(protected)/categorias/page.tsx` (`useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))`, `useSortable({ id })`, `CSS.Transform.toString(transform)`).
- Subida de imágenes: reutilizar `ImageUploader` (`src/components/ui/image-uploader.tsx`) con `isBannerImage` (optimiza a 1920px WebP). Nunca `next/image` directo sobre su salida — usar `ImagenSubida` (`src/components/ui/imagen-subida.tsx`).
- Traducciones: `t(key, language)` cae a `es` si la clave no existe en el idioma activo (`src/lib/translations.ts:3748`). Las claves de UI del panel admin históricamente solo se agregan a los bloques `es` y `en` (ver `bannerHelp`, `bannerFitLabel`, etc.) — seguir ese mismo patrón para las claves nuevas.
- Props de componentes nuevos: siempre `Readonly<Props>` (regla S6759 del proyecto).
- Botones: siempre `<button type="button">`, nunca `<div role="button">`.

---

### Task 1: Migración de base de datos

**Files:**
- Create: `supabase/migrations/20260923000001_banner_slider.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- Banner con modo slider: permite elegir entre imagen fija (actual) o hasta
-- 5 imágenes que rotan automáticamente en la página pública del menú.
-- No requiere RLS/GRANTs nuevos: son columnas sobre `empresas`, que ya tiene
-- su propio RLS y sus GRANTs a authenticated/anon.
ALTER TABLE public.empresas
  ADD COLUMN tipo_banner text NOT NULL DEFAULT 'imagen'
    CHECK (tipo_banner IN ('imagen', 'slider')),
  ADD COLUMN banner_slides jsonb NOT NULL DEFAULT '[]'::jsonb;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260923000001_banner_slider.sql
git commit -m "feat(db): agregar columnas tipo_banner y banner_slides a empresas"
```

- [ ] **Step 3: CHECKPOINT — aplicar la migración (requiere confirmación explícita del usuario)**

El proyecto Supabase linkeado es producción real (tenants reales, no sandbox). **No corras el siguiente comando sin que el usuario lo confirme explícitamente en esa sesión.**

```bash
supabase db push --linked
```

Después de aplicarla, verificar que quedó 1:1 en el historial:

```bash
supabase migration list
```

`Local` y `Remote` deben mostrar `20260923000001` en la misma fila. Si no aplicás la migración ahora, podés seguir con el resto de las tareas (código) y aplicarla al final — pero nada de lo público funcionará hasta que la columna exista.

---

### Task 2: Tipos de dominio, DTO Zod y contrato del repositorio

**Files:**
- Modify: `src/core/domain/entities/types.ts:107-140` (interface `Empresa`) y `:150-170` (interface `EmpresaPublic`)
- Modify: `src/core/domain/repositories/IEmpresaRepository.ts:3-32` (interface `UpdateEmpresaData`)
- Modify: `src/core/application/dtos/empresa.dto.ts:7-40` (`updateEmpresaSchema`)

- [ ] **Step 1: Agregar los campos a `Empresa` en `types.ts`**

En la interface `Empresa`, justo después de la línea `bannerFit: "contain" | "cover" | "fill" | null;`:

```typescript
  tipoBanner: "imagen" | "slider";
  bannerSlides: string[];
```

- [ ] **Step 2: Agregar los mismos campos a `EmpresaPublic` en `types.ts`**

En la interface `EmpresaPublic`, justo después de su propia línea `bannerFit: "contain" | "cover" | "fill" | null;`:

```typescript
  tipoBanner: "imagen" | "slider";
  bannerSlides: string[];
```

- [ ] **Step 3: Agregar los campos a `UpdateEmpresaData` en `IEmpresaRepository.ts`**

Justo después de la línea `banner_fit?: string | null;`:

```typescript
  tipo_banner?: 'imagen' | 'slider';
  banner_slides?: string[];
```

- [ ] **Step 4: Agregar los campos al schema Zod en `empresa.dto.ts`**

Justo después de la línea `banner_fit: z.enum(['contain', 'cover', 'fill']).optional().or(z.literal('')).or(z.null()),`:

```typescript
  tipo_banner: z.enum(['imagen', 'slider']).optional(),
  banner_slides: z.array(httpsUrl).max(5).optional(),
```

- [ ] **Step 5: Verificar que compila**

Run: `pnpm typecheck`
Expected: FALLA — `SupabaseAdminRepository.mapEmpresa` y `SupabaseEmpresaRepository` todavía no devuelven `tipoBanner`/`bannerSlides`, así que TypeScript se queja de que falta esa propiedad en el objeto `Empresa`/`EmpresaPublic` que construyen. Es el fallo esperado; se resuelve en las próximas dos tareas.

- [ ] **Step 6: Commit**

```bash
git add src/core/domain/entities/types.ts src/core/domain/repositories/IEmpresaRepository.ts src/core/application/dtos/empresa.dto.ts
git commit -m "feat(empresa): agregar tipo_banner y banner_slides a tipos y DTO"
```

---

### Task 3: Repositorio — TDD sobre `construirPayloadEmpresa`

**Files:**
- Modify: `tests/compliance/empresa-update-payload.test.ts`
- Modify: `src/core/infrastructure/database/supabase-empresa.repository.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `tests/compliance/empresa-update-payload.test.ts` (antes del cierre del `describe('combinaciones', ...)` existente, como bloque nuevo):

```typescript
describe('banner slider: tipo_banner y banner_slides son campos directos', () => {
  it('incluye tipo_banner tal cual', () => {
    expect(construirPayloadEmpresa({ tipo_banner: 'slider' })).toEqual({ tipo_banner: 'slider' });
  });

  it('un array vacío de banner_slides se guarda como array vacío, no como null', () => {
    // Si esto pasara por camposTextoPresentes, `[] || null` lo convertiría en
    // null y la columna volvería a su DEFAULT — perdiendo que el admin vació
    // deliberadamente el slider.
    expect(construirPayloadEmpresa({ banner_slides: [] })).toEqual({ banner_slides: [] });
  });

  it('conserva el array completo de banner_slides', () => {
    const slides = ['https://cdn.example.com/a.webp', 'https://cdn.example.com/b.webp'];
    expect(construirPayloadEmpresa({ banner_slides: slides })).toEqual({ banner_slides: slides });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/compliance/empresa-update-payload.test.ts`
Expected: FAIL — los tres `it` nuevos devuelven `{}` porque `tipo_banner`/`banner_slides` todavía no están en `CAMPOS_DIRECTOS`.

- [ ] **Step 3: Agregar los campos a `CAMPOS_DIRECTOS`**

En `src/core/infrastructure/database/supabase-empresa.repository.ts`, modificar el array `CAMPOS_DIRECTOS` (línea ~30):

```typescript
const CAMPOS_DIRECTOS = [
  'tipo_impuesto', 'porcentaje_impuesto', 'mostrar_logo', 'validacion_pedidos_habilitada',
  'mostrar_promociones', 'mostrar_tgtg', 'descuento_bienvenida_activo',
  'descuento_bienvenida_porcentaje', 'descuento_bienvenida_duracion', 'tipo',
  'envio_domicilio_habilitado', 'tipo_banner', 'banner_slides',
] as const satisfies ReadonlyArray<keyof UpdateEmpresaData>;
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run tests/compliance/empresa-update-payload.test.ts`
Expected: PASS

- [ ] **Step 5: Leer `tipo_banner`/`banner_slides` en `getById`**

En el mismo archivo, en el `.select(...)` de `getById` (línea ~57), agregar `tipo_banner, banner_slides` a la lista de columnas (al final, junto a `razon_social`).

En el objeto que devuelve `getById` (después de la línea `bannerFit: (empresa.banner_fit as "contain" | "cover" | "fill" | null) ?? "contain",`), agregar:

```typescript
          tipoBanner: (empresa.tipo_banner as "imagen" | "slider" | undefined) ?? "imagen",
          bannerSlides: Array.isArray(empresa.banner_slides) ? (empresa.banner_slides as string[]) : [],
```

- [ ] **Step 6: Leer `tipo_banner`/`banner_slides` en `PUBLIC_SELECT` / `mapToEmpresaPublic`**

Agregar `tipo_banner, banner_slides,` a la constante `PUBLIC_SELECT` (línea ~223), junto a `logo_url, mostrar_logo, url_image, banner_fit,`.

En `mapToEmpresaPublic` (línea ~248), después de la línea `bannerFit: (data.banner_fit as "contain" | "cover" | "fill" | null) ?? "contain",`, agregar:

```typescript
      tipoBanner: (data.tipo_banner as "imagen" | "slider" | undefined) ?? "imagen",
      bannerSlides: Array.isArray(data.banner_slides) ? (data.banner_slides as string[]) : [],
```

- [ ] **Step 7: Commit**

```bash
git add tests/compliance/empresa-update-payload.test.ts src/core/infrastructure/database/supabase-empresa.repository.ts
git commit -m "feat(empresa): persistir y leer tipo_banner/banner_slides en el repositorio"
```

---

### Task 4: `SupabaseAdminRepository` (panel superadmin)

**Files:**
- Modify: `src/core/infrastructure/database/SupabaseAdminRepository.ts:158-210` (método `mapEmpresa`)

- [ ] **Step 1: Agregar los campos al mapper**

En `mapEmpresa`, después de la línea `bannerFit: (row.banner_fit as "contain" | "cover" | "fill" | null) ?? "contain",`, agregar:

```typescript
      tipoBanner: (row.tipo_banner as "imagen" | "slider" | undefined) ?? "imagen",
      bannerSlides: Array.isArray(row.banner_slides) ? (row.banner_slides as string[]) : [],
```

Este método hace `select("*, empresas(*)")`, así que no hace falta tocar ningún `.select(...)` — las columnas nuevas ya vienen con el `*`.

- [ ] **Step 2: Verificar que compila**

Run: `pnpm typecheck`
Expected: PASS (ya no debería quedar ningún objeto `Empresa`/`EmpresaPublic` incompleto)

- [ ] **Step 3: Commit**

```bash
git add src/core/infrastructure/database/SupabaseAdminRepository.ts
git commit -m "feat(superadmin): mapear tipo_banner/banner_slides en SupabaseAdminRepository"
```

---

### Task 5: API route, page.tsx y prop-drilling hacia el form

**Files:**
- Modify: `src/app/api/admin/empresa/route.ts:31-54` (handler `GET`)
- Modify: `src/app/admin/(protected)/configuracion/page.tsx:57-62` (objeto `empresaApariencia`)
- Modify: `src/components/admin/configuracion-page-client.tsx:26-36` (interface `EmpresaApariencia`)

- [ ] **Step 1: Agregar los campos a la respuesta de `GET /api/admin/empresa`**

En `route.ts`, dentro del objeto `data` que devuelve `handleResult` en el `GET`, después de la línea `url_image: empresa.urlImage || null,`, agregar:

```typescript
      tipo_banner: empresa.tipoBanner ?? 'imagen',
      banner_slides: empresa.bannerSlides ?? [],
```

(El `PUT` no necesita cambios: `updateEmpresaSchema.safeParse` ya valida ambos campos desde la Task 2, y `getEmpresaUseCase().update` reenvía el DTO completo sin allowlist propia.)

- [ ] **Step 2: Agregar los campos al objeto `empresaApariencia` en `page.tsx`**

En `src/app/admin/(protected)/configuracion/page.tsx`, después de la línea `banner_fit: empresaData?.bannerFit ?? 'contain',`, agregar:

```typescript
    tipo_banner: empresaData?.tipoBanner ?? 'imagen',
    banner_slides: empresaData?.bannerSlides ?? [],
```

- [ ] **Step 3: Agregar los campos a la interface `EmpresaApariencia`**

En `src/components/admin/configuracion-page-client.tsx`, dentro de `interface EmpresaApariencia`, después de `banner_fit: "contain" | "cover" | "fill" | null;`, agregar:

```typescript
  tipo_banner: "imagen" | "slider";
  banner_slides: string[];
```

- [ ] **Step 4: Verificar que compila**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/empresa/route.ts "src/app/admin/(protected)/configuracion/page.tsx" src/components/admin/configuracion-page-client.tsx
git commit -m "feat(empresa): propagar tipo_banner/banner_slides desde la API hasta el form"
```

---

### Task 6: Traducciones

**Files:**
- Modify: `src/lib/translations.ts` (bloques `es` y `en`)

- [ ] **Step 1: Agregar las claves nuevas al bloque `es`**

Después de la línea `bannerFitLabel: "Ajuste de imagen",` (línea 613):

```typescript
    bannerModeStatic: "Imagen fija",
    bannerModeSlider: "Slider",
    bannerSliderHelp: "Hasta 5 imágenes que rotan automáticamente cada 5 segundos. Sustituye el banner: no se muestran logo, título ni descripción, solo las imágenes.",
    bannerSliderMaxReached: "Máximo 5 imágenes",
    bannerSliderPrevious: "Imagen anterior del banner",
    bannerSliderNext: "Imagen siguiente del banner",
    bannerSliderGoTo: "Ir a la imagen",
    bannerSliderAlt: "Banner de",
```

- [ ] **Step 2: Agregar las mismas claves al bloque `en`**

Después de la línea `bannerFitLabel: "Image fit",` (línea 1691):

```typescript
    bannerModeStatic: "Static image",
    bannerModeSlider: "Slider",
    bannerSliderHelp: "Up to 5 images that rotate automatically every 5 seconds. Replaces the banner entirely: no logo, title or description, just the images.",
    bannerSliderMaxReached: "Maximum 5 images",
    bannerSliderPrevious: "Previous banner image",
    bannerSliderNext: "Next banner image",
    bannerSliderGoTo: "Go to image",
    bannerSliderAlt: "Banner for",
```

- [ ] **Step 3: Verificar que compila**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/translations.ts
git commit -m "feat(i18n): agregar claves de banner slider (es/en)"
```

---

### Task 7: `BannerSliderManager` (admin) — TDD

**Files:**
- Create: `src/components/admin/banner-slider-manager.tsx`
- Test: `tests/ui/banner-slider-manager.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/ui/banner-slider-manager.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { BannerSliderManager } from '@/components/admin/banner-slider-manager';

// Se mockea el boundary de subida real: BannerSliderManager no es responsable
// de optimizar/subir archivos, solo de gestionar el array de URLs.
vi.mock('@/components/ui/image-uploader', () => ({
  ImageUploader: ({ value, onChange }: { value: string; onChange: (url: string) => void }) => (
    value ? (
      <div data-testid="slide-thumb">
        <span>{value}</span>
        <button type="button" onClick={() => onChange('')}>Eliminar</button>
      </div>
    ) : (
      <button type="button" onClick={() => onChange('https://cdn.example.com/nueva.webp')}>Agregar</button>
    )
  ),
}));

function renderManager(slides: string[], onChange = vi.fn()) {
  render(
    <LanguageProvider>
      <BannerSliderManager slides={slides} onChange={onChange} />
    </LanguageProvider>
  );
  return onChange;
}

describe('BannerSliderManager', () => {
  it('muestra el slot de agregar cuando hay menos de 5 imágenes', () => {
    renderManager(['https://cdn.example.com/a.webp']);

    expect(screen.getByRole('button', { name: 'Agregar' })).toBeInTheDocument();
  });

  it('al agregar una imagen, llama onChange con el array actualizado', () => {
    const onChange = renderManager(['https://cdn.example.com/a.webp']);

    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(onChange).toHaveBeenCalledWith([
      'https://cdn.example.com/a.webp',
      'https://cdn.example.com/nueva.webp',
    ]);
  });

  it('con 5 imágenes, oculta el slot de agregar y muestra el mensaje de máximo', () => {
    const cinco = Array.from({ length: 5 }, (_, i) => `https://cdn.example.com/${i}.webp`);
    renderManager(cinco);

    expect(screen.queryByRole('button', { name: 'Agregar' })).not.toBeInTheDocument();
    expect(screen.getByText('Máximo 5 imágenes')).toBeInTheDocument();
  });

  it('al eliminar una imagen, llama onChange sin ella', () => {
    const onChange = renderManager(['https://cdn.example.com/a.webp', 'https://cdn.example.com/b.webp']);

    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[0]);

    expect(onChange).toHaveBeenCalledWith(['https://cdn.example.com/b.webp']);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/ui/banner-slider-manager.test.tsx`
Expected: FAIL con "Failed to resolve import" o similar — el componente no existe todavía.

- [ ] **Step 3: Crear `src/components/admin/banner-slider-manager.tsx`**

```typescript
'use client';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { ImageUploader } from '@/components/ui/image-uploader';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

const MAX_SLIDES = 5;

interface BannerSliderManagerProps {
  readonly slides: string[];
  readonly onChange: (slides: string[]) => void;
}

interface SortableSlideProps {
  readonly url: string;
  readonly onRemove: () => void;
}

function SortableSlide({ url, onRemove }: Readonly<SortableSlideProps>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute top-1 left-1 z-10 p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center bg-card/90 backdrop-blur-sm rounded-full shadow-elegant cursor-grab active:cursor-grabbing outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Reordenar imagen"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <ImageUploader
        value={url}
        onChange={(newUrl) => { if (!newUrl) onRemove(); }}
        label=""
        previewClassName="relative group rounded-lg overflow-hidden border aspect-video"
        isBannerImage
      />
    </div>
  );
}

export function BannerSliderManager({ slides, onChange }: Readonly<BannerSliderManagerProps>) {
  const { language } = useLanguage();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = slides.indexOf(String(active.id));
    const toIndex = slides.indexOf(String(over.id));
    if (fromIndex === -1 || toIndex === -1) return;
    onChange(arrayMove(slides, fromIndex, toIndex));
  }

  function handleAddSlide(url: string) {
    if (!url || slides.length >= MAX_SLIDES) return;
    onChange([...slides, url]);
  }

  function handleRemoveSlide(url: string) {
    onChange(slides.filter((slide) => slide !== url));
  }

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={slides} strategy={horizontalListSortingStrategy}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {slides.map((url) => (
              <SortableSlide key={url} url={url} onRemove={() => handleRemoveSlide(url)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {slides.length < MAX_SLIDES ? (
        <ImageUploader
          value=""
          onChange={handleAddSlide}
          label=""
          previewClassName="relative group rounded-lg overflow-hidden border aspect-video"
          isBannerImage
        />
      ) : (
        <p className="text-xs text-muted-foreground">{t('bannerSliderMaxReached', language)}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run tests/ui/banner-slider-manager.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/banner-slider-manager.tsx tests/ui/banner-slider-manager.test.tsx
git commit -m "feat(admin): agregar BannerSliderManager (gestor drag-and-drop del slider)"
```

---

### Task 8: Wirear `BannerSliderManager` dentro de `EmpresaAparienciaForm`

**Files:**
- Modify: `src/components/admin/empresa-apariencia-form.tsx`
- Test: `tests/ui/empresa-apariencia-banner-mode.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/ui/empresa-apariencia-banner-mode.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { EmpresaAparienciaForm } from '@/components/admin/empresa-apariencia-form';

const fetchWithCsrf = vi.fn();
vi.mock('@/lib/csrf-client', () => ({
  fetchWithCsrf: (...args: unknown[]) => fetchWithCsrf(...args),
}));

vi.mock('@/lib/admin-context', () => ({
  useAdmin: () => ({ overrideEmpresaId: '', empresaId: 'empresa-1' }),
}));

vi.mock('@/components/admin/banner-slider-manager', () => ({
  BannerSliderManager: ({ slides }: { slides: string[] }) => (
    <div data-testid="slider-manager">{slides.length} imágenes</div>
  ),
}));

const initialData = {
  logo_url: null,
  mostrar_logo: true,
  url_image: null,
  banner_fit: 'contain' as const,
  tipo_banner: 'imagen' as const,
  banner_slides: [] as string[],
  descripcion_es: '',
  descripcion_en: '',
  descripcion_fr: '',
  descripcion_it: '',
  descripcion_de: '',
};

function renderForm(data = initialData) {
  return render(
    <LanguageProvider>
      <EmpresaAparienciaForm initialData={data} />
    </LanguageProvider>
  );
}

beforeEach(() => {
  fetchWithCsrf.mockReset();
  fetchWithCsrf.mockResolvedValue({ ok: true } as Response);
});

describe('EmpresaAparienciaForm — modo de banner', () => {
  it('en modo imagen fija (default), muestra los campos actuales y no el gestor de slider', () => {
    renderForm();

    expect(screen.getByText('Imagen de fondo del banner')).toBeInTheDocument();
    expect(screen.queryByTestId('slider-manager')).not.toBeInTheDocument();
  });

  it('al elegir Slider, oculta los campos de imagen fija y muestra el gestor', async () => {
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Slider' }));

    expect(screen.queryByText('Imagen de fondo del banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('slider-manager')).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchWithCsrf).toHaveBeenCalledWith('/api/admin/empresa?empresaId=empresa-1', {
        method: 'PUT',
        body: JSON.stringify({ tipo_banner: 'slider' }),
      });
    });
  });

  it('con tipo_banner inicial en slider, arranca mostrando el gestor', () => {
    renderForm({ ...initialData, tipo_banner: 'slider', banner_slides: ['https://cdn.example.com/a.webp'] });

    expect(screen.getByTestId('slider-manager')).toHaveTextContent('1 imágenes');
    expect(screen.queryByText('Imagen de fondo del banner')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/ui/empresa-apariencia-banner-mode.test.tsx`
Expected: FAIL — todavía no existe el botón "Slider" ni el gestor condicional.

- [ ] **Step 3: Actualizar el tipo de `initialData` en `EmpresaAparienciaFormProps`**

En `src/components/admin/empresa-apariencia-form.tsx`, en la interface `EmpresaAparienciaFormProps`, después de `banner_fit: "contain" | "cover" | "fill" | null;`:

```typescript
    tipo_banner: "imagen" | "slider";
    banner_slides: string[];
```

- [ ] **Step 4: Importar `BannerSliderManager`**

Agregar junto a los demás imports:

```typescript
import { BannerSliderManager } from '@/components/admin/banner-slider-manager';
```

- [ ] **Step 5: Agregar los handlers de guardado**

Después de `handleBannerFitChange` (antes de `handleSubmit`):

```typescript
  const handleTipoBannerChange = async (tipo: "imagen" | "slider") => {
    setFormData((prev) => ({ ...prev, tipo_banner: tipo }));
    setSaved(false);
    try {
      const ok = await saveEmpresa({ tipo_banner: tipo }, efectivoEmpresaId);
      if (!ok) setImageError('Error al guardar el tipo de banner');
    } catch (error) {
      logClientError(error, 'handleTipoBannerChange');
      setImageError('Error al guardar el tipo de banner');
    }
  };

  const handleSlidesChange = async (slides: string[]) => {
    setFormData((prev) => ({ ...prev, banner_slides: slides }));
    setSaved(false);
    try {
      const ok = await saveEmpresa({ banner_slides: slides }, efectivoEmpresaId);
      if (!ok) setImageError('Error al guardar las imágenes del slider');
    } catch (error) {
      logClientError(error, 'handleSlidesChange');
      setImageError('Error al guardar las imágenes del slider');
    }
  };
```

- [ ] **Step 6: Agregar el selector de modo y envolver el bloque de imagen fija**

Al principio del `<form>` (antes del comentario `{/* Logo de la empresa */}`), agregar el selector:

```tsx
      <div className="inline-flex rounded-full border border-input p-0.5">
        <button
          type="button"
          onClick={() => handleTipoBannerChange('imagen')}
          className={`px-4 py-1.5 rounded-full text-sm transition-colors ${formData.tipo_banner !== 'slider' ? 'bg-foreground text-background' : 'text-muted-foreground'}`}
        >
          {t('bannerModeStatic', language)}
        </button>
        <button
          type="button"
          onClick={() => handleTipoBannerChange('slider')}
          className={`px-4 py-1.5 rounded-full text-sm transition-colors ${formData.tipo_banner === 'slider' ? 'bg-foreground text-background' : 'text-muted-foreground'}`}
        >
          {t('bannerModeSlider', language)}
        </button>
      </div>
```

Todo lo que hoy hay DENTRO del `<form>` (Logo, Imagen de fondo, Descripción, Traducciones colapsables y el botón de submit) es exclusivo del modo "Imagen fija" — en modo slider no queda nada de eso, ni el botón de guardar (el toggle y el gestor de imágenes ya auto-guardan en cada cambio, igual que `handleBannerFitChange`). Envolver TODO ese contenido existente en un condicional, usando como anclas el texto EXACTO que ya está en el archivo:

Buscar el inicio (el comentario y el `<div>` que lo sigue):

```tsx
      {/* Logo de la empresa */}
      <div>
```

y reemplazarlo por:

```tsx
      {formData.tipo_banner !== 'slider' && (
      <>
      {/* Logo de la empresa */}
      <div>
```

Buscar el final (el cierre del bloque de submit, justo antes de `</form>`):

```tsx
        {saved && (
          <span className="text-primary text-sm">{t('savedSuccess', language)}</span>
        )}
      </div>
    </form>
```

y reemplazarlo por:

```tsx
        {saved && (
          <span className="text-primary text-sm">{t('savedSuccess', language)}</span>
        )}
      </div>
      </>
      )}
    </form>
```

No se toca ni una línea del contenido interno (Logo, Imagen de fondo, Descripción, Traducciones, botón de submit) — solo se agregan las tres líneas de apertura del condicional antes del primer bloque y las tres de cierre después del último.

E inmediatamente después del `)}` de cierre (todavía dentro del `<form>`, antes de `</form>`), agregar el bloque nuevo:

```tsx
      {formData.tipo_banner === 'slider' && (
        <div>
          <p className="text-sm font-medium text-foreground mb-2">
            {t('bannerModeSlider', language)}
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            {t('bannerSliderHelp', language)}
          </p>
          <BannerSliderManager slides={formData.banner_slides} onChange={handleSlidesChange} />
        </div>
      )}
```

- [ ] **Step 7: Correr el test y verificar que pasa**

Run: `npx vitest run tests/ui/empresa-apariencia-banner-mode.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 8: Correr toda la suite de UI para verificar que no rompiste nada existente**

Run: `npx vitest run tests/ui`
Expected: PASS en todos los archivos, incluido cualquier test previo que ya cubriera `EmpresaAparienciaForm` indirectamente.

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/empresa-apariencia-form.tsx tests/ui/empresa-apariencia-banner-mode.test.tsx
git commit -m "feat(admin): wirear selector de modo de banner en EmpresaAparienciaForm"
```

---

### Task 9: `SliderBanner` (público) — TDD

**Files:**
- Create: `src/components/slider-banner.tsx`
- Test: `tests/ui/slider-banner.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/ui/slider-banner.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { SliderBanner } from '@/components/slider-banner';

const slides = ['https://cdn.example.com/1.webp', 'https://cdn.example.com/2.webp', 'https://cdn.example.com/3.webp'];

function renderSlider(slidesArg: string[] = slides) {
  return render(
    <LanguageProvider>
      <SliderBanner slides={slidesArg} empresaNombre="La Mermelada" />
    </LanguageProvider>
  );
}

function activeDotIndex(): number {
  const dots = screen.getAllByRole('button', { name: /Ir a la imagen/ });
  return dots.findIndex((dot) => dot.querySelector('span')?.className.includes('bg-white') && !dot.querySelector('span')?.className.includes('bg-white/50'));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SliderBanner', () => {
  it('no renderiza nada si no hay imágenes', () => {
    const { container } = renderSlider([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('arranca mostrando la primera imagen', () => {
    renderSlider();
    expect(activeDotIndex()).toBe(0);
  });

  it('avanza automáticamente cada 5 segundos', () => {
    renderSlider();

    vi.advanceTimersByTime(5000);

    expect(activeDotIndex()).toBe(1);
  });

  it('se pausa con el mouse encima y se reanuda al salir', () => {
    renderSlider();
    const region = screen.getByRole('button', { name: /Imagen siguiente/ }).closest('div')!.parentElement!;

    fireEvent.mouseEnter(region);
    vi.advanceTimersByTime(6000);
    expect(activeDotIndex()).toBe(0);

    fireEvent.mouseLeave(region);
    vi.advanceTimersByTime(5000);
    expect(activeDotIndex()).toBe(1);
  });

  it('la flecha siguiente avanza una imagen manualmente', () => {
    renderSlider();

    fireEvent.click(screen.getByRole('button', { name: 'Imagen siguiente del banner' }));

    expect(activeDotIndex()).toBe(1);
  });

  it('no hace autoplay si el sistema tiene prefers-reduced-motion activo', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    renderSlider();
    vi.advanceTimersByTime(10000);
    expect(activeDotIndex()).toBe(0);

    window.matchMedia = original;
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run tests/ui/slider-banner.test.tsx`
Expected: FAIL — el módulo `@/components/slider-banner` no existe.

- [ ] **Step 3: Crear `src/components/slider-banner.tsx`**

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ImagenSubida as Image } from './ui/imagen-subida';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

const AUTOPLAY_MS = 5000;

interface SliderBannerProps {
  readonly slides: string[];
  readonly empresaNombre: string;
}

function nextIndex(current: number, total: number): number {
  return (current + 1) % total;
}

function previousIndex(current: number, total: number): number {
  return (current - 1 + total) % total;
}

export function SliderBanner({ slides, empresaNombre }: Readonly<SliderBannerProps>) {
  const { language } = useLanguage();
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (shouldReduceMotion || paused || slides.length <= 1) return;
    timerRef.current = setInterval(() => {
      setIndex((current) => nextIndex(current, slides.length));
    }, AUTOPLAY_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [shouldReduceMotion, paused, slides.length, index]);

  if (slides.length === 0) return null;

  const altText = `${t('bannerSliderAlt', language)} ${empresaNombre}`;

  return (
    <div
      className="relative h-[200px] md:h-[280px] overflow-hidden bg-primary"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {slides.map((url, i) => (
        <motion.div
          key={url}
          className="absolute inset-0"
          initial={false}
          animate={{ opacity: i === index ? 1 : 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.5 }}
        >
          <Image
            src={url}
            alt={altText}
            fill
            className="object-cover"
            sizes="100vw"
            priority={i === 0}
            loading={i === 0 ? 'eager' : 'lazy'}
          />
        </motion.div>
      ))}

      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setIndex(previousIndex(index, slides.length))}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 min-h-[44px] min-w-[44px] flex items-center justify-center bg-card/70 backdrop-blur-sm rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors hover:bg-card/90"
            aria-label={t('bannerSliderPrevious', language)}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setIndex(nextIndex(index, slides.length))}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 min-h-[44px] min-w-[44px] flex items-center justify-center bg-card/70 backdrop-blur-sm rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors hover:bg-card/90"
            aria-label={t('bannerSliderNext', language)}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-2">
            {slides.map((url, i) => (
              <button
                key={url}
                type="button"
                onClick={() => setIndex(i)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label={`${t('bannerSliderGoTo', language)} ${i + 1}`}
              >
                <span className={`block w-2 h-2 rounded-full ${i === index ? 'bg-white' : 'bg-white/50'}`} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run tests/ui/slider-banner.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/slider-banner.tsx tests/ui/slider-banner.test.tsx
git commit -m "feat(menu): agregar SliderBanner (carrusel publico con autoplay)"
```

---

### Task 10: Wirear `SliderBanner` en la página pública y en el test de compliance de imágenes

**Files:**
- Modify: `src/components/client-menu-page.tsx:7` (import) y `:343-349` (render)
- Modify: `tests/compliance/imagenes-sin-doble-optimizacion.test.ts:36-53` (`DEBEN_USAR_ENVOLTORIO`)

- [ ] **Step 1: Importar `SliderBanner`**

En `src/components/client-menu-page.tsx`, junto al import existente `import { HeroBanner } from "@/components/hero-banner"`, agregar:

```typescript
import { SliderBanner } from "@/components/slider-banner"
```

- [ ] **Step 2: Reemplazar el render del banner**

Reemplazar:

```tsx
          <HeroBanner empresa={empresa} bannerFit={empresa?.bannerFit ?? "contain"} />
```

por:

```tsx
          {empresa?.tipoBanner === "slider" ? (
            <SliderBanner slides={empresa.bannerSlides} empresaNombre={empresa.nombre} />
          ) : (
            <HeroBanner empresa={empresa} bannerFit={empresa?.bannerFit ?? "contain"} />
          )}
```

- [ ] **Step 3: Agregar `slider-banner.tsx` a la lista de compliance de imágenes**

En `tests/compliance/imagenes-sin-doble-optimizacion.test.ts`, agregar `'src/components/slider-banner.tsx',` al array `DEBEN_USAR_ENVOLTORIO`, junto a `'src/components/hero-banner.tsx',`.

- [ ] **Step 4: Correr el test de compliance**

Run: `npx vitest run tests/compliance/imagenes-sin-doble-optimizacion.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/client-menu-page.tsx tests/compliance/imagenes-sin-doble-optimizacion.test.ts
git commit -m "feat(menu): renderizar SliderBanner cuando tipo_banner es slider"
```

---

### Task 11: Verificación final

**Files:** ninguno (solo comandos)

- [ ] **Step 1: Lint + build completos (regla de oro del proyecto)**

Run: `pnpm lint && pnpm build`
Expected: ambos sin errores. Si falla algo de SonarLint (S3776, S3358, etc.), corregir antes de continuar — no marcar esta tarea como completada si fallan.

- [ ] **Step 2: Suite completa de tests**

Run: `pnpm test` (o el comando equivalente que corra `vitest run` sobre todo el repo)
Expected: PASS

- [ ] **Step 3: Si la migración de la Task 1 todavía no se aplicó, CHECKPOINT de nuevo**

Confirmar con el usuario antes de correr:

```bash
supabase db push --linked
```

- [ ] **Step 4: Smoke tests post-migración (obligatorio tras cada `db push`)**

Run: `pnpm db:smoke`
Run: `pnpm e2e:db`
Expected: ambos sin fallos.

- [ ] **Step 5: Verificación manual en navegador**

Levantar `pnpm dev`, entrar a `/admin/configuracion`, alternar entre "Imagen fija" y "Slider", cargar 2-3 imágenes de prueba, reordenarlas por drag, y verificar en la página pública del menú que el slider avanza solo cada 5s, se pausa al pasar el mouse, y las flechas/dots funcionan.
