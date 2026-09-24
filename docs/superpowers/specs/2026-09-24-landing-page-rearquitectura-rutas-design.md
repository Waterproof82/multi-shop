# Landing page + reestructuración de rutas — Design

Fecha: 2026-09-24
Estado: aprobado, pendiente de plan de implementación

## Contexto

Hoy `/` (raíz de cada dominio de tenant) sirve directamente la carta digital
(`src/app/page.tsx` → `MenuPage`). Se pide convertir `/` en una landing de
presentación de la empresa, con:

1. Enlace a la carta digital.
2. Sección "Nosotros" (ancla en la misma página).
3. Sección "Dónde estamos" (ancla en la misma página).

Durante el diseño se amplió el alcance: el usuario pidió tomar como
referencia la estructura de secciones de `https://sabordelaindia.es/index.html`
(scrapeada a `.firecrawl/sabordelaindia-index.md`) y construir una gestión de
esas secciones desde el panel de superadmin (con edición de contenido
delegada al panel de admin de cada tenant). El resultado son 6 tipos de
sección fijos, activables/desactivables por empresa.

Debe seguir funcionando para:
- El flujo de mesa (QR físico) de un restaurante tipo mesa.
- El modo camarero.
- El subdominio `pedidos.<dominio>` (o `<slug>-pedidos.<base>`).
- Tiendas con `mostrarCarritoEmpresa=true`.

## Decisiones de alcance (confirmadas con el usuario)

- La landing aplica a **todos los tenants** (tienda y restaurante), no solo
  restaurantes.
- El enlace "Ver carta" apunta a una **subruta nueva `/carta`** en el mismo
  dominio (no al subdominio `pedidos`, que sigue existiendo como mecanismo
  aparte y opcional).
- Los QR de mesa ya impresos (`/?mesa={mesaId}`) **no se tocan**: `/` sigue
  sirviendo la carta directamente cuando detecta ese contexto (bypass), sin
  redirect.
- Las secciones de landing son un **set fijo de 6 tipos** (no bloques
  libres/reordenables de forma arbitraria): `hero`, `nosotros`, `cta_carta`,
  `testimonio`, `galeria`, `visitanos`. Máximo una fila por tipo y empresa.
- Edición de contenido: **admin del tenant y superadmin**, ambos.
  Superadmin no tiene un editor de contenido propio — usa el flujo existente
  "entrar como esta empresa" (`/api/superadmin/switch-empresa`) y edita en
  `/admin/landing`, igual que el resto de la configuración. Superadmin sí
  gana switches rápidos de activar/desactivar cada tipo de sección desde su
  tabla de empresas (mismo patrón que `ModuloSwitch` / `delivery_habilitado`).

## 1. Arquitectura de rutas

### `/carta` (ruta nueva)
Es el `src/app/page.tsx` actual movido tal cual: misma lógica de resolución
de empresa, mesa, camarero, subdominio pedidos, `showCart`, fetch de menú,
`JsonLd`, `MenuPage`. Cero cambio de comportamiento — es un `mv`, no una
reescritura.

Para no duplicar esta lógica en dos archivos, se extrae a un componente de
servidor compartido (p. ej. `src/components/carta-route.tsx`, función server
async `CartaRoute({ searchParams })`) que exportan tanto
`src/app/carta/page.tsx` como la rama de bypass de `src/app/page.tsx`.

### `/` (raíz) — gate
1. Resuelve `fullDomain` y `empresa` (mismos helpers que hoy:
   `getDomainFromHeaders`, `getEmpresaByDomain`, `isPedidosSubdomain`).
2. Si `empresa` es `null` → mismo mensaje "Dominio no configurado" que hoy.
3. Calcula bypass:
   ```
   bypass = hasMesaParam (raw ?mesa= presente)
         || isWaiterMode (cookie waiter_token)
         || isPedidos (subdominio pedidos)
   ```
4. `bypass === true` → renderiza `<CartaRoute searchParams={searchParams} />`
   (mismo componente compartido, mismo comportamiento que hoy en `/`).
5. `bypass === false` → renderiza `<LandingPage empresa={empresa} />` (nueva).

Este esquema es intencionalmente conservador: **ningún QR, sesión de
camarero o subdominio pedidos existente cambia de comportamiento.**

### Archivos secundarios a actualizar (enlaces que hoy asumen "/" = carta)
- `src/app/admin/(protected)/admin-sidebar.tsx` — link "Ver tienda"
  (`t('viewStore')`): `/` → `/carta`. Es obligatorio: si no se cambia, el
  admin usa ese link para previsualizar su carta y en cambio vería la
  landing.
- `src/app/pedido/pago-ko/page.tsx` — "volver al inicio" tras un pago
  fallido: `/` → `/carta`, para no sacar al cliente del flujo de pedido.
