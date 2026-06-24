# Propina (Tip) en Mesa

## Resumen

Los clientes en mesa pueden seleccionar una propina antes de pagar. La propina se guarda en la sesión de la mesa (`mesa_sesiones.propina_cents`) y es visible para todos los participantes de la mesa en tiempo real. Se incluye automáticamente en el total cobrado por Redsys, tanto en pago completo como en pago dividido.

---

## Base de datos

### `mesa_sesiones` (delta)
```sql
propina_cents  INT NOT NULL DEFAULT 0
```

Almacena el importe de propina en céntimos acordado por los participantes. Se actualiza mediante la API de propina. Se resetea al cerrar la sesión.

### Migración
`supabase/migrations/20260624000001_mesa_propina_cents.sql`

---

## API

### `PATCH /api/mesas/[mesaId]/propina`

Actualiza `propina_cents` en la sesión activa de la mesa.

**Body:**
```json
{ "propinaCents": 100 }
```

- Validación Zod: `int`, `min(0)`, `max(5000)` (0 = sin propina, 5000 = 50€ máximo).
- Requiere sesión activa; devuelve 404 si no existe.
- Rate limiting: `rateLimitPublic`.

---

## Flujo de pago

### Pago completo (full payment)
```
amountCents = remainingCents + propinaCents
```

### Pago dividido (división igual)
El RPC `claim_and_create_division_pago` recibe:
```
p_session_total_cents = (divisionBaseCents ?? sessionTotalCents) + propinaCents
```
Cada persona paga su parte proporcional incluyendo la propina. El último pagador absorbe el redondeo.

### División personalizada (modo `personalizado`)
`remainingCents` ya descuenta los pagos confirmados anteriores. `propinaCents` se suma encima del restante.

---

## `GET /api/mesas/[mesaId]/orders` — respuesta

El campo `propinaCents` se incluye en la respuesta del endpoint de órdenes:
```json
{
  "propinaCents": 100,
  "division": { "importePorPersona": 12.50, ... }
}
```

`importePorPersona` ya incluye la propina: `(baseTotal + propinaCents/100) / personas`.

---

## UI — `TipSelector`

Componente dentro de `mesa-orders-client.tsx`, renderizado encima del botón de pago en el ticket del cliente.

### Presets
`[50, 100, 200, 300, 400, 500]` céntimos (0,50 € a 5,00 €).

### Personalizado
Campo de texto libre con validación de número positivo. Se convierte a céntimos al guardar.

### Quitar propina
Botón con icono `X` (rojo) que aparece cuando `localCents > 0`. Envía `propinaCents: 0`.

### Optimistic UI
1. Click → `setLocalCents(value)` inmediato (UI actualizada).
2. `savingRef.current = true` para bloquear el echo del servidor.
3. `PATCH /api/mesas/[mesaId]/propina` en background.
4. Si error → `setLocalCents(prev)` (revert).
5. `savingRef.current = false` al terminar.
6. El `useEffect` que sincroniza la prop `propinaCents` respeta `savingRef` y no sobreescribe el estado local mientras se guarda.

### Realtime
No requiere nueva suscripción. El canal `mesa_sesiones` UPDATE ya existente llama a `refresh()` en todos los clientes conectados a la misma mesa, propagando el cambio de propina automáticamente.

---

## Trampa crítica

`propinaCents` se declara con `let` ANTES del bloque `try` en `orders/route.ts` y se asigna dentro del `try`. Si se declarase dentro del try, no estaría disponible en el `return` del final (fuera del scope).

---

## i18n

Claves añadidas en `src/lib/translations.ts` (es/en/fr/it/de):
- `mesaPropinaTitulo` — "Propina" / "Tip" / ...
- `mesaPropinaQuitar` — "Quitar propina" / "Remove tip" / ...
- `mesaPropinaOtro` — "Otro importe" / "Other amount" / ...
- `mesaPropinaPersonalizado` — "Personalizado:" / "Custom:" / ...
- `mesaPropinaAceptada` — "Propina aceptada" / "Tip accepted" / ...
