# Mermelada de Tomate - Carta Digital Multi-idioma

E-commerce / Carta digital multi-idioma con gestión de pedidos y panel de administración.

## Stack Tecnológico

| Tecnología | Versión | Uso |
|------------|---------|-----|
| Next.js | 16.0.10 | Framework full-stack |
| React | 19.2.0 | UI Library |
| TypeScript | 5.x | Tipado estático |
| Supabase | ^2.95.3 | BBDD + Auth |
| Cloudflare R2 | - | Storage imágenes |
| Tailwind CSS | 4.x | Estilos |
| AWS SDK | ^3.994 | S3/R2 |
| Zod | 3.25.x | Validación schemas |
| jose | 6.x | JWT |

---

## Arquitectura

```
src/
├── app/                      # Next.js App Router
│   ├── actions.ts           # Server Actions
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Página principal
│   ├── admin/              # Panel administración
│   │   ├── (protected)/     # Rutas protegidas
│   │   └── login/
│   └── api/                # API Routes
│
├── core/                    # Clean Architecture
│   ├── domain/             # Entidades e Interfaces
│   │   ├── entities/       # Types
│   │   └── repositories/   # Interfaces
│   │
│   ├── application/        # Use Cases + Actions
│   │   ├── dtos/          # Zod schemas
│   │   ├── use-cases/
│   │   └── actions/
│   │
│   └── infrastructure/    # Implementaciones
│       ├── database/       # Supabase repos
│       └── storage/        # R2 storage
│
├── components/              # Componentes React
│   └── ui/                 # Componentes UI
│
└── lib/                    # Utilidades y contextos
```

---

## Subdominios

### Sistema Multi-tenant

La app detecta subdominios para mostrar el menú o el carrito:

| Dominio | Comportamiento |
|---------|----------------|
| `midominio.com` | Solo menú (sin carrito) |
| `pedidos.midominio.com` | Menú + Carrito de pedidos |
| `midominio-pedidos.com` | Menú + Carrito de pedidos |

### Configuración en BBDD

```sql
-- Tabla empresas
dominio: 'midominio.com'           -- Dominio principal
subdomain_pedidos: 'pedidos'       -- Prefijo subdominio
mostrar_carrito: true/false        -- Forzar mostrar carrito
```

### Lógica de Detección

```typescript
// 1. Extraer dominio del subdominio
parseMainDomain('pedidos.midominio.com') → 'midominio.com'

// 2. Detectar si es subdominio de pedidos
isPedidosSubdomain('pedidos.midominio.com', 'pedidos') → true

// 3. Buscar empresa por dominio
getEmpresaByDomain('midominio.com') → Empresa
```

---

## Imágenes (Cloudflare R2)

### Estructura de Archivos

```
Bucket R2/
└── {empresa-slug}/
    └── {año}/
        └── {mes}/
            └── {uuid}-{filename}.webp
```

**Ejemplo:** `alma-de-arena/2026/3/abc123-logo.webp`

### Proceso de Upload

1. **Cliente** selecciona imagen
2. **Optimización** (cliente):
   - Redimensiona a max 480x480px
   - Convierte a WebP
   - Comprime al 80%
3. **Server Action** genera URL firmada (60 seg)
4. **Upload directo** del navegador a R2
5. **URL pública** guardada en BBDD

### Variables de Entorno (R2)

```env
R2_ACCOUNT_ID=tu_account_id
R2_ACCESS_KEY_ID=tu_access_key
R2_SECRET_ACCESS_KEY=tu_secret_key
R2_BUCKET_NAME=images
NEXT_PUBLIC_R2_DOMAIN=https://tu-dominio.r2.dev
```

### Configurar Dominio Personalizado

1. Cloudflare Dashboard → R2 → tu bucket → Custom Domains
2. Agregar `imagenes.tudominio.com`
3. Actualizar `NEXT_PUBLIC_R2_DOMAIN`

---

## Base de Datos (Supabase)

### Tablas Principales

