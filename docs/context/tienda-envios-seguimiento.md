# Tienda — Envíos a domicilio y número de seguimiento

> Ver también: [delivery.md](./delivery.md) (delivery con riders de Glovo, un sistema **distinto**) · [admin-api-patterns.md](./admin-api-patterns.md)

## Qué es

En una empresa de tipo `tienda`, el cliente elige una **modalidad de entrega** al pedir: recogida en tienda o envío a domicilio. Cada modalidad de envío la configura el admin con su nombre (normalmente, el del transportista: "Battery Express PROVINCIA TENERIFE"), su precio y su plazo.

Cuando el admin entrega el paquete al transportista, desde `/admin/pedidos` puede:

1. Guardar el **número de seguimiento** que le dio el transportista.
2. Enviar al cliente un **email con ese número y el detalle completo del pedido**, después de confirmarlo en un pop-up que muestra una vista previa del email.

Esto no tiene nada que ver con el delivery de restaurante (Glovo + riders, `origen = 'delivery'`, `delivery_fee_cents`).

---

## Datos: qué se guarda en `pedidos`

| Columna | Qué es | Quién la escribe |
|---------|--------|------------------|
| `modalidad_entrega_id` | FK a `modalidades_entrega` (**`ON DELETE SET NULL`**) | Creación del pedido |
| `modalidad_entrega_tipo` | `'recogida'` \| `'domicilio'` (copia) | Creación del pedido |
| `modalidad_entrega_precio_cents` | Precio del envío (copia). **El `total` ya lo incluye** | Creación del pedido |
| `modalidad_entrega_nombre` | Nombre `es` de la modalidad (copia) | Creación del pedido |
| `numero_seguimiento` | Código del transportista, 1–100 caracteres | Admin (`PUT .../seguimiento`) |
| `seguimiento_email_enviado_at` | Última vez que se envió el email de seguimiento | `POST .../seguimiento` |

Migraciones: `20260928000001_pedidos_numero_seguimiento.sql` y `20260928000002_pedidos_modalidad_entrega_nombre.sql` (esta segunda rellenó los pedidos que ya existían).

### Por qué el nombre es una COPIA y no un JOIN

La FK es `ON DELETE SET NULL`. Con un JOIN, si el admin borra o renombra la modalidad, los pedidos ya enviados perderían o cambiarían su transportista. El tipo y el precio ya se copiaban por el mismo motivo; el nombre sigue el mismo patrón.

La copia se hace en `PedidoUseCase.buildModalidadPayload`, con el nombre que devuelve `ModalidadEntregaUseCase.validarPrecioVigente` (leído de la BD, **nunca** del body del cliente). Solo se copia el nombre en español: los nombres de transportista son nombres propios.

### Gastos de envío: la columna correcta

En tienda, el coste de envío está en **`modalidad_entrega_precio_cents`**, no en `delivery_fee_cents` (ese es el de Glovo). El detalle del pedido en el admin mostraba solo `delivery_fee_cents`, así que en tienda los gastos de envío no aparecían. Ahora `gastosEnvioCents()` (en `pedidos/page.tsx`) lee `modalidad_entrega_precio_cents ?? delivery_fee_cents`.

---

## Regla: quién puede tener número de seguimiento

`puedeTenerSeguimiento()` en `core/domain/constants/pedido.ts`:

```ts
pedido.modalidad_entrega_tipo === 'domicilio' && pedido.estado !== 'cancelado'
```

- Recogida, mesa y delivery con rider → no.
- Cancelado → no (no se envía). Por eso, en un pedido cancelado la columna **Acciones sale vacía**: el botón de cancelar tampoco aparece. Para reactivarlo, se pulsa la etiqueta de estado "Cancelado" (vuelve a "Pendiente").

La misma regla se aplica en dos sitios: el cliente decide si pinta el botón del camión, y el `UPDATE` del repositorio la vuelve a exigir en SQL (`.eq('modalidad_entrega_tipo','domicilio').neq('estado','cancelado')`). Si no se actualiza ninguna fila, el caso de uso responde `NOT_FOUND`.

---

