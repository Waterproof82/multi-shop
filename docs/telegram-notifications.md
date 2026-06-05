# Documentación: Notificaciones de Pedidos por Telegram

## Resumen

Sistema de notificaciones vía Telegram para pedidos. Soporta tres modos según el tipo de empresa y el dominio:

- **`tienda`**: notificación con quick-reply buttons ("Te contestaremos" / "Te llamamos"). El cliente ve una página de tracking con el estado del pedido.
- **`restaurante` (pedidos subdomain)**: notificación con botones de tiempo, el cliente es redirigido a una página de seguimiento en vivo con cuenta regresiva.
- **`restaurante` (mesa / dine-in)**: notificación para pedidos de mesa, con botones de estado Anotado/Preparado/Servido para el equipo de sala. Soporta dos grupos Telegram: cocina (comida) y bar (bebidas).

---

## Flujo — Modo Tienda

1. Cliente confirma pedido → `POST /api/pedidos`
2. `PedidoUseCase` crea el pedido en DB
3. `sendTelegramWithQuickReplies(pedido, chatId)` envía mensaje con botones de respuesta rápida
4. Cliente es redirigido a `/tracking/{token}`
5. **El negocio pulsa un botón** → webhook actualiza `pedido.estado` → la página de tracking refleja el cambio

**Botones de quick-reply:**
```
[ 💬 Te contestaremos lo más pronto posible ]
[ 📞 Te llamamos ahora en cuanto tengamos un momento ]
```
Al pulsar, el botón seleccionado queda marcado (`✅`) y aparece `🔄 Modificar respuesta`.

> **Con `pagos_pickup_habilitados = true`:** el paso 3 se omite en la creación del pedido. Telegram se envía desde el webhook de Redsys una vez confirmado el pago (ver sección siguiente).

## Flujo — Tienda / Recogida con pago online (`pagos_pickup_habilitados`)

Cuando la empresa tiene `pagos_pickup_habilitados = true`, los pedidos de tipo `tienda` y `recogida en local` requieren pago online (Redsys) antes de notificar al negocio.

1. Cliente confirma pedido → `POST /api/pedidos`
2. `PedidoUseCase` crea el pedido en DB **sin** enviar Telegram
3. El cliente es redirigido al formulario de Redsys (TPV virtual)
4. Redsys llama al webhook `POST /api/redsys/webhook/{empresaId}`
5. `processRedsysWebhookUseCase` verifica la firma y el resultado del pago
6. Si el pago es **exitoso** (`Ds_Response 0000–0099`):
   - `tipo === 'restaurante'` + `origen === 'recogida'` → `sendTelegramWithInlineButtons` (botones de tiempo)
   - `tipo === 'tienda'` → `sendTelegramWithQuickReplies`
   - Se guarda el `telegram_message_id` en el pedido
7. Si el pago **falla**, el pedido queda marcado como `failed` y no se notifica

> Para pedidos de `delivery`, Redsys ya era obligatorio antes de este toggle. El webhook también es el encargado de disparar el pedido a Glovo (solo para `origen === 'delivery'`).

## Flujo — Modo Restaurante (subdomain pedidos / takeaway)

1. Cliente confirma pedido → `POST /api/pedidos`
2. `PedidoUseCase` genera `tracking_token` (UUID) y crea el pedido con ese token en DB
3. `sendTelegramWithInlineButtons(pedido, chatId)` envía mensaje con botones `[10 min] [15 min] [20 min] [30 min]`
4. Cliente es redirigido a `/tracking/{token}` — sin popup
5. **El restaurante pulsa un botón en Telegram** → webhook `POST /api/telegram/webhook`
6. El webhook actualiza `estimated_minutes` y `estimated_ready_at` en el pedido
7. El webhook edita el mensaje original en Telegram: muestra `✅ Tiempo fijado: X min` + `🔄 Modificar tiempo`
8. La página de tracking del cliente muestra el tiempo en vivo (polling cada 5 s)
9. Cuando `estimated_ready_at` llega, la página muestra "¡Tu pedido está listo!"

## Flujo — Modo Mesa (dine-in)

1. Cliente en mesa escanea QR → pide desde `/?mesa={token}`
2. `POST /api/pedidos` incluye `mesa_id` + `sesion_id`
3. El use case enruta los ítems según `tipo_producto` y la configuración de grupos:
   - **Con dos grupos**: ítems de comida → `telegram_mesa_chat_id` (cocina), ítems de bebida → `telegram_bebidas_chat_id` (bar)
   - **Sin grupo bar**: todos los ítems → `telegram_mesa_chat_id` (comportamiento anterior)
4. El mensaje muestra el número de pedido, la mesa y los ítems (sin precios)
5. **El equipo de sala interactúa con los botones (flujo 3 estados):**

**Estado inicial:**
```
[ ✅ Anotado ]  [ 🍳 Preparado ]
```

**Al pulsar Anotado:**
```
[ ✅ Anotado ✓ ]  [ 🍳 Preparado ]
[ 🔄 Modificar ]
```
→ Estado del pedido en DB: `anotado`