- El resto de los `href="/"` existentes (`not-found.tsx`, `privacidad`,
  `superadmin/super-admin-header.tsx`, logout de `admin-sidebar.tsx`,
  "volver al inicio" de `tracking-page-client.tsx`) se dejan apuntando a `/`
  — son salidas genéricas al sitio, no parte del funnel de pedido.
- `buildQrUrl` en `src/app/admin/(protected)/mesas/page.tsx` **no se toca**
  (sigue generando `/?mesa={mesaId}`, cubierto por el bypass).

## 2. Modelo de datos

Tabla nueva `empresa_landing_secciones`:

```sql
CREATE TABLE public.empresa_landing_secciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('hero','nosotros','cta_carta','testimonio','galeria','visitanos')),
  activo BOOLEAN NOT NULL DEFAULT false,
  orden INT NOT NULL DEFAULT 0,
  contenido JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, tipo)
);
```

Sigue el checklist de migraciones de `CLAUDE.md` al pie de la letra: RLS
`AS RESTRICTIVE` deny-all para `anon` (el catálogo público NO lee esta tabla
directo — lee vía `getSupabaseClient()`/service_role desde un use case,
mismo patrón que `menus_virtuales`), políticas `TO authenticated` explícitas
usando `get_mi_empresa_id()` para admin CRUD, y los GRANTs explícitos
obligatorios post-2026-07-31.

`contenido` es JSONB validado en la capa de aplicación con un Zod
discriminated union por `tipo` (no a nivel de Postgres) — mismo patrón que
ya usa el proyecto para DTOs (`safeParse` + `max()` en strings).

Además: nueva columna `empresas.whatsapp TEXT NULL` (dato de contacto
general, igual que `telefono` — no es contenido de una sección, vive en
`empresa` para poder reusarse en footer u otros lugares a futuro).

### Campos por tipo (`TranslatableText` = mismo shape que `descripcion`/`footer1`, 5 idiomas)

| Tipo | Campos en `contenido` | Reutiliza de `empresa` (no se duplica) |
|---|---|---|
| `hero` | `kicker`, `titulo`, `descripcion` (TranslatableText), `imagenUrl`, `ctaSecundariaTexto`/`ctaSecundariaUrl` (opcional), `horario` (TranslatableText, opcional) | — |
| `nosotros` | `kicker`, `titulo`, `descripcion`, `imagenUrl` | — |
| `cta_carta` | `kicker`, `titulo`, `descripcion`, `ctaSecundariaTexto`/`ctaSecundariaUrl` (opcional) | CTA principal fijo → `/carta` |
| `testimonio` | `texto` (cita), `autor` | — |
| `galeria` | `titulo` (opcional), `imagenes: string[]` (mismo patrón que `bannerSlides`) | — |
| `visitanos` | `kicker`, `titulo`, `horario` (TranslatableText) | `direccion`, `telefono`, `urlMapa`, `emailNotification`, `whatsapp` |

Motivo de esta separación: `direccion`/`telefono`/`urlMapa`/`email` ya son
la fuente de verdad usada por `SiteFooter` y `JsonLd`. La sección
`visitanos` los **lee**, no los copia — así un cambio de dirección en
Configuración se refleja en la landing sin tocar la tabla de secciones.

Nota deliberada: el campo `descripcion` de `empresa` (usado hoy en
`hero-banner.tsx` como tagline de `/carta`) **no se reutiliza** para la
sección `nosotros` — son contenidos con audiencias distintas (uno es el
banner de la carta, el otro es la sección de presentación de la landing).
Queda documentado para que no se lea como un descuido.

## 3. Capas de aplicación (Clean Architecture, según CLAUDE.md)

- **Domain**: entidad `LandingSeccion` (tipo, activo, orden, contenido
  tipado por tipo) en `core/domain/entities/types.ts` o archivo propio.
- **Application**: DTOs Zod (`landing-seccion.dto.ts`, discriminated union
  por `tipo`), use cases `getLandingSeccionesUseCase` (lectura pública,
  solo `activo=true`, ordenadas) y `upsertLandingSeccionUseCase` (admin).
- **Infrastructure**: `SupabaseLandingSeccionRepository`, mapper
  camelCase↔snake_case igual que el resto del repo layer.

## 4. API

- `GET/PUT /api/admin/landing-secciones` — usa `resolveAdminContextWithEmpresa`
  (mismo helper que `menus-virtuales`), así sirve tanto al admin del tenant
  (empresaId de su JWT) como a superadmin operando con `?empresaId=` — sin
  necesidad de un árbol de rutas `/api/superadmin/...` aparte para esto.
  `requireRole(['admin','superadmin'])` como el resto de mutaciones admin.
- Lectura pública: no es un endpoint HTTP — el use case se llama
  server-side desde `LandingPage` (Server Component), igual que
  `getCachedMenu` hoy.

