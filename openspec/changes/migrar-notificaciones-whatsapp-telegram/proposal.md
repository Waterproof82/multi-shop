# Proposal: Migrar flujo de notificaciones de WhatsApp a Telegram

## Intent
Migrar el flujo de notificaciones de nuevos pedidos desde WhatsApp a Telegram para:
- Eliminar dependencia de WhatsApp y evitar exposición de números internos.
- Mejorar la experiencia de usuario (UX) al eliminar la necesidad de copy/paste o abrir apps externas.
- Aumentar la auditabilidad con logs claros en el backend.
- Facilitar el testing y extensibilidad para agregar otros canales de notificación en el futuro.

## Scope

### In Scope
- Modificar el endpoint `/api/pedidos` para enviar notificaciones por Telegram en lugar de WhatsApp.
- Implementar validación exhaustiva de datos con Zod.
- Crear lógica para preparar mensajes en Markdown seguro y enviarlos a la API de Telegram.
- Configurar variables de entorno para credenciales de Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`).
- Implementar rate limiting opcional por IP/email usando Upstash Redis para evitar spam/bots.
- Documentar nuevas variables de entorno en `README.md` y `env.md`.
- Asegurar que el frontend solo muestre confirmación y vacíe el carrito sin links externos.

### Out of Scope
- Modificar la lógica de autenticación o autorización.
- Cambiar el flujo de creación de pedidos en sí (solo se afecta la notificación).
- Implementar notificaciones push para clientes.
- Modificar la estructura de datos de los pedidos en la base de datos.

## Capabilities

### New Capabilities
- **telegram-notifications**: Capacidad para enviar notificaciones de pedidos a Telegram usando credenciales seguras y mensajes en Markdown.
- **rate-limit-pedidos**: Implementación de rate limiting por IP/email para el endpoint de pedidos, usando Upstash Redis.
- **markdown-sanitization**: Sanitización de contenido Markdown para evitar inyecciones o problemas en mensajes de Telegram.

### Modified Capabilities
- **pedido-use-case**: Modificación de la lógica de creación de pedidos para incluir envío de notificación a Telegram.
- **pedido-api**: Modificación del endpoint `/api/pedidos` para manejar el envío de notificaciones a Telegram.

## Approach

### Arquitectura y Flujo
1. **Validación**: El endpoint `/api/pedidos` valida los datos del pedido con Zod y usa `Result<T, AppError>` para manejar errores.
2. **Creación del Pedido**: El `PedidoUseCase` crea el pedido en Supabase y devuelve los datos del pedido.
3. **Notificación a Telegram**: Tras guardar el pedido, el backend prepara un mensaje en Markdown seguro y envía una solicitud POST a la API de Telegram usando credenciales de entorno.
4. **Rate Limiting**: Se implementa rate limiting opcional por IP/email para evitar spam, usando Upstash Redis.
5. **Respuesta al Cliente**: El frontend recibe una confirmación de éxito y vacía el carrito.

### Tecnologías y Herramientas
- **Zod**: Validación exhaustiva de datos del pedido.
- **Result<T, AppError>**: Manejo de errores consistente en todo el código.
- **Upstash Redis**: Rate limiting y almacenamiento temporal de tokens.
- **Telegram API**: Envío de mensajes en formato Markdown.
- **Clean Architecture**: Modificaciones limitadas a las capas de aplicación e infraestructura.

### Sanitización de Markdown
Se implementará una función para sanitizar el contenido del mensaje antes de enviarlo a Telegram, evitando inyecciones o problemas con caracteres especiales.

## Affected Areas

| Area | Impacto | Descripción
|------|--------|---------------
| `src/app/api/pedidos/route.ts` | Modificado | Endpoint de pedidos para enviar notificaciones a Telegram.
| `src/core/application/use-cases/pedido.use-case.ts` | Modificado | Lógica para enviar notificación a Telegram tras crear el pedido.
| `src/core/infrastructure/api/helpers.ts` | Nuevo | Métodos para enviar mensajes a Telegram y sanitizar Markdown.
| `src/core/infrastructure/database/` | Sin cambios | Repositorios y lógica de base de datos.
| `src/lib/` | Nuevo | Funciones de sanitización de Markdown.
| `README.md` | Modificado | Documentación de nuevas variables de entorno.
| `env.md` | Nuevo | Archivo con variables de entorno para Telegram.

## Risks

| Riesgo | Probabilidad | Mitigación
|--------|-------------|-------------
| El bot de Telegram puede ser bloqueado | Media | Monitorear logs y alertar ante fallos.
| Inyección de código en mensajes Markdown | Baja | Sanitización exhaustiva del contenido antes de enviarlo.
| Fallo en la conexión a Redis | Baja | Rate limiting opcional (no blocking).
| Errores de validación en datos del pedido | Baja | Validación exhaustiva con Zod.

## Rollback Plan

1. **Revertir el endpoint de pedidos**: Eliminar la lógica de envío a Telegram y restaurar el enlace de WhatsApp.
2. **Revertir variables de entorno**: Eliminar las variables `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` de la configuración.
3. **Revertir lógica de notificación**: Eliminar la función de envío a Telegram en el `PedidoUseCase`.
4. **Validar logs**: Revisar logs para asegurar que no hay errores residuales.

## Dependencies

- **Upstash Redis**: Configurado y accesible para implementar rate limiting opcional.
- **Telegram API**: Bot configurado y credenciales disponibles.
- **Variables de entorno**: `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` deben estar configuradas.

## Success Criteria

- [ ] El endpoint `/api/pedidos` envía notificaciones a Telegram en lugar de WhatsApp.
- [ ] Los mensajes de Telegram son seguros y sanitizados.
- [ ] El rate limiting opcional funciona correctamente.
- [ ] El frontend muestra confirmación de pedido y vacía el carrito sin links externos.
- [ ] Las nuevas variables de entorno están documentadas en `README.md` y `env.md`.
- [ ] Los tests de integración confirman que el flujo funciona correctamente.

---