**Al pulsar Preparado:**
```
[ 🍳 Preparado ✓ ]  [ 🍽️ Servido ]
[ 🔄 Modificar ]
```
→ Estado del pedido en DB: `preparado`
→ Si `telegram_bebidas_chat_id` está configurado: se envía alerta al grupo bar — *"🍳 Comida lista — Mesa 3 · Pedido #42"*

**Al pulsar Servido:**
```
[ 🍽️ Servido ✓ ]  [ 🗑️ Eliminar ]
[ 🔄 Modificar ]
```
→ Estado del pedido en DB: `servido`

**Al pulsar Eliminar:** borra el mensaje del chat de Telegram.

**Al pulsar Modificar:** restaura los botones originales `Anotado / Preparado` y resetea el estado a `pendiente`.

---

## Configuración

### Variables de entorno

```env
# Token del bot (obtenido de @BotFather) — global para todos los tenants
TELEGRAM_BOT_TOKEN=123456789:AABBccdd...

# Secreto para validar que el webhook viene de Telegram (lo inventás vos)
# Solo letras, números, guiones y underscores
TELEGRAM_WEBHOOK_SECRET=mi_secreto_seguro_123
```

### Por empresa (tabla `empresas`)

| Campo | Descripción |
|-------|-------------|
| `tipo` | `'tienda'` (defecto) o `'restaurante'` |
| `telegram_chat_id` | ID del chat para pedidos takeaway/tienda |
| `telegram_mesa_chat_id` | ID del chat para pedidos de mesa — cocina (comida) |
| `telegram_bebidas_chat_id` | ID del chat para el bar (bebidas + alerta de comida lista). Opcional. |

### Obtener el `telegram_chat_id`

1. Mandá un mensaje a tu bot en Telegram
2. Consultá: `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Buscá `"chat":{"id": XXXXXXX}` — ese es el chat ID

### Registrar el webhook (una sola vez por servidor)

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://tu-dominio.vercel.app/api/telegram/webhook" \
  -d "secret_token=mi_secreto_seguro_123"
```

Un único webhook sirve todos los tenants — no hay que registrar uno por empresa.

---

## Endpoints

### `POST /api/pedidos`
Crea el pedido. Si la empresa es `restaurante`, retorna `trackingToken` en el JSON.

### `POST /api/telegram/webhook`
Recibe callbacks de Telegram. Valida `X-Telegram-Bot-Api-Secret-Token` y despacha por patrón de `callback_data`:

| `callback_data` | Acción |
|----------------|--------|
| `order:{id}:{min}` | Fija tiempo de preparación (restaurante takeaway) |
| `modify:{id}` | Restaura botones de tiempo (si pedido no está listo) |
| `quick_reply:{id}:soon` | Marca estado `soon`, muestra respuesta seleccionada |
| `quick_reply:{id}:call` | Marca estado `call`, muestra respuesta seleccionada |
| `modify_reply:{id}` | Restaura botones quick-reply (tienda) |
| `anotado:{id}` | Marca como anotado, muestra estado + Preparado + Modificar |
| `preparado:{id}` | Marca como preparado, notifica bar si está configurado, muestra Servido + Modificar |
| `servido:{id}` | Marca como servido, muestra Eliminar + Modificar |
| `eliminar:{id}` | Borra el mensaje del chat de Telegram |
| `modify_mesa:{id}` | Restaura botones Anotado/Preparado (mesa), resetea a pendiente |
| `noop` | Dismiss spinner sin acción |

Siempre devuelve `200` (requisito de Telegram).

### `GET /api/orders/status?token={token}`
Consulta pública, rate-limited. Devuelve:
```json
{
  "numero_pedido": 42,
  "estimated_minutes": 20,
  "estimated_ready_at": "2026-05-20T21:35:00Z"
}
```
Nunca expone el `id` interno del pedido. Devuelve 404 si el token no existe.

---

## Manejo de errores

Si la notificación a Telegram falla, el error se registra en logs pero **no impide la creación del pedido**. La operación es fire-and-forget para no bloquear la respuesta al cliente.

---

## Columnas de base de datos

### `empresas`
```sql
tipo                         text     DEFAULT 'tienda'   -- 'tienda' | 'restaurante'
telegram_chat_id             text     NULL               -- pedidos takeaway/tienda/recogida
telegram_mesa_chat_id        text     NULL               -- pedidos de mesa — cocina
telegram_bebidas_chat_id     text     NULL               -- pedidos de mesa — bar (opcional)
waiter_pin_hash              text     NULL               -- bcrypt hash del PIN de sala
pagos_pickup_habilitados     boolean  DEFAULT false      -- requiere pago online para recogida/tienda; Telegram se envía post-pago
```

### `pedidos`
```sql
tracking_token      text        UNIQUE NULL   -- solo restaurante takeaway
estimated_minutes   int         NULL          -- fijado por el restaurante vía Telegram
estimated_ready_at  timestamptz NULL          -- calculado: created_at + estimated_minutes
mesa_id             uuid        NULL          -- FK mesas (solo pedidos de mesa)
sesion_id           uuid        NULL          -- FK mesa_sesiones
estado              text        NULL          -- pendiente | anotado | preparado | servido | soon | call
```

### `productos`
```sql
tipo_producto   text    NOT NULL DEFAULT 'comida'   -- 'comida' | 'bebida'
```
Usado para el enrutamiento split: comida → cocina, bebida → bar.