| Tabla | Descripción | Clave Foránea |
|-------|-------------|---------------|
| `empresas` | Multi-tenant: empresas | PK: `id` |
| `categorias` | Categorías del menú | FK: `empresa_id` |
| `productos` | Productos (i18n) | FK: `empresa_id`, `categoria_id` |
| `clientes` | Clientes registrados | FK: `empresa_id` |
| `pedidos` | Pedidos realizados | FK: `empresa_id`, `cliente_id` |
| `perfiles_admin` | Admin users | FK: `id` → auth.users |
| `promociones` | Promociones email | FK: `empresa_id` |

### Schema Empresas (campos relevantes para footer)

```sql
empresas:
  - id (uuid)
  - nombre (text)
  - dominio (text)
  - logo_url (text)
  - mostrar_carrito (boolean)
  - email_notification (text)
  - telefono_whatsapp (text)
  - direccion (text)
  - fb (text)           -- URL Facebook
  - instagram (text)    -- URL Instagram
  - url_mapa (text)     -- Iframe embed de Google Maps
  - descripcion_es, descripcion_en, ...
```

### SQL: Agregar columnas para footer

```sql
ALTER TABLE empresas 
ADD COLUMN IF NOT EXISTS fb TEXT,
ADD COLUMN IF NOT EXISTS instagram TEXT,
ADD COLUMN IF NOT EXISTS url_mapa TEXT;
```

### Schema Productos (i18n)

```sql
productos:
  - id (uuid)
  - empresa_id (uuid)
  - categoria_id (uuid, nullable)
  - titulo_es, titulo_en, titulo_fr, titulo_it, titulo_de
  - descripcion_es, descripcion_en, ...
  - precio (numeric)
  - foto_url (text, nullable)
  - es_especial (boolean)
  - activo (boolean)
```

---

## Autenticación Admin

### Flujo de Login

1. **Formulario** envía email/password a `/api/admin/login`
2. **Server** verifica credenciales con Supabase Auth
3. **Genera JWT** con `jose` (24h expiry)
4. **Cookie** `admin_token` (HttpOnly, secure)

### Middleware (proxy.ts)

```typescript
// Verifica JWT en todas las rutas /api/admin/*
if (path.startsWith('/api/admin')) {
  const token = request.cookies.get('admin_token');
  const { payload } = await jwtVerify(token);
  
  // Pasa headers a la ruta
  requestHeaders.set('x-empresa-id', payload.empresaId);
}
```

### Protección de Rutas

```typescript
// Extraer empresaId del header (no de params)
const empresaId = request.headers.get('x-empresa-id');
if (!empresaId) return 401;
```

---

## Panel de Administración

### Rutas

- `/admin/login` - Login
- `/admin` - Dashboard
- `/admin/productos` - CRUD productos
- `/admin/categorias` - CRUD categorías
- `/admin/pedidos` - Ver/administrar pedidos
- `/admin/clientes` - Ver clientes
- `/admin/promociones` - Enviar promociones por email
- `/admin/configuracion` - Colores, datos de contacto, redes sociales, mapa

### Características

- **Diseño Responsive**: Sidebar + hamburger en móvil
- **Buscador**: Filtra productos/categorías
- **Ordenamiento**: Click en columnas
- **Subida imágenes**: Optimización automática
- **Promociones**: Email con imagen adjunta

---

## Promociones por Email

### Flujo

1. Admin accede a `/admin/promociones`
2. Escribe el mensaje de promoción
3. Opcional: selecciona imagen local
4. Al guardar: imagen se sube a R2 → se guarda URL en BBDD → se envía email

### Tabla `promociones`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | PK |
| `empresa_id` | uuid | FK → empresas |
| `fecha_hora` | timestamp | Fecha de creación |
| `texto_promocion` | text | Mensaje de la promo |
| `imagen_url` | text | URL de imagen en R2 |
| `numero_envios` | integer | Cantidad de emails enviados |

### Email HTML

