# Carta Digital Multi-idioma

Plataforma **multi-tenant** de gestión de negocios de hostelería y retail. Cada empresa tiene su propio dominio, su propio panel de administración y opera de forma completamente aislada. Un único despliegue sirve a N negocios.

---

## ¿Qué puede hacer este sistema?

### 🛍️ Modo Tienda — autogestionable de extremo a extremo

- **Carta digital** con categorías, productos, imágenes y precios gestionables desde el panel de admin.
- **Pedidos online** con formulario de cliente, seguimiento en tiempo real y notificación instantánea al negocio vía Telegram.
- **Pasarela de pagos Redsys TPV Virtual** integrada: el cliente paga al hacer el pedido (envío a domicilio y recogida en local, configurable por separado).
- **Sistema de envío a domicilio con riders** mediante integración con Glovo Business LaaS: cotización de coste en tiempo real, auto-despacho del rider al confirmar el pago, tracking del estado del rider.
- **Selector de dirección** con autocompletado Mapbox y validación por código postal.
- **Descuento de bienvenida**: popup automático a los 30 segundos, código único por email, porcentaje y duración configurables, validación server-side completa.
- **Campañas TooGoodToGo**: crea paquetes sorpresa con precio reducido, envía emails masivos a suscriptores, gestiona cupones y reservas.
- **Envío de promociones** por email a la base de clientes con imagen y texto personalizado.

### 🍽️ Modo Restaurante — pedidos en mesa y takeaway

- **Pedidos desde la mesa** mediante QR: el cliente escanea el código QR de la mesa con la cámara del móvil, sin instalar nada, y hace su pedido directamente.
- **Validación de presencia física**: los pedidos en mesa requieren escaneo in-app del QR impreso (token de sesión de 20 min, rotación automática al cerrar la sesión).
- **Panel de sala para camareros** con login por PIN: grid de mesas con estado en tiempo real, apertura y cierre de sesión, búsqueda rápida de productos para tomar pedidos.
- **Pago en mesa** vía Redsys TPV: pago total o división de cuenta entre 2 y 20 personas. Lock atómico (PostgreSQL `FOR UPDATE`) para pago total; división permite pagos simultáneos independientes mediante RPC transaccional. Verificación de total antes de pagar (detecta productos añadidos en el último momento). Idempotencia de webhook garantizada con update atómico `WHERE status='pending'`. Actualización en tiempo real vía Supabase Realtime.
- **Registro manual de pagos** por el camarero (efectivo / pago externo) para desbloquear la sesión en escenarios de división.
- **Gestión de pedidos takeaway** desde un entorno de chat de Telegram: con un solo botón se indica el tiempo de recogida (10, 15, 20, 30 o 45 minutos). El cliente recibe la notificación automáticamente en su pantalla de seguimiento, sin necesidad de llamar por teléfono.
- **Notas por ítem:** clientes y camareros pueden añadir una nota libre a cada producto del carrito ("sin cebolla", "punto medio", etc.). La nota viaja por todo el pipeline hasta las pantallas de cocina y bar, donde aparece como pill ámbar debajo del nombre.
- **Gestión de pedidos en mesa (cocina y bar)** íntegramente en la app — tres pantallas especializadas:
  - `/kitchen` — pantalla standalone para tablet en cocina. Sin login. Muestra ítems de comida con avance de estado por swipe (pendiente → en preparación → listo). Colores por tiempo de espera (azul → teal → ámbar → rojo).
  - `/waiter/kitchen` — vista de cocina dentro del panel de camarero (PIN requerido). Añade filtros por Listos y Retenidos, retención de ítems por mesa, y release masivo. Timer arranca desde la validación, no desde el pedido original.
  - `/waiter/pendientes` — cola de validación: pedidos en `pendiente_validacion` que el camarero revisa antes de mandar a cocina/bar. Selección individual o por tipo (comida/bebida), pausa por ítem (→ kitchen retenido), envío conjunto comida+bebida en un solo tap.
  - `/waiter/bar` — vista de bebidas para el camarero. Swipe directo a servido con countdown de 5 s. Botón "Todos servidos" por mesa.
  - Los camareros deslizan cada ítem para avanzar su estado con gestos de puntero.

### 🖥️ TPV — Terminal Punto de Venta (Fases 1 y 2)

Software de caja para restaurantes y tiendas integrado en la misma plataforma. Cumplimiento legal completo con la Ley Antifraude (RD 1007/2023) y RD 1619/2012. Dashboard de analítica con selector de período y configuración de tipo de impuesto (IVA/IGIC) por empresa. Historial multi-turno, cobro parcial y rectificativos con trazabilidad cross-turno.

#### Gestión de turno y cobro

- **Gestión de turnos de caja**: apertura con efectivo inicial, cierre con arqueo ciego real — el teórico queda oculto con `—` hasta que el operador introduce su conteo; solo entonces se revela la diferencia. Flujo completamente ciego para garantizar objetividad.
- **Mostrador táctil en 3 columnas**: grid de mesas/categorías a la izquierda, menú de productos en el centro, ticket activo a la derecha. Navegación por teclado + touch optimizada.
- **Selección de complementos**: modal de selección cuando un producto tiene opciones obligatorias u opcionales (radio-select por complemento, validación pre-añadido).
- **Flujo de cobro completo**: efectivo (calcula cambio automáticamente), tarjeta, propina opcional. Pantalla de confirmación con número de ticket, desglose de IVA/IGIC y enlace de verificación AEAT (formato DD-MM-AAAA requerido por la AEAT). La tasa se toma del campo `porcentaje_impuesto` de la empresa (no hardcodeada).
- **Cobro parcial**: el operador puede editar el "Importe a cobrar" para pagar una fracción del total. La sesión de mesa permanece abierta hasta cobrar el total. El mostrador muestra en tiempo real el importe ya cobrado y el pendiente restante. Cada cobro parcial genera un ticket fiscal independiente.
- **Detección de cobro externo**: si un camarero o cliente paga la mesa desde otro canal mientras está abierta en el TPV, el mostrador detecta el cierre de sesión vía Realtime (Supabase postgres_changes) y limpia el ticket automáticamente con un aviso al operador.
- **Bloqueo preventivo de cobro**: el botón "Cobrar" se bloquea mientras algún pedido de la mesa tiene ítems sin servir (estado pendiente, en cocina o listo), igual que en el sistema de camarero.
- **Selector de pase/marcha**: antes de enviar un pedido a cocina, el operador puede asignarle un pase (`1er pase`, `2º pase`, `Postre`, `Bebida`). El campo se guarda en `pedidos.pase` y se muestra como badge en el ticket activo. El KDS de cocina agrupa los ítems por sección de pase cuando hay pedidos con distintos pases activos.
- **Historial multi-turno**: selector de turno en `/tpv/historial` que permite consultar cualquier turno pasado. Los pedidos se filtran entre `apertura_at` y `cierre_at` del turno seleccionado. Los cobros se filtran por `turno_id`. Navegación SSR mediante query param `?turnoId=`; muestra hasta los últimos 20 turnos.
- **Rectificativos con trazabilidad cross-turno**: el historial resuelve server-side si un cobro fue rectificado en otro turno (`yaRectificado: boolean`). El rectificativo muestra "Rectificativo · anula SERIE-NNNNNN (otro turno)" cuando el original pertenece a un turno distinto. Tras confirmar la rectificación, `router.refresh()` recarga los datos SSR y actualiza los totales.

#### Cumplimiento legal (Ley Antifraude + RD 1007/2023 + RD 1619/2012)

- **Cadena de hashes SHA-256**: cada cobro encadena el hash del anterior vía trigger PostgreSQL + pgcrypto. Inmutable: triggers bloquean DELETE y UPDATE de campos económicos con EXCEPTION.
- **Ticket rectificativo**: anula un cobro previo emitiendo un cobro de signo negativo con referencia al original — sin modificar registros inmutables (RD 1619/2012). Queda excluido automáticamente de las estadísticas de analítica (`rectifica_cobro_id IS NULL`).
- **Numeración correlativa**: `serie-NNNNNN` sin saltos por empresa, atómica a nivel de base de datos.
- **IVA/IGIC calculado en DB**: `iva_cents` y `base_imponible_cents` computados en el trigger de inserción — nunca en el cliente. El porcentaje queda grabado por cobro para que cambiar la config de la empresa no afecte al histórico.
- **Desglose de ítems en ticket** (`detalle_items JSONB` en `tpv_cobros`): cada cobro almacena nombre, cantidad y precio unitario de cada producto. Para cobros de mesa el servidor lo construye automáticamente desde `pedidos.detalle_pedido`; para mostrador lo envía el cliente desde el carrito. Inmutable una vez grabado (trigger extendido). El ticket rectificativo hereda los ítems del original. RD 1619/2012.
- **Informe Z de cierre de turno**: al cerrar un turno se asigna automáticamente un `numero_z` secuencial por empresa (trigger BEFORE UPDATE con `pg_advisory_xact_lock` — sin race conditions ni saltos). Se abre un modal `InformeZModal` con el informe completo (totales, IVA, arqueo de caja, huella digital) y auto-print vía `window.print()`. Electron intercepta la llamada y la envía a la impresora configurada. El operador confirma antes de que la app redirija a la pantalla de apertura.
- **Auditoría para inspectores**: `GET /api/tpv/audit/chain` verifica la cadena de hashes recomputando SHA-256 en Node.js; `GET /api/tpv/audit/export` descarga todos los cobros del período como JSON con cabecera `Content-Disposition: attachment`.
- **Pantalla de conformidad legal** `/tpv/legal`: Declaración de Responsabilidad del fabricante (RD 1007/2023), versión del software, fecha de firma, serie del sistema, checklist de cumplimiento, y acceso a verificación de cadena y exportación.
- **NIF/CIF de la empresa**: campo configurable desde el panel admin, incluido en el ticket de cobro y en el enlace de verificación AEAT.

#### Analítica (Fase 2)

- **Dashboard `/tpv/analytics`**: selector de período (Hoy / Semana / Mes / Custom con fechas libres), 5 KPIs (facturado total, ticket medio, IVA/IGIC total + base imponible, propinas, número de turnos con duración media), gráfico de barras de ventas por hora en zona horaria Europe/Madrid (Recharts, lazy-loaded con `dynamic()`), split efectivo/tarjeta con barras de progreso, top 10 productos más vendidos (via `pedidos.detalle_pedido` JSONB), historial de turnos del período con operador, horario y totales.
- **Endpoint único** `GET /api/tpv/analytics?desde=&hasta=`: validación Zod con rango máximo de 365 días. Ejecuta 3 RPCs PostgreSQL con `SECURITY DEFINER` (`tpv_analytics_kpis`, `tpv_analytics_por_hora`, `tpv_analytics_top_productos`) más query directa de turnos. `empresa_id` siempre derivado del JWT, nunca del query string.
- **Configuración IVA/IGIC por empresa**: campos `tipo_impuesto` (`'iva'|'igic'`) y `porcentaje_impuesto` en tabla `empresas`. Configurable desde el panel admin con auto-relleno (IVA → 10%, IGIC → 7%). El label se propaga como prop SSR a todos los componentes TPV — sin hardcodear la etiqueta.

#### Stock & Mermas (Fase 2)

