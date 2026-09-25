# SEO Multi-Tenant

## Archivos clave

| Archivo | Responsabilidad |
|---|---|
| `src/lib/seo/tenant-seo.ts` | Metadata por pagina: canonical, hreflang `?lang=`, OG, descripcion recortada (puro, testeado) |
| `src/lib/seo/json-ld.ts` | `@graph` schema.org: Restaurant/Store + WebSite + Menu (puro, testeado) |
| `src/app/layout.tsx` | Solo valores POR DEFECTO (titulo con template, OG, favicon). SIN canonical ni hreflang |
| `src/app/page.tsx`, `src/app/carta/page.tsx` | `generateMetadata` propio: canonical + hreflang de SU ruta |
| `src/app/robots.ts` | Robots.txt dinamico por dominio |
| `src/app/sitemap.ts` | Sitemap `/`, `/carta`, `/privacidad` con alternates hreflang |
| `src/app/not-found.tsx` | 404 noindex |
| `src/components/json-ld.tsx` | Serializa el `@graph` de `src/lib/seo/json-ld.ts` |

## Trampas criticas

- **NUNCA `alternates`/`canonical` en el layout raiz.** Se hereda en TODAS las
  paginas: antes `/carta` y `/privacidad` declaraban canonical `/` y Google las
  trataba como duplicados de la home. Cada pagina indexable declara el suyo
  con `buildTenantPageMetadata`. Test: `tests/compliance/tenant-seo.test.ts`.
- **Variantes de idioma = `?lang=xx`.** `LanguageProvider` aplica ese parametro
  al montar (gana a localStorage y lo persiste). Cada variante es canonical de
  si misma y se enlazan todas con hreflang + `x-default`. Solo se emiten los
  idiomas con `descripcion` propia del tenant.
- **Sin FAQPage.** Google exige que el marcado describa contenido VISIBLE; las
  FAQ genericas no se pintaban y afirmaban cosas falsas para algunos tenants
  (pago en efectivo...). Riesgo de accion manual por structured data spam.
- **Geo desde `url_mapa`**: el admin guarda la URL del iframe "Insertar un
  mapa" (`!2d<lng>!3d<lat>`), que el parser antiguo (`@lat,lng`) nunca leia.
- **Un solo `<main>` por pagina, y lo pone la pagina/layout de seccion**, no el
  layout raiz (ver `landing-page.tsx`, `client-menu-page.tsx`). Si el raiz lo
  pone, header/footer quedan dentro y dejan de ser landmarks banner/contentinfo.
- **FAB del carrito (`?carrito=abierto`)**: es estado de UI, no una pagina.
  Enlace con `rel="nofollow"`, excluido en robots.ts y su canonical es
  `/carta`. Los botones del carrito usan `etiquetaAbrirCarrito()` para que el
  `aria-label` incluya el contador (el badge va `aria-hidden`).
- **Enlaces `target="_blank"`** en la landing: `<AvisoNuevaPestana>` (sr-only,
  WCAG 3.2.5). Test: `tests/ui/landing-accesibilidad.test.tsx`.

## Features implementadas

- **Metadata dinamica:** Titulo, descripcion, OG por empresa (multi-tenant)
- **hreflang:** `?lang=xx` por idioma con descripcion propia + x-default
- **Robots.txt:** Bloquea paneles internos, API, mesa, pedido, tracking y `?mesa=`
- **Sitemap:** sin `lastModified` (no hay fecha real de edicion; un lastmod siempre "ahora" hace que Google lo ignore)
- **Schema.org:** Restaurant/Store (geo desde urlMapa), WebSite, Menu con MenuItem por plato (solo restaurante)
- **Geo coordinates:** Parsea lat/lng desde Google Maps URL en `empresa.url_mapa`

## Campos de BBDD usados

| Campo | Uso |
|---|---|
| `empresa.dominio` | Dominio principal |
| `empresa.slug` | Slug para URLs canonicas |
| `empresa.descripcion` | Descripciones i18n (es/en/fr/it/de) |
| `empresa.url_mapa` | Google Maps URL — parsea coordenadas geo |
| `empresa.updated_at` / `actualizado_en` | lastModified para sitemap |
