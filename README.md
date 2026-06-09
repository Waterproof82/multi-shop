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
- **Pago en mesa** vía Redsys TPV: pago total o división de cuenta entre 2 y 20 personas. Sistema de lock atómico para evitar pagos simultáneos. Verificación de total antes de pagar (detecta productos nuevos añadidos en el último momento).
- **Registro manual de pagos** por el camarero (efectivo / pago externo) para desbloquear la sesión en escenarios de división.
- **Gestión de pedidos takeaway** desde un entorno de chat de Telegram: con un solo botón se indica el tiempo de recogida (10, 15, 20, 30 o 45 minutos). El cliente recibe la notificación automáticamente en su pantalla de seguimiento, sin necesidad de llamar por teléfono.
- **Gestión de pedidos en mesa (cocina y bar)** íntegramente en la app:
  - `/waiter/kitchen` — vista de cocina con todos los ítems de comida en curso, agrupados por pedido o por mesa. Colores por tiempo de espera (azul → teal → ámbar → rojo). Filtro "Listos" para servicio.
  - `/waiter/bar` — vista equivalente para bebidas.
  - Los camareros deslizan cada ítem para avanzar su estado (`pendiente → en preparación → listo → servido`) con gestos de puntero.

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

## Stack Tecnológico

| Tecnología | Versión | Uso |
|------------|---------|-----|
| Next.js | 16.0.10 (Turbopack) | Framework full-stack |
| React | 19.2.0 | UI Library |
| TypeScript | 5.x | Tipado estático |
| Supabase | ^2.95.3 | BBDD + Auth |
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

## Seguridad

Documentación completa en [`docs/context/security.md`](docs/context/security.md).

| Área | Implementación |
|------|----------------|
| **Autenticación** | JWT HS256 en cookie HttpOnly + SameSite strict, jti claim, 24h expiry, runtime guard en secret |
| **JWT Revocation** | Verificada en proxy (API) y `verifyToken` (pages SSR). Fail-closed en producción |
| **Autorización** | `proxy.ts` verifica JWT e inyecta `x-empresa-id` por tenant |
| **CSRF** | Token HMAC-SHA256 verificado con `timingSafeEqual`, Cache-Control no-store |
| **CSP** | Nonce criptográfico por request en `proxy.ts`, sin `unsafe-inline` en scripts |
| **Rate limiting** | Upstash Redis — 5/15min login (fail-closed en prod), 20/min público, 60/min admin |
| **Env validation** | `instrumentation.ts` → `validateEnv()` al startup, falla fatal en producción |
| **Validación** | Zod `safeParse` + try/catch en `request.json()` + max-length en todos los DTOs |
| **Uploads** | Validación MIME + magic bytes + tamaño + path seguro (slug desde DB) |
| **Multi-tenant** | Aislamiento por `empresaId` en cada query, RLS + service_role |
| **Mínimo privilegio** | Endpoints públicos usan `empresaPublicRepository` (anon key) para lecturas |
| **XSS emails** | `escapeHtml()` en todos los templates HTML, logging centralizado sin PII |
| **Price tampering** | Total recalculado server-side + rechazo de productos desconocidos (`PRODUCT_NOT_FOUND`) |
| **Anti-enumeración** | Login devuelve mensaje genérico para todos los tipos de fallo auth |
| **RBAC** | `requireRole(request, ['admin'])` en todos los handlers mutativos de `/api/admin/*` |
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
// Autenticación — obligatorio en todas las rutas /api/admin/*
const { empresaId, error: authError } = await requireAuth(request);
if (authError) return authError;

// Respuestas consistentes
return successResponse(data);             // 200 OK
return successResponse(data, 201);        // 201 Created
return errorResponse('msg', 404);         // 404 Not Found
return validationErrorResponse('msg');    // 400 Bad Request
return handleResult(result);             // automático desde Result<T> (mapea error codes a HTTP status)
```

`handleResult` mapea automáticamente códigos de error a HTTP status:
- `VALIDATION_ERROR` → 400, `AUTH_*` → 401, `*_NOT_FOUND` → 404, otros → 500

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

El sistema soporta dos roles:

| Rol | Descripción | Acceso |
|-----|-------------|--------|
| `admin` | Admin de empresa | Panel admin de su empresa, solo datos de su tenant |
| `superadmin` | Super Admin | Panel superadmin, acceso a TODAS las empresas |

El rol se define en la columna `rol` de la tabla `perfiles_admin`:
- `admin` → redirige a `/admin`
- `superadmin` → redirige a `/superadmin`

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
| `perfiles_admin` | id (uuid) | empresa_id → empresas (nullable) | → auth.users, `rol` = 'admin' o 'superadmin' |
| `categorias` | id (uuid) | empresa_id → empresas | categoria_padre_id, categoriaComplementoDe |
| `productos` | id (uuid) | empresa_id, categoria_id | i18n: titulo_es/en/fr/it/de |
| `clientes` | id (uuid) | empresa_id | telefono único por empresa |
| `pedidos` | id (uuid) | empresa_id, cliente_id | numero_pedido (atómico por tenant), detalle_pedido: JSON (PedidoItem[]), **codigo_descuento_id, descuento_porcentaje, total_sin_descuento**, **mesa_id, sesion_id, estado** |
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

# Cloudflare R2
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=images
NEXT_PUBLIC_R2_DOMAIN=https://imagenes.tudominio.com
CLOUDFLARE_API_TOKEN=xxx                           # opcional, fallback a AWS SDK

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
| **Waiter Panel** | Panel PIN-auth en /waiter. Grid de mesas, ciclo de sesión open/close, ítems diferidos, pago manual. WaiterBanner sticky global con badges de cocina y bar en tiempo real. |
| **Kitchen & Bar In-App** | `/waiter/kitchen` y `/waiter/bar`: vistas en tiempo real para gestión de ítems sin Telegram. Estados por ítem: pendiente → en_preparacion → preparado → servido (swipe gestual). Colores por tiempo de espera (oklch, 6 rangos). GroupBy por pedido o por mesa. Filtro "Listos". Retenidos con sección propia. Badges con counts en WaiterBanner (neutral/verde/naranja). |
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

---

## Deployment (Vercel)

1. Conectar repo a Vercel
2. Configurar todas las variables de entorno
3. Framework Preset: Next.js
4. Deploy automático en push a `main`

> Next.js 16 usa Turbopack — es normal ver "Skipping validation of types" en el build.
