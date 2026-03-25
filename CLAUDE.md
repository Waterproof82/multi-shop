CLAUDE.md - Contexto del proyecto multi_shop
Reglas globales
Usar context7 para documentacion de librerias externas antes de generar codigo
Idioma del codigo: ingles (variables, tipos). Idioma del negocio: espanol (campos DB, UI)
⚠️ REGLA DE ORO — Verificacion obligatoria tras cada cambio
> Despues de CADA modificacion — sin excepcion — ejecutar:
```bash
pnpm lint && pnpm build
```
No marcar ninguna tarea como completada hasta que ambos comandos pasen sin errores.
Si alguno falla, corregirlo ANTES de continuar.
---
Stack
Next.js 16 + React 19 + TypeScript + Supabase + Tailwind CSS v4 + Cloudflare R2 + Upstash Redis
---
Arquitectura - Clean Architecture
```
API Route (Zod + requireAuth) → Use Case (logica) → Repository (Supabase/R2)
```
Capa	Ubicacion	Responsabilidad
Domain	`core/domain/`	Entidades (`types.ts`), interfaces repos, constantes, tipos de error
Application	`core/application/`	DTOs (Zod), Use Cases, Mappers
Infrastructure	`core/infrastructure/`	Repos Supabase, logger, API helpers, storage R2, env validation
Reglas inquebrantables:
NUNCA acceder a DB desde API routes ni pages — siempre Use Case → Repository
NUNCA llamar `createClient()` fuera de `supabase-client.ts` — usar singletons
NUNCA tipar con `any` — usar `Record<string, unknown>` o tipos de dominio
NUNCA verificar JWT manual en pages — usar `authAdminUseCase.verifyToken(token)`
NUNCA duplicar utils — importar desde su ubicacion canonica
---
SOLID — Checklist
SRP: Cada clase/funcion tiene una unica responsabilidad
OCP: Extension por composicion, nunca modificacion
LSP: Implementaciones de repos son sustituibles por sus interfaces
ISP: Interfaces pequenas y especificas (ver `I*Repository`)
DIP: Use cases dependen de `IRepository`, nunca de implementaciones concretas
```typescript
// ✅ CORRECTO — depende de abstraccion
export class ProductUseCase {
  constructor(private readonly productRepo: IProductRepository) {}
}

// ❌ INCORRECTO — depende de implementacion concreta
const supabase = createClient(url, key); // fuera de supabase-client.ts
```
---
Patron Result<T> (todo el codebase)
```typescript
// types.ts — discriminated union para errores
type Result<T, E = AppError> = { success: true; data: T } | { success: false; error: E };

interface AppError {
  code: string; message: string; module: ErrorModule;
  method?: string; severity?: ErrorSeverity; details?: Record<string, unknown>;
}
```
Flujo completo en un ejemplo:
```typescript
// Repository → retorna Result
async findAllByTenant(empresaId: string): Promise<Result<Product[]>> {
  try {
    const { data, error } = await supabase.from('productos').select('*').eq('empresa_id', empresaId);
    if (error) {
      await logger.logAndReturnError('DB_SELECT_ERROR', error.message, 'repository', 'findAllByTenant', { empresaId });
      return { success: false, error: { code: 'DB_ERROR', message: 'Error al obtener productos', module: 'repository' } };
    }
    return { success: true, data };
  } catch (e) {
    return { success: false, error: await logger.logFromCatch(e, 'repository', 'findAllByTenant', { empresaId }) };
  }
}

// Use Case → propaga Result
async getAll(empresaId: string): Promise<Result<Product[]>> {
  const result = await this.productRepo.findAllByTenant(empresaId);
  if (!result.success) return result;
  return { success: true, data: result.data };
}

// API Route → valida con Zod, usa handleResult
export async function GET(request: NextRequest) {
  const { empresaId, error } = await requireAuth(request);
  if (error) return error;
  return handleResult(await productUseCase.getAll(empresaId!));
}
```
---
API Error Codes (centralized in `core/domain/constants/api-errors.ts`)
```typescript
AUTH_ERRORS.UNAUTHORIZED    → { code: 'AUTH_001', message: 'Authentication required' }
AUTH_ERRORS.INVALID_TOKEN   → { code: 'AUTH_002', message: 'Invalid or expired token' }
AUTH_ERRORS.FORBIDDEN       → { code: 'AUTH_003', message: 'Access denied' }
AUTH_ERRORS.CSRF_REQUIRED   → { code: 'AUTH_004', message: 'CSRF token required' }
AUTH_ERRORS.CSRF_INVALID    → { code: 'AUTH_005', message: 'Invalid CSRF token' }
VALIDATION_ERRORS.MISSING_FILE      → { code: 'VAL_002', message: 'No file provided' }
VALIDATION_ERRORS.FILE_TOO_LARGE    → { code: 'VAL_003', message: 'File exceeds maximum size' }
VALIDATION_ERRORS.INVALID_FILE_TYPE → { code: 'VAL_004', message: 'File type not allowed' }
SERVER_ERRORS.CONFIG_ERROR   → { code: 'SRV_002', message: 'Server configuration error' }
SERVER_ERRORS.STORAGE_ERROR  → { code: 'SRV_003', message: 'Storage configuration error' }
SERVER_ERRORS.DATABASE_ERROR → { code: 'SRV_004', message: 'Database error' }
SERVER_ERRORS.UPLOAD_ERROR   → { code: 'SRV_005', message: 'Error processing upload' }

// Usage:
import { createErrorResponse } from '@/core/domain/constants/api-errors';
return NextResponse.json(createErrorResponse(AUTH_ERRORS.UNAUTHORIZED), { status: 401 });
```
---
Imports principales
```typescript
// Use Cases y repos
import {
  productUseCase, categoryUseCase, clienteUseCase, empresaUseCase,
  pedidoUseCase, promocionUseCase, authAdminUseCase,
  empresaRepository,        // service role (admin)
  empresaPublicRepository,  // anon key (paginas publicas)
} from '@/core/infrastructure/database';

// API helpers
import { requireAuth, successResponse, errorResponse, validationErrorResponse, handleResult, handleResultWithStatus } from '@/core/infrastructure/api/helpers';

// DTOs Zod
import { createProductSchema } from '@/core/application/dtos/product.dto';

// Tipos de dominio
import type { Product, Category, Empresa, Pedido, PedidoItem, Cliente } from '@/core/domain/entities/types';

// Logger
import { logger } from '@/core/infrastructure/logging/logger';

// Dominio/multi-tenant
import { parseMainDomain, getDomainFromHeaders } from '@/lib/domain-utils';

// Constantes
import { DEFAULT_EMPRESA_COLORES, DEFAULT_PEDIDOS_SUBDOMAIN } from '@/core/domain/constants/empresa-defaults';
import { PEDIDO_ESTADOS, PEDIDO_ESTADO_LABELS, PEDIDO_ESTADO_COLORS } from '@/core/domain/constants/pedido';
import { AUTH_ERRORS, VALIDATION_ERRORS, SERVER_ERRORS, createErrorResponse } from '@/core/domain/constants/api-errors';

// Supabase singletons
import { getSupabaseClient, getSupabaseAnonClient } from '@/core/infrastructure/database/supabase-client';

// Storage R2
import { getS3Client, getR2Config, deleteImageFromR2 } from '@/core/infrastructure/storage/s3-client';

// HTML seguro para emails
import { escapeHtml } from '@/lib/html-utils';

// CSRF
import { generateCsrfToken, validateCsrfToken } from '@/lib/csrf';
```
---
Use Cases — metodos disponibles
Use Case	Metodos
ProductUseCase	`getAll`, `create`, `update`, `delete`
CategoryUseCase	`getAll`, `create`, `update`, `delete`
ClienteUseCase	`getAll`, `create`, `update`, `delete`, `togglePromoSubscription`
EmpresaUseCase	`getById`, `update`, `updateColores`
PedidoUseCase	`getAll`, `create`, `updateStatus`, `getStats`, `delete`
PromocionUseCase	`getAll`, `create`
AuthAdminUseCase	`login`, `verifyToken`
GetMenuUseCase	`execute` (menu publico con productos y categorias)
---
Logger
```typescript
await logger.logAndReturnError(code, msg, module, method, opts); // crea AppError + loguea
await logger.logFromCatch(error, module, method, opts);          // catch blocks, captura stack
await logger.logError({ code, message, module });                // logging basico
```
---
Base de datos (Supabase)
Tabla	Claves	Notas
`empresas`	PK: id	dominio, subdomain_pedidos, colores, logo_url, slug, contacto (fb, instagram, url_mapa, direccion, telefono_whatsapp)
`perfiles_admin`	PK: id, FK: empresa_id	enlaza con auth.users
`categorias`	PK: id, FK: empresa_id	categoria_padre_id, categoriaComplementoDe
`productos`	PK: id, FK: empresa_id, categoria_id	i18n: titulo_es/en/fr/it/de
`clientes`	PK: id, FK: empresa_id	telefono unico por empresa
`pedidos`	PK: id, FK: empresa_id, cliente_id	detalle_pedido: JSON array de PedidoItem; numero_pedido: entero atomico por tenant (via `get_next_pedido_number()`)
`promociones`	PK: id, FK: empresa_id	imagen_url, numero_envios
`log_errors`	PK: id, FK: empresa_id	logging centralizado (codigo, mensaje, modulo, metodo, severity, metadata JSONB)
Trampas de datos:
`pedidos` NO tiene columna `telefono` — el telefono esta en `clientes`
`detalle_pedido[].complementos` almacena objetos `{ name, price }` (tipo `PedidoComplemento`)
Repositories devuelven camelCase (dominio). APIs admin transforman a snake_case para el frontend
---
Seguridad — Reglas para desarrollo
> Referencia completa: `docs/context/security.md`

