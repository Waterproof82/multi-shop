# Landing Page — Etapa 1: Ruteo + landing mínima — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `/` en una landing de presentación (con enlace a la carta, sección Nosotros y sección Dónde estamos) sin romper ningún flujo existente — mesa QR, modo camarero, subdominio `pedidos`, tiendas con carrito — moviendo la carta actual a `/carta`.

**Architecture:** La lógica de renderizado de la carta (`src/app/page.tsx` de hoy) se extrae sin cambios a un componente de servidor compartido `CartaRoute`, reutilizado por `/carta` y por `/` cuando corresponde. `/` pasa a ser un gate: resuelve la empresa, calcula si debe hacer bypass (mesa QR / camarero / subdominio pedidos) con una función pura testeable, y renderiza `CartaRoute` o una `LandingPage` nueva.

**Tech Stack:** Next.js App Router (Server + Client Components), React, Vitest + Testing Library, Tailwind v4.

**Spec de referencia:** `docs/superpowers/specs/2026-09-24-landing-page-rearquitectura-rutas-design.md` (sección 1: Arquitectura de rutas — esta es la única sección que cubre esta etapa).

---

## Contexto para quien ejecute esto

- Regla de oro del proyecto (`CLAUDE.md`): tras cada tarea completada correr `pnpm lint && pnpm build`. No marcar la tarea como hecha si fallan.
- Los commits van SIN "Co-Authored-By" ni atribución de IA — conventional commits solos (regla global del usuario).
- Los QR de mesa ya impresos apuntan a `/?mesa={mesaId}` (ver `buildQrUrl` en `src/app/admin/(protected)/mesas/page.tsx:29`) — **no se toca ese archivo**, el bypass en `/` lo cubre.
- `EmpresaPublic` (`src/core/domain/entities/types.ts:152`) es el tipo de la empresa pública. Los fixtures de test de este plan instancian el objeto completo porque el tipo no tiene casi campos opcionales.

## File Structure

**Nuevos:**
- `src/lib/landing/should-bypass-landing.ts` — regla pura: ¿"/" debe servir la carta en vez de la landing?
- `src/lib/landing/landing-content.ts` — reglas puras: ¿hay contenido para la sección Nosotros / Dónde estamos?
- `src/components/landing-header.tsx` — header de la landing (logo, nav, selector de idioma).
- `src/components/landing-page.tsx` — página de landing completa (hero + secciones + footer).
- `src/components/carta-route.tsx` — lógica de la carta de hoy, extraída de `src/app/page.tsx`, sin cambios de comportamiento.
- `src/app/carta/page.tsx` — wrapper fino de la ruta nueva.
- `tests/compliance/landing-bypass.test.ts`
- `tests/compliance/landing-content.test.ts`
- `tests/ui/landing-header.test.tsx`
- `tests/ui/landing-page.test.tsx`

**Modificados:**
- `src/app/page.tsx` — pasa de servir la carta directamente a ser el gate landing/carta.
- `src/lib/translations.ts` — 2 keys nuevas (`landingNavAboutUs`, `landingNavWhereWeAre`) en `es` y `en`.
- `tests/compliance/imagenes-sin-doble-optimizacion.test.ts` — se suma `landing-header.tsx` a la lista de ficheros que deben usar `ImagenSubida`.
- `src/app/admin/(protected)/admin-sidebar.tsx` — el link "Ver tienda" pasa de `/` a `/carta`.
- `src/app/pedido/pago-ko/page.tsx` — el link "volver al inicio" pasa de `/` a `/carta`.

---

### Task 1: `shouldBypassLanding` — regla pura de bypass

