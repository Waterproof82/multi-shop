# Carta Digital Multi-idioma

Plataforma **multi-tenant** de gestión de negocios de hostelería y retail. Cada empresa opera con su propio dominio, panel de administración y datos completamente aislados. Un único despliegue sirve a N negocios simultáneamente.

---

## ¿Qué puede hacer este sistema?

### 🛍️ Modo Tienda

- **Carta digital** con categorías, productos, imágenes y precios gestionables desde el panel admin.
- **Pedidos online** con formulario de cliente, seguimiento en tiempo real y notificación instantánea al negocio vía Telegram.
- **Pasarela de pagos Redsys TPV Virtual**: el cliente paga al hacer el pedido (delivery y recogida configurables por separado).
- **Delivery con riders** mediante integración Glovo Business LaaS: cotización en tiempo real, auto-despacho del rider al confirmar pago, tracking de estado.
- **Selector de dirección** con autocompletado Mapbox y validación por código postal.
- **Descuento de bienvenida**: popup a los 30 segundos, código único por email, porcentaje y duración configurables, validación server-side completa.
- **Campañas TooGoodToGo**: paquetes sorpresa a precio reducido, emails masivos a suscriptores, gestión de cupones y reservas.
- **Envío de promociones** por email a la base de clientes con imagen y texto personalizado.

### 🍽️ Modo Restaurante

- **Pedidos desde la mesa por QR**: el cliente escanea el QR con la cámara del móvil, sin instalar nada, y hace su pedido directamente.
- **Validación de presencia física**: los pedidos en mesa requieren escaneo in-app del QR impreso (token de sesión de 20 min con rotación automática).
- **Panel de sala para camareros** con login por PIN: grid de mesas con estado en tiempo real, apertura y cierre de sesión, búsqueda rápida de productos.
- **Pago en mesa** vía Redsys: pago total o división de cuenta entre 2 y 20 personas. Lock atómico para pago total; división permite pagos simultáneos independientes via RPC transaccional. Verificación de total antes de pagar para detectar productos añadidos en el último momento.
- **Registro manual de pagos** (efectivo / pago externo) para desbloquear sesiones en escenarios de división.
- **Gestión de pedidos takeaway** desde Telegram: confirmación del tiempo de preparación con un botón; el cliente recibe la notificación al instante.
- **Etiquetado de alérgenos**: 14 alérgenos EU (Reglamento 1169/2011 Anexo II) configurables por producto. Iconos SVG con nombre traducido en 5 idiomas.
- **Notas por ítem**: texto libre por producto en el carrito ("sin cebolla", "punto medio"). Viaja hasta las pantallas de cocina y bar.
- **Gestión de cocina y bar — cuatro pantallas especializadas**:
  - `/kitchen` — tablet en cocina, sin login. Ítems de comida con avance de estado por swipe (pendiente → en preparación → listo). Colores por tiempo de espera.
  - `/waiter/kitchen` — vista de cocina dentro del panel de camarero (PIN). Añade filtros por listos y retenidos, retención por mesa y release masivo.
  - `/waiter/pendientes` — cola de validación: pedidos en `pendiente_validacion` que el camarero revisa antes de mandar a cocina/bar. Selección individual o por tipo, pausa por ítem.
  - `/waiter/bar` — bebidas para el camarero. Swipe directo a servido con countdown de 5 s. Botón "Todos servidos" por mesa.

### 🖥️ TPV — Terminal Punto de Venta

Software de caja para restaurantes y tiendas integrado en la misma plataforma. Cumplimiento legal completo con la Ley Antifraude (RD 1007/2023) y RD 1619/2012. Dashboard de analítica con selector de período y configuración de tipo de impuesto (IVA/IGIC) por empresa.

#### Gestión de turno y cobro

- **Turnos de caja**: apertura con efectivo inicial, cierre con arqueo ciego — el teórico queda oculto hasta que el operador introduce su conteo real.
- **Mostrador táctil en 3 columnas**: grid de mesas/categorías, menú de productos y ticket activo. Navegación por teclado y touch.
- **Complementos**: modal de selección para opciones obligatorias u opcionales (radio-select, validación pre-añadido).
- **Cobro completo**: efectivo (calcula cambio), tarjeta, propina opcional. Desglose de IVA/IGIC y enlace de verificación AEAT en el ticket.
- **Cobro parcial**: el operador edita el importe a cobrar para pagar por fracciones. Cada cobro parcial genera un ticket fiscal independiente.
- **Selector de pase/marcha**: 1er pase, 2º pase, postre, bebida. El KDS de cocina agrupa ítems por sección de pase.
- **Historial multi-turno**: consulta de cualquier turno pasado con filtrado por fechas de apertura/cierre.
- **Rectificativos con trazabilidad cross-turno**: el historial resuelve si un cobro fue rectificado en otro turno.
- **Detección de cobro externo**: si la mesa se paga desde otro canal mientras está abierta en el TPV, el mostrador lo detecta vía Realtime y limpia el ticket automáticamente.

