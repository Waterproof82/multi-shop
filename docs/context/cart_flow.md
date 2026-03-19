# Documentación del Flujo de Acceso al Carrito y Pedidos

Este documento describe el mecanismo para mostrar u ocultar la funcionalidad del carrito de compras basado en **subdominios**, y el **flujo completo de pedidos con WhatsApp**.

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

---

# Flujo de Pedidos y WhatsApp

## Arquitectura General

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   CartDrawer    │────▶│  /api/pedidos   │────▶│   Supabase      │
│   (Frontend)    │     │   (API Route)   │     │   (Database)    │
└────────┬────────┘     └────────┬────────┘     └─────────────────┘
         │                        │
         │                        ▼
         │               ┌─────────────────┐
         │               │  WhatsApp Link   │
         │               │   Generation     │
         │               └────────┬────────┘
         │                        │
         ▼                        ▼
┌─────────────────────────────────────────────────┐
│              WhatsApp Opening Flow               │
├─────────────────────────────────────────────────┤
│  1. Guardar pedido en BD (SIEMPRE primero)      │
│  2. Generar WhatsApp link con prefijo 34        │
│  3. Detectar plataforma (mobile vs desktop)     │
│  4. Mobile: wa.me (app nativa)                  │
│  5. Desktop: web.whatsapp.com/send (navegador)  │
│  6. Fallback: enlace manual en diálogo          │
└─────────────────────────────────────────────────┘
```

## API Route: `/api/pedidos`

### POST Request
```typescript
{
  items: Array<{
    item: { id, name, price, translations? }
    quantity: number
    selectedComplements?: Array<{ name, price }>
  }>
  total: number
  nombre: string
  telefono: string
  email?: string
}
```

### POST Response
```typescript
{
  success: true
  numeroPedido: number      // Número de pedido generado
  pedidoId: string          // UUID del pedido
  whatsappLink?: string    // URL de WhatsApp (wa.me/34XXXXXXXXX?text=...)
  companyPhone?: string     // Teléfono de la empresa para fallback
}
```

## WhatsApp Link Generation

```typescript
// En /api/pedidos/route.ts

function generateWhatsAppMessage(items, total, nombre, numeroPedido): string {
  let mensaje = `*Pedido #${numeroPedido}*\n`;
  mensaje += `*Cliente:* ${nombre}\n\n`;
  mensaje += `*PEDIDO:*\n`;
  
  items.forEach((item, index) => {
    mensaje += `${index + 1}. ${item.item.name}`;
    if (item.selectedComplements) {
      mensaje += ` (+${item.selectedComplements.map(c => c.name).join(', ')})`;
    }
    mensaje += ` x${item.quantity}\n`;
  });
  
  mensaje += `\n*TOTAL: ${total.toFixed(2)}€*\n`;
  mensaje += `¿Cuándo puedo pasar a recoger el pedido?`;
  
  return mensaje;
}

// Phone normalization
const telefonoLimpio = telefono.replaceAll(/\D/g, '');
const telefonoConPrefijo = telefonoLimpio.startsWith('34') 
  ? telefonoLimpio 
  : `34${telefonoLimpio}`;

whatsappLink = `https://wa.me/${telefonoConPrefijo}?text=${encodeURIComponent(mensaje)}`;
```

## Frontend: CartDrawer Component

### State Management
```typescript
const [sent, setSent] = useState(false)           // Diálogo abierto
const [confirming, setConfirming] = useState(false) // Modo confirmación
const [orderNumber, setOrderNumber] = useState<number | null>(null)
const [companyPhone, setCompanyPhone] = useState<string | null>(null)
```

### Opening Logic — Estrategia por plataforma

```typescript
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// Genera ambas URLs desde teléfono + mensaje
const buildWhatsAppUrls = (numero, mensaje) => ({
  waMeUrl: `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`,
  webUrl: `https://web.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(mensaje)}`,
});