- **Gestión de ingredientes** (`/admin/stock/ingredientes`): CRUD con badge visual de stock (rojo = bajo mínimo, verde = OK). Unidades: kg, l, ud. Umbral de alerta configurable por ingrediente.
- **Editor de escandallo** (`/admin/stock/recetas`): vincula ingredientes a productos con cantidad necesaria por servicio. Un producto sin receta no descuenta stock pero genera un aviso `sin_receta` en el audit log.
- **Descuento automático al servir**: trigger PostgreSQL `deducir_stock_on_servido` se ejecuta en el mismo transaction que el cambio de estado. Decremento atómico (`cantidad_actual = cantidad_actual - X`). Si el ingrediente cae por debajo del umbral, el producto se desactiva automáticamente del menú (`activo = false`).
- **Re-habilitación automática**: cuando admin registra una entrada de stock que supera el umbral, los productos vinculados se reactivan sin intervención manual.
- **Registro de mermas** (`/tpv/mermas`): operador elige ingrediente, cantidad y motivo (caducidad / rotura / error de preparación / otro). Requiere turno activo. Genera fila en `mermas` + `movimientos_stock` (tipo=`merma`) de forma atómica.
- **Audit log inmutable** (`/admin/stock/movimientos`): historial paginado de todos los movimientos (entrada, deducción, ajuste, merma, sin_receta, **inventario**). Filtrable por ingrediente, tipo y rango de fechas. `movimientos_stock` es append-only — ni `authenticated` ni `anon` pueden modificar o borrar filas.
- **Inventario físico a ciegas** (`/admin/stock/inventario`): flujo de 3 pasos para el conteo periódico del almacén. (1) El operador introduce la cantidad real de cada ingrediente sin ver el teórico. (2) El sistema calcula y muestra las desviaciones (verde = sobrante, rojo = faltante). (3) Al confirmar, se insertan movimientos de tipo `inventario` y se actualiza `cantidad_actual`. El tipo `inventario` se añadió como nuevo valor al enum `tipo_movimiento`.
- **Alerta de stock bajo en cobro**: badge `LowStockBadge` (ámbar, clicable) en el header del TPV y en la pantalla de cobro. Refresco cada 3 minutos. Informativo, nunca bloquea el pago.

#### Empleados TPV — autenticación por PIN

Sistema de cajeros y encargados que acceden al TPV con PIN numérico, sin necesidad de email/password ni cuenta en `auth.users`. Los empleados se gestionan desde `/admin/configuracion` → tab "Empleados".

- **Login por PIN**: pantalla `/tpv/login` con entrada numérica (4-8 dígitos). El PIN se hashea con PBKDF2 SHA-256 scoped por empresa.
- **Cookie `tpv_employee_token`**: JWT HS256, audience `'tpv-employee'`, 1h. Sliding window lazy: solo se renueva (con consulta a DB) cuando quedan <15 min de vida.
- **Dual-auth en proxy**: para rutas `/tpv/*`, el proxy intenta `admin_token` primero; si falla, prueba `tpv_employee_token`. Si ninguno es válido → redirect `/tpv/login`.
- **Botón "Bloquear TPV"**: visible solo en sesiones de empleado. Llama `POST /api/tpv/empleados/logout`, limpia la cookie y redirige a `/tpv/login` sin afectar el turno activo. Permite handoff entre empleados en el mismo dispositivo.
- **Permisos por rol**:
  - `encargado`: TPV completo. Puede abrir turno, ver mermas, cierre con arqueo completo. No accede al panel admin.
  - `cajero`: mostrador + cobro únicamente. Mermas ocultas. Cierre de caja en modo **arqueo ciego** (no ve el total teórico; el servidor calcula la diferencia internamente).
- **Precarga de nombre**: al abrir turno, `operadorNombre` se pre-rellena desde el token del empleado (campo readonly).
- **`operador_id` en `tpv_turnos`**: FK nullable a `empleados_tpv`. Turnos de admin tienen `operador_id = NULL`.

Tabla DB: `empleados_tpv` con índice parcial único `ON (empresa_id, pin_hash) WHERE activo = true`.
CRUD admin: `GET|POST /api/admin/empleados-tpv`, `PATCH|DELETE /api/admin/empleados-tpv/[id]`.

#### Rendimiento y resiliencia offline

- **Navegación instantánea entre pestañas**: catálogo, categorías, configuración fiscal, turno activo y grilla de mesas se cargan una única vez al arrancar la sesión. Navegar entre Mostrador, Mesas, Historial y Analytics no genera ninguna consulta adicional a la base de datos — el contexto React persiste entre navegaciones client-side.
- **Invalidación reactiva del catálogo**: si un administrador edita precios o desactiva productos desde `/admin/productos` mientras el servicio está en marcha, el TPV recibe la actualización vía Supabase Realtime en ≤400 ms (debounce para ediciones en lote).
- **Resilencia offline (IndexedDB)**: el catálogo se replica en `IndexedDB` local al arrancar. Si Supabase no está disponible en un reload, el TPV carga los datos del snapshot local en lugar de mostrar una pantalla de error.
- **Service Worker para `/tpv/*`**: caché NetworkFirst para páginas TPV con fallback a shell offline. Los chunks estáticos (JS/CSS) se sirven CacheFirst tras la primera carga.

#### Rutas TPV

`/tpv/login`, `/tpv/turno/abrir`, `/tpv/turno/cerrar`, `/tpv/mostrador`, `/tpv/cobro/[sesionId]`, `/tpv/historial`, `/tpv/mesas`, `/tpv/legal`, `/tpv/analytics`, `/tpv/mermas`.
Admin stock: `/admin/stock/ingredientes`, `/admin/stock/recetas`, `/admin/stock/movimientos`, `/admin/stock/inventario`.
Admin empleados: `/admin/configuracion` → tab "Empleados".

### 🤖 Notificaciones Telegram — dos modos de operación

- **Tienda**: botones de acción rápida (Aceptar, Rechazar) directamente en el mensaje.
- **Restaurante takeaway**: selector de tiempo de preparación con botones; el admin confirma el tiempo y el cliente lo ve al instante.

### 🌐 Multi-idioma y multi-tenant

- **5 idiomas**: español, inglés, francés, italiano y alemán en todos los textos de cara al cliente.
- **Cada empresa** tiene su propio dominio (o subdominio `pedidos.`), colores, logo, carta, clientes y configuración completamente aislados.
- **Panel SuperAdmin** con vista global de todas las empresas, estadísticas, ranking y toggles de funcionalidades por empresa.

### 🔒 Seguridad de producción

JWT + HttpOnly cookies, revocación en Redis (fail-closed), RBAC por rol, CSRF HMAC-SHA256, CSP con nonce criptográfico por request, rate limiting por IP y por UUID, validación de precio server-side (anti-tampering), aislamiento por tenant con RLS en Supabase.

---

## ⚡ Arquitectura Realtime — Sistema Híbrido

Todas las vistas de tiempo real del sistema han sido migradas de polling HTTP a **Supabase Realtime** con un enfoque híbrido deliberado.

### El problema del polling

Antes de la migración, el panel de sala tenía múltiples bucles de polling HTTP corriendo en paralelo:

| Componente | Intervalo anterior | Approach actual |
|------------|-------------------|-----------------|
| `WaiterBanner` (badges counts) | 2 × 10 s | Único canal Realtime multiplexado |
| `WaiterLoginForm` (detección de apertura de mesa) | 2 s | Realtime trigger en `mesa_sesiones` |
| `kitchen/page.tsx` (ítems de cocina) | 3 s | Realtime en `pedido_item_estados` |
| `bar/page.tsx` (ítems de bar) | 3 s | Realtime en `pedido_item_estados` |
| `pendientes/page.tsx` (cola de validación) | 3 s | Realtime en `pedidos` + `pedido_item_estados` |
| `client-menu-page.tsx` / `mesa-order-history.tsx` | (redundante) | Eliminado |

### Qué significa "híbrido"

El sistema distingue dos tipos de actualización con necesidades distintas:

**1. Cambios de datos** → Supabase Realtime (PostgreSQL CDC)
Cuando se inserta o modifica un registro en `pedidos` o `pedido_item_estados`, Supabase notifica al cliente al instante vía WebSocket. El cliente re-fetchea solo el endpoint afectado. Latencia: < 100 ms. Sin polling.

**2. Progresión visual de timers** → `setInterval` de 1 segundo
Los colores de urgencia (azul → teal → ámbar → rojo) y los contadores de tiempo de espera en cocina y bar necesitan actualizar la UI cada segundo aunque no haya cambios en DB. Este intervalo es puramente cosmético — no hace ninguna llamada de red.

```
              ┌──────────────────────────────────────┐
              │          Supabase Realtime           │
              │  pedidos INSERT/UPDATE               │
              │  pedido_item_estados INSERT/UPDATE   │
              └──────────────┬───────────────────────┘
                             │ CDC via WebSocket
                             ▼
              ┌──────────────────────────────────────┐
              │      Cliente React (kitchen/bar)     │
              │                                      │
              │  onPostgresChanges → fetchItems()    │  ← datos al instante
              │  setInterval 1s   → setItems(p→p)   │  ← re-render visual (timers)
              └──────────────────────────────────────┘
```

### Canal multiplexado en WaiterBanner

`WaiterBanner` necesita sincronizar tres señales: conteos de cocina, conteos de bar y estado de pago en curso. La solución anterior usaba dos endpoints en polling a 10 s. La solución actual abre **un único canal Realtime** que escucha cambios en `pedido_item_estados` y en `mesa_sesiones`, y dispara un `fetchCounts()` consolidado:

```typescript
const channel = supabase
  .channel('waiter-banner')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_item_estados' }, fetchCounts)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'mesa_sesiones' }, fetchCounts)
  .subscribe();
```

### Impacto en costes de Supabase

| Métrica | Antes | Después |
|---------|-------|---------|
| Requests HTTP / minuto (1 camarero activo) | ~30 | ~0 (solo al cambio) |
| Conexiones WebSocket | 0 | 1 por tab |
| Latencia percibida al cambio | hasta 3–10 s | < 100 ms |
| Carga en DB durante inactividad | constante | cero |

> Las conexiones Realtime de Supabase son significativamente más baratas en créditos de compute que el polling HTTP equivalente — y la latencia mejora drásticamente.

### Activación en Supabase (migración `20260626000001`)

```sql
-- Habilita CDC para las tablas críticas de tiempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedido_item_estados;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;
```

Estas tablas deben estar publicadas en Supabase antes de que los canales Realtime funcionen. La migración las activa automáticamente.

---

## PWA & Resiliencia — Panel Camarero

El panel `/waiter` incluye un Service Worker vanilla (sin Workbox/Serwist) cuyo objetivo es **rendimiento y resiliencia ante micro-cortes de red**, no funcionamiento offline real.

> **Importante:** el camarero no puede operar sin conexión. Todos los datos (pedidos, mesas, estados) vienen de `/api/*`, que es siempre NetworkOnly. Lo que el SW previene es que un corte breve de Wi-Fi expulse al camarero al PIN o rompa la UI con una pantalla de error del browser.

### Service Worker (activo, scope `/waiter`)

