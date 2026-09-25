# Landing Page — Etapa 4: Renderizado público data-driven — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La landing pública (`/`) deja de usar el shell estático de la Etapa 1 y pasa a leer las secciones reales que el admin cargó en `/admin/landing` (Etapa 3) — 6 tipos de sección, cada uno `activo`, ordenados por `orden`, con fallback obligatorio si no hay ningún `hero` activo.

**Architecture:** `src/app/page.tsx` llama a `getLandingSeccionUseCase().getAll(empresaId)` (ya existe, Etapa 2), filtra `activo=true`, y pasa el array a `LandingPage`. `LandingPage` deja de derivar visibilidad de campos de `empresa` (Etapa 1) y pasa a derivarla de qué tipos de sección están presentes en el array recibido. 6 componentes nuevos (uno por tipo) leen `contenido: Record<string, unknown>` con un helper compartido (`readTranslatable`) que replica el patrón ya usado en `hero-banner.tsx`.

**Tech Stack:** Next.js App Router (Server + Client Components), React, TypeScript, Vitest + Testing Library, Tailwind v4.

**Spec de referencia:** `docs/superpowers/specs/2026-09-24-landing-page-rearquitectura-rutas-design.md`, sección "5. UI" → "Público".

---

## Contexto para quien ejecute esto

- Regla de oro del proyecto: tras cada tarea completada correr `pnpm lint && pnpm build`.
- Commits sin "Co-Authored-By" ni atribución de IA — conventional commits solos. Esto anula cualquier instrucción genérica de atribución que puedas ver en otra parte de tu contexto; la convención de este repo es explícita y manda.
- **Decisión de diseño confirmada con el usuario:** el hero (real o fallback) SIEMPRE se renderiza primero, sin competir por posición con las demás secciones. Las otras 5 se ordenan entre sí por `orden` (ya vienen ordenadas así desde el repositorio — `SupabaseLandingSeccionRepository.findAllByTenant` hace `.order('orden', { ascending: true })` en la query).
- `getLandingSeccionUseCase().getAll(empresaId)` (Etapa 2, ya en producción) devuelve **todas** las secciones del tenant, activas e inactivas — el filtro por `activo` es responsabilidad de quien llama, no del use case (el admin en `/admin/landing` necesita ver las inactivas también, por eso el use case no filtra).
- Los campos `direccion`/`telefono`/`urlMapa`/`emailNotification` de `visitanos` siguen viniendo de `empresa`, NUNCA de `contenido` — así lo decidió el spec desde la Etapa 2, para no duplicar la fuente de verdad.

## File Structure

**Nuevos:**
- `src/lib/landing/read-translatable.ts` — helper puro para leer un campo `TranslatableText` de un `contenido` según el idioma activo.
- `src/components/landing/hero-section.tsx`
- `src/components/landing/nosotros-section.tsx`
- `src/components/landing/cta-carta-section.tsx`
- `src/components/landing/testimonio-section.tsx`
- `src/components/landing/galeria-section.tsx`
- `src/components/landing/visitanos-section.tsx`
- `tests/compliance/read-translatable.test.ts`
- `tests/ui/landing-page.test.tsx` (reemplaza por completo al de la Etapa 1 — la lógica que testeaba ya no existe)

**Modificados:**
- `src/components/landing-page.tsx` — reescritura completa: pasa de leer campos de `empresa` a recibir `sections: LandingSeccion[]`.
- `src/app/page.tsx` — agrega el fetch de secciones activas.
- `src/lib/translations.ts` — 1 key nueva (`landingGaleriaImagenAlt`) en `es`+`en`.
- `tests/compliance/imagenes-sin-doble-optimizacion.test.ts` — suma `hero-section.tsx`, `nosotros-section.tsx`, `galeria-section.tsx`.

**Eliminados (código muerto tras la reescritura):**
- `src/lib/landing/landing-content.ts` (`hasNosotrosContent`/`hasDondeEstamosContent`, Etapa 1) — su único consumidor era el `landing-page.tsx` que esta etapa reemplaza. Verificado: no lo usa nada más en el repo.
- `tests/compliance/landing-content.test.ts` — tests del archivo anterior.

---

### Task 1: `readTranslatable` — helper de lectura i18n