**Files:**
- Create: `src/lib/landing/should-bypass-landing.ts`
- Test: `tests/compliance/landing-bypass.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/compliance/landing-bypass.test.ts
import { describe, it, expect } from 'vitest';
import { shouldBypassLanding } from '@/lib/landing/should-bypass-landing';

describe('shouldBypassLanding — cuándo "/" sigue sirviendo la carta en vez de la landing', () => {
  it('bypassa con ?mesa= presente (QR de mesa)', () => {
    expect(shouldBypassLanding({ hasMesaParam: true, isWaiterMode: false, isPedidosSubdomain: false })).toBe(true);
  });

  it('bypassa en modo camarero', () => {
    expect(shouldBypassLanding({ hasMesaParam: false, isWaiterMode: true, isPedidosSubdomain: false })).toBe(true);
  });

  it('bypassa en el subdominio pedidos', () => {
    expect(shouldBypassLanding({ hasMesaParam: false, isWaiterMode: false, isPedidosSubdomain: true })).toBe(true);
  });

  it('no bypassa sin ninguna señal — se muestra la landing', () => {
    expect(shouldBypassLanding({ hasMesaParam: false, isWaiterMode: false, isPedidosSubdomain: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm vitest run tests/compliance/landing-bypass.test.ts`
Expected: FAIL — `Cannot find module '@/lib/landing/should-bypass-landing'`

- [ ] **Step 3: Implementación mínima**

```ts
// src/lib/landing/should-bypass-landing.ts
export interface LandingBypassSignals {
  hasMesaParam: boolean;
  isWaiterMode: boolean;
  isPedidosSubdomain: boolean;
}

export function shouldBypassLanding(signals: LandingBypassSignals): boolean {
  return signals.hasMesaParam || signals.isWaiterMode || signals.isPedidosSubdomain;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm vitest run tests/compliance/landing-bypass.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/landing/should-bypass-landing.ts tests/compliance/landing-bypass.test.ts
git commit -m "feat(landing): agregar regla de bypass entre landing y carta"
```

---

### Task 2: `hasNosotrosContent` / `hasDondeEstamosContent` — reglas puras de visibilidad

**Files:**
- Create: `src/lib/landing/landing-content.ts`
- Test: `tests/compliance/landing-content.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/compliance/landing-content.test.ts
import { describe, it, expect } from 'vitest';
import { hasNosotrosContent, hasDondeEstamosContent } from '@/lib/landing/landing-content';

describe('hasNosotrosContent', () => {
  it('false si descripcion es null', () => {
    expect(hasNosotrosContent(null)).toBe(false);
  });

  it('false si todos los idiomas están vacíos', () => {
    expect(hasNosotrosContent({ es: '', en: null })).toBe(false);
  });

  it('true si hay texto en al menos un idioma', () => {
    expect(hasNosotrosContent({ es: 'Somos una empresa familiar' })).toBe(true);
  });
});

describe('hasDondeEstamosContent', () => {
  it('false sin direccion, telefono ni urlMapa', () => {
    expect(hasDondeEstamosContent({ direccion: null, telefono: null, urlMapa: null })).toBe(false);
  });

  it('true con solo direccion', () => {
    expect(hasDondeEstamosContent({ direccion: 'Calle Falsa 123', telefono: null, urlMapa: null })).toBe(true);
  });

  it('true con solo telefono', () => {
    expect(hasDondeEstamosContent({ direccion: null, telefono: '922000000', urlMapa: null })).toBe(true);
  });

  it('true con solo urlMapa', () => {
    expect(hasDondeEstamosContent({ direccion: null, telefono: null, urlMapa: 'https://maps.google.com/x' })).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm vitest run tests/compliance/landing-content.test.ts`
Expected: FAIL — `Cannot find module '@/lib/landing/landing-content'`

- [ ] **Step 3: Implementación mínima**

```ts
// src/lib/landing/landing-content.ts
import type { EmpresaPublic } from "@/core/domain/entities/types";

export function hasNosotrosContent(descripcion: EmpresaPublic['descripcion']): boolean {
  if (!descripcion) return false;
  return Object.values(descripcion).some((text) => Boolean(text?.trim()));
}

export function hasDondeEstamosContent(
  empresa: Pick<EmpresaPublic, 'direccion' | 'telefono' | 'urlMapa'>
): boolean {
  return Boolean(empresa.direccion || empresa.telefono || empresa.urlMapa);
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm vitest run tests/compliance/landing-content.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/landing/landing-content.ts tests/compliance/landing-content.test.ts
git commit -m "feat(landing): agregar reglas de visibilidad de secciones Nosotros y Donde estamos"
```