| Estrategia | Ruta | Qué resuelve |
|------------|------|--------|
| CacheFirst | `/_next/static/*` | Chunks con hash — carga instantánea en visitas repetidas |
| NetworkFirst + fallback | `/waiter/*`, `bell.mp3` | Corte breve → shell cacheado visible + overlay "sin conexión" |
| NetworkOnly | `/api/*` | Auth y datos de pedidos siempre frescos — nunca cachear |

- GET-only guard: mutaciones (POST/PATCH/DELETE) siempre van a red.
- `skipWaiting()` + `clients.claim()`: el nuevo SW toma control sin recargar.
- Página offline estática en `/waiter/offline` pre-cacheada en el install event.
- `navigator.onLine` guard en `WaiterBanner`: evita redirigir al PIN cuando la red cae brevemente.
- **Solo se registra en producción.** En dev (`pnpm dev`) no hay SW para no interferir con HMR.

### Capacitor Android (activo — en producción)

El panel `/waiter` se distribuye como **APK nativo para Android** en PDAs de camarero. Capacitor envuelve la webapp en un WebView nativo sin reescribir el código.

- APK firmado, distribuido vía Supabase Storage (sin Play Store)
- Auto-update: al abrir la app compara `versionCode` con `/api/app/version` y redirige a la descarga si hay nueva versión
- `SameSite=lax` obligatorio en la cookie `waiter_token` para que el WebView la reciba
- `CookieManager.flush()` en `onPause()` para persistir la sesión si el proceso es killed

Ver `docs/context/capacitor-android-pda.md` para el proceso de build y release.

---

## Stack Tecnológico

| Tecnología | Versión | Uso |
|------------|---------|-----|
| Next.js | 16.0.10 (Turbopack) | Framework full-stack |
| React | 19.2.0 | UI Library |
| TypeScript | 5.x | Tipado estático |
| Supabase | ^2.95.3 | BBDD + Auth + Realtime CDC |
| Cloudflare R2 | — | Storage imágenes |
| Tailwind CSS | 4.x | Estilos |
| AWS SDK v3 | ^3.994 | Cliente S3/R2 |
| Zod | 3.25.x | Validación schemas |
| jose | ^6.1.3 | JWT (sign + verify) |
| Upstash Redis | — | Rate limiting + JWT revocation |
| Brevo | — | Envío de emails |
| Mapbox Search JS React | — | Autocompletar dirección de entrega |
| Redsys TPV Virtual | — | Pago online (HMAC_SHA256_V1) |
| Glovo Business LaaS | — | Despacho de riders (DH On Demand Rider API) |
| @zxing/browser | — | Decodificación QR in-app (iOS Safari + Android Chrome) |
| Service Worker (vanilla) | — | Caching offline para `/waiter` — sin Workbox/Serwist |

---

## Arquitectura — Clean Architecture

```
┌─────────────────────────────────────────────────────────┐
│            API Routes / Pages (Presentación)            │
│  - Validación Zod (safeParse)                           │
│  - requireAuth, successResponse, errorResponse          │
│  - Pages admin usan authAdminUseCase.verifyToken()      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│               Use Cases (Aplicación)                    │
│  - ProductUseCase, CategoryUseCase, ClienteUseCase      │
│  - EmpresaUseCase, PedidoUseCase, PromocionUseCase      │
│  - AuthAdminUseCase, TgtgUseCase                        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              Repositories (Infraestructura)              │
│  - IProductRepository, ICategoryRepository              │
│  - IClienteRepository, IEmpresaRepository               │
│  - IPedidoRepository, IPromocionRepository              │
│  - IAdminRepository                                     │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│               Supabase / R2 (Implementación)            │
│  - getSupabaseClient()     → service role               │
│  - getSupabaseAnonClient() → anon key                   │
│  - getS3Client()           → Cloudflare R2              │
└─────────────────────────────────────────────────────────┘
```

### Estructura de directorios

```
src/
├── app/
│   ├── layout.tsx                   # Root layout (multi-tenant, nonce CSP)
│   ├── page.tsx                     # Menú público (SSR)
│   ├── pedido/
│   │   ├── pago-ok/                 # Confirmación pago Redsys → redirect /tracking/{token}
│   │   └── pago-ko/                 # Error de pago Redsys
│   ├── mesa/[mesaId]/orders/        # Ticket de mesa (cliente)
│   ├── waiter/                      # Panel de sala
│   │   ├── page.tsx                 # Login PIN + grid de mesas
│   │   ├── pendientes/page.tsx      # Cola de validación (pendiente_validacion)
│   │   ├── kitchen/page.tsx         # Vista de cocina en tiempo real (comida)
│   │   └── bar/page.tsx             # Vista de bar en tiempo real (bebidas)
│   ├── admin/
│   │   ├── login/                   # Login admin
│   │   └── (protected)/             # Rutas protegidas (SSR)
│   │       ├── layout.tsx           # Verifica sesión con authAdminUseCase
│   │       ├── page.tsx             # Dashboard
│   │       ├── productos/
│   │       ├── categorias/
│   │       ├── pedidos/
│   │       ├── clientes/
│   │       ├── promociones/
│   │       ├── toogoodtogo/             # Campañas TGTG (crear, enviar, gestionar)
│   │       ├── delivery/            # Zona de entrega + credenciales Glovo + Redsys
│   │       ├── estadisticas/
│   │       └── configuracion/
│   ├── tpv/                         # Terminal Punto de Venta
│   │   ├── turno/abrir/page.tsx     # Apertura de turno con efectivo inicial
│   │   ├── mostrador/page.tsx       # Mostrador táctil (3 columnas)
│   │   ├── cobro/[sesionId]/page.tsx# Flujo de cobro (efectivo/tarjeta/propina)
│   │   ├── historial/page.tsx       # Historial pedidos + cobros del turno
│   │   ├── mesas/page.tsx           # Grid de mesas con estado de sesión
│   │   └── legal/page.tsx           # Conformidad legal + Declaración RD 1007/2023
│   ├── superadmin/                  # Panel Super Admin
│   │   ├── layout.tsx               # Verifica rol superadmin
│   │   ├── page.tsx                 # Dashboard global
│   │   └── empresas/[id]/page.tsx   # Editar empresa
│   └── api/
│       ├── admin/                   # Protegidas por proxy.ts JWT
│       │   ├── login/               # POST — autenticación
│       │   ├── logout/              # POST — cerrar sesión
│       │   ├── productos/           # CRUD productos
│       │   ├── categorias/          # CRUD categorías
│       │   ├── pedidos/             # GET/PATCH/DELETE + PUT (stats)
│       │   │   └── enviar-email/    # POST — email confirmación al admin
│       │   ├── upload-image/        # POST — upload imágenes a R2
│       │   ├── clientes/            # CRUD clientes
│       │   ├── empresa/             # GET/PUT datos empresa
│       │   ├── update-colores/      # POST colores del tema
│       │   ├── tgtg/                # GET all, POST crear campaña
│       │   │   ├── [id]/            # DELETE campaña (guarda vs emailEnviado/reservas)
│       │   │   └── enviar/          # POST — enviar emails campaña activa
│       │   └── promociones/
│       │       └── unsubscribe/     # POST — pública, toggle suscripción
│       ├── superadmin/              # Protegidas, rol superadmin
│       │   └── empresas/
│       │       ├── route.ts         # GET — todas las empresas
│       │       └── [id]/route.ts   # GET/PUT — empresa específica
│       ├── mesas/                   # Pública — mesa ordering (QR)
│       │   ├── route.ts             # GET ?token={uuid} — info de mesa
│       │   └── [mesaId]/
│       │       ├── orders/          # GET — pedidos + estado de pago (sesionPagada, pagoEnCurso)
│       │       ├── token/           # POST — emite mesa_client_token (QR session enforcement)
│       │       ├── lock/            # POST (adquirir) + DELETE (liberar) — lock de pago
│       │       └── division/        # POST (activar) + DELETE (cancelar) — división de cuenta
│       ├── waiter/                  # Panel de sala (PIN auth)
│       │   ├── auth/                # POST — login con PIN
│       │   ├── logout/              # POST — cerrar sesión waiter
│       │   ├── me/                  # GET — verificar sesión
│       │   ├── mesa/                # GET — mesa asignada actualmente
│       │   ├── mesas/               # GET — todas las mesas con estado
│       │   │   └── [mesaId]/
│       │   │       ├── open/        # POST — abrir sesión de mesa
│       │   │       ├── close/       # POST — cerrar sesión de mesa
│       │   │       ├── orders/      # GET — pedidos de una mesa
│       │   │       │   └── items/[itemId]/ # DELETE — eliminar ítem de pedido
│       │   │       ├── deferred/    # GET/PUT — ítems diferidos de la sesión
│       │   │       └── manual-payment/ # POST — pago manual (efectivo/externo)
│       │   ├── orders/
│       │   │   ├── counts/          # GET — contadores cocina + bar (WaiterBanner badges)
│       │   │   ├── kitchen/         # GET — ítems de cocina en curso (comida)
│       │   │   ├── bar/             # GET — ítems de bar en curso (bebidas)
│       │   │   └── items/[itemId]/state/ # PUT — avanzar estado de ítem (swipe)
│       │   └── productos/           # GET — productos para tomar pedidos
│       ├── telegram/
│       │   └── webhook/             # POST — callbacks de Telegram (todos los modos)
│       ├── pedidos/                 # POST — pública, crear pedido (tienda + mesa + delivery)
│       ├── redsys/
│       │   ├── initiate/            # POST — pública, genera form TPV Redsys (delivery)
│       │   ├── initiate-mesa/       # POST — pública, genera form TPV Redsys (mesa)
│       │   ├── confirm-mesa/        # GET — urlOk de Redsys (fallback confirmación mesa)
│       │   ├── cancel-mesa/         # GET — urlKo de Redsys (libera lock + redirect)
│       │   └── webhook/             # POST — notificación servidor Redsys (pago confirmado → despacha Glovo / actualiza mesa)
│       ├── glovo/
│       │   ├── quote/               # POST — pública, cotización de envío en tiempo real
│       │   ├── order/               # POST — admin, despacho manual de rider
│       │   └── webhook/             # POST — callbacks de estado del rider Glovo
│       ├── tpv/                     # TPV (admin auth)
│       │   ├── turno/               # POST (abrir) + GET (activo)
│       │   ├── cobro/               # POST — registrar cobro completo (hash chain)
│       │   │   └── rectificar/      # POST — ticket rectificativo (cobro negativo)
│       │   ├── pedidos/             # POST — crear pedido desde mostrador
│       │   └── audit/
│       │       ├── chain/           # GET — verificar cadena SHA-256 (Ley Antifraude)
│       │       └── export/          # GET — exportar cobros como JSON (inspectores)
│       └── unsubscribe/             # GET — pública, dar de baja/alta promo
│
├── core/                            # Clean Architecture
│   ├── domain/
│   │   ├── entities/types.ts        # Tipos de dominio
│   │   ├── repositories/            # Interfaces I*Repository
│   │   └── constants/
│   │       ├── api-errors.ts        # Códigos de error centralizados
│   │       ├── pedido.ts            # Estados y labels de pedido
│   │       └── empresa-defaults.ts  # Colores y configuración por defecto
│   ├── application/
│   │   ├── dtos/                    # Schemas Zod por entidad
│   │   └── use-cases/               # Un use case por entidad
│   └── infrastructure/
│       ├── api/
│       │   ├── helpers.ts           # requireAuth, handleResult (error code → HTTP status), responses
│       │   ├── rate-limit.ts        # rateLimitLogin, rateLimitPublic, rateLimitAdmin, rateLimitMesaPolling (UUID-keyed)
│       │   └── api-logger.ts        # logApiError
│       ├── database/
│       │   ├── supabase-client.ts   # Singletons Supabase
│       │   └── index.ts             # Inyección de dependencias
│       ├── logging/logger.ts        # ErrorLogger singleton
│       ├── storage/s3-client.ts     # Singleton R2
│       └── env-validation.ts        # Validación de env vars al startup
│
├── instrumentation.ts               # Next.js startup hook → validateEnv()
├── proxy.ts                         # Middleware JWT + CSRF + CSP nonce + CORS
│
└── lib/
    ├── csrf.ts                      # HMAC-SHA256 tokens CSRF (timingSafeEqual)
    ├── domain-utils.ts              # parseMainDomain(), getDomainFromHeaders()
    ├── html-utils.ts                # escapeHtml()
    ├── token-revocation.ts          # JWT revocation list (Upstash Redis REST)
    ├── unsubscribe-token.ts         # HMAC tokens para unsubscribe (TTL 1 año, GDPR)
    ├── brevo-email.ts               # sendEmail()
    ├── server-services.ts           # getEmpresaByDomain(), getMenuUseCase
    ├── admin-context.tsx            # AdminContext (empresaId, empresaNombre)
    ├── cart-context.tsx             # CartContext
    └── translations.ts              # Traducciones i18n (es/en/fr/it/de)
```