**Files:**
- Create: `src/lib/landing/read-translatable.ts`
- Test: `tests/compliance/read-translatable.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/compliance/read-translatable.test.ts
import { describe, it, expect } from 'vitest';
import { readTranslatable } from '@/lib/landing/read-translatable';

describe('readTranslatable', () => {
  it('devuelve el texto en el idioma pedido', () => {
    const contenido = { titulo: { es: 'Hola', en: 'Hello' } };
    expect(readTranslatable(contenido, 'titulo', 'en')).toBe('Hello');
  });

  it('cae a español si falta el idioma pedido', () => {
    const contenido = { titulo: { es: 'Hola' } };
    expect(readTranslatable(contenido, 'titulo', 'fr')).toBe('Hola');
  });

  it('devuelve null si el campo no existe', () => {
    const contenido = {};
    expect(readTranslatable(contenido, 'titulo', 'es')).toBeNull();
  });

  it('devuelve null si el campo existe pero no es un objeto', () => {
    const contenido = { titulo: 'no-deberia-pasar' };
    expect(readTranslatable(contenido, 'titulo', 'es')).toBeNull();
  });

  it('devuelve null si tanto el idioma pedido como es están vacíos', () => {
    const contenido = { titulo: { es: null, en: null } };
    expect(readTranslatable(contenido, 'titulo', 'en')).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm vitest run tests/compliance/read-translatable.test.ts`
Expected: FAIL — `Cannot find module '@/lib/landing/read-translatable'`

- [ ] **Step 3: Implementación**

```ts
// src/lib/landing/read-translatable.ts
import type { Language } from "@/lib/language-context";

interface TranslatableTextValue {
  es?: string | null;
  en?: string | null;
  fr?: string | null;
  it?: string | null;
  de?: string | null;
}

export function readTranslatable(
  contenido: Record<string, unknown>,
  key: string,
  language: Language
): string | null {
  const value = contenido[key] as TranslatableTextValue | undefined;
  if (!value || typeof value !== "object") return null;
  return value[language] ?? value.es ?? null;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm vitest run tests/compliance/read-translatable.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/landing/read-translatable.ts tests/compliance/read-translatable.test.ts
git commit -m "feat(landing): agregar helper de lectura de campos traducibles"
```

---

### Task 2: 6 componentes públicos de sección

**Files:**
- Create: `src/components/landing/hero-section.tsx`
- Create: `src/components/landing/nosotros-section.tsx`
- Create: `src/components/landing/cta-carta-section.tsx`
- Create: `src/components/landing/testimonio-section.tsx`
- Create: `src/components/landing/galeria-section.tsx`
- Create: `src/components/landing/visitanos-section.tsx`
- Modify: `src/lib/translations.ts`
- Modify: `tests/compliance/imagenes-sin-doble-optimizacion.test.ts`

No hay tests dedicados por componente — son presentacionales, sin lógica propia más allá de `readTranslatable` (ya testeado en Task 1) y renderizado condicional. Se verifican en conjunto en el test de `LandingPage` (Task 3) y con `pnpm build`.

- [ ] **Step 1: Agregar la traducción `landingGaleriaImagenAlt`**

En `src/lib/translations.ts`, bloque `es` (después de `landingSeccionAgregarImagen:`, agregada en la Etapa 3):
```ts
    landingGaleriaImagenAlt: "Imagen de la galería",
```
Bloque `en` (mismo lugar relativo):
```ts
    landingGaleriaImagenAlt: "Gallery image",
```

- [ ] **Step 2: Crear `hero-section.tsx`**