---

### Task 3: Keys de traducción de la landing

**Files:**
- Modify: `src/lib/translations.ts:557` (bloque `es`), `src/lib/translations.ts:1644` (bloque `en`)

`TranslationObject` se infiere de `typeof translations.es` (línea 3760), así que la key nueva DEBE existir en el bloque `es`. Sigue el mismo patrón que `contact`/`location` (solo `es` + `en` — `fr`/`it`/`de` caen a `es` automáticamente vía `t()`, línea 3764-3767).

- [ ] **Step 1: Agregar las keys al bloque `es`**

En `src/lib/translations.ts`, después de la línea `location: "Ubicación",` (línea 557):

```ts
    location: "Ubicación",
    landingNavAboutUs: "Nosotros",
    landingNavWhereWeAre: "Dónde estamos",
```

- [ ] **Step 2: Agregar las keys al bloque `en`**

Después de la línea `location: "Location",` (línea 1644, ahora corrida +2 por el paso anterior — buscar por texto, no por número):

```ts
    location: "Location",
    landingNavAboutUs: "About us",
    landingNavWhereWeAre: "Find us",
```

- [ ] **Step 3: Verificar tipos**

Run: `pnpm typecheck`
Expected: sin errores (las keys nuevas están tipadas porque están en el bloque `es`)

- [ ] **Step 4: Commit**

```bash
git add src/lib/translations.ts
git commit -m "feat(landing): agregar traducciones de navegacion de la landing"
```

---

### Task 4: `LandingHeader`

**Files:**
- Create: `src/components/landing-header.tsx`
- Test: `tests/ui/landing-header.test.tsx`
- Modify: `tests/compliance/imagenes-sin-doble-optimizacion.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```tsx
// tests/ui/landing-header.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { LandingHeader } from '@/components/landing-header';
import type { EmpresaPublic } from '@/core/domain/entities/types';

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

function renderHeader(props: { showNosotros?: boolean; showDondeEstamos?: boolean } = {}) {
  return render(
    <LanguageProvider>
      <LandingHeader
        empresa={baseEmpresa}
        showNosotros={props.showNosotros ?? false}
        showDondeEstamos={props.showDondeEstamos ?? false}
      />
    </LanguageProvider>
  );
}