---

## Monitorización y Observabilidad — Sentry

Documentación completa en [`docs/context/sentry-monitoring.md`](docs/context/sentry-monitoring.md).

El sistema usa **dos capas de observabilidad complementarias**:

| Capa | Qué captura | Dónde |
|---|---|---|
| Supabase `log_errors` | Errores de negocio con contexto de tenant (`empresa_id`, `modulo`) | DB propia |
| Sentry | Crashes técnicos, client-side errors, stack traces desminificados, performance, session replay | Sentry.io |

### Qué cubre Sentry

- **Errores client-side en producción** — antes eran silenciosos (solo `console.error` en dev)
- **React error boundaries** — `error.tsx`, `global-error.tsx`, `tpv/error.tsx`
- **Stack traces legibles** — source maps subidos en cada build, las líneas apuntan al TypeScript original
- **Contexto multi-tenant** — todos los eventos llevan el tag `empresa_id` del tenant
- **Session Replay on error** — graba la sesión justo antes del crash con `maskAllText` y `blockAllMedia` (obligatorio — el sistema maneja datos de clientes)
- **Performance monitoring** — Web Vitals, transacciones

### Trampas críticas

- `instrumentation.ts` / `register()` corre **una sola vez al arrancar** — NO por request. El tag `empresa_id` se inyecta en `layout.tsx` (server) y `SentryProvider` (client).
- **No agregar `Sentry.captureException()` en `error.tsx`** — `withSentryConfig` los instrumenta automáticamente. Hacerlo duplica eventos.
- `https://*.sentry.io` está en `connect-src` en **dos sitios**: `next.config.mjs` y `src/proxy.ts`. Si añadís un dominio a la CSP, revisá ambos.

---

## Seguridad

Documentación completa en [`docs/context/security.md`](docs/context/security.md).

| Área | Implementación |
|------|----------------|
| **Autenticación** | JWT HS256 en cookie HttpOnly + SameSite strict, jti claim, 24h expiry, runtime guard en secret |
| **JWT Revocation** | Verificada en proxy (API) y `verifyToken` (pages SSR). Fail-closed en producción |
| **Autorización** | `proxy.ts` verifica JWT e inyecta `x-empresa-id` por tenant. `resolveAdminContext()` unifica rate-limit + JWT + RBAC + tenant en 1 llamada (33 rutas admin) |
| **CSRF** | Token HMAC-SHA256 verificado con `timingSafeEqual`, Cache-Control no-store |
| **CSP** | Nonce criptográfico por request en `proxy.ts`, sin `unsafe-inline` en scripts. `frame-src` incluye `vercel.live` solo en preview (VERCEL_ENV ≠ production) |
| **Rate limiting** | Upstash Redis — 5/15min login (fail-closed en prod), 20/min público, 60/min admin |
| **Env validation** | `instrumentation.ts` → `validateEnv()` al startup, falla fatal en producción |
| **Validación** | Zod `safeParse` + try/catch en `request.json()` + max-length en todos los DTOs |
| **Uploads** | Validación MIME + magic bytes + tamaño + path seguro (slug desde DB) |
| **Multi-tenant** | Aislamiento por `empresaId` en cada query, RLS + service_role. Endpoints de mesa pública verifican `empresa_id` en DB antes de mutaciones |
| **Webhooks** | Glovo: HMAC-SHA256 timing-safe + fail-closed. Telegram: comparación de secret + fail-closed (503 si no configurado) |
| **Mínimo privilegio** | Endpoints públicos usan `empresaPublicRepository` (anon key) para lecturas |
| **XSS emails** | `escapeHtml()` en todos los templates HTML, logging centralizado sin PII |
| **Price tampering** | Total recalculado server-side + rechazo de productos desconocidos (`PRODUCT_NOT_FOUND`) |
| **Anti-enumeración** | Login devuelve mensaje genérico para todos los tipos de fallo auth |
| **RBAC** | `RolAdmin` union type + CHECK constraint en DB. `requireRole(request, roles[])` en todos los handlers de `/api/admin/*` y `/api/tpv/*`. Cuatro roles: `superadmin`, `admin`, `encargado`, `cajero`. Guards en layouts y páginas (redirect SSR). |
| **Secrets fail-closed** | Waiter PIN pepper: lanza si `WAITER_PIN_PEPPER` falta (sin fallback hardcodeado). Telegram: 503 si `TELEGRAM_WEBHOOK_SECRET` falta |
| **Logs de pago** | `console.log` con datos de pago eliminados de Redsys use cases y cart-drawer |
| **Backup restore** | `receta_items` validados por FK antes del upsert — solo se restauran filas cuyo `producto_id` e `ingrediente_id` pertenecen al tenant |
| **Unsubscribe** | HMAC-SHA256 con `UNSUBSCRIBE_HMAC_SECRET` dedicado, TTL 1 año (GDPR/CAN-SPAM), acción explícita `'baja'` |
| **CORS** | Whitelist de dominios, `Vary: Origin`, preflight 204, headers en rutas públicas |
| **Cart tokens** | Validación con audience claim `'cart-access'` para prevenir token confusion |
| **JSON-LD** | Sanitización de `<`, `>`, `&` para prevenir inyección en script tags |
| **Headers** | HSTS, X-Frame-Options, X-Content-Type-Options, Permissions-Policy |
| **URL schemes** | DTOs validan `https://` en fb, instagram, logo_url, url_mapa, foto_url, imagen_url |
| **Error mapping** | `handleResult()` mapea error codes a HTTP status (400, 401, 404, 500) |
| **Pedido atómico** | `get_next_pedido_number()` con mutex por tenant |

---

## Principios Aplicados

### Clean Architecture

| Capa | Contenido |
|------|-----------|
| **Domain** | `entities/types.ts`, `repositories/I*.ts`, `constants/` |
| **Application** | `dtos/*.ts`, `use-cases/*.ts` |
| **Infrastructure** | `database/*.ts`, `storage/*.ts`, `api/helpers.ts` |

Reglas estrictas:
- **NUNCA** acceder a DB directamente desde routes o pages
- **SIEMPRE** pasar por: Use Case → Repository → Supabase
- **NUNCA** llamar `createClient()` fuera de `supabase-client.ts`

### SOLID

- **Dependency Inversion**: repositorios inyectados por constructor, instanciados en `index.ts`
- Sin `any` — se usan tipos de dominio o `Record<string, unknown>`

```typescript
// ✅ BIEN — depende de abstracción
export class ProductUseCase {
  constructor(private readonly productRepo: IProductRepository) {}
}
```

---

## Helpers de API

```typescript
// Auth unificada para /api/admin/* — reemplaza requireAuth + requireRole + tenant + rate-limit
const ctx = await resolveAdminContext(request);
if (ctx.error) return ctx.error;
const { empresaId } = ctx; // string | null (null para superadmin sin ?empresaId)

// Respuestas consistentes
return successResponse(data);             // 200 OK
return successResponse(data, 201);        // 201 Created
return errorResponse('msg', 404);         // 404 Not Found
return validationErrorResponse('msg');    // 400 Bad Request
return handleResult(result);             // automático desde Result<T> (mapea error codes a HTTP status)
```

`handleResult` mapea automáticamente códigos de error a HTTP status:
- `VALIDATION_ERROR` → 400, `AUTH_*` → 401, `*_NOT_FOUND` → 404, otros → 500

Ver patrón completo: [`docs/context/admin-api-patterns.md`](docs/context/admin-api-patterns.md).

## Códigos de Error Centralizados

```typescript
import { AUTH_ERRORS, VALIDATION_ERRORS, SERVER_ERRORS, createErrorResponse } from '@/core/domain/constants/api-errors';

// Uso en rutas
return NextResponse.json(createErrorResponse(AUTH_ERRORS.UNAUTHORIZED), { status: 401 });
```

| Prefijo | Códigos | Ejemplos |
|---------|---------|---------|
| `AUTH_` | AUTH_001–005 | UNAUTHORIZED, INVALID_TOKEN, CSRF_REQUIRED |
| `VAL_` | VAL_002–004 | MISSING_FILE, FILE_TOO_LARGE, INVALID_FILE_TYPE |
| `SRV_` | SRV_002–005 | CONFIG_ERROR, STORAGE_ERROR, DATABASE_ERROR |

---

## Repositorios y Use Cases

```typescript
import {
  productUseCase, categoryUseCase, clienteUseCase,
  empresaUseCase, pedidoUseCase, promocionUseCase,
  authAdminUseCase, tgtgUseCase, empresaRepository,
} from '@/core/infrastructure/database';
```

| Use Case | Métodos |
|----------|---------|
| **ProductUseCase** | `getAll`, `create`, `update`, `delete` |
| **CategoryUseCase** | `getAll`, `create`, `update`, `delete` |
| **ClienteUseCase** | `getAll`, `create`, `update`, `delete`, `togglePromoSubscription` |
| **EmpresaUseCase** | `getById`, `update`, `updateColores` |
| **PedidoUseCase** | `getAll`, `create`, `updateStatus`, `getStats`, `delete`, `createMesaOrder` |
| **MesaSesionUseCase** | `getAll`, `open`, `close`, `getActiveOrders` |
| **DeliverySettingsUseCase** | `getDeliverySettings`, `updateDeliverySettings`, `getDeliveryZone` |
| **GlovoUseCase** | `getDeliveryQuote`, `createGlovoOrder`, `processGlovoWebhook` |
| **RedsysUseCase** | `initiateRedsysPayment`, `processRedsysWebhook` |
| **PromocionUseCase** | `getAll`, `create` |
| **AuthAdminUseCase** | `login`, `verifyToken` |
| **TgtgUseCase** | `getWithItems`, `getAllRecent`, `create`, `sendCampaignEmails`, `markEmailSent`, `getHistory`, `getReservas`, `adjustCupones`, `claimCupon`, `updateHoras`, `deletePromo`, `isTokenUsed`, `getPublicItem`, `getPublicPromo` |
| **SuperAdminUseCase** | `getAllEmpresas`, `getEmpresaById`, `updateEmpresa` |
| **DescuentoUseCase** | `subscribe`, `validateCode`, `markAsUsed` |

