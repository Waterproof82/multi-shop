# Mesa Payments — Pagar en mesa con Redsys

## Overview

Cuando está habilitado, el ticket del cliente en `/mesa/{mesaId}/orders` muestra botones de pago al final de la cuenta. El cliente puede pagar el total de la sesión o dividir la cuenta entre varias personas. Cada pago se procesa a través de Redsys TPV.

Esta funcionalidad solo aplica a empresas de tipo `restaurante` y se activa por empresa desde el panel SuperAdmin.

---

## Activación

En el panel SuperAdmin (`/superadmin`) → tabla Empresas → columna **Pagos**:
- El toggle solo aparece para empresas de tipo `restaurante`.
- Al activarlo se guarda `pagos_mesa_habilitados = true` en la tabla `empresas`.
- Si la empresa no tiene las credenciales Redsys configuradas, el pago fallará en el use case (error `PAYMENT_NOT_CONFIGURED`). En desarrollo se usan credenciales de test de Redsys automáticamente.

---

## Database Schema

### `empresas` (delta)
```sql
pagos_mesa_habilitados  boolean NOT NULL DEFAULT false
```

### `mesa_sesiones` (delta)
```sql
division_personas         int     DEFAULT NULL   -- NULL = no división activa
division_pagos_realizados int NOT NULL DEFAULT 0 -- shares confirmados por Redsys
```

### `pedidos` (delta — preexistente, usado por esta feature)
```sql
payment_status      text   -- 'pending' | 'paid' | 'failed'
payment_order_ref   text   -- referencia enviada a Redsys (DS_MERCHANT_ORDER)
payment_amount_cents int   -- importe en céntimos enviado a Redsys
```

### RPC: `increment_division_pagos(p_sesion_id UUID)`
Incremento atómico de `division_pagos_realizados`. Retorna `(pagos_realizados INT, personas INT)`. Usa `SECURITY DEFINER` para ejecutarse en contexto de servicio desde el webhook.

---

## Flujo: Pagar total

```
Cliente en /mesa/{mesaId}/orders
  → click "Pagar total"
  → POST /api/redsys/initiate-mesa  { mesaId, esDivision: false }
  → Use case: suma total de todos los pedidos de la sesión activa
  → Marca todos los pedidos con payment_status = 'pending'
  → El pedido con mayor numero_pedido recibe payment_order_ref (anchor)
  → Retorna RedsysFormData
  → Cliente hace form submit a Redsys
  → Redsys procesa → POST /api/redsys/webhook (server-to-server)
  → Webhook: verifica firma, marca pedido anchor y todos los de la sesión como 'paid'
  → Redsys redirige al cliente a /mesa/{mesaId}/orders
```

---

## Flujo: Dividir cuenta

```
Cliente en /mesa/{mesaId}/orders
  → click "Dividir cuenta"
  → Modal selector (2–20 personas)
  → Confirma N personas
  → POST /api/mesas/{mesaId}/division  { numPersonas: N }
  → Guarda division_personas=N, division_pagos_realizados=0 en mesa_sesiones
  → UI muestra: barra de progreso + "Pagar mi parte €X.XX"

Por cada persona que paga:
  → POST /api/redsys/initiate-mesa  { mesaId, esDivision: true }
  → Use case: calcula importe = total / N
    (última persona: paga el residuo para cuadrar al centavo)
  → Marca anchor pedido como payment_status = 'pending'
  → Redsys procesa → POST /api/redsys/webhook
  → Webhook: llama RPC increment_division_pagos
    - Si pagos_realizados < personas: solo marca el anchor como 'paid'
    - Si pagos_realizados >= personas: marca TODOS los pedidos de la sesión como 'paid'
  → Cliente regresa a /mesa/{mesaId}/orders y ve el progreso actualizado

El botón "Cambiar" (solo visible cuando pagos_realizados === 0) permite
reabrir el modal y corregir el número de personas.
```

---

## API Routes

### `POST /api/redsys/initiate-mesa`

Inicia el pago para la sesión activa de una mesa.

**Body:**
```json
{
  "mesaId": "uuid",
  "esDivision": false
}
```

**Response (success):**
```json
{
  "DS_MERCHANT_PARAMETERS": "...",
  "DS_SIGNATURE": "...",
  "DS_SIGNATURE_VERSION": "HMAC_SHA256_V1"
}
```

El cliente recibe estos campos y los envía como un `<form method="POST">` al endpoint de Redsys (`NEXT_PUBLIC_REDSYS_URL`).

Después del pago, Redsys redirige a `/mesa/{mesaId}/orders` (tanto urlOk como urlKo).

### `POST /api/mesas/{mesaId}/division`

Activa o actualiza la división de cuenta para la sesión activa de una mesa.

**Body:**
```json
{ "numPersonas": 4 }
```

Resetea `division_pagos_realizados` a 0. Solo funciona si hay una sesión activa.

### `GET /api/mesas/{mesaId}/orders` (actualizado)

Ahora retorna también:
```json
{
  "pagosHabilitados": true,
  "division": {
    "personas": 4,
    "pagosRealizados": 1,
    "importePorPersona": 12.50
  }
}
```
`division` es `null` si no hay división activa.

---

## Webhook Redsys

El webhook en `/api/redsys/webhook` es el único mecanismo de confirmación de pago (server-to-server). **No se confía en el redirect urlOk** para marcar pagos.

### Lógica de validación

1. Decodifica `DS_MERCHANT_PARAMETERS` (Base64 → JSON)
2. Verifica la firma HMAC-SHA256 con la `redsys_secret_key` de la empresa
3. Lee `Ds_Response`: códigos `0000`–`0099` → `paid`; resto → `failed`
4. Actualiza `payment_status` en el pedido anchor

### Diferencia pago total vs. división

| Caso | Acción en webhook |
|---|---|
| Sin división (`division_personas IS NULL`) | Marca todos los pedidos de la `sesion_id` como `paid` |
| Con división, shares pendientes | Solo incrementa `division_pagos_realizados` (RPC atómica) |
| Con división, último share | Incrementa + marca todos los pedidos de la sesión como `paid` |

### Testing en local

Redsys no puede alcanzar `localhost`. Para pruebas locales usar:
```bash
ngrok http 3000
# La URL pública de ngrok va como webhookUrl en el use case
```
En producción/staging el webhook funciona sin configuración adicional.

---

## Archivos

| Archivo | Rol |
|---|---|
| `supabase/migrations/20260601000001_pagos_mesa_habilitados.sql` | Columna en empresas |
| `supabase/migrations/20260601000002_division_cuenta_mesa.sql` | Columnas de división + RPC |
| `src/core/application/use-cases/payment/initiateRedsysMesaPaymentUseCase.ts` | Use case de inicio de pago mesa |
| `src/app/api/redsys/initiate-mesa/route.ts` | Endpoint de inicio de pago |
| `src/app/api/mesas/[mesaId]/division/route.ts` | Endpoint para fijar división |
| `src/app/api/mesas/[mesaId]/orders/route.ts` | Retorna `pagosHabilitados` + `division` |
| `src/core/application/use-cases/payment/processRedsysWebhookUseCase.ts` | Webhook + lógica de sesión |
| `src/components/mesa-orders-client.tsx` | UI del ticket con botones de pago |
| `src/app/superadmin/empresas-table.tsx` | Toggle "Pagos" en superadmin |