## API — `/api/admin/pedidos/[pedidoId]/seguimiento`

Todos los métodos pasan por `resolveAdminContextWithEmpresa` (autenticación + rol admin/superadmin + `?empresaId=` para superadmin). Los métodos mutativos pasan por CSRF en el proxy.

| Método | Qué hace | Body / respuesta |
|--------|----------|------------------|
| `PUT` | Guarda el número. Cadena vacía (o solo espacios) lo **borra** (`null`) | `{ numeroSeguimiento: string ≤ 100 }` → `{ numeroSeguimiento: string \| null }` |
| `GET` | **Vista previa** del email. No envía nada | → `{ subject, html, destinatario }` |
| `POST` | Envía el email vía Brevo y guarda `seguimiento_email_enviado_at` | → `{ enviadoAt }` |

`GET` y `POST` componen el email con la **misma** función (`componerEmail` → `construirEmailSeguimiento`): lo que el admin ve en la vista previa es exactamente lo que recibe el cliente.

`prepararEmailSeguimiento` (caso de uso) responde `VALIDATION_ERROR` si el pedido no es un envío a domicilio activo, no tiene número de seguimiento o el cliente no tiene email.

Si el email sale pero falla guardar `seguimiento_email_enviado_at`, el `POST` **responde éxito igualmente**: devolver error haría que el admin reintentara y el cliente recibiera el email dos veces.

---

## Email — `core/infrastructure/services/seguimiento-email.builder.ts`

- Mismo aspecto que el email de promociones (`promo-email.builder.ts`): cabecera con el color primario y el logo del tenant, tarjeta de 540 px.
- Contenido: número de seguimiento destacado, número de pedido, fecha, **tipo de envío + nombre de la modalidad**, dirección, productos con complementos (el precio del complemento se multiplica por la cantidad), gastos de envío, total y enlace a la web.
- Idioma: `clientes.idioma` (es/en/fr/it/de), con español si el idioma no está entre esos cinco. Incluye versión en texto plano.
- **Sin enlaces de baja**: es un email transaccional del pedido, no marketing.
- **Todo lo que escriben el admin o el cliente pasa por `escapeHtml`** (número de seguimiento, nombre, dirección, productos, complementos, nombre de la modalidad). El email sale firmado con el nombre de la tienda: sin escapar, sería inyección de HTML en un correo real.
- Remitente: `empresa.emailNotification`, o `BREVO_DEFAULT_SENDER_EMAIL` si no tiene.

---

## UI — `/admin/pedidos`

- **Acciones** (`AccionesPedido`): botón del camión (azul si no hay número, verde si lo hay) + botón de cancelar.
- **Pop-up** (`components/admin/pedidos/seguimiento-dialog.tsx`), en dos pasos:
  1. Campo del número → Guardar.
  2. Si el cliente tiene email: "¿Enviar email al cliente?", con el destinatario y la vista previa en un `<iframe sandbox="" srcDoc>` (el HTML del email no ejecuta scripts). Si no tiene email: aviso de que no se le puede escribir.
- El padre monta el diálogo con `key={pedido.id}`, así que el estado empieza vacío en cada pedido. No hay un `useEffect` de reseteo porque el lint de React lo marca.
- **Detalle ampliado**: `TipoEnvioResumen` ("Tipo de envío: Envío a domicilio — {nombre}"), dirección, `SeguimientoResumen` (número y fecha del email) y los gastos de envío.

---

## Tests

| Fichero | Qué fija |
|---------|----------|
| `tests/compliance/pedido-seguimiento-email.test.ts` | `puedeTenerSeguimiento`; contenido del email; **escape de HTML** en todos los campos; idioma con español por defecto |
| `tests/core/pedido-seguimiento.test.ts` | Recorte de espacios, vacío → `null`, `NOT_FOUND` / `VALIDATION_ERROR` |
| `tests/core/pedido-modalidad-revalidacion.test.ts` | Se copia `modalidad_entrega_nombre` **validado** al crear el pedido; recogida implícita → `null` |
| `tests/ui/pedidos-admin-modalidad-badge.test.tsx` | `TipoEnvioResumen` en el detalle ampliado |