Reglas obligatorias:
- JWT en cookies HttpOnly, `Secure` (prod), `SameSite: strict`, claim `jti` para revocacion
- JWT revocation verificada en proxy (API) Y en `verifyToken` (pages SSR) — ambos llaman `isTokenRevoked(jti)`
- Secrets leidos lazy (nunca constantes a nivel de modulo): `getTokenSecret()`, `getAdminTokenSecret()`
- Zod `safeParse` en TODAS las API routes — NUNCA `parse` (lanza excepciones)
- `request.json()` SIEMPRE envuelto en try/catch dedicado — retornar 400, no 500
- `escapeHtml()` en emails — nunca insertar input de usuario directo en HTML
- Colores: validar `#RRGGBB` con regex
- Telefono: validar con `/^\+?[0-9\s\-()]+$/`
- URLs: validar `https://` en DTOs (fb, instagram, logo_url, url_mapa, foto_url, imagen_url)
- No hardcodear secrets ni URLs de fallback
- URLs base: derivar del request (`new URL(request.url)`), NUNCA de env vars
- CSRF validado en proxy para todos los metodos mutativos de `/api/admin/*`
- CSRF token endpoint con `Cache-Control: no-store, private`
- Magic bytes en uploads — verificar firma binaria, no solo MIME
- Total server-side: `PedidoUseCase.create` recalcula total desde DB — rechaza productos/complementos no encontrados con `PRODUCT_NOT_FOUND`
- RLS: anon denegado en pedidos, clientes, log_errors, perfiles_admin, promociones. Escrituras via service_role
- Minimo privilegio: endpoints publicos usan `empresaPublicRepository` (anon key) para lecturas
- IP real: usar `cf-connecting-ip` o primer entry de `x-forwarded-for` — NUNCA el ultimo
- Rate limiting: login 5/15min (fail-closed en prod), publico 20/min, admin 60/min
- Token revocation: fail-closed en produccion (Redis caido = tokens tratados como revocados)
- Login: mensaje generico para todos los fallos auth (previene enumeracion de usuarios)
- No loguear PII (emails) en errores — solo datos anonimizados
- Max-length en todos los DTOs: titulos 200, descripciones 2000, nombres 200, direcciones 500
- JSON-LD sanitizado con escape de `<`, `>`, `&`
- Cart tokens: proxy valida `aud: 'cart-access'` — al generar usar `.setAudience('cart-access')`
- `handleResult()` mapea error codes a HTTP status (400, 401, 404, 500)