### Repositories — métodos

| Repository | Métodos |
|------------|---------|
| **IAdminRepository** | `loginWithPassword`, `findById` |
| **ISuperAdminRepository** | `findAllEmpresas`, `findEmpresaById`, `updateEmpresa`, `getEmpresaStats` |
| **IClienteRepository** | `findAllByTenant`, `findByEmail`, `findByTelefono`, `create`, `update`, `delete` |
| **IEmpresaRepository** | `getById`, `findByDomain`, `update`, `updateColores` |
| **IPedidoRepository** | `findAllByTenant`, `updateStatus`, `delete`, `create`, `getStats`, `createMesaOrder`, `findBySessionId`, `updateStatusById`, `findEstimatedReadyAtById`, `updateEstimatedTime` |
| **IMesaRepository** | `findByToken`, `findById`, `findAllByEmpresa`, `setSessionId` |
| **IMesaSesionRepository** | `create`, `close`, `findActive`, `findOrdersBySession` |
| **IPromocionRepository** | `findAllByTenant`, `create`, `deleteAllByTenant` |
| **IProductRepository** | `findAllByTenant`, `findByIds`, `create`, `update`, `delete` |
| **ICategoryRepository** | `findAllByTenant`, `create`, `update`, `delete` |
| **ILogErrorRepository** | `log` |
| **ITgtgRepository** | `findWithItems`, `findAllRecent`, `create`, `sendEmails`, `markEmailSent`, `findHistory`, `findReservas`, `adjustCupones`, `claimCupon`, `updateHoras`, `delete`, `isTokenUsed`, `findPublicItem`, `findPublicPromo` |
| **ICodigoDescuentoRepository** | `create`, `findByCodigo`, `findByEmail`, `markAsUsed` |

---

## Tipos de Dominio

```typescript
// core/domain/entities/types.ts

interface Empresa {
  id, nombre, dominio, logoUrl, mostrarCarrito, moneda,
  emailNotification, urlImage, colores: EmpresaColores | null,
  descripcion, fb?, instagram?, urlMapa?, direccion?, telefonoWhatsapp?
}

interface PedidoItem {
  producto_id?, nombre, precio, cantidad,
  complementos?: PedidoComplemento[]
}

interface PedidoComplemento {
  nombre?: string; name?: string;   // formato dual por compatibilidad
  precio?: number; price?: number;
}

interface CartItem {
  item?: { id, name, price };
  quantity: number;
  selectedComplements?: { name: string; price: number }[];
}
```

## Formato de Datos: Dominio vs Admin

Los repositories devuelven **camelCase** (dominio). Las API routes del admin transforman a **snake_case** usando los tipos correctos:

```typescript
import type { Product } from '@/core/domain/entities/types';

function toAdminProduct(prod: Product) {
  return {
    id: prod.id,
    empresa_id: prod.empresaId,
    categoria_id: prod.categoriaId,
    titulo_es: prod.titulo_es,
    foto_url: prod.fotoUrl,
    es_especial: prod.esEspecial,
    // ...
  };
}
```

---

## Autenticación Admin

### Roles de Usuario

El sistema soporta cuatro roles (`RolAdmin` union type, CHECK constraint en DB):

| Rol | Descripción | Acceso |
|-----|-------------|--------|
| `admin` | Admin de empresa | Panel admin completo + TPV |
| `superadmin` | Super Admin | Panel superadmin, acceso a TODAS las empresas |
| `encargado` | Encargado de turno | TPV completo (analytics, historial, mermas, cierre de turno). Sin acceso a `/admin/*` |
| `cajero` | Cajero | Solo TPV mostrador, cobro y pedidos. Sin acceso a analytics, historial, mermas ni cierre de turno |

El rol se define en la columna `rol` de la tabla `perfiles_admin` (CHECK constraint desde `20260707000001_rbac_roles_constraint.sql`):
- `admin` → redirige a `/admin`
- `superadmin` → redirige a `/superadmin`
- `encargado` / `cajero` → redirigen a `/tpv`

> **Nota**: `encargado` y `cajero` pueden autenticarse en el TPV de dos formas independientes: (a) mediante cuenta `perfiles_admin` + email/password (flujo legacy), o (b) mediante la tabla `empleados_tpv` + PIN numérico (`tpv_employee_token` cookie). El panel admin solo reconoce el flujo (a); el TPV reconoce ambos.

### Panel Super Admin

Acceso: `/superadmin` - Ver resumen de todas las empresas y editar cualquier campo.

```
/superadmin                     → Dashboard con stats de todas las empresas
/superadmin/empresas/[id]      → Editar empresa específica
```

APIs asociadas:
```
/api/superadmin/empresas        → GET todas las empresas con stats
/api/superadmin/empresas/[id]  → GET/PUT empresa específica
```

### Flujo de login
```
POST /api/admin/login
  → AuthAdminUseCase.login()
  → adminRepo.loginWithPassword()  (Supabase Auth)
  → adminRepo.findById()           (perfil + empresa)
  → JWT HS256, 24h, jti=randomUUID()
  → cookie admin_token (HttpOnly, SameSite=strict)
  → Redirección según rol: admin → /admin, superadmin → /superadmin
```

### Flujo de logout
```
POST /api/admin/logout
  → jwtVerify(admin_token) → extrae jti + exp
  → revokeToken(jti, ttlRestante) → Upstash Redis SET key EX ttl
  → delete cookie admin_token + csrf_token
```

### Verificación de sesión en pages
```typescript
// app/admin/(protected)/layout.tsx  y  page.tsx
import { authAdminUseCase } from '@/core/infrastructure/database';

const token = cookieStore.get('admin_token')?.value;
if (!token) redirect('/admin/login');

const admin = await authAdminUseCase.verifyToken(token);
if (!admin) redirect('/admin/login');

// admin.empresaId, admin.empresa, admin.nombreCompleto
```

### Middleware (proxy.ts)
- Lee secrets de forma lazy (`getAdminTokenSecret()`) — nunca constantes a nivel de módulo
- Verifica JWT en todas las rutas `/api/admin/*`
- Comprueba revocación del `jti` en Redis (fail-closed en producción)
- Valida CSRF (timingSafeEqual) en todos los métodos mutativos
- Inyecta `x-empresa-id`, `x-admin-id`, `x-admin-rol` como headers
- Genera nonce criptográfico por request para rutas de página; emite CSP dinámico y pasa `x-nonce` a server components
- Aplica CORS headers a todas las rutas `/api/*` (admin y públicas)
- Valida cart access tokens con audience claim `'cart-access'`
- Rutas públicas sin JWT (match exacto): `/api/admin/login`, `/api/unsubscribe`, `/api/admin/promociones/unsubscribe`, `/api/csp-report`
- **Dual-auth para rutas TPV**: para `/tpv/*` y `/api/tpv/*` intenta `admin_token` primero, luego `tpv_employee_token` (audience `'tpv-employee'`). La cookie `tpv_employee_token` implementa sliding window lazy (DB check solo en los últimos 15 min de vida).
- Inyecta `x-pathname` en todas las rutas de página — el layout TPV lo usa para saltarse la verificación de auth en `/tpv/login`.

> Agregar nuevas rutas públicas a `isPublicRoute` en `proxy.ts` (usar `===`, no `startsWith`)

> `pedidos` NO tiene columna `telefono` — el teléfono está en `clientes`

---

## Subdominios y Multi-tenant

| Host | Comportamiento |
|------|---------------|
| `midominio.com` | Menú sin carrito |
| `pedidos.midominio.com` | Menú + carrito |
| `midominio-pedidos.com` | Menú + carrito (dominio propio) |

```typescript
import { parseMainDomain, getDomainFromHeaders } from '@/lib/domain-utils';

const domain = await getDomainFromHeaders();
const main = parseMainDomain(domain); // elimina subdominio pedidos
```

---

## Base de Datos (Supabase)

| Tabla | PK | FK | Notas |
|-------|----|----|-------|
| `empresas` | id (uuid) | — | dominio, subdomain_pedidos, colores, fb, instagram, url_mapa, telefono_whatsapp, **descuento_bienvenida_activo/porcentaje**, telegram_chat_id, **waiter_pin_hash** |
| `perfiles_admin` | id (uuid) | empresa_id → empresas (nullable) | → auth.users, `rol` ∈ {'admin','superadmin','encargado','cajero'} |
| `categorias` | id (uuid) | empresa_id → empresas | categoria_padre_id, categoriaComplementoDe |
| `productos` | id (uuid) | empresa_id, categoria_id | i18n: titulo_es/en/fr/it/de |
| `clientes` | id (uuid) | empresa_id | telefono único por empresa |
| `pedidos` | id (uuid) | empresa_id, cliente_id | numero_pedido (atómico por tenant), detalle_pedido: JSON (PedidoItem[]), **codigo_descuento_id, descuento_porcentaje, total_sin_descuento**, **mesa_id, sesion_id, estado**, **validated_at** (timestamptz, NULL = sin validación) |
| `promociones` | id (uuid) | empresa_id | imagen_url, numero_envios |
| `codigos_descuento` | id (uuid) | empresa_id | codigo unik por empresa + email, usado boolean, pedido_id FK |
| `tgtg_promociones` | id (uuid) | empresa_id | fechaActivacion, horaRecogidaInicio/Fin, emailEnviado, numeroEnvios |
| `tgtg_items` | id (uuid) | tgtg_promo_id, empresa_id | titulo, precioOriginal, precioDescuento, cuponesTotal, cuponesDisponibles |
| `tgtg_reservas` | id (uuid) | tgtg_item_id, empresa_id | token único, estado (pendiente/confirmado/cancelado), fechaReserva |
| `log_errors` | id (uuid) | empresa_id | logging centralizado con severity y metadata JSONB |
| **`mesas`** | id (uuid) | empresa_id, sesion_id → mesa_sesiones | numero, nombre, token UUID (QR), sesion_id activa |
| **`mesa_sesiones`** | id (uuid) | mesa_id, empresa_id | abierta_en, cerrada_en (NULL = abierta) |

**Columnas delivery en `pedidos`** (añadidas en migración `20260527100000_riders_app.sql` + `add_origen_to_pedidos`):

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `origen` | `TEXT` | `'recogida'` o `'delivery'` |
| `direccion_entrega` | `TEXT` | Dirección completa |
| `codigo_postal` | `TEXT` | CP de entrega |
| `latitude_entrega` | `DOUBLE PRECISION` | Latitud GPS |
| `longitude_entrega` | `DOUBLE PRECISION` | Longitud GPS |
| `delivery_fee_cents` | `INT` | Fee total cobrado |
| `payment_status` | `TEXT` | `'not_required'` / `'pending'` / `'paid'` / `'failed'` |
| `payment_order_ref` | `TEXT` | Referencia Redsys (DS_MERCHANT_ORDER) |
| `payment_amount_cents` | `INT` | Importe cobrado |
| `glovo_order_id` | `TEXT` | ID pedido en Glovo |
| `glovo_status` | `TEXT` | Estado del rider Glovo |