#### Cumplimiento legal (Ley Antifraude + RD 1007/2023 + RD 1619/2012)

- **Cadena de hashes SHA-256**: cada cobro encadena el hash del anterior via trigger PostgreSQL + pgcrypto. Inmutable: triggers bloquean DELETE y UPDATE de campos económicos.
- **Ticket rectificativo**: cobro de signo negativo con referencia al original, sin modificar registros inmutables. Excluido de estadísticas.
- **Numeración correlativa**: `SERIE-NNNNNN` sin saltos, atómica a nivel de base de datos.
- **IVA/IGIC calculado en DB**: `iva_cents` y `base_imponible_cents` computados en el trigger de inserción — nunca en el cliente.
- **Desglose de ítems en ticket** (`detalle_items JSONB`): nombre, cantidad y precio unitario por producto, inmutable una vez grabado.
- **Informe Z de cierre de turno**: `numero_z` secuencial por empresa (trigger con advisory lock sin race conditions). Modal con totales, IVA, arqueo y huella digital. Auto-print vía `window.print()`.
- **Auditoría para inspectores**: `GET /api/tpv/audit/chain` verifica la cadena SHA-256; `GET /api/tpv/audit/export` descarga todos los cobros como JSON.
- **Pantalla de conformidad legal** `/tpv/legal`: Declaración de Responsabilidad RD 1007/2023, versión del software, checklist de cumplimiento con última purga RGPD, verificación de cadena y exportación.
- **VeriFactu — Modo No-VeriFactu** (Art. 12 RD 1007/2023): `verifactu_mode` por empresa. El trigger persiste `verifactu_qr_url` en cada cobro. El QR se imprime en el ticket para verificación AEAT.
- **DPA Art. 28 RGPD**: pantalla `/tpv/legal/dpa` con plantilla de Acuerdo de Tratamiento de Datos.
- **RGPD accountability** (Art. 5.2): tabla `rgpd_purge_log` — cada ejecución del Vercel Cron mensual de purga queda registrada de forma inmutable.

#### Analítica

- **Dashboard `/tpv/analytics`**: 5 KPIs (facturado, ticket medio, IVA/IGIC, propinas, turnos), gráfico de ventas por hora en zona Europe/Madrid, split efectivo/tarjeta, top 10 productos, historial de turnos con operador y duración.
- **Configuración IVA/IGIC por empresa**: `tipo_impuesto` ('iva'|'igic') y `porcentaje_impuesto`. El label se propaga via SSR a todos los componentes TPV.
- **Analítica avanzada**:
  - **Matriz BCG de Menú** (`/admin/analytics/menu-engineering`): scatter plot Estrellas / Vaca / Enigma / Perro según popularidad y margen de contribución.
  - **Heatmap de Ocupación** (`/admin/analytics/ocupacion`): grid 7×24 de densidad de sesiones de mesa.
  - **Informe de Cierre de Turno** (`/tpv/analytics/cierre/[turnoId]`): resumen automático al cerrar — ventas, covers, top productos, mermas.
  - **Comparativa de Períodos** (`/admin/analytics/comparativa`): delta % entre dos períodos (ventas, covers, ticket medio, margen).

#### Stock & Mermas

- **Gestión de ingredientes**: CRUD con badge visual de stock (rojo = bajo mínimo). Unidades: kg, l, ud.
- **Escandallo**: vincula ingredientes a productos con cantidad por servicio.
- **Descuento automático al servir**: trigger PostgreSQL en el mismo transaction que el cambio de estado. Si el ingrediente cae bajo el umbral, el producto se desactiva automáticamente del menú.
- **Re-habilitación automática**: cuando se registra una entrada de stock que supera el umbral, los productos vinculados se reactivan.
- **Registro de mermas**: ingrediente, cantidad y motivo (caducidad / rotura / error / otro). Requiere turno activo.
- **Audit log inmutable** (`movimientos_stock`): historial de entradas, deducciones, ajustes, mermas e inventario. Append-only.
- **Inventario físico a ciegas**: el operador introduce cantidades sin ver el teórico. El sistema muestra desviaciones y confirma con movimientos de tipo `inventario`.
- **Alerta de stock bajo**: badge ámbar en el header del TPV. Refresco cada 3 minutos. Informativo, no bloquea el cobro.

