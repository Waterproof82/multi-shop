# Rediseño editorial de la parte pública (landing, carta, carrito)

Estado a 2026-09-27. Rama: `feat/rediseno-editorial-publico`.

La landing, la carta (`/carta`) y todos sus pop-ups comparten ahora **un mismo
sistema visual editorial**: fotos a sangre, filetes finos en vez de tarjetas,
esquinas rectas, titulares serif romanos y botones oscuros. Los colores siguen
siendo **los del tenant** (`--primary`, `--accent` en runtime): no hay tema fijo.

> **Regla de una línea:** una pantalla pública nueva debe usar este lenguaje
> (tabla "Sistema" de abajo) y **nunca** colores fijos, cursiva en titulares ni
> `hover:scale` sobre bloques con texto.

---

## Ruta rápida para revisar

1. Mira la tabla **Sistema** (qué comparte todo).
2. Recorre **Qué cambió, pantalla a pantalla**.
3. Lee **Errores detectados — no repetir** antes de tocar estos ficheros.
4. Verifica con la **Checklist** del final.

---

## Sistema (lo que comparten todas las pantallas)

| Elemento | Decisión | Dónde vive |
|---|---|---|
| Colores | Solo tokens del tenant (`primary`, `foreground`, `muted`…). Nada de hex/oklch fijos | `empresa-theme-provider.tsx` |
| Titulares | Playfair Display **400, romana** (`font-normal`), tracking negativo | clases por componente |
| Énfasis en titulares | `*palabra*` sigue funcionando: `<em>` **en redonda** + color primario | `TituloResaltado` en `landing-ui.tsx` |
| Cifras en serif | `[font-variant-numeric:lining-nums]` en nombres de producto (Playfair usa cifras antiguas por defecto) | `menu-section.tsx`, carrito, zoom |
| Separadores | Filete `border-foreground/10–15`, no tarjetas con sombra | todos |
| Esquinas | `rounded-[3px]` (botones, inputs, diálogos, opciones) | todos |
| Botón principal | Oscuro: `bg-foreground text-background`. **No** el `primary` del tenant (si es verde, se confunde con WhatsApp) | `landingBtnOscuro`, carrito, pop-ups |
| Antetítulo | Versalitas pequeñas **encima** del titular, nunca en columna aparte | `Eyebrow` en `landing-ui.tsx` |
| Movimiento | Sin fundidos al hacer scroll ni entradas animadas. Solo: cinta (marquee), zoom de foto en hover y "press" del botón | ver "Hover de las cards" |
| Pastillas | Permitidas si no llevan degradado (ej. precio de envío) | — |

El sello de diseño (macroestructura, tono) está en la cabecera de
`src/components/landing/landing-ui.tsx` y el historial en `.hallmark/log.json`.

---

## Qué cambió, pantalla a pantalla

### Landing (`src/components/landing-page.tsx` + `src/components/landing/*`)

| Sección | Antes | Ahora |
|---|---|---|
| Fondo | 4 brillos radiales (aspecto "plantilla IA") | Fondo liso del tenant |
| Hero | Foto en tarjeta redondeada 42px + texto | Foto **a sangre**; debajo, banda asimétrica: titular a la izquierda, descripción + botones a la derecha. Sin foto: el titular abre la página |
| Nosotros | Foto con marco desplazado | Díptico: foto pegada al borde izquierdo, texto en columna estrecha |
| CTA carta | Panel oscuro centrado con trama | Banda a todo el ancho, alineada a la izquierda |
| Testimonio | Cita en cursiva centrada con comilla gigante | Cita romana desplazada, comilla colgada en el margen |
| Galería | Tarjetas redondeadas con zoom en hover | Hoja de contactos: separación mínima, sin esquinas. La lógica de rejilla (con tests) **no se tocó** |
| Visítanos | Mapa en tarjeta | Datos con filetes a la izquierda, mapa pegado al borde derecho |
| Franja WhatsApp | Degradado | Color de marca plano |
| Cabecera | Translúcida con blur | Fondo sólido + filete |

**Admin (`/admin/landing`)**: los campos de imagen única (hero, nosotros) suben
ahora con `isBannerImage` → **1920 px** en vez de 480 px. Ver error E3.

### Carta (`/carta`)