**Columnas delivery + credenciales en `empresas`**:

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `delivery_postal_codes` | `TEXT[]` | CP habilitados (vacío = delivery off) |
| `delivery_min_order_cents` | `INT` | Pedido mínimo en céntimos |
| `delivery_fee_surcharge_cents` | `INT` | Cargo adicional en céntimos |
| `glovo_client_id` | `TEXT` | Client ID Glovo Business |
| `glovo_key_id` | `TEXT` | Key ID par RS256 |
| `glovo_private_key` | `TEXT` | RSA Private Key PEM |
| `glovo_vendor_id` | `TEXT` | client_vendor_id del outlet |
| `glovo_country_code` | `TEXT` | Código de país (default `'es'`) |
| `redsys_merchant_code` | `TEXT` | Número de comercio Redsys |
| `redsys_terminal` | `TEXT` | Terminal Redsys (default `'001'`) |
| `redsys_secret_key` | `TEXT` | Clave HMAC_SHA256_V1 |

> `pedidos` NO tiene columna `telefono` — el teléfono está en `clientes`

> `detalle_pedido[].complementos` almacena objetos `{ name, price }` — tipo `PedidoComplemento[]`

> `perfiles_admin.empresa_id` es NULL para superadmins (sin empresa asignada)

---

## Variables de Entorno

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx

# Auth JWT
ACCESS_TOKEN_SECRET=secreto_largo_aleatorio        # openssl rand -hex 32

# CSRF + Carrito + Unsubscribe (obligatorios en producción)
CSRF_HMAC_SECRET=secreto_largo_aleatorio           # openssl rand -hex 32
CART_TOKEN_SECRET=secreto_largo_aleatorio          # openssl rand -hex 32
UNSUBSCRIBE_HMAC_SECRET=secreto_largo_aleatorio    # openssl rand -hex 32

# Rate Limiting + JWT Revocation (Upstash Redis)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# CORS
CORS_ALLOWED_ORIGINS=https://tudominio.com,https://pedidos.tudominio.com
CORS_ALLOWED_DOMAINS=tudominio.com

# Cloudflare R2 — bucket de imágenes
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=images
NEXT_PUBLIC_R2_DOMAIN=https://imagenes.tudominio.com
CLOUDFLARE_API_TOKEN=xxx                           # opcional, fallback a AWS SDK

# Cloudflare R2 — bucket de backups (DISTINTO del de imágenes)
R2_BACKUP_BUCKET_NAME=multi-shop-backups
R2_ENDPOINT=https://{account_id}.r2.cloudflarestorage.com

# Backup del sistema
BACKUP_SECRET=hex64chars                           # openssl rand -hex 32 — auth del Edge Function

# Sentry — Error monitoring y observabilidad
NEXT_PUBLIC_SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>  # runtime (client + server)
SENTRY_AUTH_TOKEN=xxx                              # build only — sube source maps
SENTRY_ORG=tu-org-slug                             # build only
SENTRY_PROJECT=tu-project-slug                     # build only

# Email (Brevo)
BREVO_API_KEY=xxx
BREVO_DEFAULT_SENDER_EMAIL=noreply@tudominio.com

# Mapbox (selector de dirección de entrega — frontend)
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJxxx

# Redsys TPV Virtual
# Test: https://sis-t.redsys.es:25443/sis/realizarPago (default si no se define)
# Prod: https://sis.redsys.es/sis/realizarPago
NEXT_PUBLIC_REDSYS_URL=https://sis.redsys.es/sis/realizarPago
# Las credenciales Redsys (merchant_code, terminal, secret_key) se configuran por empresa en /admin/delivery
# Las credenciales Glovo (client_id, key_id, private_key PEM, vendor_id) se configuran por empresa en /admin/delivery
```

---

## Imágenes (Cloudflare R2)

### Estructura en bucket

```
{empresa-slug}/{año}/{mes}/{uuid}.webp
```

### Flujo de upload

1. Cliente optimiza imagen en browser:
   - **Productos**: 480×480, WebP, 80% (`optimizeImage`)
   - **Banners**: 1920×1080, WebP, 92% (`optimizeBannerImage`)
   - `ImageUploader` usa prop `isBannerImage` para seleccionar optimización
2. `POST /api/admin/upload-image?empresaId=xxx` (superadmin requiere query param)
3. El API route valida MIME type, magic bytes y tamaño
4. Deriva `empresaSlug` desde DB — nunca del cliente
5. Upload a R2 y devuelve `{ publicUrl }`

```typescript
import { deleteImageFromR2, uploadToR2 } from '@/core/infrastructure/storage/s3-client';
```

---

## Comandos

```bash
pnpm dev      # Desarrollo con Turbopack
pnpm build    # Build de producción
pnpm lint     # Linting

# Solo una vez: configurar CORS en R2
npx tsx scripts/setup-r2-cors.ts
```

### Graphify — grafo de conocimiento del proyecto

El proyecto usa [Graphify](https://graphify.net) para generar un grafo de conocimiento basado en AST. Claude Code lo consulta automáticamente antes de hacer búsquedas en el código.

Los artefactos generados viven en `graphify-out/` (`graph.json` y `GRAPH_REPORT.md` están versionados).

```bash
# Prerequisito (una sola vez)
pip install "graphifyy[sql]"

# Regenerar el grafo tras cambios significativos en el código
graphify . --code-only

# Ver el estado actual del grafo (nodos, comunidades)
graphify cluster-only .
```

> El ejecutable queda en `~/.local/bin/graphify` (Linux/Mac) o `%APPDATA%\Python\Python3xx\Scripts\graphify.exe` (Windows). Si no está en el PATH, usar la ruta completa.

---

## Crear Super Admin

### Requisitos de Base de Datos

El campo `empresa_id` en `perfiles_admin` debe permitir NULL para superadmins:

```sql
ALTER TABLE public.perfiles_admin 
ALTER COLUMN empresa_id DROP NOT NULL;

ALTER TABLE public.perfiles_admin 
DROP CONSTRAINT IF EXISTS perfiles_admin_empresa_id_fkey;
```

### Script Node (recomendado)

```bash
# Crear archivo .env desde .env.local si no existe
cp .env.local .env

# Crear superadmin
npx tsx scripts/create-superadmin.ts superadmin@tudominio.com Password123 "Super Admin"
```

### Script SQL (alternativa)

```sql
-- 1. Crear usuario en Auth (reemplazar valores)
INSERT INTO auth.users (instance_id, email, encrypted_password, email_confirmed_at, role, aud, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, id)
VALUES (
  (SELECT id FROM auth.instances LIMIT 1),
  'superadmin@tudominio.com',
  crypt('Password123', gen_salt('bf')),
  now(),
  NULL,
  'authenticated',
  now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  gen_random_uuid()
) RETURNING id;

-- 2. Crear perfil (reemplazar USER_ID)
INSERT INTO public.perfiles_admin (id, empresa_id, nombre_completo, rol, created_at)
VALUES ('USER_ID_AQUI', NULL, 'Super Admin', 'superadmin', now());
```

### Convertir admin existente a superadmin

```sql
UPDATE public.perfiles_admin 
SET rol = 'superadmin', empresa_id = NULL
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@connect.com');
```

---

## 💾 Sistema de Backup Automático (Tenant Snapshot)

Backup diario automático de todos los datos operativos de cada empresa a Cloudflare R2. Sistema completamente serverless — cero infraestructura adicional.

### Arquitectura

```
GitHub Actions (cron 03:00 UTC)
    → POST supabase/functions/v1/tenant-backup  (Bearer BACKUP_SECRET)
        → Supabase Edge Function (Deno)
            → Consulta todos los tenants en paralelo
            → Serializa snapshot JSON por empresa
            → PUT a R2 como backups/{empresa_id}/{YYYY-MM-DD}.json
```

### Tablas incluidas en el snapshot

| Tabla | Notas |
|-------|-------|
| `empresas` | Fila completa incluyendo credenciales de la empresa |
| `categorias` | Filtrado por `empresa_id` |
| `productos` | Filtrado por `empresa_id` |
| `mesas` | Filtrado por `empresa_id` |
| `ingredientes` | Filtrado por `empresa_id` |
| `empleados_tpv` | Filtrado por `empresa_id` |
| `receta_items` | Sin `empresa_id` — filtrado vía `producto_id IN (...)` |

### Restore

`POST /api/admin/backup/restore` — restaura el último snapshot del día desde R2.

Orden de inserción FK-safe:
1. `empresas` → UPDATE (nunca upsert — evita conflictos de unicidad en dominio/slug)
2. `mesas` → sanitiza `empresa_id` + fuerza `sesion_id = null` (sesiones son transitorias)
3. `ingredientes` → sanitiza `empresa_id`
4. `categorias` → sanitiza `empresa_id`
5. `productos` → sanitiza `empresa_id`
6. `empleados_tpv` → sanitiza `empresa_id`
7. `receta_items` → sin `empresa_id` (no sanitizar)

```typescript
// Seguridad: empresa_id siempre sobreescrito desde el token JWT del admin
const sanitize = (rows: SnapshotRow[]) =>
  rows.map(r => ({ ...r, empresa_id: empresaId }));
```

> ⚠️ `mesas.sesion_id` DEBE ponerse a `null` en el restore — las sesiones activas son transitorias y no se restauran.

### Variables de entorno requeridas (backup)

```env
# Cloudflare R2 — bucket exclusivo de backups (NO el de imágenes)
R2_BACKUP_BUCKET_NAME=multi-shop-backups   # Variable distinta a R2_BUCKET_NAME

# Autenticación del Edge Function
BACKUP_SECRET=hex64chars                    # openssl rand -hex 32
```

> ⚠️ **`R2_BUCKET_NAME` vs `R2_BACKUP_BUCKET_NAME`**: son dos variables distintas. `R2_BUCKET_NAME` apunta al bucket de imágenes. `R2_BACKUP_BUCKET_NAME` apunta al bucket de backups. NUNCA usar la misma.

### Archivos clave

| Archivo | Descripción |
|---------|-------------|
| `supabase/functions/tenant-backup/index.ts` | Edge Function Deno — genera y sube el snapshot |
| `src/app/api/admin/backup/restore/route.ts` | API Route — descarga y restaura el snapshot |
| `.github/workflows/tenant-backup.yml` | GitHub Actions — disparo diario a las 03:00 UTC |

### Secretos en GitHub Actions

Los secrets deben estar definidos en GitHub → Settings → Secrets:
- `SUPABASE_URL` — URL pública del proyecto Supabase
- `BACKUP_SECRET` — mismo valor que la variable de entorno del Edge Function

> ⚠️ En el workflow YAML, los secrets **deben** estar en el bloque `env:` del step, no interpolados directamente en el shell script (`$SUPABASE_URL` no `${{ secrets.SUPABASE_URL }}`). VS Code mostrará un falso positivo de "Context access might be invalid" — es un bug del plugin de GitHub Actions para VS Code; en runtime funciona correctamente.

### Deno Edge Functions — TypeScript en VS Code

Los archivos en `supabase/functions/` usan la runtime Deno con imports URL (`https://esm.sh/`) y el global `Deno`. El servidor de TypeScript de VS Code (Node.js) no reconoce estos y genera errores TS2307/TS2304.