#### Compras y Proveedores — SIALTI

Módulo de gestión de la cadena de suministro. Cumple con el Reglamento CE 178/2002 (trazabilidad sanitaria), Ley Antifraude 11/2021 y RD 1619/2012.

- **Maestro de proveedores**: CRUD con CIF único por tenant. Catálogo de artículos con precio, unidad, factor de conversión e IVA/IGIC.
- **Pedidos de compra**: ciclo `borrador → enviado → recibido / cancelado`. Precios e IVA inmutables una vez enviado.
- **Albaranes de recepción**: captura `numero_lote` y `fecha_caducidad` para perecederos. Inmutable al recibir (trigger PostgreSQL). Recepción atómica via RPC `recibir_albaran_transaccional`.
- **Facturas de proveedor**: desglose de base imponible por tipo de IVA (0/4/10/21%) e IGIC (0/3/7/9.5/15%). Validación matemática ±2 céntimos.
- **Soporte IGIC**: régimen detectado desde `empresa.tipo_impuesto`.

#### Food Cost Analytics

- **CMP automático**: trigger recalcula el Coste Medio Ponderado en cada entrada de stock.
- **Food Cost Teórico vs Real** (`/admin/analytics/food-cost`): coste teórico (escandallo × CMP) frente a coste real de compras.
- **Rentabilidad por Producto** (`/admin/analytics/rentabilidad`): precio de venta, coste de receta, margen bruto, margen %, unidades vendidas y contribución total.

#### Empleados TPV — autenticación por PIN

- **Login por PIN**: pantalla `/tpv/login` con 4–8 dígitos. PIN hasheado con PBKDF2 SHA-256 por empresa.
- **Cookie `tpv_employee_token`**: JWT HS256, 1h, sliding window lazy.
- **Dual-auth en proxy**: intenta `admin_token` primero; si falla, prueba `tpv_employee_token`.
- **Botón "Bloquear TPV"**: limpia la cookie y redirige a `/tpv/login` sin afectar el turno activo.
- **Permisos por rol**: `encargado` (TPV completo) / `cajero` (mostrador + cobro, arqueo ciego).

#### Rendimiento y resiliencia offline (TPV)

- **Navegación instantánea**: catálogo, categorías, turno activo y mesas se cargan una vez al arrancar. Sin consultas adicionales al navegar entre secciones.
- **Invalidación reactiva del catálogo**: actualizaciones desde `/admin/productos` llegan al TPV vía Supabase Realtime en ≤400 ms.
- **Resilencia offline (IndexedDB)**: el catálogo se replica localmente al arrancar. Si Supabase no está disponible en un reload, el TPV carga el snapshot local.

### ⚡ Tiempo Real — Sistema Híbrido

Todas las vistas en tiempo real usan **Supabase Realtime** (WebSocket, CDC sobre PostgreSQL) en lugar de polling HTTP. La latencia al cambio es < 100 ms con carga cero en DB durante inactividad.

El sistema distingue dos tipos de actualización:

| Tipo | Mecanismo | Latencia |
|------|-----------|----------|
| Cambios de datos (pedidos, estados) | Supabase Realtime CDC | < 100 ms |
| Progresión visual de timers | `setInterval` 1 s (sin red) | 1 s |

Un único canal Realtime multiplexado en `WaiterBanner` consolida conteos de cocina, bar y estado de pago, reduciendo a cero los requests HTTP por camarero activo durante períodos de inactividad.

Los canales se desconectan cuando el tab está oculto y se reconectan al volver, ahorrando quota de Supabase.

### 🤖 Notificaciones Telegram

- **Tienda**: botones de acción rápida (Aceptar, Rechazar) en el mensaje.
- **Restaurante takeaway**: selector de tiempo de preparación; el cliente ve la confirmación al instante.
- **Mesa**: gestionado íntegramente in-app, sin Telegram.