| Pieza | Cambio | Fichero |
|---|---|---|
| Categoría | Filete encima + titular serif grande; descripción sin barra lateral de color | `menu-section.tsx` |
| Card de producto | Sin caja ni sombra: foto recta sobre `bg-muted`, nombre serif, filete, precio + botón oscuro | `menu-section.tsx` |
| Navegación de categorías | Pestañas **subrayadas** (`border-b-2 border-primary`) en vez de pastillas; `aria-current` en la activa; sin emojis 🍳🥤 | `category-nav.tsx` (solo la rama de cliente; la del camarero no se tocó) |
| Buscador | Línea inferior + icono `Search` de lucide (antes emoji 🔍) | `client-menu-page.tsx` |
| Banner | Sin animación de entrada (framer-motion eliminado), subtítulo sin cursiva. Sigue centrado: el arte del tenant está compuesto así | `hero-banner.tsx` |
| Cabecera | Sólida; **sin logo muestra el nombre** (antes el botón quedaba vacío) | `site-header-client.tsx` |

### Hover de las cards (petición expresa del usuario)

| Efecto | Estado |
|---|---|
| Zoom de la foto **dentro de su marco** (`md:group-hover:scale-105`, 500 ms) | ✅ recuperado |
| Filete del marco que pasa a `primary` (solo cards clicables) | ✅ adaptado (va en un `::after`, ver E7) |
| "Press" del botón al pulsar (`active:scale-[0.97]`) | ✅ en lugar de crecer en hover |
| Card entera que crece y sube con sombra | ❌ descartado: texto borroso al rasterizar y solapa a las vecinas |

Todo con `motion-safe` / `motion-reduce`.

### Pop-ups

| Pop-up | Cambio | Fichero |
|---|---|---|
| Añadir al carrito | Título serif, progreso de grupos en `primary` (antes semáforo oklch fijo), opciones rectas, total etiquetado, botón oscuro a todo el ancho | `quantity-selector-dialog.tsx` |
| Subcategorías | Título serif, filas con filete, sin viñetas ▸ | `category-nav.tsx` |
| Complementos (modo sin carrito) | Mismo lenguaje | `menu-section.tsx` (`ItemDetailDialog`) |
| Zoom de foto | Marco recto, foto sobre `bg-muted`, **nombre visible como pie de foto**, botón cerrar cuadrado de **44 px** (antes 36 px) | `image-zoom-dialog.tsx`, `product-image-gallery.tsx` |

### Carrito (`cart-drawer.tsx`)

- Cabecera serif, filas con filete (no tarjetas), miniaturas cuadradas de 56 px,
  total etiquetado, botones oscuros rectos, overlays de envío/confirmación sin
  blur ni sombra, check de éxito en `primary` (antes verde fijo).
- **Nuevo:** pulsar foto + nombre de un item abre el **zoom de foto**
  (`CartItemResumen`). Botón transparente superpuesto; `−`, `+` y papelera quedan
  fuera. Sin foto o con vídeo → no hay zoom. Tests: `tests/ui/cart-item-zoom.test.tsx`.

### Sección de envío del carrito

| Punto | Cambio |
|---|---|
| Título | "Método de entrega" (h3 serif) que además **nombra la lista** (`aria-labelledby`) |
| Selección | `aria-pressed` + borde y fondo `primary` + indicador tipo radio |
| Tamaño | Filas ≥ 56 px (antes 38 px, bajo el mínimo táctil) |
| Iconos | Lucide mapeado desde la clave `icono` de BD (`ICONO_LUCIDE`). El admin sigue usando `emojiDeIcono` |
| Precio | Todos en pastilla, también "Gratis" |
| Nombre largo | Nombre arriba, plazo con reloj debajo (`PlazoEntrega`) |
| Dirección | `<label>` visible asociado — `MapboxAddressInput` acepta ahora `id` |

Ficheros: `TiendaFulfillmentSelector.tsx`, `DeliveryMethodSelector.tsx` (restaurante,
mismo tratamiento), `MapboxAddressInput.tsx`.

### Textos en castellano (sin voseo)

23 textos pasados de voseo rioplatense a **castellano de España con tuteo**
(12 en `translations.ts`, 9 en componentes/API, 2 en `www/index.html`).
Ver error E9 y la regla en `CLAUDE.md`.

---

## Errores detectados — no repetir

