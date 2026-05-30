# Delivery — Glovo Business LaaS + Redsys TPV

Sistema de delivery integrado: zona de cobertura configurable, cotización en tiempo real vía Glovo Business (DH On Demand Rider API), pago online obligatorio vía Redsys TPV Virtual y despacho automático del rider al confirmar el pago.

---

## Arquitectura general

```
Cliente (cart-drawer)
  └─ POST /api/pedidos          → crea pedido con campos delivery + genera tracking token
  └─ POST /api/redsys/initiate  → genera form Redsys + lo auto-submite
       └─ TPV Virtual Redsys
           └─ POST /api/redsys/webhook (notif servidor)
               └─ processRedsysWebhookUseCase
                   ├─ UPDATE pedidos SET payment_status='paid'
                   ├─ createGlovoOrderUseCase  (despacha rider, fire-and-forget)
                   └─ Telegram notification
  └─ Redirect → /pedido/pago-ok?token=XXX → /tracking/XXX
```

---

## 1. Zona de cobertura

### Configuración admin (`/admin/delivery`)

- **Códigos postales habilitados**: lista editable. Si está vacía, delivery deshabilitado.
- **Pedido mínimo (€)**: validado client-side y server-side.
- **Suplemento envío (€)**: cargo fijo adicional por encima de la cotización Glovo.

### Campos en `empresas`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `delivery_postal_codes` | `TEXT[]` | CP habilitados. Vacío = delivery off |
| `delivery_min_order_cents` | `INT` | Pedido mínimo en céntimos |
| `delivery_fee_surcharge_cents` | `INT` | Cargo adicional en céntimos |

### Validación postal code

`DeliveryMethodSelector.tsx` consulta `/api/admin/delivery-zone` (endpoint público con domain-based auth) al seleccionar una dirección Mapbox. Si el CP no está en la lista, muestra error inline y bloquea el botón "Confirmar pedido".

---

## 2. Cotización de envío

### Endpoint público

```
POST /api/glovo/quote
```

- Auth: domain-based (`getDomainFromHeaders` + `empresaPublicRepository`)
- Rate limit: `rateLimitPublic` (20 req/min por IP)
- Input: `{ address, latitude, longitude, orderTotalCents }`
- Output: `{ feeCents: number, estimatedMinutes: number }`

### Use Case (`getDeliveryQuoteUseCase`)

1. Verifica credenciales Glovo configuradas (`glovo_client_id`, `glovo_key_id`, `glovo_private_key`, `glovo_vendor_id`)
2. Llama a `glovoService.getDeliveryQuote()`
3. Suma `delivery_fee_surcharge_cents` al fee Glovo
4. Retorna fee total + ETA

---

## 3. Creación del pedido con delivery

### Campos adicionales en `pedidos`

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
| `glovo_order_id` | `TEXT` | ID del pedido en Glovo |
| `glovo_status` | `TEXT` | Estado del rider Glovo |

### Flujo en `PedidoUseCase.create()`

- Si `data.origen === 'delivery'` → genera `trackingToken` siempre (independiente del dominio)
- Pasa `deliveryData` al repositorio
- El pedido se crea con `payment_status = 'pending'`

---

## 4. Pago Redsys

### Credenciales por empresa (admin `/admin/delivery`)

| Columna `empresas` | Descripción |
|-------------------|-------------|
| `redsys_merchant_code` | Número de comercio Redsys |
| `redsys_terminal` | Terminal (default: `'001'`) |
| `redsys_secret_key` | Clave HMAC_SHA256_V1 (Base64) |

> Los campos de clave nunca se devuelven en la API de lectura — solo `redsys_secret_key_set: boolean`.

### Flujo de pago

```
1. POST /api/redsys/initiate  { pedidoId }
   → initiateRedsysPaymentUseCase
   → lee pedido de DB (verifica payment_status != 'paid')
   → generatePaymentOrderRef(numeroPedido) → "NNNNxxxxxxxx" (12 chars, 4 dígitos iniciales)
   → UPDATE pedidos SET payment_order_ref, payment_amount_cents, payment_status='pending'
   → genera DS_MERCHANT_PARAMETERS + DS_SIGNATURE (HMAC_SHA256_V1 + 3DES-CBC zero-IV)
   → retorna { Ds_SignatureVersion, Ds_MerchantParameters, Ds_Signature, redsysUrl }

2. cart-drawer crea <form method=POST action=redsysUrl> y lo auto-submite
   → Redirige al TPV Redsys

3. Usuario paga en TPV → Redsys llama webhook

4. POST /api/redsys/webhook  (notificación servidor, no autenticada con JWT)
   → processRedsysWebhookUseCase
   → verifica HMAC firma Redsys
   → Ds_Response '0000'-'0099' = éxito
   → UPDATE payment_status = 'paid'
   → fire-and-forget: createGlovoOrderUseCase + Telegram notification

5. Redsys redirige al navegador:
   → OK: /pedido/pago-ok?token=XXX → redirect /tracking/XXX
   → KO: /pedido/pago-ko
```

### `generatePaymentOrderRef`

```typescript
export function generatePaymentOrderRef(numeroPedido: number): string {
  const prefix = String(numeroPedido).padStart(4, '0').slice(0, 4);
  const suffix = Date.now().toString(36).toUpperCase().slice(-8);
  return `${prefix}${suffix}`.slice(0, 12);
}
```

> Redsys requiere que DS_MERCHANT_ORDER empiece con 4 dígitos numéricos (spec § 2.5).

---

## 5. Despacho Glovo

### Credenciales por empresa