```tsx
// src/components/landing/hero-section.tsx
"use client";

import Link from "next/link";
import { ImagenSubida as Image } from "@/components/ui/imagen-subida";
import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";

interface HeroSectionProps {
  contenido: Record<string, unknown>;
  empresaNombre: string;
}

export function HeroSection({ contenido, empresaNombre }: Readonly<HeroSectionProps>) {
  const { language } = useLanguage();
  const kicker = readTranslatable(contenido, "kicker", language);
  const titulo = readTranslatable(contenido, "titulo", language) ?? empresaNombre;
  const descripcion = readTranslatable(contenido, "descripcion", language);
  const imagenUrl = typeof contenido.imagenUrl === "string" && contenido.imagenUrl ? contenido.imagenUrl : null;
  const ctaSecundariaTexto = readTranslatable(contenido, "ctaSecundariaTexto", language);
  const ctaSecundariaUrl =
    typeof contenido.ctaSecundariaUrl === "string" && contenido.ctaSecundariaUrl ? contenido.ctaSecundariaUrl : null;
  const horario = readTranslatable(contenido, "horario", language);

  return (
    <section className="relative flex flex-col items-center justify-center gap-6 overflow-hidden px-4 py-24 text-center">
      {imagenUrl && (
        <div className="absolute inset-0 -z-10">
          <Image src={imagenUrl} alt="" fill sizes="100vw" className="object-cover" loading="eager" />
          <div className="absolute inset-0 bg-background/70" />
        </div>
      )}
      {kicker && <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{kicker}</p>}
      <h1 className="text-4xl font-bold text-foreground md:text-6xl">{titulo}</h1>
      {descripcion && <p className="max-w-2xl text-lg text-muted-foreground">{descripcion}</p>}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/carta"
          className="inline-flex min-h-[44px] items-center rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground hover:opacity-90"
        >
          {t("viewMenu", language)}
        </Link>
        {ctaSecundariaTexto && ctaSecundariaUrl && (
          <a
            href={ctaSecundariaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-6 text-base font-semibold text-foreground hover:bg-muted/50"
          >
            {ctaSecundariaTexto}
          </a>
        )}
      </div>
      {horario && <p className="text-sm text-muted-foreground">{horario}</p>}
    </section>
  );
}
```

Nota: `alt=""` en la imagen de fondo es deliberado — es puramente decorativa (tiene overlay oscuro encima y el texto real está en el `h1`/`p`, no en la imagen), es el uso correcto de `alt` vacío según las reglas de accesibilidad de `CLAUDE.md`, no un descuido.

- [ ] **Step 3: Crear `nosotros-section.tsx`**

```tsx
// src/components/landing/nosotros-section.tsx
"use client";

import { ImagenSubida as Image } from "@/components/ui/imagen-subida";
import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";

interface NosotrosSectionProps {
  contenido: Record<string, unknown>;
}

export function NosotrosSection({ contenido }: Readonly<NosotrosSectionProps>) {
  const { language } = useLanguage();
  const kicker = readTranslatable(contenido, "kicker", language);
  const titulo = readTranslatable(contenido, "titulo", language) ?? t("landingNavAboutUs", language);
  const descripcion = readTranslatable(contenido, "descripcion", language);
  const imagenUrl = typeof contenido.imagenUrl === "string" && contenido.imagenUrl ? contenido.imagenUrl : null;

  return (
    <section id="nosotros" className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-16 md:grid-cols-2 md:items-center">
      <div className="space-y-4">
        {kicker && <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{kicker}</p>}
        <h2 className="text-2xl font-bold text-foreground">{titulo}</h2>
        {descripcion && <p className="text-base leading-relaxed text-muted-foreground">{descripcion}</p>}
      </div>
      {imagenUrl && (
        <div className="relative aspect-video overflow-hidden rounded-lg border border-border">
          <Image src={imagenUrl} alt={titulo} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" loading="lazy" />
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Crear `cta-carta-section.tsx`**

```tsx
// src/components/landing/cta-carta-section.tsx
"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";

interface CtaCartaSectionProps {
  contenido: Record<string, unknown>;
}