**Fix**: añadir `// @ts-nocheck` como primera línea de cada Edge Function. No afecta a la ejecución real en Deno.

```typescript
// @ts-nocheck — Deno Edge Function: URL imports and Deno globals are valid at runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
```

---

## 🐛 Errores Comunes — Registro de Bugs y Anti-patrones

Registro de bugs encontrados y corregidos. Leer antes de programar para no repetirlos.

### SonarLint — Reglas críticas aplicadas en este codebase

#### S2245 — `Math.random()` no apto para identificadores únicos

`Math.random()` no es criptográficamente seguro y SonarLint lo marca en contextos donde se usa como identificador (nombres de canales Supabase Realtime, etc.).

```typescript
// ❌ MAL
const channelRef = useRef(`waiter-banner-${Math.random().toString(36).slice(2)}`);

// ✅ BIEN
const channelRef = useRef(`waiter-banner-${crypto.randomUUID().slice(0, 8)}`);
```

`crypto.randomUUID()` está disponible en todos los browsers modernos, en Node.js 14.17+ y en Deno. Sin dependencias extra.

---

#### S3776 — Complejidad cognitiva ≤ 15

Cuando un componente React supera 15 unidades de complejidad cognitiva, SonarLint lo marca. La complejidad se acumula de forma diferente a la ciclomática: las funciones anidadas dentro del componente (handlers, callbacks, funciones internas) suman al componente padre.

**Síntomas**: `useEffect` con múltiples `if`, handlers con `try/catch` + `if/else` anidados.

**Fix estándar**: extraer handlers y callbacks a funciones puras de módulo (fuera del componente):

```typescript
// ❌ MAL — el if/else anidado en el .then() suma complejidad a WaiterBanner
fetch('/api/waiter/me')
  .then(async r => {
    setIsWaiter(r.ok);
    if (r.ok) {
      const json = await r.json() as { empresaId: string };
      setWaiterEmpresaId(json.empresaId);
    }
  });

// ✅ BIEN — función de módulo, no suma al componente
async function applyWaiterMeResponse(
  r: Response,
  setIsWaiter: (v: boolean) => void,
  setWaiterEmpresaId: (id: string | null) => void,
) {
  setIsWaiter(r.ok);
  if (r.ok) {
    const json = await r.json() as { empresaId: string };
    setWaiterEmpresaId(json.empresaId);
  }
}

// En el componente:
fetch('/api/waiter/me')
  .then(r => applyWaiterMeResponse(r, setIsWaiter, setWaiterEmpresaId));
```

**En páginas SSR**: extraer cadenas de auth a helper de módulo:

```typescript
// ❌ MAL — múltiples if anidados dentro de la page function
async function MostradorPage() {
  const adminToken = cookieStore.get('admin_token')?.value;
  if (adminToken) {
    const admin = await authAdminUseCase.verifyToken(adminToken);
    if (admin?.empresaId) empresaId = admin.empresaId;
  }
  if (!empresaId) {
    const employeeToken = cookieStore.get('tpv_employee_token')?.value;
    if (employeeToken) { ... }
  }
  // ...
}

// ✅ BIEN — helper de módulo
async function resolveEmpresaId(
  cookieStore: Awaited<ReturnType<typeof cookies>>
): Promise<string | null> {
  const adminToken = cookieStore.get('admin_token')?.value;
  if (adminToken) {
    const admin = await authAdminUseCase.verifyToken(adminToken);
    if (admin?.empresaId) return admin.empresaId;
  }
  const employeeToken = cookieStore.get('tpv_employee_token')?.value;
  if (!employeeToken) return null;
  const payload = await verifyTpvEmployeeToken(employeeToken);
  return payload?.empresaId ?? null;
}
```

---

#### S7776 — Usar `Set` en lugar de `Array` para comprobaciones de pertenencia

```typescript
// ❌ MAL — Array.includes() es O(n) y SonarLint lo marca
const VALID_ROLES: RolAdmin[] = ['superadmin', 'admin', 'encargado', 'cajero'];
if (VALID_ROLES.includes(admin.rol)) { ... }

// ✅ BIEN — Set.has() es O(1) y semánticamente correcto
const VALID_ROLES = new Set<RolAdmin>(['superadmin', 'admin', 'encargado', 'cajero']);
if (VALID_ROLES.has(admin.rol)) { ... }
```

---

#### S1874 — `React.FormEvent` deprecado en React 18.3+

`React.FormEvent` fue marcado `@deprecated` en `@types/react`. El tipo base correcto es `React.SyntheticEvent<T>`.

```typescript
// ❌ MAL
async function handleSubmit(e: React.FormEvent) { ... }
async function handleSubmit(e: React.FormEvent<HTMLFormElement>) { ... }  // sigue siendo deprecated

// ✅ BIEN
async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) { ... }
```

---

#### S6759 — Props de componentes deben ser `Readonly<>`

```typescript
// ❌ MAL
export default async function Home({ searchParams }: { searchParams: Promise<...> }) { ... }

// ✅ BIEN
export default async function Home({ searchParams }: Readonly<{ searchParams: Promise<...> }>) { ... }

// Para componentes funcionales el patrón es:
function MiComponente({ prop1, prop2 }: Readonly<MiComponenteProps>) { ... }
```

---

#### S1656 — Asignación de variable a sí misma

Error silencioso: la variable se asigna a sí misma en lugar de al valor correcto.

```typescript
// ❌ MAL — empresaId no cambia, bug silencioso
if (admin?.empresaId) empresaId = empresaId;

// ✅ BIEN
if (admin?.empresaId) empresaId = admin.empresaId;
```

---

#### S6582 — Usar optional chaining en lugar de `&&`

```typescript
// ❌ MAL
const mesas = mesasResult && mesasResult.success ? mesasResult.data : null;

// ✅ BIEN
const mesas = mesasResult?.success ? mesasResult.data : null;
```

---

#### S2004 — Máximo 4 niveles de funciones anidadas

Contar desde el componente: `Componente → useCallback → .then → setItems(prev => ...)` son 4 niveles. Si hay un `if` dentro, son 5 → violación.

**Fix**: extraer el predicado o callback a función de módulo:

```typescript
// ❌ MAL — 5 niveles
const rollback = useCallback(() => {
  fetch('/api/...').then(() => {
    setItems(prev => prev.some(i => i.id === item.id) ? prev : [...prev, item]);
  });
}, [item]);

// ✅ BIEN — predicado en módulo
function addItemBackIfMissing(item: KitchenItem) {
  return (prev: KitchenItem[]) =>
    prev.some(i => i.pedidoId === item.pedidoId && i.itemIdx === item.itemIdx)
      ? prev
      : [...prev, item];
}
// En el componente:
setItems(addItemBackIfMissing(item));
```

---

#### S3358 — Prohibido ternario anidado

```typescript
// ❌ MAL
const color = isReady ? 'green' : isWarning ? 'amber' : 'red';

// ✅ BIEN — función de módulo con if/return
function resolveColor(isReady: boolean, isWarning: boolean): string {
  if (isReady) return 'green';
  if (isWarning) return 'amber';
  return 'red';
}
```

---

### Trampas de arquitectura — errores no obvios

#### `R2_BUCKET_NAME` vs `R2_BACKUP_BUCKET_NAME`

El proyecto usa **dos buckets distintos en R2**:
- `R2_BUCKET_NAME` → bucket de imágenes de productos/empresas
- `R2_BACKUP_BUCKET_NAME` → bucket de backups (tenant snapshots)

Usar la misma variable para ambos mezcla los datos. Cada bucket tiene su propia variable de entorno. Definir ambas en Vercel, en GitHub Secrets y en `.env.local`.

#### Deno Edge Functions — no pasar por ESLint/TypeScript del proyecto

Los archivos en `supabase/functions/` corren en Deno, no en Node.js. VS Code mostrará errores TS en:
- Imports con URL (`https://esm.sh/...`, `jsr:...`, `npm:...`)
- El global `Deno`

Estos son **falsos positivos del editor**, no errores reales. La función se despliega y ejecuta correctamente en la runtime Deno de Supabase.

**No intentar "arreglar" estos imports** cambiándolos a imports de npm — romperá el Edge Function. La solución es `// @ts-nocheck` en la primera línea del archivo.

#### YAML GitHub Actions — secrets en `env:` del step

```yaml
# ❌ MAL — VS Code muestra warning "Context access might be invalid"
run: |
  curl -H "Authorization: Bearer ${{ secrets.BACKUP_SECRET }}" ...

# ✅ BIEN — secrets en env: block, referencias como variables de shell
- name: Trigger backup
  env:
    BACKUP_SECRET: ${{ secrets.BACKUP_SECRET }}
    SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
  run: |
    curl -H "Authorization: Bearer $BACKUP_SECRET" "$SUPABASE_URL/functions/v1/..."
```

El warning de VS Code es un falso positivo del plugin de GitHub Actions (no conoce los secrets en tiempo de edición). Pero el patrón `env:` también es la forma más segura y recomendada porque evita que los valores aparezcan en logs de shell.

---

## Estado del Proyecto