- **Logo empresa**: Se obtiene de `empresas.logo_url`
- **Imagen promoción**: Se inserta entre header y mensaje
- **Enlaces de Suscripción/Baja**: URLs absolutas con el `dominio` de la empresa. Personalizadas por cliente (email y acción).

### Limpieza de Imágenes

Al crear una nueva promoción:
1. Se obtiene la promoción anterior
2. Se elimina la imagen anterior de R2
3. Se crea la nueva promoción

Esto evita imágenes huérfanas en el bucket.

---

## Seguridad (OWASP)

### A01: Broken Access Control
- Cookies HttpOnly para token admin
- JWT verificado en middleware
- Validación por empresaId en cada operación

### A02: Cryptographic Failures
- JWT con `jose` y HS256
- Secrets en variables de entorno

### A03: Injection
- Zod validation en todos los DTOs
- Parámetros parametrizados en Supabase

### A05: Security Misconfig
- Solo variables `NEXT_PUBLIC_*` en cliente
- Código server-only marcado con `server-only`

---

## Footer del Sitio

El footer se muestra en el menú público con fondo negro y contiene:

| Campo | Fuente | Descripción |
|-------|--------|-------------|
| Logo | `empresas.logo_url` | Imagen con fondo transparente |
| Descripción | `empresas.descripcion_{idioma}` | Texto multiidioma |
| Facebook | `empresas.fb` | URL completa (ej: https://facebook.com/...) |
| Instagram | `empresas.instagram` | URL completa (ej: https://instagram.com/...) |
| Dirección | `empresas.direccion` | Dirección física |
| WhatsApp | `empresas.telefono_whatsapp` | Link wa.me/... |
| Email | `empresas.email_notification` | Mailto link |
| Mapa | `empresas.url_mapa` | Iframe embed de Google Maps |

### Embed del Mapa

Para obtener la URL del mapa:
1. Ir a Google Maps → buscar la empresa
2. Click en "Compartir" → "Insertar un mapa"
3. Copiar solo la URL del `src` del iframe
4. Pegar en el campo `url_mapa` en configuración

Si no hay `url_mapa` pero hay `dirección`, se muestra un link a Google Maps.

---

## Variables de Entorno

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx

# JWT
ACCESS_TOKEN_SECRET=tu_secret

# R2
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=images
NEXT_PUBLIC_R2_DOMAIN=https://xxx.r2.dev

# Email (Brevo)
BREVO_API_KEY=xxx
```

---

## Comandos

```bash
# Desarrollo
pnpm dev

# Build producción
pnpm build

# Lint
pnpm lint

# Scripts
npx tsx scripts/migrate-r2-folders.ts    # Migrar carpetas R2
npx tsx scripts/migrate-db-urls.ts         # Migrar URLs BBDD
npx tsx scripts/setup-r2-cors.ts          # Configurar CORS R2

# Migraciones BBDD (Supabase)
npx supabase db push                      # Push migraciones locales
```

---

## Estado del Proyecto

| Aspecto | Estado |
|---------|--------|
| **Build** | ✅ Compila correctamente |
| **Lint** | ✅ 0 errores (1 warning menor) |
| **Clean Architecture** | ✅ Domain/Application/Infrastructure |
| **SOLID** | ✅ DIP bien implementado |
| **OWASP** | ✅ JWT, Zod, HttpOnly cookies |
| **Accessibility** | ✅ Labels, keyboard handlers, ARIA roles |

### Build y Bundle
- Bundle optimizado con lazy loading
- Recharts solo carga en `/admin/estadisticas`
- Imágenes optimizadas automáticamente (480x480px, WebP, 80% calidad)

---

## Deployment (Vercel)

1. Conectar repo a Vercel
2. Configurar variables de entorno
3. Framework Preset: Next.js
4. Deploy automático en push a main

### Notas

- Next.js 16 usa Turbopack por defecto
- R2 necesita CORS configurado para uploads directos
- Build puede mostrar "Skipping validation of types" - es normal