| # | Error | Síntoma | Cómo evitarlo |
|---|---|---|---|
| E1 | **Scripts de edición en Windows cambian LF→CRLF** (`open(p,'w')` de Python) | `git diff` muestra el fichero ENTERO como cambiado (llegó a +5.000 líneas) | Editar en binario (`'rb'`/`'wb'`) o `newline=''`. Tras editar, comparar el final de línea de cada fichero con **su** `HEAD` contando bytes `b'\r\n'`. **Excepción:** `cart-drawer.tsx` es CRLF en el repo |
| E2 | Medir finales de línea con `rg -c $'\r'` en Git Bash | Informó CRLF en ficheros LF | Contar bytes con Python, no con `rg` |
| E3 | Pintar a sangre imágenes subidas a 480 px (`optimizeImage`) | Foto borrosa a pantalla completa | Campos que se pintan grandes → `isBannerImage` (1920 px). Las fotos **ya subidas** siguen a 480 px hasta que se resuban |
| E4 | Tests que fijan clases de diseño (`bg-primary`) | Un cambio visual rompe un test de comportamiento | Afirmar la **señal semántica** (`aria-current`, `aria-pressed`), no el color. Excepción legítima: la pastilla del precio de envío (`rounded-full`) es una decisión de producto fijada a propósito |
| E5 | Tocar el `Dialog` base (`ui/dialog.tsx`) para rediseñar pop-ups públicos | Cambiaría también el admin | Estilar cada diálogo por `className` |
| E6 | Tailwind v4: `scale-*` usa la propiedad CSS `scale`, **no** `transform` | `getComputedStyle(el).transform` devuelve `none` aunque el zoom funcione | Verificar con `getComputedStyle(el).scale` |
| E7 | Poner un borde/ring al contenedor de una imagen `fill` | La imagen tapa el borde | Pintarlo en un `::after` por encima (`pointer-events-none`) |
| E8 | Hacer clicable una fila que contiene otros botones (`−`, `+`, papelera) | HTML inválido y toques fallidos que abren otra cosa | Botón transparente superpuesto solo sobre la zona informativa (mismo patrón que las cards) |
| E9 | **Voseo en textos de UI** (`Escribí`, `Podés`, `Seleccioná`) | Textos argentinos en una app para España | Castellano con tuteo. Buscar **por palabra**, no por línea (ver E10) |
| E10 | Filtrar falsos positivos descartando **líneas enteras** | Líneas con "menú" o "después" ocultaron 2 textos con voseo | `rg -o` palabra a palabra, `sort -u`, y excluir palabras legítimas |
| E11 | Placeholder como única etiqueta de un input (`MapboxAddressInput`) | Campo sin nombre para lectores de pantalla | `<label htmlFor>` visible + prop `id` |
| E12 | Emojis como iconos (🔍 🏪 📦 🕐 🍳) | Se ven distinto en cada sistema y desentonan con lucide | Iconos de lucide |
| E13 | Olvidar `npx cap copy android` tras editar `www/index.html` | La PDA sigue con los textos viejos | Ejecutarlo siempre; luego recompilar el APK para que llegue a los dispositivos |
| E14 | Reutilizar el mismo `topic_key` de Engram para cambios distintos | La memoria nueva **sobrescribió** la anterior | Un `topic_key` por cambio |

---

## Fuera de alcance (a propósito)

- UI exclusiva del camarero (badges y botones de pase, rama de camarero de `CategoryNav`).
- Verde de "descuento válido" en el carrito: es un estado de éxito, no decoración.
- `SiteFooter`, FABs flotantes (carrito, WhatsApp).
- Fotos de tenants subidas antes del cambio a 1920 px (hay que resubirlas desde el admin).

---

## Checklist de verificación

- [ ] `pnpm lint` y `npx tsc --noEmit` limpios.
- [ ] `npx vitest run tests` en verde (859 tests al cerrar esta rama).
- [ ] Complejidad cognitiva ≤ 15 en los ficheros tocados (script de `deuda-complejidad.md`).
- [ ] `git diff --stat` sin diffs de fichero entero sospechosos (E1).
- [ ] Sin voseo: barrido por palabra en `translations.ts` (bloque `es`), `src/`, `www/`, `public/`.
- [ ] Revisión visual a 375 / 414 / 1440 px sin scroll horizontal.
- [ ] Carrito lleno + checkout revisado a mano (datos, envío, descuento).

## Tests nuevos o adaptados

| Test | Qué protege |
|---|---|
| `tests/ui/cart-item-zoom.test.tsx` (nuevo, 4) | Zoom desde el carrito; sin foto/vídeo no hay zoom; `+` no lo abre |
| `tests/ui/tienda-fulfillment-selector.test.tsx` (+4, 1 adaptado) | Título, `aria-pressed`, icono lucide, dirección etiquetada |
| `tests/ui/category-nav-subcategorias.test.tsx` (1 adaptado) | Categoría padre activa vía `aria-current` (antes clase `bg-primary`) |