## 5. UI

### Admin del tenant — `/admin/(protected)/landing/page.tsx` (nueva)
6 tabs/cards fijos (uno por tipo), cada uno con:
- Toggle `activo`.
- Input numérico `orden`.
- Formulario específico del tipo (inputs por idioma para los campos
  `TranslatableText`, `ImageUploader`/`ImagenSubida` para imágenes —
  `galeria` usa un array de `ImageUploader`, mismo patrón que
  `bannerSlides` en la configuración del banner tipo slider).
- `visitanos` muestra de solo-lectura los campos que vienen de
  Configuración (dirección/teléfono/mapa/email/whatsapp) con un link a esa
  pantalla, y campos editables solo para `kicker`/`titulo`/`horario`.

### Superadmin — `empresas-table.tsx` (columna nueva)
6 switches por fila (uno por tipo de sección), mismo componente
`ModuloSwitch` que ya usan `delivery_habilitado`/`mesas_habilitadas`/etc.
Solo togglean `activo`; el contenido se edita entrando como la empresa
(botón "entrar" ya existente → `/api/superadmin/switch-empresa`) y yendo a
`/admin/landing`.

### Público — `LandingPage` (nueva, renderizada desde `src/app/page.tsx`)
- Header propio y liviano (no reutiliza `SiteHeaderClient`, que está
  acoplado a carrito/mesa/scroll-a-categoría): logo + `LanguageSelector`
  (mismo `LanguageProvider` global, ya disponible en `layout.tsx`) + 3 links:
  "Carta" → `/carta`, "Nosotros" → `#nosotros`, "Dónde estamos" →
  `#donde-estamos` (el ancla HTML usa este id; `visitanos` sigue siendo el
  nombre del `tipo` de sección en la tabla — son dos cosas distintas, no
  renombrar una para que combine con la otra).
- Componente por tipo: `HeroSection`, `NosotrosSection`, `CtaCartaSection`,
  `TestimonioSection`, `GaleriaSection`, `VisitanosSection`. Se renderiza
  solo lo que existe y está `activo`, ordenado por `orden`.
- **Fallback obligatorio**: si no hay ninguna sección `hero` activa
  (tenant recién creado, todavía sin contenido cargado), se muestra un hero
  mínimo generado (nombre de empresa + botón "Ver la carta" → `/carta`) —
  la landing nunca puede quedar en blanco.
- Todo el texto traducible sigue el patrón ya usado en `hero-banner.tsx`:
  `contenido.titulo?.[language] ?? contenido.titulo?.es ?? null`.
- Imágenes siempre vía `ImagenSubida` (nunca `next/image` — regla de
  `docs/context/imagenes.md`, y se debe sumar esta pantalla a
  `tests/compliance/imagenes-sin-doble-optimizacion.test.ts`).
- Footer: reutiliza `<SiteFooter empresa={empresa} />` sin cambios.
- Anclas de scroll (`#nosotros`, `#donde-estamos`) son nativas del navegador,
  sin JS adicional.

## Fuera de alcance (explícito)

- Editor de bloques libre/reordenable de forma arbitraria (se eligió set
  fijo de 6 tipos).
- Pantalla de edición de contenido dedicada dentro de `/superadmin` (usa
  switch-empresa + `/admin/landing`).
- Horarios estructurados por día (el campo `horario` es texto libre
  traducible, igual que el sitio de referencia).
- Reordenamiento drag-and-drop (el campo `orden` es un input numérico).

## Riesgos / puntos de atención para el plan de implementación

- La migración de `src/app/page.tsx` a `src/app/carta/page.tsx` +
  extracción a componente compartido debe verificarse con los tests E2E de
  mesa/camarero existentes antes de mergear (mesa QR, pausa/selección,
  `mesaEsperandoActivacion`, etc. no deben regresar).
- `generateMetadata` en `layout.tsx` sigue apuntando a `/` como canonical —
  su contenido (title/description desde `empresa.descripcion`) ahora
  describe la landing, no la carta; revisar si conviene ajustar el fallback
  de `FALLBACK_DESCRIPTIONS`.
- El `JsonLd` de producto/menú (hoy en `page.tsx`) se muda con el resto de
  la lógica a `/carta` — la landing puede necesitar su propio `JsonLd` de
  tipo `LocalBusiness`/`Organization` más adelante (no incluido en este
  alcance).
- Dado el tamaño (migración + RLS + DTOs + 2 use cases + repo + API + 2
  pantallas admin/superadmin + 6 componentes públicos + reestructuración de
  rutas), el plan de implementación debe partirse en etapas ejecutables por
  separado (rutas primero, ya que no depende de nada nuevo; luego
  DB/backend; luego UI admin; luego UI pública; superadmin al final).