Validacion de env vars al startup (`src/instrumentation.ts` → `validateEnv()`):
- Produccion: falla fatal si faltan secrets criticos
- Desarrollo: warnings para vars recomendadas en produccion

Variables de entorno obligatorias:
- `ACCESS_TOKEN_SECRET` — firma JWT
- `CSRF_HMAC_SECRET` — firmar tokens CSRF
- `CART_TOKEN_SECRET` — JWT de acceso al carrito (requiere `aud: 'cart-access'`)
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — rate limiting + JWT revocation (produccion)
- `CORS_ALLOWED_DOMAINS` — whitelist de dominios para CORS (produccion)
---
Multi-tenant y subdominios
Dominio	Comportamiento
`midominio.com`	Menu sin carrito
`pedidos.midominio.com`	Menu + carrito
`midominio-pedidos.com`	Menu + carrito (alternativa)
Empresa se resuelve siempre por `dominio` principal → `parseMainDomain(domain)`
Carrito activo si host coincide con `subdomain_pedidos`
---
Proxy y autenticacion
`src/proxy.ts` autentica JWT para `/api/admin/*` e inyecta headers:
`x-empresa-id` — ID del tenant (leido por `requireAuth`)
`x-admin-id` — ID del admin
`x-admin-rol` — Rol del admin
Rutas publicas (sin JWT): `/api/admin/login`, `/api/admin/logout`, `/api/unsubscribe`, `/api/admin/promociones/unsubscribe`
> Si agregas nuevas rutas publicas en admin, agregarlas al proxy en `isPublicRoute`
Auth en pages del admin:
```typescript
const cookieStore = await cookies();
const token = cookieStore.get('admin_token')?.value;
if (!token) redirect('/admin/login');
const admin = await authAdminUseCase.verifyToken(token);
if (!admin) redirect('/admin/login');
// admin.empresaId, admin.empresa, admin.nombreCompleto
```
---
Subsistemas
Imagenes (R2 / Cloudflare)
Optimizacion en cliente: 480x480, WebP, 80% (`components/ui/image-uploader.tsx`)
Upload server-side: `POST /api/admin/upload-image` → Cloudflare API o AWS SDK S3
`empresaSlug` derivado de DB, nunca del cliente
URLs: `https://{R2_DOMAIN}/{slug}/{anio}/{mes}/{uuid}.webp`
`deleteImageFromR2(url)` para borrar imagenes del bucket
Email (Brevo)
`lib/brevo-email.ts` — envio de emails transaccionales via Brevo API
Usado en promociones y confirmacion de pedidos
Siempre escapar texto con `escapeHtml()` antes de insertar en HTML
Internacionalizacion (i18n)
`lib/translations.ts` — diccionario de traducciones (es/en/fr/it/de)
`lib/language-context.tsx` — contexto React para idioma activo
Productos: campos i18n `titulo_es`, `titulo_en`, `titulo_fr`, `titulo_it`, `titulo_de`
Todos los textos de UI (incluidos aria-labels) deben usar `t()` — nunca hardcodear texto en un solo idioma
Promociones
POST crea promo y envia emails a clientes suscritos
Imagen se sube a R2, al crear nueva promo se borra la anterior con `deleteImageFromR2`
`texto_promocion` se escapa con `escapeHtml()`
Pedidos (flujo publico)
`POST /api/pedidos` — crea pedido + registra/actualiza cliente (sin auth)
`POST /api/admin/pedidos/enviar-email` — email de confirmacion (con auth)
Logo y Favicon
`logo_url` en tabla `empresas`, gestionado desde `/admin/configuracion`
Favicon dinamico generado desde `logo_url` en `app/layout.tsx`
Cache con `unstable_cache` TTL 5 min
---
Componentes clave
Componente	Ubicacion	Funcion
ImageUploader	`components/ui/`	Upload con preview y optimizacion WebP
ClientMenuPage	`components/`	Pagina publica del menu
CartDrawer	`components/`	Carrito lateral (solo subdomain pedidos)
SiteFooter	`components/`	Footer con logo, contacto, redes, mapa
PromoNotification	`components/`	Banner unsub/sub (query params)
AdminSidebar	`app/admin/(protected)/`	Navegacion lateral admin
EmpresaDatosForm	`components/admin/`	Formulario datos empresa
ColoresForm	`components/admin/`	Formulario colores con preview
---
Antipatrones — NO hacer
`createClient()` fuera de `supabase-client.ts`
Acceder a DB desde routes/pages sin Use Case
Verificar JWT manual (`jwtVerify`) en pages
Duplicar `parseMainDomain` / `getDomainFromHeaders`
Usar `telefono` en tabla pedidos (no existe)
Insertar inputs de usuario directo en HTML de emails
Tipar con `any`
`throw new Error` en repositories (usar `Result<T>` + logger)
Crear nuevos clientes S3/Supabase (usar singletons)
Derivar `baseUrl` de env vars (derivar del request)
Usar `parse` de Zod en vez de `safeParse` (lanza excepciones no controladas)
Llamar `request.json()` sin try/catch dedicado — siempre envolver y retornar 400
Hardcodear colores de marca en componentes (usar CSS variables del tenant)
Confiar en el total enviado por el cliente en pedidos — `PedidoUseCase.create` recalcula y rechaza productos desconocidos
Aceptar precios del cliente si el producto no existe en DB — retornar `PRODUCT_NOT_FOUND`
Usar el ultimo entry de `x-forwarded-for` como IP del cliente — usar el primero (o `cf-connecting-ip`)
Leer secrets como constantes a nivel de modulo (`const SECRET = process.env.X`) — usar funciones lazy
Usar `empresaRepository` (service role) en endpoints publicos — usar `empresaPublicRepository` (anon key)
Loguear PII (emails, telefonos) en errores — usar datos anonimizados
Crear schemas sin max-length — todos los strings deben tener `.max()` apropiado
Retornar mensajes de error distintos por tipo de fallo en login — mensaje generico para prevenir enumeracion
Usar `includes('-pedidos')` para detectar subdominios — usar `endsWith('-pedidos')`
Hardcodear texto de UI en un solo idioma — usar `t()` de translations (incluidos aria-labels, botones, placeholders)
Usar `focus-visible:outline-*` para focus rings — usar patron estandar `outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
Crear botones interactivos menores de 44px — todos los touch targets deben tener `min-h-[44px] min-w-[44px]`
Ignorar `prefers-reduced-motion` — usar `useReducedMotion()` de framer-motion o `motion-reduce:` de Tailwind
---
Proceso de revision — Orden de prioridad
Cuando revises o modifiques codigo, seguir este orden antes de dar la tarea por completada:
Violaciones de capas — ¿Alguna route/page accede a DB directamente?
Tipos — ¿Hay `any`? Reemplazar por tipos de dominio
Validacion — ¿Todas las routes usan Zod `safeParse`? ¿`request.json()` en try/catch? ¿Max-length en strings?
Auth — ¿Todas las rutas admin usan `requireAuth()`? ¿Nuevas rutas publicas en `isPublicRoute`?
Result pattern — ¿Use cases y repos retornan `Result<T, E>`? ¿Ningun `throw` suelto?
Seguridad — ¿Secrets leidos lazy? ¿URLs con `https://`? ¿Sin PII en logs? ¿Endpoints publicos usan anon client?
SOLID — ¿Alguna clase tiene mas de una responsabilidad? ¿DIP respetado?
DRY — ¿Hay logica duplicada que pertenece a un util o helper canonico?
UI/UX — Focus rings (`ring-2`), reduced-motion, ARIA labels (traducidos con `t()`), CSS variables (no colores hardcodeados), touch targets 44px
`pnpm lint && pnpm build` ← OBLIGATORIO antes de marcar como completado
---
Comandos
```bash
pnpm dev    # Desarrollo (Turbopack)
pnpm build  # Build — ignorar "Skipping validation of types", es normal en Next.js 16
pnpm lint   # Lint
```
---
Design Context
Users
Duenos de restaurantes/tiendas: Gestionan menu, pedidos, clientes y configuracion desde el panel admin. Necesitan una interfaz clara, profesional y eficiente.
Clientes finales: Ven el menu digital y hacen pedidos principalmente desde movil. Necesitan una experiencia rapida, intuitiva y atractiva.
Ambos perfiles son igual de importantes. El diseno debe funcionar excelente para admin y publico.
Brand Personality
Profesional, confiable, premium
Tono: Serio pero accesible. Transmite calidad y confianza como un SaaS de gama alta.
La interfaz debe sentirse como una herramienta profesional, no como un proyecto amateur.
Aesthetic Direction
Paleta neutra y adaptable: Base neutra (grises, blancos calidos, negros suaves) que cada empresa personaliza desde admin > configuracion con sus propios colores de marca.
No forzar una tematica visual especifica (ej: italiana) — la plataforma es generica y multi-tenant.
Anti-referencias: Interfaces recargadas, colores chillones por defecto, disenos que parezcan plantillas genericas.
Referencias: Apps SaaS premium (Linear, Stripe, Vercel) para admin. Apps de delivery limpias (estilo carta digital moderna) para publico.
Tipografia: Inter para cuerpo, Playfair Display para acentos en headings del menu publico (aporta elegancia sin dominar). Admin usa solo Inter.
Light mode como default. Dark mode en admin.
Design Principles
Neutral by default, branded by choice — La base es neutra y elegante. Los colores de marca del tenant se aplican solo en puntos estrategicos (botones primarios, acentos, header). Nunca hardcodear colores de marca en componentes.
Mobile-first, always — El 80%+ de clientes finales usa movil. Cada decision de diseno se valida primero en 375px.
Clarity over decoration — Preferir whitespace y jerarquia tipografica clara sobre ornamentos. Si un elemento no ayuda al usuario a completar su tarea, eliminarlo.
Consistent token usage — SIEMPRE usar CSS variables/tokens del design system. Nunca hardcodear colores (`bg-black`, `text-blue-400`, etc.). Los componentes deben respetar el tema del tenant.
Accessible by default (WCAG AA) — Contraste minimo 4.5:1, navegacion por teclado, aria-labels en elementos interactivos, soporte para reduced-motion.
UI Polish — Estandar minimo para cada componente
Focus states: `outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` en todos los elementos interactivos
Hover states: Transiciones de 150ms con `ease-out`
Active states: Efecto `scale-[0.98]` para feedback tactico
Animaciones: Solo `transform` y `opacity` — nunca propiedades que causen layout/paint
Reduced motion: Respetar `prefers-reduced-motion` en todas las animaciones (Framer Motion `useReducedMotion()` y CSS `motion-reduce:`)
Empty states: Con icono y mensaje explicativo util, nunca listas o tablas vacias sin contexto
Content visibility: Secciones largas del menu usan `content-visibility: auto`
Touch targets: Minimo 44x44px en todos los elementos interactivos (`min-h-[44px] min-w-[44px]`)
ARIA switches: Toggles custom deben tener `role="switch"` y `aria-checked`
```tsx
// Patron Button con polish completo
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-all duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]',
      },
    },
  }
);

// Framer Motion con reduced-motion
const shouldReduceMotion = useReducedMotion() ?? false;
const variants = shouldReduceMotion
  ? { initial: {}, animate: {} }
  : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } };
```
