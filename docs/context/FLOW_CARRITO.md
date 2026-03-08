# Documentación del Flujo de Acceso al Carrito

Este documento describe el mecanismo para mostrar u ocultar la funcionalidad del carrito de compras basado en **subdominios**.

## Objetivo
El carrito de compras y los botones de "Añadir" solo se muestran cuando el usuario accede desde el subdominio de pedidos configurado para la empresa.

## Flujo Completo

### 1. Detección por Subdominio (mecanismo principal)

En `src/app/page.tsx`, el servidor determina si mostrar el carrito:

```typescript
const subdomainConfig = empresa?.subdomainPedidos ?? 'pedidos';
const isPedidos = isPedidosSubdomain(fullDomain, subdomainConfig);
const mostrarCarritoEmpresa = empresa?.mostrarCarrito ?? false;
const showCart = isPedidos || mostrarCarritoEmpresa;
```

**Lógica:**
- Si el usuario visita `pedidos.midominio.com` (o el subdominio configurado) → `showCart = true`
- O si la empresa tiene `mostrar_carrito = true` en la DB → `showCart = true`
- En caso contrario → `showCart = false`

### 2. Resolución de Empresa

| Dominio | Comportamiento |
|---------|----------------|
| `midominio.com` | Menú sin carrito |
| `pedidos.midominio.com` | Menú + carrito |
| `midominio-pedidos.com` | Menú + carrito (alternativa) |

- La empresa se resuelve siempre por el `dominio` principal (sin subdominio)
- Se usa `parseMainDomain(domain)` de `lib/domain-utils.ts` para extraer el dominio principal
- El carrito se activa si el host actual coincide con `subdomain_pedidos` de la empresa

### 3. Renderizado del Servidor (SSR)

En `src/app/page.tsx`:
1. El servidor obtiene el dominio completo del request
2. Extrae el dominio principal y busca la empresa en Supabase (via `getEmpresaByDomain`)
3. Compara el dominio completo con `subdomain_pedidos` de la empresa
4. Pasa la prop `showCart={true/false}` al componente cliente `MenuPage`

### 4. Interfaz de Usuario (Cliente)

En los componentes del menú:
- **Si `showCart` es false:**
  - El botón flotante del carrito no se renderiza
  - Los botones "Añadir al carrito" en cada producto están ocultos
  - La interacción de compra está deshabilitada
- **Si `showCart` es true:**
  - Se muestra la interfaz de compra completa

### 5. Cart Context (estado cliente)

En `src/lib/cart-context.tsx`:
- El carrito es estado React puro (no requiere autenticación)
- Se muestra/oculta basado en la prop `showCart` del servidor

## Configuración

### Variables relevantes en la DB (tabla `empresas`)

| Columna | Descripción |
|---------|-------------|
| `dominio` | Dominio principal de la empresa |
| `subdomain_pedidos` | Subdominio que activa el carrito (ej: `pedidos.midominio.com`) |
| `mostrar_carrito` | Flag para mostrar carrito en el dominio principal |

### Utilidades de dominio

```typescript
// lib/domain-utils.ts
import { parseMainDomain, getDomainFromHeaders } from '@/lib/domain-utils';

const domain = await getDomainFromHeaders();   // extrae host del request
const mainDomain = parseMainDomain(domain);    // elimina subdominio pedidos
```

## Legacy: Token JWT de Acceso

El proxy (`src/proxy.ts`) aún soporta un flujo legacy con tokens JWT:
- URL: `https://tudominio.com/?access=TOKEN_JWT`
- Establece cookie `access_token` (HttpOnly, 15 min)
- Script: `scripts/generate-token.ts`

Este flujo **ya no controla la visibilidad del carrito** — el subdominio es el mecanismo activo.