describe('LandingHeader', () => {
  it('siempre muestra el link a la carta', () => {
    renderHeader();
    expect(screen.getByRole('link', { name: 'Ver catálogo' })).toHaveAttribute('href', '/carta');
  });

  it('muestra el link Nosotros solo si showNosotros es true', () => {
    renderHeader({ showNosotros: true });
    expect(screen.getByRole('link', { name: 'Nosotros' })).toHaveAttribute('href', '#nosotros');
  });

  it('no muestra el link Nosotros si showNosotros es false', () => {
    renderHeader({ showNosotros: false });
    expect(screen.queryByRole('link', { name: 'Nosotros' })).not.toBeInTheDocument();
  });

  it('muestra el link Dónde estamos solo si showDondeEstamos es true', () => {
    renderHeader({ showDondeEstamos: true });
    expect(screen.getByRole('link', { name: 'Dónde estamos' })).toHaveAttribute('href', '#donde-estamos');
  });

  it('no muestra el link Dónde estamos si showDondeEstamos es false', () => {
    renderHeader({ showDondeEstamos: false });
    expect(screen.queryByRole('link', { name: 'Dónde estamos' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm vitest run tests/ui/landing-header.test.tsx --project ui`
Expected: FAIL — `Cannot find module '@/components/landing-header'`

- [ ] **Step 3: Implementación mínima**

```tsx
// src/components/landing-header.tsx
"use client";

import Link from "next/link";
import { ImagenSubida as Image } from "@/components/ui/imagen-subida";
import { LanguageSelector } from "@/components/language-selector";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import type { EmpresaPublic } from "@/core/domain/entities/types";

interface LandingHeaderProps {
  empresa: EmpresaPublic;
  showNosotros: boolean;
  showDondeEstamos: boolean;
}

export function LandingHeader({ empresa, showNosotros, showDondeEstamos }: Readonly<LandingHeaderProps>) {
  const { language } = useLanguage();

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:h-20 md:px-6">
        <div className="flex items-center gap-2">
          {empresa.logoUrl && (
            <div className="relative h-12 w-24 md:h-16 md:w-32">
              <Image
                src={empresa.logoUrl}
                alt={empresa.nombre ?? t("companyLogo", language)}
                fill
                sizes="(max-width: 768px) 96px, 128px"
                className="object-contain"
                loading="eager"
              />
            </div>
          )}
        </div>
        <nav className="flex items-center gap-1 md:gap-4">
          {showNosotros && (
            <a
              href="#nosotros"
              className="inline-flex min-h-[44px] items-center px-2 text-sm font-medium text-foreground/80 hover:text-foreground md:px-3"
            >
              {t("landingNavAboutUs", language)}
            </a>
          )}
          {showDondeEstamos && (
            <a
              href="#donde-estamos"
              className="inline-flex min-h-[44px] items-center px-2 text-sm font-medium text-foreground/80 hover:text-foreground md:px-3"
            >
              {t("landingNavWhereWeAre", language)}
            </a>
          )}
          <Link
            href="/carta"
            className="inline-flex min-h-[44px] items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {t("viewMenu", language)}
          </Link>
          <LanguageSelector />
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm vitest run tests/ui/landing-header.test.tsx --project ui`
Expected: PASS (5 tests)

- [ ] **Step 5: Sumar el fichero a la lista de compliance de imágenes**

En `tests/compliance/imagenes-sin-doble-optimizacion.test.ts`, agregar una línea al array `DEBEN_USAR_ENVOLTORIO` (alfabéticamente junto a los otros `src/components/*.tsx`):

```ts
const DEBEN_USAR_ENVOLTORIO = [
  'src/components/menu-section.tsx',
  'src/components/cart-drawer.tsx',
  'src/components/product-image-gallery.tsx',
  'src/components/tpv/MenuPanel.tsx',
  'src/components/hero-banner.tsx',
  'src/components/slider-banner.tsx',
  'src/components/site-header-client.tsx',
  'src/components/landing-header.tsx',
  'src/components/google-reviews-widget.tsx',
  'src/components/mesa-orders-client.tsx',
  'src/components/ui/image-uploader.tsx',
  'src/app/not-found.tsx',
  'src/app/superadmin/page.tsx',
  'src/app/superadmin/empresas-table.tsx',
  'src/app/admin/(protected)/admin-sidebar.tsx',
  'src/app/admin/(protected)/productos/page.tsx',
  'src/app/admin/(protected)/promociones/page.tsx',
  'src/app/admin/(protected)/toogoodtogo/page.tsx',
];
```

- [ ] **Step 6: Correr el test de compliance y verificar que pasa**

Run: `pnpm vitest run tests/compliance/imagenes-sin-doble-optimizacion.test.ts`
Expected: PASS — incluye ahora 2 casos nuevos para `landing-header.tsx` (no importa `next/image`, sí importa `imagen-subida`)

- [ ] **Step 7: Commit**

```bash
git add src/components/landing-header.tsx tests/ui/landing-header.test.tsx tests/compliance/imagenes-sin-doble-optimizacion.test.ts
git commit -m "feat(landing): agregar header de la landing con logo, nav e idioma"
```

---

### Task 5: `LandingPage`

**Files:**
- Create: `src/components/landing-page.tsx`
- Test: `tests/ui/landing-page.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```tsx
// tests/ui/landing-page.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { LandingPage } from '@/components/landing-page';
import type { EmpresaPublic } from '@/core/domain/entities/types';

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

function renderLanding(overrides: Partial<EmpresaPublic> = {}) {
  return render(
    <LanguageProvider>
      <LandingPage empresa={{ ...baseEmpresa, ...overrides }} />
    </LanguageProvider>
  );
}

describe('LandingPage', () => {
  it('muestra el nombre de la empresa y el CTA a la carta', () => {
    renderLanding();
    expect(screen.getByRole('heading', { level: 1, name: 'La Mermelada' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Ver catálogo' })[0]).toHaveAttribute('href', '/carta');
  });

  it('muestra titulo y subtitulo cuando existen', () => {
    renderLanding({ titulo: 'BENVENUTI', subtitulo: 'Buon appetito!' });
    expect(screen.getByText('BENVENUTI')).toBeInTheDocument();
    expect(screen.getByText('Buon appetito!')).toBeInTheDocument();
  });

  it('no renderiza la sección Nosotros sin descripcion', () => {
    renderLanding({ descripcion: null });
    expect(screen.queryByRole('heading', { name: 'Nosotros' })).not.toBeInTheDocument();
  });

  it('renderiza la sección Nosotros con el texto en español', () => {
    renderLanding({ descripcion: { es: 'Somos una empresa familiar desde 1990' } });
    expect(screen.getByRole('heading', { name: 'Nosotros' })).toBeInTheDocument();
    expect(screen.getByText('Somos una empresa familiar desde 1990')).toBeInTheDocument();
  });

  it('no renderiza la sección Dónde estamos sin direccion/telefono/urlMapa', () => {
    renderLanding({ direccion: null, telefono: null, urlMapa: null });
    expect(screen.queryByRole('heading', { name: 'Dónde estamos' })).not.toBeInTheDocument();
  });

  it('renderiza la dirección en la sección Dónde estamos cuando existe', () => {
    renderLanding({ direccion: 'Calle Falsa 123', telefono: null, urlMapa: null });
    expect(screen.getByRole('heading', { name: 'Dónde estamos' })).toBeInTheDocument();
    // SiteFooter también pinta la dirección en su columna de contacto — puede haber más de un match.
    expect(screen.getAllByText('Calle Falsa 123').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm vitest run tests/ui/landing-page.test.tsx --project ui`
Expected: FAIL — `Cannot find module '@/components/landing-page'`

- [ ] **Step 3: Implementación mínima**

```tsx
// src/components/landing-page.tsx
"use client";

import Link from "next/link";
import { LandingHeader } from "@/components/landing-header";
import { SiteFooter } from "@/components/site-footer";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { hasNosotrosContent, hasDondeEstamosContent } from "@/lib/landing/landing-content";
import type { EmpresaPublic } from "@/core/domain/entities/types";

interface LandingPageProps {
  empresa: EmpresaPublic;
}

export function LandingPage({ empresa }: Readonly<LandingPageProps>) {
  const { language } = useLanguage();
  const showNosotros = hasNosotrosContent(empresa.descripcion);
  const showDondeEstamos = hasDondeEstamosContent(empresa);
  const descripcion = empresa.descripcion?.[language] ?? empresa.descripcion?.es ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <LandingHeader empresa={empresa} showNosotros={showNosotros} showDondeEstamos={showDondeEstamos} />

      <section className="flex flex-col items-center justify-center gap-6 px-4 py-24 text-center">
        {empresa.titulo && (
          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            {empresa.titulo}
          </p>
        )}
        <h1 className="text-4xl font-bold text-foreground md:text-6xl">{empresa.nombre}</h1>
        {empresa.subtitulo && <p className="text-lg text-muted-foreground">{empresa.subtitulo}</p>}
        <Link
          href="/carta"
          className="inline-flex min-h-[44px] items-center rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground hover:opacity-90"
        >
          {t("viewMenu", language)}
        </Link>
      </section>

      {showNosotros && (
        <section id="nosotros" className="mx-auto w-full max-w-3xl px-4 py-16">
          <h2 className="mb-4 text-2xl font-bold text-foreground">{t("landingNavAboutUs", language)}</h2>
          <p className="text-base leading-relaxed text-muted-foreground">{descripcion}</p>
        </section>
      )}

      {showDondeEstamos && (
        <section id="donde-estamos" className="mx-auto w-full max-w-3xl px-4 py-16">
          <h2 className="mb-4 text-2xl font-bold text-foreground">{t("landingNavWhereWeAre", language)}</h2>
          <div className="space-y-2 text-base text-muted-foreground">
            {empresa.direccion && <p>{empresa.direccion}</p>}
            {empresa.telefono && <p>{empresa.telefono}</p>}
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
      )}

      <SiteFooter empresa={empresa} />
    </div>
  );
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm vitest run tests/ui/landing-page.test.tsx --project ui`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/landing-page.tsx tests/ui/landing-page.test.tsx
git commit -m "feat(landing): agregar pagina de landing con hero y secciones Nosotros/Donde estamos"
```

---

### Task 6: Extraer `CartaRoute` y crear la ruta `/carta`

Este task es un refactor que preserva comportamiento: `/` sigue mostrando exactamente lo mismo que hoy al terminar el task (todavía no existe el gate). Es la base para el Task 7.

**Files:**
- Create: `src/components/carta-route.tsx`
- Create: `src/app/carta/page.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Crear `carta-route.tsx` con el contenido actual de `src/app/page.tsx`**

Contenido exacto de `src/app/page.tsx` hoy, renombrando `Home` a `CartaRoute`, exportado con nombre (no default), y sin el `export const dynamic` (eso vive solo en los `page.tsx`):

```tsx
// src/components/carta-route.tsx
import { getCachedMenu, getEmpresaByDomain, isPedidosSubdomain, extractMainDomain, getModalidadesEntregaPublicas } from "@/lib/server-services"
import { MenuPage } from "@/components/client-menu-page"
import SiteHeaderWrapper from "@/components/site-header-wrapper";
import type { MenuCategoryVM } from "@/core/application/dtos/menu-view-model"
import { EmpresaThemeProvider } from "@/components/empresa-theme-provider";
import { getDomainFromHeaders } from "@/lib/domain-utils";
import { logger } from "@/core/infrastructure/logging/logger";
import { JsonLd } from "@/components/json-ld";
import { cookies } from "next/headers";

interface CartaRouteProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function CartaRoute({ searchParams }: Readonly<CartaRouteProps>) {
  const resolvedParams = await searchParams;
  const rawMesaParam = typeof resolvedParams.mesa === 'string' && resolvedParams.mesa.length > 0;
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

  const empresaId = empresa?.id;

  if (!empresa && empresaId === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">Dominio no configurado</h1>
          <p className="text-muted-foreground">Esta web no está asociada a ninguna empresa.</p>
        </div>
      </div>
    );
  }

  // If mesas are disabled for this empresa, treat mesa param as absent
  const mesasHabilitadas = empresa?.mesasHabilitadas ?? true;
  const hasMesaParam = rawMesaParam && mesasHabilitadas;
  const mostrarCarritoEmpresa = empresa?.mostrarCarrito ?? false;
  const isRestaurant = empresa?.tipo === 'restaurante';
  // When a mesa URL is present but mesas are disabled, suppress the cart for customers.
  // Waiter mode bypasses this — staff can always place orders regardless of the toggle.
  const mesaDisabledContext = rawMesaParam && !mesasHabilitadas && !isWaiterMode;
  // - pedidos subdomain: always
  // - waiter session or mesa QR: always (regardless of mostrarCarritoEmpresa)
  // - tienda with mostrarCarritoEmpresa=true: yes
  // - restaurante on main domain with no table/waiter: never (must come via QR or waiter)
  // - mesa URL with mesas disabled: never (overrides all the above)
  const showCart = !mesaDisabledContext && (isPedidos || isWaiterMode || hasMesaParam || (mostrarCarritoEmpresa && !isRestaurant));

  let menuData: MenuCategoryVM[] = [];

  try {
    const menuResult = await getCachedMenu(empresaId!);
    if (menuResult.data) {
      menuData = menuResult.data;
    } else if (menuResult.error) {
      logger.logError({
        codigo: 'MENU_FETCH_ERROR',
        mensaje: menuResult.error,
        modulo: 'use-case',
        metodo: 'execute',
        severity: 'error',
      });
    }
  } catch (error) {
    logger.logFromCatch(error, 'use-case', 'execute');
  }

  const modalidadesEntrega = empresa?.tipo === 'tienda'
    ? await getModalidadesEntregaPublicas(empresaId!)
    : [];

  const header = await SiteHeaderWrapper({ showCart, empresa });
  const baseUrl = fullDomain ? `https://${fullDomain}` : "https://localhost:3000";

  return (
    <EmpresaThemeProvider colores={empresa?.colores || null}>
      {empresa && <JsonLd empresa={empresa} menuData={menuData} baseUrl={baseUrl} />}
      <MenuPage menuData={menuData} header={header} showCart={showCart} empresa={empresa} isWaiterMode={isWaiterMode} modalidadesEntrega={modalidadesEntrega} />
    </EmpresaThemeProvider>
  );
}
```

- [ ] **Step 2: Crear `src/app/carta/page.tsx`**

```tsx
// src/app/carta/page.tsx
import { CartaRoute } from "@/components/carta-route";

export const dynamic = 'force-dynamic';

interface CartaPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CartaPage({ searchParams }: Readonly<CartaPageProps>) {
  return <CartaRoute searchParams={searchParams} />;
}
```

- [ ] **Step 3: Reemplazar `src/app/page.tsx` para que delegue en `CartaRoute`**

Comportamiento sin cambios todavía — `/` sigue mostrando la carta siempre, ahora desde el componente compartido:

```tsx
// src/app/page.tsx
import { CartaRoute } from "@/components/carta-route";

export const dynamic = 'force-dynamic';

interface HomeProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Home({ searchParams }: Readonly<HomeProps>) {
  return <CartaRoute searchParams={searchParams} />;
}
```

- [ ] **Step 4: Verificar lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores. `pnpm build` puede tardar varios minutos — es normal.

- [ ] **Step 5: Chequeo manual con el servidor de desarrollo**

Run: `pnpm dev`

En el navegador:
- Visitar `http://localhost:3000/` de un tenant configurado → debe verse exactamente la carta de hoy (sin cambios visuales).
- Visitar `http://localhost:3000/carta` del mismo tenant → debe verse lo mismo.

- [ ] **Step 6: Commit**

```bash
git add src/components/carta-route.tsx src/app/carta/page.tsx src/app/page.tsx
git commit -m "refactor(landing): extraer CartaRoute y agregar la ruta /carta"
```

---

### Task 7: Convertir `src/app/page.tsx` en el gate landing/carta

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Reescribir `src/app/page.tsx`**

```tsx
// src/app/page.tsx
import { getEmpresaByDomain, isPedidosSubdomain, extractMainDomain } from "@/lib/server-services"
import { getDomainFromHeaders } from "@/lib/domain-utils";
import { EmpresaThemeProvider } from "@/components/empresa-theme-provider";
import { LandingPage } from "@/components/landing-page";
import { CartaRoute } from "@/components/carta-route";
import { shouldBypassLanding } from "@/lib/landing/should-bypass-landing";
import { cookies } from "next/headers";

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

  return (
    <EmpresaThemeProvider colores={empresa.colores}>
      <LandingPage empresa={empresa} />
    </EmpresaThemeProvider>
  );
}
```

Nota: esto vuelve a resolver `empresa` de forma independiente a `CartaRoute` (que hace su propia resolución cuando se delega el bypass). Es una duplicación deliberada — ver spec, sección "Arquitectura de rutas" — que ya existe hoy entre `layout.tsx` y `page.tsx`, y prioriza que cada ruta sea autosuficiente por sobre ahorrarse una consulta.

- [ ] **Step 2: Verificar lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 3: Chequeo manual con el servidor de desarrollo**

Run: `pnpm dev`

En el navegador, contra un tenant configurado en local:
- `http://localhost:3000/` sin query params ni cookie de camarero → debe verse la **landing** nueva (nombre de empresa, CTA a la carta, y las secciones Nosotros/Dónde estamos si la empresa tiene `descripcion`/`direccion`/`telefono`/`urlMapa` cargados).
- `http://localhost:3000/?mesa=<id-de-mesa-real>` → debe verse la **carta**, igual que antes del cambio.
- `http://localhost:3000/carta` → debe verse la **carta** siempre, con o sin `?mesa=`.
- Si el tenant de prueba tiene camarero: loguearse como camarero y confirmar que `/` sigue mostrando la carta (bypass por cookie `waiter_token`).
- Si hay un tenant con subdominio `pedidos` configurado en local: confirmar que su raíz sigue mostrando la carta.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(landing): activar la landing en / cuando no aplica bypass de carta"
```

---

### Task 8: Actualizar el link "Ver tienda" del admin

**Files:**
- Modify: `src/app/admin/(protected)/admin-sidebar.tsx:519`

- [ ] **Step 1: Cambiar el href**

En `src/app/admin/(protected)/admin-sidebar.tsx`, el link con `{t('viewStore', language)}`:

```tsx
            <Link
              href="/carta"
              className="flex items-center gap-3 px-4 py-2.5 min-h-[44px] text-sm text-slate-300 hover:bg-white/5 hover:text-white w-full rounded-lg transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              <ExternalLink className="h-4 w-4 flex-shrink-0" />
              {t('viewStore', language)}
            </Link>
```

(único cambio: `href="/"` → `href="/carta"`)

- [ ] **Step 2: Verificar lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/(protected)/admin-sidebar.tsx"
git commit -m "fix(admin): apuntar el link Ver tienda a /carta"
```

---

### Task 9: Actualizar el link "volver al inicio" tras pago fallido

**Files:**
- Modify: `src/app/pedido/pago-ko/page.tsx:29`

- [ ] **Step 1: Cambiar el href**

En `src/app/pedido/pago-ko/page.tsx`:

```tsx
        <Link
          href="/carta"
          className="inline-block mt-2 px-6 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          {tx.trackingBackToHome}
        </Link>
```

(único cambio: `href="/"` → `href="/carta"`, mantiene el texto `trackingBackToHome` existente)

- [ ] **Step 2: Verificar lint y build**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/pedido/pago-ko/page.tsx
git commit -m "fix(pedidos): volver a /carta en vez de / tras un pago fallido"
```

---

### Task 10: Verificación final

**Files:** ninguno nuevo — corrida completa de la suite.

- [ ] **Step 1: Suite completa**

Run: `pnpm test`
Expected: PASS — incluye todos los tests nuevos de este plan más el resto de la suite (nada debe haberse roto: en particular, ningún test de mesa/camarero/waiter debería fallar, porque `buildQrUrl`, `useMesaId` y toda la lógica de `CartaRoute` no cambiaron de comportamiento).

- [ ] **Step 2: Lint + build final**

Run: `pnpm lint && pnpm build`
Expected: sin errores.

- [ ] **Step 3: Reporte**

Confirmar en el chat con el usuario:
- Qué rutas quedaron (`/` = landing, `/carta` = carta).
- Que los QR de mesa y el subdominio `pedidos` no requieren ningún cambio de configuración.
- Que las secciones Nosotros / Dónde estamos de la landing dependen de que la empresa tenga cargados `descripcion` / `direccion` / `telefono` / `urlMapa` en `/admin/configuracion` — si una empresa no tiene nada cargado, esa sección simplemente no aparece (comportamiento esperado, no un bug).

---

## Fuera de alcance de esta etapa

Cubierto por el roadmap del spec (secciones 2-5), a planificar en sesiones separadas cuando se llegue a cada una:
- Tabla `empresa_landing_secciones` y los 6 tipos de sección gestionables.
- Pantalla `/admin/landing`.
- Switches de superadmin en `empresas-table.tsx`.
- Renderizado público data-driven (esta etapa usa campos existentes de `empresa` directamente, no la tabla nueva).
