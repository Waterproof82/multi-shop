# TPV — Cobros, Cobro Parcial, Historial y Rectificativos

> Documento técnico y de buenas prácticas sobre el ciclo de vida de un cobro en el TPV: desde el mostrador hasta el historial y la corrección legal de errores.

---

## 1. Flujo general de un cobro

```
Mostrador (TicketPanel)
  └─ Cobrar → /tpv/cobro/[sesionId]
       └─ CobroFlow
            ├─ CobroMetodoPropina (método + propina + importe parcial)
            ├─ CobroEfectivo / CobroTarjeta
            └─ CobroConfirmado
                  └─ onNuevaOperacion → /tpv/mostrador (router.push)
```

El cobro se registra en `tpv_cobros` con:
- `importe_cobrado_cents` — lo que efectivamente se cobró (puede ser parcial)
- `base_imponible_cents` — calculado en trigger PostgreSQL
- `iva_cents` — calculado en trigger PostgreSQL (nunca en cliente)
- `iva_porcentaje` — grabado en el momento del cobro (histórico inmutable)
- `propina_cents` — exenta de IVA
- `hash` / `hash_anterior` — cadena SHA-256 (trigger pgcrypto)

---

## 2. Cobro parcial

El TPV permite cobrar una fracción del total de la sesión (ej: un comensal paga su parte sin cerrar la mesa).

### Comportamiento
- En `CobroMetodoPropina` el operador puede editar el campo "Importe a cobrar" (input tipo `text` con `inputMode="decimal"`).
- Si el importe es menor que el total pendiente → `esParcial = true`.
- El payload enviado a `POST /api/tpv/cobro` incluye `cerrarSesion: false`.
- El use-case omite el RPC `close_mesa_sesion` cuando `cerrarSesion === false`.
- La sesión permanece abierta; el mostrador recarga y muestra el importe ya cobrado restado del total.

### `yaCobradoCents`
- Calculado en `GET /api/tpv/pedidos?sesionId=...` sumando todos los `tpv_cobros.importe_cobrado_cents` de la sesión.
- Propagado: `MostradorClient.yaCobradoCents` → `TicketPanel` → botón "Cobrar" muestra pendiente.
- En `CobroFlow`, el `totalPendienteCents = totalCents - yaCobradoCents` es la base inicial del campo de importe.

### Pantalla de confirmación parcial
- `CobroConfirmado` recibe `esParcial` y `pendienteCents`.
- Icono ½ naranja en lugar del ✓ verde.
- Muestra "Pendiente: X,XX €" y botón "Volver al mostrador →".

### Trampa de input numérico
`type="number"` con `value={toFixed(2)}` impide editar el campo mientras el usuario está escribiendo. La solución es `type="text" inputMode="decimal"` + estado local `rawImporte: string` que se formatea solo al hacer blur.

---

## 3. Detección de cobro externo (Realtime)

Si un camarero o cliente cierra la sesión desde otro canal mientras el operador del TPV tiene la mesa abierta en el mostrador:

- `MostradorClient` suscribe a `postgres_changes` en `mesa_sesiones` filtrado por `id = sesionId`.
- Cuando `cerrada_at` pasa de `null` a un valor → toast verde "La mesa X ha sido cobrada desde otro canal." + `clearMesa()`.
- El mostrador vuelve al estado limpio sin necesidad de navegar.

### Canal Realtime
```
tpv-sesion-close-{sesionId}
  └─ postgres_changes UPDATE mesa_sesiones filter: id=eq.{sesionId}
```

---

## 4. Historial del turno — selector de turno

### Flujo SSR
```
/tpv/historial?turnoId={uuid}
  └─ historial/page.tsx
       ├─ Carga últimos 20 turnos de la empresa
       ├─ Selecciona turno por param (o activo, o más reciente)
       ├─ Filtra pedidos: created_at BETWEEN apertura_at AND cierre_at
       ├─ Filtra cobros: turno_id = turnoSeleccionado.id
       ├─ Enriquece cobros con yaRectificado y originalTicket (queries extra)
       └─ Renderiza HistorialClient con turnos[] + turnoId
```

### Selector en cliente
- `HistorialClient` muestra un `<select>` cuando `turnos.length > 1`.
- Al cambiar: `router.push('/tpv/historial?turnoId=xxx')` → el servidor recarga con los datos del turno seleccionado.
- No hay estado de carga explícito — Next.js gestiona la transición SSR.

### Etiquetas del selector
- Turno activo: `Turno activo · desde DD/MM HH:MM`
- Turno cerrado: `DD/MM HH:MM–HH:MM · OperadorNombre`