| Aspecto | Estado |
|---------|--------|
| **Build** | Compila correctamente |
| **Clean Architecture** | 100% — Domain / Application / Infrastructure |
| **SOLID** | 100% — DIP, sin `any`, repositorios inyectados |
| **Seguridad** | Auditoría completa — JWT revocation (fail-closed), RBAC `requireRole`, env validation startup, rate limiting (fail-closed login), CSP nonces + report-uri, CSRF timing-safe, price tampering + product rejection, anti-enumeración, mínimo privilegio, cart token audience, JSON-LD sanitización |
| **Tipos TypeScript** | Sin `any` en core ni API routes |
| **Error Handling** | 100% — Result<T, E> en todos los módulos |
| **API Error Codes** | Códigos centralizados en `core/domain/constants/api-errors.ts` + **DISCOUNT_ERRORS** |
| **Logging** | Tabla log_errors + ErrorLogger singleton |
| **UI/UX** | Audit 9/10 — WCAG AA, focus states, reduced-motion, ARIA, mobile-first, 44px touch targets, glassmorphic dark theme, consistent design tokens |
| **i18n** | es/en/fr/it/de en productos + panel admin + componentes públicos |
| **Welcome Discount** | Popup 30s en subdomain pedidos, código único BIENVENIDO-XXXXXX, email con idioma del cliente, porcentaje configurable (1-50%), duración configurable (7/14/30/60/90 días), validación server-side (existencia, usado, expirado, email match), aplicación en checkout, persists en pedido |
| **Admin Panel Design** | Glassmorphic dark theme (backdrop-blur + white/10 opacity), estadoPendiente=Aceptado colores consistentes con badges de tabla (ámbar/azul), diseño unificado sin colores por empresa |
| **SEO Multi-Tenant** | Metadata dinámica por empresa, hreflang (5 idiomas), sitemap/robots dinámicos, Schema.org Restaurant+FAQ+Menu, geo coordinates desde urlMapa, 404 con meta tags |
| **Mesa Ordering** | QR table ordering para restaurantes dine-in. mesas + mesa_sesiones en DB. Rate limiting per-UUID (120/min). Ticket view con complementos + i18n + hora 24h. Gestión in-app de ítems por cocina y bar (sin Telegram). |
| **Mesa Payments** | Pago en mesa vía Redsys TPV. Pago total o división de cuenta (2–20 personas). `mesa_division_pagos` elimina race condition en pagos simultáneos. Sistema de lock atómico (`pago_en_curso`) bloquea todos los usuarios de la mesa durante el pago. Verificación de total antes de pagar (detecta nuevos productos). Overlay 💳 en ticket + back button trap + adaptive polling (3s/10s). |
| **QR Session Enforcement** | Pedidos en mesa requieren presencia física validada por escaneo in-app del QR impreso. Token de 20min en `mesa_client_tokens` (sessionStorage). `validateMesaClientToken` middleware en `/api/pedidos` y `/api/mesas/{mesaId}/orders`. Rotación de sesión al cerrar mesa invalida todos los tokens anteriores. Rate limit: 10 tokens/hora/mesa. |
| **Waiter Panel** | Panel PIN-auth en /waiter. Grid de mesas, ciclo de sesión open/close, ítems diferidos, pago manual. WaiterBanner sticky global con badges de cocina y bar en tiempo real. Re-autenticación sin recarga: `WaiterLoginForm` dispara `CustomEvent('waiter-auth-changed')` → banner revalida sesión automáticamente. |
| **Kitchen & Bar In-App** | `/waiter/kitchen` y `/waiter/bar`: vistas en tiempo real para gestión de ítems sin Telegram. Estados por ítem: pendiente → en_preparacion → preparado → servido (swipe gestual). Colores por tiempo de espera (oklch, 6 rangos). GroupBy por pedido o por mesa. Filtro "Listos". Retenidos con sección propia. Badges con counts en WaiterBanner (neutral/verde/naranja). Timer de espera arranca desde `validated_at` (momento de validación), no desde `created_at` del pedido original. |
| **Waiter Pendientes** | `/waiter/pendientes`: cola de validación antes de cocina/bar. Selección individual o por tipo (comida/bebida). Pausa (⏸) por ítem de comida → llega a cocina como retenido. Botón conjunto comida+bebida (botón morado) valida ambos tipos en un solo POST. La pausa prevalece sobre la selección en envíos conjuntos. |
| **Realtime Híbrido** | Migración completa de polling a Supabase Realtime en todas las vistas del panel de sala (kitchen, bar, pendientes, waiter-banner, waiter-login). Sistema híbrido: Realtime CDC para cambios de datos (<100 ms latencia, sin carga en DB en reposo) + `setInterval` 1 s exclusivamente para actualización visual de timers. Un único canal multiplexado en WaiterBanner consolida conteos de cocina, bar y estado de pago. Eliminados ~30 requests HTTP/min por camarero activo. **Tab visibility lifecycle**: canales Realtime se desconectan cuando el tab está oculto (ahorra quota de Supabase) y se reconectan al volver. Ver sección [⚡ Arquitectura Realtime](#-arquitectura-realtime--sistema-híbrido). |
| **Backup Automático (Tenant Snapshot)** | Edge Function Deno en `supabase/functions/tenant-backup` genera snapshots JSON diarios de todos los tenants (categorias, productos, mesas, ingredientes, empleados_tpv, receta_items + fila completa de empresa). Upload automático a Cloudflare R2 en `backups/{empresa_id}/{YYYY-MM-DD}.json`. GitHub Actions cron dispara el backup a las 03:00 UTC con autenticación Bearer. Restore via `POST /api/admin/backup/restore` con orden FK-safe y sanitización de `empresa_id`. Bucket separado `R2_BACKUP_BUCKET_NAME` (distinto del bucket de imágenes `R2_BUCKET_NAME`). |
| **TPV Empleados PIN** | Cajeros y encargados acceden al TPV con PIN numérico. Tabla `empleados_tpv`, cookie `tpv_employee_token` (JWT 1h sliding window lazy), dual-auth en proxy. Permisos por rol: encargado (TPV completo), cajero (mostrador + cobro + arqueo ciego). Botón "Bloquear TPV" para handoff entre empleados. CRUD desde `/admin/configuracion` tab Empleados. |
| **Electron TPV Windows** | Shell Electron para TPV en Windows. Carga la URL remota de producción (`https://{domain}/tpv`). IPC para impresión térmica ESC/POS (node-thermal-printer). Auto-update vía electron-updater (endpoint `/api/app/version/latest.yml`). Atajos de teclado globales. Bundling con esbuild. |
| **TPV — Terminal Punto de Venta** | Software de caja con cumplimiento legal completo (Ley Antifraude RD 1007/2023 + RD 1619/2012). **Arqueo ciego**: el teórico queda oculto hasta que el operador introduce su conteo. Mostrador táctil 3 columnas con selector de pase/marcha (1er/2º/Postre/Bebida). Cobro efectivo/tarjeta/propina con tasa IVA/IGIC configurable por empresa. Cadena de hashes SHA-256 inmutable por trigger PostgreSQL: bloqueo de DELETE y UPDATE con EXCEPTION. Ticket rectificativo = cobro negativo con `rectifica_cobro_id` (excluido de estadísticas). Numeración correlativa atómica (`serie-NNNNNN`). IVA/IGIC calculado en DB trigger (no en cliente). Endpoints de auditoría para inspectores (`/api/tpv/audit/chain`, `/api/tpv/audit/export`). Pantalla `/tpv/legal` con Declaración de Responsabilidad RD 1007/2023. Dashboard `/tpv/analytics` con selector de período (Hoy/Semana/Mes/Custom), 5 KPIs, gráfico por hora (Recharts lazy), top productos (JSONB) e historial de turnos. Endpoint `GET /api/tpv/analytics` con 3 RPCs `SECURITY DEFINER`. Configuración IVA/IGIC por empresa con propagación SSR de label. **Stock & Mermas**: trigger `deducir_stock_on_servido` descuenta ingredientes al servir (atómico, mismo tx). Auto-disable/re-enable de productos por umbral. Registro de mermas por turno. Audit log inmutable (`movimientos_stock`). Badge `LowStockBadge` en pantalla de cobro. **Inventario físico** (`/admin/stock/inventario`): conteo a ciegas, revisión de desviaciones, confirmación con movimientos tipo `inventario`. |
| **KDS Pases/Marchas** | Campo `pase` opcional en `pedidos` (CHECK: primer/segundo/postre/bebida). Selector en TicketPanel antes de enviar a cocina. KDS de cocina agrupa ítems por pase con cabeceras de sección cuando hay múltiples pases activos. Propagado en cadena: `pedidos.pase` → `KitchenItemRecord.pase` → `KitchenItem.pase` → render KDS. |
| **Telegram Multi-modo** | tienda → quick-reply buttons. restaurante takeaway → time-selector + tracking en vivo. mesa → gestionado in-app (sin Telegram). |
| **Delivery + Pago online** | Zona de cobertura por CP configurable. Cotización Glovo en tiempo real. Pago Redsys TPV Virtual obligatorio para delivery. Auto-despacho de rider al confirmar pago. Tracking page post-pago. |

## Documentación

- [`docs/context/security.md`](docs/context/security.md) — Medidas de seguridad detalladas
- [`docs/context/bbdd.md`](docs/context/bbdd.md) — Esquema de base de datos
- [`docs/context/cart_flow.md`](docs/context/cart_flow.md) — Flujo del carrito
- [`docs/context/context.md`](docs/context/context.md) — Contexto general del proyecto
- [`docs/context/toogoodtogo.md`](docs/context/toogoodtogo.md) — Flujo completo TGTG (campañas, reservas, emails, reglas de negocio)
- [`docs/context/welcome-discount.md`](docs/context/welcome-discount.md) — Sistema de descuento de bienvenida
- [`docs/context/mesa-ordering.md`](docs/context/mesa-ordering.md) — QR table ordering (flujo, API, rate limiting, ticket)
- [`docs/context/mesa-payments.md`](docs/context/mesa-payments.md) — Pagos en mesa: Redsys, división, lock system, race conditions, overlays
- [`docs/context/waiter-panel.md`](docs/context/waiter-panel.md) — Panel de sala (PIN auth, sesiones, mesas)
- [`docs/telegram-notifications.md`](docs/telegram-notifications.md) — Notificaciones Telegram (tienda, restaurante takeaway, mesa)
- [`docs/context/delivery.md`](docs/context/delivery.md) — Delivery: zona de cobertura, Glovo Business LaaS, Redsys TPV, flujo completo end-to-end
- [`docs/context/qr-session-enforcement.md`](docs/context/qr-session-enforcement.md) — QR session enforcement: presencia física, mesa_client_tokens, QRScannerGate, rotación de sesión
- [`docs/context/waiter-validation-flow.md`](docs/context/waiter-validation-flow.md) — Cola de validación: flujo pendiente_validacion → cocina/bar, from_validation flag, pausa, timer validated_at
- [`docs/tpv-legal-compliance.md`](docs/tpv-legal-compliance.md) — TPV: checklist de cumplimiento legal (Ley Antifraude, TicketBAI, RD 1619/2012, RGPD, PCI-DSS)
- [`docs/context/tpv-cobros-historial.md`](docs/context/tpv-cobros-historial.md) — TPV Fase 3: cobro parcial, historial multi-turno, rectificativos cross-turno, buenas prácticas
- [`docs/context/stock-system.md`](docs/context/stock-system.md) — TPV Fase 2: stock & mermas, trigger de deducción, re-habilitación de productos, audit log, LowStockBadge, inventario físico
- [`docs/context/tpv-pases.md`](docs/context/tpv-pases.md) — Pases/Marchas: campo `pase` en pedidos, selector en mostrador, agrupación en KDS
- [`docs/superpowers/specs/2026-07-06-tpv-future-roadmap.md`](docs/superpowers/specs/2026-07-06-tpv-future-roadmap.md) — Roadmap de features futuras (Proveedores, Food Cost, BCG, RBAC, Integraciones)
- [`docs/superpowers/specs/2026-07-02-tpv-design.md`](docs/superpowers/specs/2026-07-02-tpv-design.md) — Spec técnica del TPV Fase 1
- [`docs/superpowers/specs/2026-07-03-tpv-analytics-design.md`](docs/superpowers/specs/2026-07-03-tpv-analytics-design.md) — Spec técnica del TPV Fase 2 (Analytics + IVA/IGIC)
- [`docs/context/tpv-empleados-pin.md`](docs/context/tpv-empleados-pin.md) — TPV empleados PIN: arquitectura dual-auth, permisos por rol, arqueo ciego, trampas críticas
- [`docs/superpowers/specs/2026-07-08-empleados-tpv-permisos-design.md`](docs/superpowers/specs/2026-07-08-empleados-tpv-permisos-design.md) — Spec de diseño del sistema de empleados TPV con PIN

---

## Deployment (Vercel)

1. Conectar repo a Vercel
2. Configurar todas las variables de entorno
3. Framework Preset: Next.js
4. Deploy automático en push a `main`

> Next.js 16 usa Turbopack — es normal ver "Skipping validation of types" en el build.
