# Documentación: Notificaciones de Pedidos por Telegram

## Resumen

Sistema de notificaciones vía Telegram para pedidos. Soporta dos modos según el tipo de empresa (`tipo` en tabla `empresas`):

- **`tienda`**: notificación simple de texto, el cliente ve un popup con el número de pedido.
- **`restaurante`**: notificación con botones de tiempo, el cliente es redirigido a una página de seguimiento en vivo.

---

## Flujo — Modo Tienda

1. Cliente confirma pedido → `POST /api/pedidos`
2. `PedidoUseCase` crea el pedido en DB
3. `sendTelegramNotification(pedido, chatId)` envía mensaje de texto al chat de la empresa
4. Cliente ve popup con número de pedido

## Flujo — Modo Restaurante

1. Cliente confirma pedido → `POST /api/pedidos`
2. `PedidoUseCase` genera `tracking_token` (UUID) y crea el pedido con ese token en DB
3. `sendTelegramWithInlineButtons(pedido, chatId)` envía mensaje con botones `[10 min] [15 min] [20 min] [30 min]`
4. Cliente es redirigido a `/tracking/{token}` — sin popup
5. **El restaurante pulsa un botón en Telegram** → webhook `POST /api/telegram/webhook`
6. El webhook actualiza `estimated_minutes` y `estimated_ready_at` en el pedido
7. El webhook edita el mensaje original en Telegram: elimina los botones y confirma el tiempo elegido (`✅ Tiempo fijado: X min`)
8. La página de tracking del cliente muestra el tiempo en vivo (polling cada 5 s)
9. Cuando `estimated_ready_at` llega, la página muestra "¡Tu pedido está listo!"

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
| `telegram_chat_id` | ID del chat de Telegram donde recibe los pedidos |

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
Recibe callbacks de Telegram al pulsar un botón de tiempo:
- Valida el header `X-Telegram-Bot-Api-Secret-Token`
- Parsea `callback_data` con formato `order:{pedidoId}:{minutes}`
- Actualiza `estimated_minutes` y `estimated_ready_at` en DB
- Edita el mensaje de Telegram para confirmar y eliminar los botones
- Siempre devuelve `200` (requisito de Telegram)

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
tipo              text    DEFAULT 'tienda'   -- 'tienda' | 'restaurante'
telegram_chat_id  text    NULL               -- per-empresa
```

### `pedidos`
```sql
tracking_token    text    UNIQUE NULL        -- solo restaurantes
estimated_minutes int     NULL               -- fijado por el restaurante vía Telegram
estimated_ready_at timestamptz NULL          -- calculado: created_at + estimated_minutes
```