### ⏱️ Fichaje Digital — LaborControl (Art. 34.9 ET · RD-Ley 8/2019)

Registro de jornada laboral con cumplimiento legal para el mercado español. Inmutable por diseño: los registros nunca se borran ni modifican — toda corrección es un evento adicional con trazabilidad completa.

- **Cuatro tipos de evento**: `entrada | salida | inicio_pausa | fin_pausa`. Las correcciones generan un quinto tipo (`correccion`) que referencia al original.
- **Doble timestamp**: `timestamp_evento` (dispositivo) y `timestamp_servidor` (fuente de verdad). Drift > 5 min → flag automático, pero el fichaje sigue siendo válido.
- **Cadena de integridad SHA-256**: cada fichaje encadena el hash del anterior. Si alguien modifica un registro en la DB, la ruptura es matemáticamente detectable.
- **Tabla particionada mensualmente**: `lc_fichajes` usa particionado nativo PostgreSQL. Cron Vercel crea la partición del mes siguiente el día 25.
- **FichajeDialog integrado en TPV**: aparece al hacer login con PIN (sugerido "entrada") y al cerrar turno (sugerido "salida").
- **Modo offline AES-GCM 256-bit**: cifra el payload en IndexedDB y lo sincroniza al recuperar conexión.
- **PIN offline en Electron**: bcrypt work factor 12, guardado via `electron-store`, rate limit 4 intentos/30 s.
- **Panel supervisor** en tiempo real (Supabase Realtime): estado actual de cada empleado (en jornada / en pausa / fuera).
- **Vista RLT**: solo lectura para el Representante Legal de los Trabajadores (Art. 64 ET).
- **Exportación**: PDF (`@react-pdf/renderer`) y Excel (ExcelJS streaming). Resumen mensual obligatorio para trabajadores a tiempo parcial (Art. 12.4.c ET).
- **Legal holds**: retenciones manuales que bloquean cualquier purga para un empleado o empresa.

### 🌐 Multi-idioma y Multi-tenant

- **5 idiomas**: español, inglés, francés, italiano y alemán en todos los textos de cara al cliente.
- **Cada empresa**: dominio propio, colores, logo, carta, clientes y configuración completamente aislados.
- **Panel SuperAdmin**: vista global de todas las empresas, ranking y toggles de funcionalidades.

### 🔒 Seguridad

JWT + HttpOnly cookies, revocación en Redis (fail-closed), RBAC por rol (`admin | superadmin | encargado | cajero`), CSRF HMAC-SHA256 con `timingSafeEqual`, CSP con nonce criptográfico por request, rate limiting por IP y UUID, validación de precio server-side, aislamiento por tenant con RLS en Supabase (53 tablas, todas con policies).

