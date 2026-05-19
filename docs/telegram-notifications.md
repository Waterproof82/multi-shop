# Documentación: Notificaciones de Pedidos por Telegram

## Resumen

Este documento describe la funcionalidad de notificaciones de pedidos a través de la API de Telegram, que reemplaza al antiguo sistema basado en WhatsApp. El objetivo principal de este cambio es mejorar la fiabilidad, la seguridad y la experiencia del usuario final, eliminando la dependencia de aplicaciones externas en el lado del cliente.

## Flujo de la Notificación

1.  **El Cliente Realiza un Pedido**: Desde el carrito de la tienda, el cliente rellena sus datos y confirma el pedido.
2.  **Llamada al API**: El frontend realiza una petición `POST` al endpoint `/api/pedidos`.
3.  **Procesamiento en Backend**:
    a.  El `PedidoUseCase` recibe los datos, los valida y crea el registro del pedido en la base de datos (Supabase).
    b.  Una vez el pedido se ha guardado con éxito, el caso de uso llama al `TelegramService`.
    c.  El `TelegramService` construye un mensaje formateado con los detalles del pedido.
    d.  Se realiza una llamada a la API de bots de Telegram para enviar el mensaje al chat configurado.
4.  **Respuesta al Cliente**:
    a.  El backend responde inmediatamente al frontend con un mensaje de éxito (`200 OK`) en cuanto el pedido se guarda en la base de datos, **sin esperar la respuesta de la API de Telegram**.
    b.  El frontend muestra un diálogo de éxito con el número de pedido. El cliente nunca interactúa directamente con Telegram.

## Configuración Requerida

Para que el sistema de notificaciones funcione, es necesario configurar dos variables de entorno en el archivo `.env.local`:

```env
TELEGRAM_BOT_TOKEN="AQUI_VA_EL_TOKEN_DE_TU_BOT"
TELEGRAM_CHAT_ID="AQUI_VA_EL_ID_DEL_CHAT"
```

### Cómo Obtener las Claves

1.  **`TELEGRAM_BOT_TOKEN`**:
    *   Habla con el bot oficial **@BotFather** en Telegram.
    *   Usa el comando `/newbot` para crear un nuevo bot.
    *   BotFather te proporcionará un token de acceso. Este es tu `TELEGRAM_BOT_TOKEN`.
    *   **IMPORTANTE**: Este token es secreto. No lo compartas ni lo subas a repositorios públicos.

2.  **`TELEGRAM_CHAT_ID`**:
    *   Este es el identificador del chat donde el bot enviará las notificaciones.
    *   **Para un chat privado**: Envía un mensaje a tu bot. Luego, abre esta URL en tu navegador (reemplazando `<TU_TOKEN>`):
        `https://api.telegram.org/bot<TU_TOKEN>/getUpdates`
        Busca en la respuesta el objeto `chat`, y dentro de él, el campo `id`. Ese es tu ID.
    *   **Para un grupo**: Añade tu bot al grupo. Envía un mensaje en el grupo. Usa la misma URL `getUpdates` de antes y busca el `id` del chat del grupo (será un número negativo).

## Manejo de Errores

El sistema está diseñado para ser resiliente. Si por cualquier motivo la notificación a Telegram falla (API caída, token incorrecto, etc.), el error **será registrado en los logs del servidor**, pero **no impedirá que el pedido se cree correctamente** y que el cliente vea un mensaje de éxito.

La creación del pedido es la operación prioritaria.

## Ventajas del Nuevo Sistema

*   **Fiabilidad**: La notificación se envía desde el servidor, eliminando problemas de "cold start" de la app de WhatsApp o si el cliente no la tiene instalada.
*   **Seguridad**: No se exponen números de teléfono ni se depende de que el cliente envíe el mensaje. Se elimina el riesgo de mensajes manipulados.
*   **Mejor Experiencia de Usuario**: El cliente recibe una confirmación instantánea en la propia web, sin ser redirigido a una aplicación externa.
*   **Simplicidad**: Se ha eliminado una gran cantidad de código complejo y propenso a errores del frontend.