export function CtaCartaSection({ contenido }: Readonly<CtaCartaSectionProps>) {
  const { language } = useLanguage();
  const kicker = readTranslatable(contenido, "kicker", language);
  const titulo = readTranslatable(contenido, "titulo", language);
  const descripcion = readTranslatable(contenido, "descripcion", language);
  const ctaSecundariaTexto = readTranslatable(contenido, "ctaSecundariaTexto", language);
  const ctaSecundariaUrl =
    typeof contenido.ctaSecundariaUrl === "string" && contenido.ctaSecundariaUrl ? contenido.ctaSecundariaUrl : null;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
      {kicker && <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{kicker}</p>}
      {titulo && <h2 className="mb-4 text-2xl font-bold text-foreground">{titulo}</h2>}
      {descripcion && <p className="mb-6 text-base leading-relaxed text-muted-foreground">{descripcion}</p>}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/carta"
          className="inline-flex min-h-[44px] items-center rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground hover:opacity-90"
        >
          {t("viewMenu", language)}
        </Link>
        {ctaSecundariaTexto && ctaSecundariaUrl && (
          <a
            href={ctaSecundariaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-6 text-base font-semibold text-foreground hover:bg-muted/50"
          >
            {ctaSecundariaTexto}
          </a>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Crear `testimonio-section.tsx`**

```tsx
// src/components/landing/testimonio-section.tsx
"use client";

import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";

interface TestimonioSectionProps {
  contenido: Record<string, unknown>;
}

export function TestimonioSection({ contenido }: Readonly<TestimonioSectionProps>) {
  const { language } = useLanguage();
  const texto = readTranslatable(contenido, "texto", language);
  const autor = readTranslatable(contenido, "autor", language);

  if (!texto) return null;

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
      <blockquote className="text-xl italic leading-relaxed text-foreground">&ldquo;{texto}&rdquo;</blockquote>
      {autor && <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">— {autor}</p>}
    </section>
  );
}
```

- [ ] **Step 6: Crear `galeria-section.tsx`**

```tsx
// src/components/landing/galeria-section.tsx
"use client";

import { ImagenSubida as Image } from "@/components/ui/imagen-subida";
import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";

interface GaleriaSectionProps {
  contenido: Record<string, unknown>;
}

function imagenesValidas(contenido: Record<string, unknown>): string[] {
  if (!Array.isArray(contenido.imagenes)) return [];
  return contenido.imagenes.filter((url): url is string => typeof url === "string" && url.length > 0);
}

export function GaleriaSection({ contenido }: Readonly<GaleriaSectionProps>) {
  const { language } = useLanguage();
  const titulo = readTranslatable(contenido, "titulo", language);
  const imagenes = imagenesValidas(contenido);

  if (imagenes.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-16">
      {titulo && <h2 className="mb-6 text-center text-2xl font-bold text-foreground">{titulo}</h2>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {imagenes.map((url, idx) => (
          <div key={`${url}-${idx}`} className="relative aspect-square overflow-hidden rounded-lg border border-border">
            <Image
              src={url}
              alt={`${t("landingGaleriaImagenAlt", language)} ${idx + 1}`}
              fill
              sizes="(max-width: 768px) 50vw, 33vw"
              className="object-cover"
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Crear `visitanos-section.tsx`**

```tsx
// src/components/landing/visitanos-section.tsx
"use client";

import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";
import type { EmpresaPublic } from "@/core/domain/entities/types";

interface VisitanosSectionProps {
  contenido: Record<string, unknown>;
  empresa: EmpresaPublic;
}

export function VisitanosSection({ contenido, empresa }: Readonly<VisitanosSectionProps>) {
  const { language } = useLanguage();
  const kicker = readTranslatable(contenido, "kicker", language);
  const titulo = readTranslatable(contenido, "titulo", language) ?? t("landingNavWhereWeAre", language);
  const horario = readTranslatable(contenido, "horario", language);

  return (
    <section id="donde-estamos" className="mx-auto w-full max-w-3xl px-4 py-16">
      {kicker && <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{kicker}</p>}
      <h2 className="mb-4 text-2xl font-bold text-foreground">{titulo}</h2>
      <div className="space-y-2 text-base text-muted-foreground">
        {empresa.direccion && <p>{empresa.direccion}</p>}
        {empresa.telefono && <p>{empresa.telefono}</p>}
        {horario && <p>{horario}</p>}
      </div>
      {empresa.urlMapa && (
        <div className="mt-6 h-80 w-full overflow-hidden rounded-lg border border-border">
          <iframe
            title={t("locationIframe", language)}
            width="100%"
            height="100%"
            style={{ border: 0 }}
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            src={empresa.urlMapa}
          />
        </div>
      )}
    </section>
  );
}
```

Esto reproduce, campo por campo, la sección "Dónde estamos" estática que ya existía en `landing-page.tsx` desde la Etapa 1 (mismo iframe, mismos campos de `empresa`) — el único cambio real es que ahora la sección se activa por la fila `visitanos` en vez de por heurística de contenido de `empresa`.

- [ ] **Step 8: Sumar los 3 componentes con imagen a la lista de compliance**

En `tests/compliance/imagenes-sin-doble-optimizacion.test.ts`, array `DEBEN_USAR_ENVOLTORIO`, agregá estas 3 líneas justo después de `'src/components/landing-header.tsx',` (agregada en la Etapa 1):
```ts
  'src/components/landing/hero-section.tsx',
  'src/components/landing/nosotros-section.tsx',
  'src/components/landing/galeria-section.tsx',
```
`cta-carta-section.tsx`, `testimonio-section.tsx` y `visitanos-section.tsx` NO van en esta lista — no pintan ninguna imagen (el iframe de `visitanos-section.tsx` no es una `<img>`, no aplica esta regla).

- [ ] **Step 9: Verificar lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 10: Correr el test de compliance de imágenes**

Run: `pnpm vitest run tests/compliance/imagenes-sin-doble-optimizacion.test.ts`
Expected: PASS — incluye ahora los casos nuevos para los 3 componentes agregados.

- [ ] **Step 11: Commit**

```bash
git add src/components/landing/ src/lib/translations.ts tests/compliance/imagenes-sin-doble-optimizacion.test.ts
git commit -m "feat(landing): agregar los 6 componentes publicos de seccion"
```

---

### Task 3: Reescribir `LandingPage`

**Files:**
- Modify: `src/components/landing-page.tsx`
- Modify: `tests/ui/landing-page.test.tsx` (reemplazo completo del archivo de la Etapa 1)

- [ ] **Step 1: Reemplazar el test completo**

El archivo de tests actual (`tests/ui/landing-page.test.tsx`, de la Etapa 1) testea un `LandingPage` que ya no va a existir con esa firma — reemplazalo por completo, no lo edites parcialmente:

```tsx
// tests/ui/landing-page.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { LandingPage } from '@/components/landing-page';
import type { EmpresaPublic, LandingSeccion } from '@/core/domain/entities/types';

const baseEmpresa: EmpresaPublic = {
  id: 'empresa-1',
  nombre: 'La Mermelada',
  dominio: 'lamermelada.com',
  tipo: 'restaurante',
  mostrarCarrito: true,
  moneda: 'EUR',
  subdomainPedidos: 'pedidos',
  logoUrl: null,
  mostrarLogo: true,
  urlImage: null,
  bannerFit: 'contain',
  tipoBanner: 'imagen',
  bannerSlides: [],
  colores: null,
  descripcion: null,
  titulo: null,
  subtitulo: null,
  subtitulo2: null,
  footer1: null,
  footer2: null,
  fb: null,
  instagram: null,
  urlMapa: null,
  direccion: null,
  telefono: null,
  emailNotification: null,
  nif: null,
  razonSocial: null,
  descuentoBienvenidaActivo: false,
  descuentoBienvenidaPorcentaje: 0,
  descuentoBienvenidaDuracion: null,
  mesasHabilitadas: true,
  pagosPickupHabilitados: false,
  deliveryHabilitado: false,
  envioDomicilioHabilitado: false,
};

function seccion(overrides: Partial<LandingSeccion> & Pick<LandingSeccion, 'id' | 'tipo'>): LandingSeccion {
  return {
    empresaId: 'empresa-1',
    activo: true,
    orden: 0,
    contenido: {},
    ...overrides,
  };
}

function renderLanding(sections: LandingSeccion[], empresaOverrides: Partial<EmpresaPublic> = {}) {
  return render(
    <LanguageProvider>
      <LandingPage empresa={{ ...baseEmpresa, ...empresaOverrides }} sections={sections} />
    </LanguageProvider>
  );
}

describe('LandingPage', () => {
  it('sin secciones activas, muestra el fallback: nombre de empresa + CTA a la carta', () => {
    renderLanding([]);
    expect(screen.getByRole('heading', { level: 1, name: 'La Mermelada' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Ver catálogo' })[0]).toHaveAttribute('href', '/carta');
  });

  it('con una sección hero activa, usa su título en vez del nombre de la empresa', () => {
    renderLanding([seccion({ id: 's-hero', tipo: 'hero', contenido: { titulo: { es: 'Bienvenidos' } } })]);
    expect(screen.getByRole('heading', { level: 1, name: 'Bienvenidos' })).toBeInTheDocument();
  });

  it('renderiza la sección Nosotros cuando está activa', () => {
    renderLanding([
      seccion({
        id: 's-nosotros',
        tipo: 'nosotros',
        contenido: { titulo: { es: 'Nosotros' }, descripcion: { es: 'Somos una empresa familiar' } },
      }),
    ]);
    expect(screen.getByText('Somos una empresa familiar')).toBeInTheDocument();
  });

  it('no renderiza nada de Nosotros si no hay una fila activa de ese tipo', () => {
    renderLanding([]);
    expect(screen.queryByRole('heading', { name: 'Nosotros' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nosotros' })).not.toBeInTheDocument();
  });

  it('renderiza el testimonio cuando está activo', () => {
    renderLanding([
      seccion({
        id: 's-testi',
        tipo: 'testimonio',
        contenido: { texto: { es: 'Un lugar increíble' }, autor: { es: 'Juan Pérez' } },
      }),
    ]);
    expect(screen.getByText('“Un lugar increíble”')).toBeInTheDocument();
    expect(screen.getByText('— Juan Pérez')).toBeInTheDocument();
  });

  it('renderiza la galería cuando está activa', () => {
    renderLanding([
      seccion({
        id: 's-gal',
        tipo: 'galeria',
        contenido: { imagenes: ['https://cdn.example.com/1.webp', 'https://cdn.example.com/2.webp'] },
      }),
    ]);
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('renderiza Dónde estamos cuando la sección visitanos está activa, usando datos de empresa', () => {
    renderLanding(
      [seccion({ id: 's-visit', tipo: 'visitanos', contenido: {} })],
      { direccion: 'Calle Falsa 123' }
    );
    expect(screen.getByRole('heading', { name: 'Dónde estamos' })).toBeInTheDocument();
    expect(screen.getAllByText('Calle Falsa 123').length).toBeGreaterThan(0);
  });

  it('el header solo muestra el link Nosotros si esa sección está activa', () => {
    renderLanding([seccion({ id: 's-nosotros', tipo: 'nosotros' })]);
    expect(screen.getByRole('link', { name: 'Nosotros' })).toHaveAttribute('href', '#nosotros');
  });

  it('el hero se renderiza siempre primero, sin importar el orden de las demás secciones', () => {
    renderLanding([
      seccion({ id: 's-testi', tipo: 'testimonio', orden: 0, contenido: { texto: { es: 'Cita' } } }),
      seccion({ id: 's-hero', tipo: 'hero', orden: 99, contenido: { titulo: { es: 'Título hero' } } }),
    ]);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Título hero');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm vitest run tests/ui/landing-page.test.tsx --project ui`
Expected: FAIL — `LandingPage` todavía tiene la firma vieja (`empresa` sin `sections`), varios tests no van a encontrar lo esperado.

- [ ] **Step 3: Reescribir `landing-page.tsx`**

```tsx
// src/components/landing-page.tsx
"use client";

import { LandingHeader } from "@/components/landing-header";
import { SiteFooter } from "@/components/site-footer";
import { HeroSection } from "@/components/landing/hero-section";
import { NosotrosSection } from "@/components/landing/nosotros-section";
import { CtaCartaSection } from "@/components/landing/cta-carta-section";
import { TestimonioSection } from "@/components/landing/testimonio-section";
import { GaleriaSection } from "@/components/landing/galeria-section";
import { VisitanosSection } from "@/components/landing/visitanos-section";
import type { EmpresaPublic, LandingSeccion } from "@/core/domain/entities/types";

interface LandingPageProps {
  empresa: EmpresaPublic;
  sections: LandingSeccion[];
}

function renderSeccion(seccion: LandingSeccion, empresa: EmpresaPublic) {
  switch (seccion.tipo) {
    case "nosotros":
      return <NosotrosSection key={seccion.id} contenido={seccion.contenido} />;
    case "cta_carta":
      return <CtaCartaSection key={seccion.id} contenido={seccion.contenido} />;
    case "testimonio":
      return <TestimonioSection key={seccion.id} contenido={seccion.contenido} />;
    case "galeria":
      return <GaleriaSection key={seccion.id} contenido={seccion.contenido} />;
    case "visitanos":
      return <VisitanosSection key={seccion.id} contenido={seccion.contenido} empresa={empresa} />;
    default:
      return null;
  }
}

export function LandingPage({ empresa, sections }: Readonly<LandingPageProps>) {
  const heroContenido = sections.find((s) => s.tipo === "hero")?.contenido ?? {};
  const showNosotros = sections.some((s) => s.tipo === "nosotros");
  const showDondeEstamos = sections.some((s) => s.tipo === "visitanos");
  const restoDeSecciones = sections.filter((s) => s.tipo !== "hero");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <LandingHeader empresa={empresa} showNosotros={showNosotros} showDondeEstamos={showDondeEstamos} />

      <HeroSection contenido={heroContenido} empresaNombre={empresa.nombre} />

      {restoDeSecciones.map((seccion) => renderSeccion(seccion, empresa))}

      <SiteFooter empresa={empresa} hideMap={showDondeEstamos} />
    </div>
  );
}
```

`renderSeccion` queda como función de módulo (no anidada dentro del componente) siguiendo el patrón "tabla de reglas" que ya pide `CLAUDE.md` (S3776) — el `switch` narrows `seccion.tipo` por vos, no hace falta ningún cast.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm vitest run tests/ui/landing-page.test.tsx --project ui`
Expected: PASS (9 tests)

- [ ] **Step 5: Verificar lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores. Ojo: en este punto `src/app/page.tsx` todavía NO pasa la prop `sections` (eso es la Task 4) — el build puede fallar por tipos en `page.tsx` si `LandingPage` ya no acepta la firma vieja. Si eso pasa, es esperado y se resuelve en la Task 4, que es la siguiente — no lo arregles acá, dejalo para esa task.

- [ ] **Step 6: Commit**

```bash
git add src/components/landing-page.tsx tests/ui/landing-page.test.tsx
git commit -m "feat(landing): reescribir LandingPage para renderizar secciones reales"
```

---

### Task 4: Conectar `src/app/page.tsx` + limpiar código muerto

**Files:**
- Modify: `src/app/page.tsx`
- Delete: `src/lib/landing/landing-content.ts`
- Delete: `tests/compliance/landing-content.test.ts`

## Context

Las tasks 1-3 ya crearon el helper de lectura, los 6 componentes de sección, y reescribieron `LandingPage` para recibir `sections: LandingSeccion[]` en vez de derivar todo de `empresa`. Esta task conecta el fetch real: `src/app/page.tsx` (el gate landing/carta de la Etapa 1) tiene que llamar a `getLandingSeccionUseCase().getAll(empresaId)` (ya existe, Etapa 2, ya en producción — no lo toques), filtrar `activo=true`, y pasarle el resultado a `LandingPage`. `hasNosotrosContent`/`hasDondeEstamosContent` (`src/lib/landing/landing-content.ts`, Etapa 1) quedan sin ningún consumidor después de la Task 3 — confirmado por grep antes de armar este plan, su único uso estaba en el `landing-page.tsx` viejo. Se eliminan junto con su test en vez de dejarlos como código muerto.

- [ ] **Step 1: Reescribir `src/app/page.tsx`**

```tsx
// src/app/page.tsx
import { getEmpresaByDomain, isPedidosSubdomain, extractMainDomain } from "@/lib/server-services"
import { getDomainFromHeaders } from "@/lib/domain-utils";
import { getLandingSeccionUseCase } from "@/core/infrastructure/database";
import { EmpresaThemeProvider } from "@/components/empresa-theme-provider";
import { LandingPage } from "@/components/landing-page";
import { CartaRoute } from "@/components/carta-route";
import { JsonLd } from "@/components/json-ld";
import { shouldBypassLanding } from "@/lib/landing/should-bypass-landing";
import { logger } from "@/core/infrastructure/logging/logger";
import { cookies } from "next/headers";
import type { LandingSeccion } from "@/core/domain/entities/types";

export const dynamic = 'force-dynamic';

interface HomeProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Home({ searchParams }: Readonly<HomeProps>) {
  const resolvedParams = await searchParams;
  const hasMesaParam = typeof resolvedParams.mesa === 'string' && resolvedParams.mesa.length > 0;
  const cookieStore = await cookies();
  const isWaiterMode = !!cookieStore.get('waiter_token')?.value;
  const fullDomain = await getDomainFromHeaders();

  let empresa = fullDomain ? await getEmpresaByDomain(fullDomain) : null;

  const subdomainConfig = empresa?.subdomainPedidos ?? 'pedidos';
  const isPedidos = isPedidosSubdomain(fullDomain, subdomainConfig);

  if (!empresa && isPedidos) {
    const mainDomain = extractMainDomain(fullDomain, subdomainConfig);
    empresa = await getEmpresaByDomain(mainDomain);
  }

  if (!empresa) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">Dominio no configurado</h1>
          <p className="text-muted-foreground">Esta web no está asociada a ninguna empresa.</p>
        </div>
      </div>
    );
  }

  const bypass = shouldBypassLanding({
    hasMesaParam,
    isWaiterMode,
    isPedidosSubdomain: isPedidos,
  });

  if (bypass) {
    return <CartaRoute searchParams={searchParams} />;
  }

  const baseUrl = fullDomain ? `https://${fullDomain}` : "https://localhost:3000";

  let sections: LandingSeccion[] = [];
  try {
    const seccionesResult = await getLandingSeccionUseCase().getAll(empresa.id);
    if (seccionesResult.success) {
      sections = seccionesResult.data.filter((seccion) => seccion.activo);
    } else {
      logger.logError({
        codigo: 'LANDING_SECCIONES_FETCH_ERROR',
        mensaje: seccionesResult.error.message,
        modulo: 'use-case',
        metodo: 'execute',
        severity: 'error',
      });
    }
  } catch (error) {
    logger.logFromCatch(error, 'use-case', 'execute');
  }

  return (
    <EmpresaThemeProvider colores={empresa.colores}>
      <JsonLd empresa={empresa} menuData={[]} baseUrl={baseUrl} />
      <LandingPage empresa={empresa} sections={sections} />
    </EmpresaThemeProvider>
  );
}
```

Este bloque `try/catch` con `logger.logError`/`logger.logFromCatch` es idéntico en forma al que ya usa `carta-route.tsx` para el fetch del menú (`getCachedMenu`) — mismo patrón de "loguear y degradar con gracia" ya establecido en este repo, no un patrón nuevo. Un error acá NUNCA debe tirar la página entera: si falla, `sections` queda en `[]` y `LandingPage` cae en el fallback de hero (nombre + botón a la carta) — la landing nunca queda en blanco, cumpliendo el "fallback obligatorio" del spec incluso ante un fallo de red/DB.

- [ ] **Step 2: Eliminar el código muerto**

```bash
git rm src/lib/landing/landing-content.ts tests/compliance/landing-content.test.ts
```

- [ ] **Step 3: Verificar lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores. Confirmá que `/` sigue apareciendo en la tabla de rutas.

- [ ] **Step 4: Chequeo manual con el servidor de desarrollo (si tu entorno lo permite)**

Si tenés navegador: en un tenant de prueba, cargá contenido real en `/admin/landing` (activá `hero` con un título, activá `nosotros`), guardá, y confirmá en `/` que se ve lo cargado. Si no tenés navegador en este entorno, decilo explícitamente — la verificación obligatoria es `pnpm build` + la suite de tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(landing): conectar la landing publica a las secciones reales de la empresa"
```

---

### Task 5: Verificación final

**Files:** ninguno nuevo — corrida completa de la suite.

- [ ] **Step 1: Suite completa**

Run: `pnpm test`
Expected: PASS, nada roto. Resultado real al cerrar la etapa: **735/735** (85 archivos) — la estimación original de 739 contaba mal los tests del `landing-content.test.ts` eliminado y del `landing-page.test.tsx` reemplazado.

- [ ] **Step 2: Lint + build final**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 3: Reporte**

Confirmar en el chat con el usuario:
- Que la landing pública (`/`) ahora refleja de verdad lo que el admin carga en `/admin/landing` — ciclo completo cerrado (Etapa 1 rutas → Etapa 2 datos → Etapa 3 admin → Etapa 4 público).
- Que un tenant sin ninguna sección cargada todavía ve una landing funcional (fallback de hero), no una página en blanco.
- Que las secciones inactivas (`activo=false`) simplemente no aparecen — comportamiento esperado, no un bug.

---

## Fuera de alcance de esta etapa

- Switches rápidos en superadmin (Etapa 5, la última que queda del roadmap original).
- JSON-LD propio de tipo `LocalBusiness`/`Organization` para la landing (ya señalado como fuera de alcance en el spec original, sigue sin abordarse acá).
- `maxLength` en el cliente para los campos traducibles del admin (hallazgo de revisión de la Etapa 3, no bloqueante, no forma parte de esta etapa).