// Mobile: wa.me → redirect directo a app nativa
if (isMobile) {
  globalThis.location.href = waMeUrl;
}
// Desktop: wa.me → intenta abrir app nativa via window.open
else {
  globalThis.open(waMeUrl, '_blank', 'noopener,noreferrer');
}
```

**Estrategia "intenta app, fallback a web":**
- Se usa `wa.me` siempre como primer intento (respeta la app instalada del usuario)
- Si la app Desktop está abierta → funciona perfecto, mensaje se pre-rellena
- Si la app tarda en arrancar (cold start) y el mensaje se pierde → el diálogo muestra
  un botón "Abrir en WhatsApp Web" que usa `web.whatsapp.com/send` como fallback seguro
- El usuario decide cuál usar, no lo forzamos

| Formato | Desktop | Mobile |
|---------|---------|--------|
| `wa.me` | Intenta app nativa (primer intento) | Abre app directamente |
| `web.whatsapp.com/send` | Siempre abre en navegador (fallback) | No usado |

### Manual Fallback

Se guarda el enlace wa.me original. Para desktop se ofrece un fallback web:

```typescript
(globalThis as Record<string, unknown>).__whatsappLink = data.whatsappLink;

// getWhatsAppUrl() → devuelve wa.me (link universal, intenta app nativa)
// getWhatsAppWebUrl() → convierte a web.whatsapp.com/send (fallback navegador, solo desktop)
```

En el diálogo de confirmación:
- **Botón principal "Reenviar"**: usa `wa.me` (reintenta la app nativa)
- **Botón "Abrir en WhatsApp Web"**: solo visible en desktop, usa `web.whatsapp.com/send` como
  fallback si la app nativa no captó el mensaje por cold start

## Database Schema

### Table: `pedidos`
```sql
id              UUID PRIMARY KEY
empresa_id      UUID REFERENCES empresas
cliente_id      UUID REFERENCES clientes
numero_pedido   INTEGER
total           DECIMAL(10,2)
estado          TEXT DEFAULT 'pendiente'
detalle_pedido  JSONB
created_at      TIMESTAMP
```

### Table: `clientes`
```sql
id                  UUID PRIMARY KEY
empresa_id          UUID REFERENCES empresas
nombre              TEXT
telefono            TEXT UNIQUE
email               TEXT
aceptar_promociones BOOLEAN
numero_pedidos      INTEGER DEFAULT 0
```

## Order Flow Sequence

1. **User fills form** (nombre, telefono, email opcional)
2. **Click "Enviar pedido"** → `handleConfirmOrder()`
3. **POST /api/pedidos** → Guardar en BD, generar WhatsApp link (wa.me)
4. **Response received** → Guardar `numeroPedido`, `whatsappLink`
5. **Open WhatsApp** → Móvil: `wa.me` (redirect), Desktop: `web.whatsapp.com/send` (nueva pestaña)
6. **Show success dialog** → `setSent(true)` con botones de fallback
7. **User confirms** → Dialog closes, cart clears

## Key Files

| File | Purpose |
|------|---------|
| `src/app/api/pedidos/route.ts` | API route, pedido creation, WhatsApp link generation |
| `src/components/cart-drawer.tsx` | Cart UI, form, WhatsApp opening logic |
| `src/lib/cart-context.tsx` | Cart state management |
| `src/core/infrastructure/database/` | Repository pattern for DB access |

## Important Notes

1. **Order first, WhatsApp second**: El pedido se guarda en la BD ANTES de intentar abrir WhatsApp
2. **Phone prefix**: Siempre añade `34` (España) si el número no tiene prefijo internacional
3. **wa.me first, web fallback**: Siempre intenta `wa.me` (respeta app instalada). En desktop, el diálogo ofrece `web.whatsapp.com/send` como fallback si la app no captó el mensaje
4. **No retries**: Sin reintentos automáticos. El usuario decide reenviar si necesita
5. **Manual fallback**: El enlace siempre está disponible en el diálogo de confirmación
6. **No blocking**: `window.open()` en desktop, `location.href` en móvil

## Testing Checklist

- [ ] Pedido se guarda en BD aunque WhatsApp falle
- [ ] Número de pedido se muestra en el diálogo
- [ ] WhatsApp abre en móvil (iOS/Android) via wa.me → app nativa
- [ ] wa.me intenta abrir app nativa en desktop
- [ ] Botón "Reenviar por WhatsApp" usa wa.me (reintenta app)
- [ ] Botón "WhatsApp Web" solo visible en desktop, abre web.whatsapp.com/send
- [ ] Enlace manual funciona si la apertura automática falla

---

## Legacy: Token JWT de Acceso

El proxy (`src/proxy.ts`) aún soporta un flujo legacy con tokens JWT:
- URL: `https://tudominio.com/?access=TOKEN_JWT`
- Establece cookie `access_token` (HttpOnly, 15 min)
- Script: `scripts/generate-token.ts`

Este flujo **ya no controla la visibilidad del carrito** — el subdominio es el mecanismo activo.