**Auditoría continua de RLS/GRANTs en Supabase**: la función `check_rls_policy_hygiene()` (`SECURITY DEFINER`, solo `service_role`) escanea el schema completo en cada push que toque `supabase/migrations/**` — 10 chequeos permanentes: policies "deny anon" mal escritas (PERMISSIVE en vez de RESTRICTIVE), policies `roles:public` que exponen funciones/columnas scopeadas a identidad, RLS deshabilitado, vistas sin `security_invoker`, privilegios por defecto inseguros, funciones `SECURITY DEFINER` sin `search_path`, roles con `BYPASSRLS`, policies `INSERT` sin `WITH CHECK`, y GRANTs de escritura a `anon` que la arquitectura nunca necesita (incluye `TRUNCATE`, el único privilegio que ninguna policy de RLS puede frenar). Corre en CI vía `e2e/compliance/rls-policy-hygiene.spec.ts` — ver [`testing-ci.md`](docs/context/testing-ci.md#cómo-agregar-un-test-de-regresión-de-seguridad-nuevo).

**Aislamiento de tenant fuera de RLS**: las rutas API que resuelven el tenant server-side (`/api/mesas/*`, `/api/glovo/order`) derivan el `empresaId` **solo** por dominio o por sesión verificada — nunca confían en `x-empresa-id`/`x-admin-rol` del request salvo que la ruta esté cubierta por uno de los 6 prefijos que `proxy.ts` sanea explícitamente (`/api/admin|waiter|kitchen|tpv|laborcontrol|superadmin`). Regresión cubierta por `e2e/compliance/mesas-tenant-header-spoofing.spec.ts`.

Ver [`docs/context/security.md`](docs/context/security.md) para detalle completo.

### 💾 Backup Automático

Backup diario de todos los datos operativos de cada empresa a Cloudflare R2. GitHub Actions (cron 03:00 UTC) dispara una Supabase Edge Function (Deno) que serializa un snapshot JSON por tenant y lo sube a `backups/{empresa_id}/{YYYY-MM-DD}.json`. Restauración via `POST /api/admin/backup/restore` con orden FK-safe.

---

## Apps Nativas

### Android — Capacitor (panel camarero)

El panel `/waiter` se distribuye como APK nativo para PDAs de camarero. Capacitor envuelve la webapp en un WebView nativo.

- APK firmado, distribuido via Supabase Storage (sin Play Store).
- Auto-update: compara `versionCode` con `/api/app/version` al abrir.
- `SameSite=lax` obligatorio en `waiter_token` para que el WebView reciba la cookie.

### Windows — Electron (TPV)

El TPV se distribuye como ejecutable Windows portable (sin instalador).

- **Formato portable**: un único `.exe`. Configuración en `%AppData%\Multisistema TPV\` via `electron-store`.
- **Auto-update silencioso**: descarga el nuevo `.exe` en background y lo reemplaza via PowerShell sin ventanas CMD visibles.
- **Impresión térmica nativa**: IPC renderer → main → `node-thermal-printer`. El renderer corre en sandbox OS-level (`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`).
- **Distribución**: releases en GitHub (el `.exe` pesa ~90 MB, supera el límite de Supabase Storage Free).

#### Build del ejecutable

```bash
pnpm build:electron:prep      # Compila TypeScript de Electron
pnpm build:electron:rebuild   # Rebuild módulos nativos contra la versión de Electron
pnpm exec electron-builder --win
# → dist/TPV MultiShop X.Y.Z.exe
```

---

## Stack Tecnológico

| Tecnología | Versión | Uso |
|------------|---------|-----|
| Next.js | 16.0.10 (Turbopack) | Framework full-stack |
| React | 19.2.0 | UI |
| TypeScript | 5.x | Tipado estático |
| Supabase | ^2.95.3 | DB + Auth + Realtime CDC |
| Cloudflare R2 | — | Storage imágenes y backups |
| Tailwind CSS | 4.x | Estilos |
| Zod | 4.4.x | Validación de schemas |
| Vitest | 4.x | Tests de compliance (property testing con fast-check) |
| jose | ^6.1.3 | JWT sign + verify |
| Upstash Redis | — | Rate limiting + JWT revocation |
| Brevo | — | Envío de emails |
| Mapbox Search JS | — | Autocompletado dirección de entrega |
| Redsys TPV Virtual | — | Pago online (HMAC_SHA256_V1) |
| Glovo Business LaaS | — | Despacho de riders |
| @zxing/browser | — | Decodificación QR in-app (iOS Safari + Android Chrome) |
| Recharts | — | Gráficos de analítica (lazy-loaded) |
| @react-pdf/renderer | — | Export PDF fichajes |
| ExcelJS | — | Export Excel fichajes (streaming) |
| Electron | 39.x | App escritorio Windows (TPV portable) |
| electron-builder | 26.x | Packaging del exe portable |
| electron-store | 8.x | Persistencia config local |
| node-thermal-printer | — | Impresión térmica ESC/POS |
| Capacitor | — | App Android nativa (panel camarero) |
| Sentry | — | Error monitoring + Session Replay |
| Service Worker (vanilla) | — | Caching offline para `/waiter` |

---

## Arquitectura — Clean Architecture

```
┌─────────────────────────────────────────────────────────┐
│            API Routes / Pages (Presentación)            │
│  Validación Zod · requireAuth · successResponse         │
└──────────────────────────┬──────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│               Use Cases (Aplicación)                    │
│  ProductUseCase · PedidoUseCase · AuthAdminUseCase …    │
└──────────────────────────┬──────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│              Repositories (Infraestructura)             │
│  IProductRepository · IPedidoRepository …               │
└──────────────────────────┬──────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│               Supabase / R2 (Implementación)            │
│  getSupabaseClient() · getSupabaseAnonClient() · R2     │
└─────────────────────────────────────────────────────────┘
```

Reglas estrictas:
- NUNCA acceder a DB directamente desde routes o pages.
- SIEMPRE: Use Case → Repository → Supabase.
- NUNCA `createClient()` fuera de `supabase-client.ts`.
- Sin `any` — se usan tipos de dominio o `Record<string, unknown>`.

Toda la lógica de negocio usa `Result<T, AppError>`. Los repositorios devuelven camelCase (dominio); las API routes del admin responden en snake_case.

---

## SEO & GEO (Generative Engine Optimization)

### SEO tradicional (implementado)

- **Metadata dinámica por empresa**: `title`, `description`, `og:*` generados por tenant en SSR.
- **hreflang**: 5 idiomas (es / en / fr / it / de) en todas las páginas públicas.
- **Sitemap y robots dinámicos**: generados por tenant, excluyen rutas privadas.
- **Schema.org estructurado**: `Restaurant`, `Menu`, `MenuItem`, `FAQPage`. Las coordenadas geográficas se parsean automáticamente desde la URL de Google Maps del negocio.
- **JSON-LD en SSR**: sanitizado contra inyección (`<`, `>`, `&` escapados).
- **404 con meta tags**: evita que las páginas de error se indexen erróneamente.

### GEO — optimización para motores de IA (pendiente)

Los motores de búsqueda de IA (ChatGPT, Perplexity, Claude, Gemini, Copilot) están adoptando `/llms.txt` como señal explícita de qué contenido de un dominio puede crawlear una IA y cuál no. Esta plataforma no tiene `/llms.txt` aún.

El Schema.org `Restaurant` + `Menu` + `MenuItem` ya es una base sólida para respuestas generativas (los LLMs extraen bien datos estructurados), pero podría complementarse con:

- **`/llms.txt`**: índice legible por IA con descripción del negocio, menú, horarios y política de datos.
- **Descripciones semánticas densas**: los campos `descripcion` de productos y empresas son los que los LLMs usan para construir respuestas. Cuanto más específicos, mejor posicionamiento en respuestas generativas.

---

## Monitorización

Dos capas complementarias:

| Capa | Qué captura |
|------|-------------|
| Supabase `log_errors` | Errores de negocio con contexto de tenant |
| Sentry | Crashes técnicos, client-side errors, stack traces desminificados, Session Replay on error, Web Vitals |

Session Replay usa `maskAllText` y `blockAllMedia` (obligatorio — el sistema maneja datos de clientes).

Ver [`docs/context/sentry-monitoring.md`](docs/context/sentry-monitoring.md).

---

## Comandos

```bash
pnpm dev              # Desarrollo con Turbopack
pnpm build            # Build de producción
pnpm lint             # Linting
pnpm typecheck        # Type check completo (tsc --noEmit)
pnpm test:compliance  # Tests estáticos rápidos (Vitest) — secrets, patrones inseguros
pnpm db:smoke         # Smoke tests de funciones DB (obligatorio tras cada migración)
pnpm e2e:db           # E2E smoke tests via Playwright
pnpm e2e              # Suite E2E completa
npx playwright test e2e/compliance/  # Solo la suite de compliance (RLS, inalterabilidad, RGPD)

# Setup R2 CORS (una sola vez)
npx tsx scripts/setup-r2-cors.ts
```

### Git hooks y CI

`pnpm install` activa automáticamente los hooks de Husky: `pre-commit` corre lint+typecheck, `pre-push` corre la suite completa de compliance. GitHub Actions corre `ci.yml` (lint/typecheck/build), `compliance.yml` (tests legales/fiscales, path-filtered + nightly) y `e2e.yml` (suite E2E completa) en cada push/PR. Detalle completo en [`docs/context/testing-ci.md`](docs/context/testing-ci.md).

---

## Variables de Entorno

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Auth JWT
ACCESS_TOKEN_SECRET=          # openssl rand -hex 32

# CSRF + Carrito + Unsubscribe
CSRF_HMAC_SECRET=
UNSUBSCRIBE_HMAC_SECRET=

# Rate Limiting + JWT Revocation (Upstash Redis)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# CORS
CORS_ALLOWED_ORIGINS=https://tudominio.com,https://pedidos.tudominio.com
CORS_ALLOWED_DOMAINS=tudominio.com

# Cloudflare R2 — imágenes
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
NEXT_PUBLIC_R2_DOMAIN=

# Cloudflare R2 — backups (bucket distinto al de imágenes)
R2_BACKUP_BUCKET_NAME=
R2_ENDPOINT=
BACKUP_SECRET=                # openssl rand -hex 32

# Sentry
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=

# Email (Brevo)
BREVO_API_KEY=
BREVO_DEFAULT_SENDER_EMAIL=

# Mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=

# Redsys (URL de entorno — credenciales por empresa en /admin/delivery)
NEXT_PUBLIC_REDSYS_URL=https://sis.redsys.es/sis/realizarPago

# RGPD Cron
CRON_SECRET=                  # openssl rand -hex 32

# Waiter PIN (pepper)
WAITER_PIN_PEPPER=
```

---

## Despliegue (Vercel)

1. Conectar repo a Vercel.
2. Configurar todas las variables de entorno.
3. Framework Preset: **Next.js**.
4. Deploy automático en push a `main`.

> Next.js 16 usa Turbopack — es normal ver "Skipping validation of types" en el build.

---

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [`docs/context/security.md`](docs/context/security.md) | Medidas de seguridad detalladas |
| [`docs/context/testing-ci.md`](docs/context/testing-ci.md) | Suites de test, Husky hooks, workflows de CI |
| [`docs/context/bbdd.md`](docs/context/bbdd.md) | Esquema completo de base de datos |
| [`docs/tpv-legal-compliance.md`](docs/tpv-legal-compliance.md) | Checklist legal TPV (Ley Antifraude, VeriFactu, RGPD, PCI-DSS) |
| [`docs/context/legal-compliance.md`](docs/context/legal-compliance.md) | Registro de leyes y normativas |
| [`docs/context/laborcontrol.md`](docs/context/laborcontrol.md) | LaborControl: arquitectura, API, cadena SHA-256, offline |
| [`docs/context/waiter-panel.md`](docs/context/waiter-panel.md) | Panel de sala: PIN auth, sesiones, mesas |
| [`docs/context/realtime-channels.md`](docs/context/realtime-channels.md) | Canales Realtime: patrones, StrictMode, WebSocket singleton |
| [`docs/context/stock-system.md`](docs/context/stock-system.md) | Stock & mermas: trigger, re-habilitación, inventario físico |
| [`docs/context/compras-system.md`](docs/context/compras-system.md) | Compras y proveedores SIALTI: tablas, RPC, compliance |
| [`docs/context/food-cost-analytics.md`](docs/context/food-cost-analytics.md) | Food cost: CMP, food cost teórico vs real, rentabilidad |
| [`docs/context/analytics-avanzado.md`](docs/context/analytics-avanzado.md) | Analítica avanzada: BCG, heatmap, cierre de turno, comparativa |
| [`docs/context/tpv-empleados-pin.md`](docs/context/tpv-empleados-pin.md) | Empleados TPV: dual-auth, permisos, arqueo ciego |
| [`docs/context/tpv-cobros-historial.md`](docs/context/tpv-cobros-historial.md) | Cobro parcial, historial multi-turno, rectificativos |
| [`docs/context/electron-tpv.md`](docs/context/electron-tpv.md) | Electron TPV: build, auto-update, impresora, trampas |
| [`docs/context/capacitor-android-pda.md`](docs/context/capacitor-android-pda.md) | Capacitor Android: build, cookies, auto-update |
| [`docs/context/delivery.md`](docs/context/delivery.md) | Delivery: zona, Glovo, Redsys, flujo end-to-end |
| [`docs/context/mesa-ordering.md`](docs/context/mesa-ordering.md) | QR table ordering: flujo, API, rate limiting |
| [`docs/context/mesa-payments.md`](docs/context/mesa-payments.md) | Pagos en mesa: Redsys, división, lock, race conditions |
| [`docs/context/rgpd-clientes.md`](docs/context/rgpd-clientes.md) | RGPD: ciclo de vida de datos de clientes |
| [`docs/context/alergenos-system.md`](docs/context/alergenos-system.md) | Alérgenos EU: 14 sustancias, iconos SVG, 5 idiomas |
| [`docs/context/sentry-monitoring.md`](docs/context/sentry-monitoring.md) | Sentry: integración, Session Replay, CSP |
| [`docs/context/pwa-offline-system.md`](docs/context/pwa-offline-system.md) | Service Worker PWA: estrategias, offline, camarero |
| [`docs/context/admin-api-patterns.md`](docs/context/admin-api-patterns.md) | Patrones API admin: resolveAdminContext, handleResult |
| [`docs/context/seo-multitenant.md`](docs/context/seo-multitenant.md) | SEO multi-tenant: metadata, hreflang, Schema.org, sitemap |