---

## 5. Rectificativos — modelo legal y visualización

### Modelo legal (RD 1619/2012)
Los registros de `tpv_cobros` son **inmutables** (triggers bloquean DELETE y UPDATE). La única corrección legal es un **documento rectificativo**: un nuevo cobro con importe negativo que referencia el original.

| Campo | Valor en el rectificativo |
|-------|--------------------------|
| `importe_cobrado_cents` | `−original.importe_cobrado_cents` |
| `propina_cents` | `−original.propina_cents` |
| `iva_porcentaje` | igual al original |
| `rectifica_cobro_id` | `original.id` |
| `turno_id` | turno ACTIVO en el momento de la rectificación |

El rectificativo se crea siempre en el **turno activo**, independientemente del turno al que pertenece el cobro original. Esto es correcto legalmente: la corrección se registra cuando se detecta el error.

### Caso cross-turno
Si el cobro original pertenece a un turno cerrado y se rectifica en el turno activo:
- En la vista del turno cerrado: el original muestra badge "Rectificado" (`yaRectificado = true`).
- En la vista del turno activo: el rectificativo muestra "Rectificativo · anula SERIE-000123 (otro turno)".
- El servidor resuelve esto con dos queries extra en `historial/page.tsx`:
  1. `SELECT rectifica_cobro_id FROM tpv_cobros WHERE rectifica_cobro_id IN (cobrosIds)` → `yaRectificadoSet`
  2. `SELECT id, serie, numero_ticket FROM tpv_cobros WHERE id IN (rectificaIds de otros turnos)` → `originalesMap`

### Totales con rectificativos
- `totalCobrado` = suma de TODOS los `importeCobradoCents` (incluye negativos) → neto correcto.
- `cobrosValidos` = cobros con `rectificaCobroId === null` → usado para ticket medio, top IVA y estadísticas de analítica. El rectificativo no contamina las métricas.
- `totalFacturado` viene de `pedidos`, no de cobros. Rectificar un cobro no cancela el pedido — este existió y se facturó. Cambiar el importe cobrado no cambia la facturación.

### UX del rectificativo
1. Botón "Rectificar" visible solo si `!isRectificativo && !c.yaRectificado`.
2. Flujo: clic → Cancelar/Confirmar → `POST /api/tpv/cobro/rectificar`.
3. En éxito: `router.refresh()` recarga los datos SSR con el nuevo cobro.
4. En error: mensaje visible inline (ej: "Este cobro ya tiene un rectificativo emitido").
5. `yaRectificado` es resuelto por el servidor, no por estado local → correcto al recargar.

### Restricciones del endpoint
- No se puede rectificar un rectificativo (`rectifica_cobro_id !== null` → 422).
- No se puede rectificar dos veces el mismo cobro (check `COUNT(*) > 0` → 422).
- Requiere turno activo (sin turno activo → 422).

---

## 6. Buenas prácticas

### Nunca modificar cobros en la base de datos
Ni manualmente vía SQL ni desde el panel admin. Los triggers lanzarán EXCEPTION y el intento quedará en los logs de Postgres. Usar siempre el flujo de rectificativo.

### No mezclar cobros Redsys (online) con cobros TPV
Los cobros del TPV físico (`tpv_cobros`) y los pagos online de Redsys (`mesa_sesiones.payment_status`) son registros de naturaleza distinta. No se muestran juntos en el historial del TPV porque no son registros fiscales del mismo tipo.

### Campo `iva_porcentaje` graba la tasa histórica
Cambiar el tipo de impuesto en el panel admin (IVA → IGIC) no afecta a los cobros pasados. La tasa queda fija en el momento del cobro.

### `yaRectificado` siempre del servidor
No derivar el estado "rectificado" solo de los cobros en la lista actual (que pueden ser de un solo turno). El servidor consulta `tpv_cobros` global y devuelve `yaRectificado: boolean` por cobro.

### Input de importe parcial: siempre `type="text"`
Los inputs `type="number"` con `value` controlado impiden edición mientras el usuario escribe decimales. Usar `type="text" inputMode="decimal"` con estado local string y formateo solo en `onBlur`.

### Sesión libre: navegar sin `sesionId`
Al seleccionar una mesa libre desde el grid, se navega sin `sesionId`. El page de mostrador resuelve la sesión activa consultando `mesa_sesiones WHERE mesa_id=? AND cerrada_at IS NULL`. Si no hay sesión, `sesionId = null` — se crea cuando se envía el primer pedido y el cliente recibe el nuevo `sesionId` en la respuesta del POST.
