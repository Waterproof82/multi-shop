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
│  3. Intentar abrir hasta 5 veces (5s interval) │
│  4. Fallback: enlace manual guardado              │
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

### Opening Logic

```typescript
// Detection
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// Mobile: Direct redirect
if (isMobile) {
  globalThis.location.href = `https://wa.me/${numeroLimpio}?text=${textoEncoded}`;
} 
// Desktop: Try popup, fallback to redirect
else {
  const urlWaMe = `https://wa.me/${numeroLimpio}?text=${textoEncoded}`;
  const nuevaPestana = globalThis.open(urlWaMe, '_blank', 'noopener,noreferrer');
  if (!nuevaPestana) {
    globalThis.location.href = urlWaMe;
  }
}
```

### Retry Strategy

El pedido se guarda PRIMERO, luego se intenta abrir WhatsApp con reintentos:

```typescript
const maxAttempts = 5;
let attempts = 0;

const tryOpenWhatsApp = () => {
  attempts++;
  console.log(`[WhatsApp] Intento ${attempts}/${maxAttempts}`);
  abrirWhatsApp(numero, mensaje);
};

// Reintentos cada 5 segundos
const retryInterval = setInterval(() => {
  if (attempts >= maxAttempts) {
    clearInterval(retryInterval);
    setConfirming(false);
  } else {
    tryOpenWhatsApp();
  }
}, 5000);

// Cleanup después de maxAttempts * 5s
setTimeout(() => {
  clearInterval(retryInterval);
  setConfirming(false);
}, maxAttempts * 5000 + 1000);
```

### Manual Fallback

Siempre se guarda el enlace de WhatsApp para uso manual:

```typescript
(globalThis as Record<string, unknown>).__whatsappLink = data.whatsappLink;

const getWhatsAppUrl = (): string | null => {
  const link = (globalThis as Record<string, unknown>).__whatsappLink as string | undefined;
  return link || null;
};
```

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
3. **POST /api/pedidos** → Guardar en BD, generar WhatsApp link
4. **Response received** → Guardar `numeroPedido`, `whatsappLink`
5. **Show success dialog** → `setSent(true)`
6. **Start WhatsApp retries** → 5 attempts, 5s interval
7. **User confirms** → Dialog closes, cart clears
8. **If failed** → Manual link available in dialog

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
3. **Retry on cold start**: WhatsApp Desktop puede tardar 10+ segundos en abrirse si está cerrado
4. **Manual fallback**: El enlace siempre está guardado para uso manual si los reintentos fallan
5. **No blocking**: `window.open()` con popup blocker fallback a `location.href`

## Testing Checklist

- [ ] Pedido se guarda en BD aunque WhatsApp falle
- [ ] Número de pedido se muestra en el diálogo
- [ ] WhatsApp abre en móvil (iOS/Android)
- [ ] WhatsApp abre en desktop (primera vez, app cerrada)
- [ ] WhatsApp abre en desktop (app ya abierta)
- [ ] Reintentos funcionan (ver logs en consola)
- [ ] Enlace manual funciona si todo falla

---

## Legacy: Token JWT de Acceso

El proxy (`src/proxy.ts`) aún soporta un flujo legacy con tokens JWT:
- URL: `https://tudominio.com/?access=TOKEN_JWT`
- Establece cookie `access_token` (HttpOnly, 15 min)
- Script: `scripts/generate-token.ts`

Este flujo **ya no controla la visibilidad del carrito** — el subdominio es el mecanismo activo.