| Columna `empresas` | Descripción |
|-------------------|-------------|
| `glovo_client_id` | Client ID de la cuenta Glovo Business |
| `glovo_key_id` | Key ID del par RS256 |
| `glovo_private_key` | RSA Private Key PEM (≤ 8000 chars) |
| `glovo_vendor_id` | `client_vendor_id` del outlet |
| `glovo_country_code` | Código de país (default: `'es'`) |

> `glovo_private_key` nunca se devuelve en la API — solo `glovo_private_key_set: boolean`.

### API (Delivery Hero On Demand Rider API)

- **Auth**: JWT RS256 Bearer Assertion (auto-renovado cada 50 min, rate limit 120 req/min)
- **Quote**: `POST /api/v1/quote`
- **Create order**: `POST /api/v1/orders`
- **Cancel**: `DELETE /api/v1/orders/{id}`

### `createGlovoOrderUseCase`

Disparado automáticamente por `processRedsysWebhookUseCase` al confirmar el pago:

```typescript
createGlovoOrderUseCase({
  empresaId, pedidoId, clientOrderId,   // DS_MERCHANT_ORDER como referencia
  recipientName, recipientPhone,
  recipientAddress, recipientLatitude, recipientLongitude,
  orderTotal, orderDescription,
})
```

- Guarda `glovo_order_id` en `pedidos`
- El estado del rider se actualiza via webhook Glovo → `POST /api/glovo/webhook`

### Webhook Glovo (`/api/glovo/webhook`)

Maneja actualizaciones de estado del rider:

```typescript
glovo_status = payload.order_id ?? payload.orderId  // snake_case DH API, camelCase fallback
feeCents = payload.delivery_fee * 100               // o payload.fee.total * 100
```

Estados Glovo propagados a `pedidos.glovo_status`: `ASSIGNED`, `PICKUP`, `DELIVERING`, `DELIVERED`, `CANCELLED`.

---

## 6. Componentes UI

### `DeliveryMethodSelector`

```tsx
<DeliveryMethodSelector
  deliveryZone={deliveryZone}   // postal codes, min order, fee config
  onMethodChange={setDeliveryMethod}
  onDeliveryData={setDeliveryData}
/>
```

- Muestra tabs "Recoger en tienda" / "A domicilio"
- Integra Mapbox Search JS React para autocompletar dirección
- Valida CP contra zona de entrega
- Cotiza fee en tiempo real (`/api/glovo/quote`)
- Extrae type con `Parameters<>` trick para evitar dependencia de peer dep:

```typescript
type SearchBoxRetrieveResult = Parameters<
  NonNullable<React.ComponentProps<typeof SearchBox>['onRetrieve']>
>[0];
```

### Cart Drawer (`cart-drawer.tsx`)

Para pedidos delivery:

1. Renderiza `DeliveryMethodSelector`
2. Al confirmar: `POST /api/pedidos` con campos delivery
3. Si éxito y `deliveryMethod === 'delivery'`: `POST /api/redsys/initiate`
4. Auto-submit del form Redsys (JS DOM)
5. No muestra el banner "sin pago requerido" para delivery

### Páginas de resultado

- `/pedido/pago-ok` — Si tiene `?token=` → redirect `/tracking/${token}`. Fallback: pantalla de confirmación.
- `/pedido/pago-ko` — Pantalla de error con link a home.

---

## 7. Variables de entorno requeridas

```env
# Mapbox (dirección selector — frontend)
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJxxx

# Redsys (URL del TPV)
NEXT_PUBLIC_REDSYS_URL=https://sis.redsys.es/sis/realizarPago
# Test: https://sis-t.redsys.es:25443/sis/realizarPago (default si no se define)
```

> Las credenciales Redsys y Glovo se configuran **por empresa** desde el panel admin (`/admin/delivery`), no como variables de entorno.

---

## 8. Configuración en admin

Ruta: `/admin/delivery`

Secciones:
1. **Zona de entrega** — lista de CP, pedido mínimo, suplemento
2. **Glovo Business** — client_id, key_id, private_key (PEM), vendor_id, country_code
3. **Redsys TPV** — merchant_code, terminal, secret_key

Los campos de clave muestran un indicador `✓ guardado` cuando tienen valor en DB. Enviar un campo vacío no sobreescribe el valor existente.

---

## 9. Propagación del `delivery_fee_cents`

El campo se propaga por toda la cadena hasta mostrarse en UI:

```
pedidos.delivery_fee_cents (DB)
  → supabase-pedido.repository.ts (SELECT + map a camelCase)
  → /api/orders/status (GET response)
  → tracking-page-client.tsx (OrderStatus interface + normalizeStatus)
  → <ItemsList deliveryFeeCents={...} />
      → línea "Gastos de envío" + incluido en total mostrado
  → /admin/pedidos (expanded detail)
      → línea "Envío" visible cuando delivery_fee_cents > 0
```

> TRAMPAS: `getOrigenPedido()` recibe ahora un tercer argumento opcional `origen?: string | null`. Si `origen === 'delivery'`, devuelve `'delivery'` antes de comprobar `trackingToken`. Sin este fix, pedidos delivery mostraban badge "Recogida" en admin.

---

## 10. Errores relacionados

| Código | Descripción |
|--------|-------------|
| `GLV_001` | No couriers available right now |
| `GLV_002` | Failed to create Glovo order |
| `GLV_003` | Delivery service is not configured for this store |
| `GLV_004` | Delivery quote has expired |
| `DEL_001` | Postal code not in delivery zone |
| `DEL_002` | Order below minimum for delivery |
| `PAY_001` | Payment already completed |
| `PAY_002` | Invalid Redsys signature |
| `PAY_003` | Redsys not configured for this store |
