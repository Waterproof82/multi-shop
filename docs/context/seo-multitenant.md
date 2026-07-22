# SEO Multi-Tenant

## Archivos clave

| Archivo | Responsabilidad |
|---|---|
| `src/app/layout.tsx` | Metadata dinamica, hreflang, OG tags |
| `src/app/robots.ts` | Robots.txt dinamico por dominio |
| `src/app/sitemap.ts` | Sitemap con lastModified desde BBDD |
| `src/app/not-found.tsx` | 404 con meta tags dinamicos |
| `src/components/json-ld.tsx` | Schema.org Restaurant + FAQ + Menu |

## Features implementadas

- **Metadata dinamica:** Titulo, descripcion, OG por empresa (multi-tenant)
- **hreflang:** Idiomas es/en/fr/it/de configurados
- **Robots.txt:** Bloquea /admin/, /api/, /superadmin/ por dominio
- **Sitemap:** lastModified desde `actualizado_en` de empresa
- **Schema.org:** Restaurant (geo desde urlMapa), FAQPage, Menu con MenuItem por plato
- **Geo coordinates:** Parsea lat/lng desde Google Maps URL en `empresa.url_mapa`

## Campos de BBDD usados

| Campo | Uso |
|---|---|
| `empresa.dominio` | Dominio principal |
| `empresa.slug` | Slug para URLs canonicas |
| `empresa.descripcion` | Descripciones i18n (es/en/fr/it/de) |
| `empresa.url_mapa` | Google Maps URL — parsea coordenadas geo |
| `empresa.updated_at` / `actualizado_en` | lastModified para sitemap |
