# Offline, resiliencia y UI optimista

Estado a 2026-08-08. Cubre el trabajo de la auditoría de latencia y lo que
destapó por el camino.

Este documento explica **qué problema resuelve cada pieza**. Para el detalle del
service worker en sí, ver [`pwa-offline-system.md`](./pwa-offline-system.md).
Para los canales de Realtime, [`realtime-channels.md`](./realtime-channels.md).

---

## El problema real: la red del comedor no es binaria

Casi todo el diseño offline de esta app sale de una observación que conviene
tener presente antes de leer el resto:

> **`fetch()` solo falla rápido cuando NO hay red. Cuando la red está DEGRADADA,
> se queda colgado.**

Y el caso malo de un restaurante no es "sin cobertura". Es:

- WiFi asociado pero sin salida real a internet
- 4G a una raya en el bolsillo del camarero
- El AP del comedor saturado a la hora punta

En todos esos, `navigator.onLine` dice `true` y `fetch()` se queda esperando.
El usuario ve un spinner eterno, se cansa, y vuelve a pulsar. Ese "vuelve a
pulsar" es el origen de la mitad de los problemas que se han arreglado.

---

## 1. UI optimista: la interfaz no espera al servidor

**Sí, hay UI optimista, y es el núcleo del trabajo de latencia.** El patrón vive
en `patchEstado` (`src/app/waiter/kitchen/page.tsx`, y equivalentes en
`bar/page.tsx`, `kitchen/page.tsx`, `pendientes/page.tsx`).

```
patchEstado(pedidoId, itemIdx, estado, applyOptimistic, rollback)
```

1. `applyOptimistic()` — el cambio se pinta **ya**. El cocinero marca un plato
   como listo y lo ve listo, sin esperar al servidor.
2. Se lanza el PATCH.
3. Según lo que pase:

| Qué ocurre | Qué se hace | Por qué |
|---|---|---|
| El servidor responde **OK** | nada, ya está pintado | — |
| El servidor responde **error** | `rollback()` | El servidor contestó y **rechazó**: la intención NO era válida |
| La petición **no llega a contestar** | **NO se revierte**, se encola | La intención del cocinero sigue siendo válida, solo falta red |

**Esa distinción es lo importante.** Revertir ante un fallo de red sería el
comportamiento equivocado: el plato SÍ está listo, lo que falla es el cable.
Deshacerlo en pantalla obligaría al cocinero a repetir la acción, que es
exactamente lo que la cola offline existe para evitar.

### Otras mejoras de percepción de velocidad

- **Reloj visual separado de los datos** (`8b4c1c6`). Las cuatro vistas de
  tiempo real clonaban el array de comandas **cada segundo** solo para repintar
  contadores de tiempo transcurrido. Ahora el tick de reloj es un `useReducer`
  independiente que no invalida los agrupamientos memoizados.
- **Contadores del banner en una sola consulta** (`84f0183`). RPC
  `get_waiter_badge_counts`. Es la ruta más caliente del sistema: se re-dispara
  con cada evento de Realtime.
- **Navegación cliente** (`8721010`). `waiter-banner` usaba `location.href` en
  ~7 sitios: cada salto entre Cocina/Bar/Pendientes era una recarga completa con
  reconexión de WebSocket. Ahora es `router.push()`.
- **Hidratación desde IndexedDB en arranque en frío** (`eaf30b2`). El listado se
  pinta con el último snapshot guardado (TTL 30 min,
  `src/lib/kitchen/kitchen-snapshot-db.ts`) mientras llega la petición real.
- **Lector de QR bajo demanda** (`235ebcd`). `@zxing` son ~1,4 MB y estaba en el
  chunk inicial de la carta pública. El comensal llega con token tras escanear
  el QR de la mesa: **nunca abre la cámara**. El caso raro pagaba el peaje del
  caso normal, en el móvil de un cliente con datos móviles.

---

## 2. Cola de comandos offline

`src/lib/waiter/command-queue.ts` + `src/hooks/waiter/useCommandQueue.ts`.
IndexedDB (`waiter_offline` / `commands`).

### La regla central: solo comandos idempotentes

No es un detalle de implementación, es **la restricción que define el módulo**.

Reenviar un comando encolado tiene que ser inofensivo si la petición original SÍ
impactó el servidor pero la respuesta se perdió — un caso habitual en red
inestable, e **indistinguible desde el cliente** de "no llegó nunca".

- Un PATCH de estado cumple: fijar `estado = 'servido'` dos veces deja el mismo
  resultado que hacerlo una.
- Un `POST /api/pedidos` no cumplía: cada reenvío creaba una comanda nueva.

### Colapso por destino

Al encolar se **reemplaza** cualquier comando pendiente con la misma `key`
(`keyPath: 'key'` en el object store). Resuelve dos cosas a la vez:

1. Solo importa el último estado. Si el cocinero marca un ítem `en_preparacion`
   y luego `listo` sin red, reproducir ambos en orden es innecesario;
   reproducirlos **desordenados** dejaría el ítem en el estado equivocado.
2. La cola no crece sin límite si alguien insiste sobre el mismo ítem.

### Política de descarte

- `MAX_AGE_MS = 1 h` — un comando más viejo que eso ya no representa la realidad
  del servicio.
- `RETRYABLE_CLIENT_ERRORS = {408, 429}` — son 4xx pero transitorios. El resto
  de 4xx son rechazos del contenido: reintentarlos es tozudez.

### Vaciado al volver al primer plano (`43da17c`)

**Este arreglo importa más de lo que parece.** Con la pantalla apagada, el
navegador **congela los timers de la página**: el `setInterval` de 30 s
sencillamente no corre. El PDA del camarero pasa media jornada así — se marca un
plato, se guarda el aparato en el bolsillo, se vuelve a sacar.

Se escucha `visibilitychange` y `pageshow`. Detalle que sí importa:
`visibilitychange` se dispara en **los dos sentidos**, y reaccionar al `hidden`
lanzaría la petición justo cuando el aparato se duerme y la radio se apaga. De
ahí `isResumeSignal()`.

### Por qué los PEDIDOS no se encolan

Desde `src/lib/idempotency.ts` la ruta acepta clave de reintento, así que el
impedimento técnico ya no existe. **Siguen sin encolarse, y ahora por una razón
de servicio**: reproducir una comanda minutos después, sin nadie mirando, manda
comida a una mesa que puede haberse levantado. El reintento de un pedido se hace
**en primer plano, con el usuario delante** — eso es lo que hace `postPedido` en
`cart-drawer.tsx`.

---

## 3. Idempotencia de pedidos (`b571c07`)

`POST /api/pedidos` acepta la cabecera `Idempotency-Key`.

**El caso que arregla**: red degradada, el comensal ve el spinner colgado, se
cansa, vuelve a pulsar → **la cocina recibía la comanda dos veces**.

- Columnas `idempotency_key` / `idempotency_fingerprint` en `pedidos`, con
  índice único **parcial** por `(empresa_id, idempotency_key)`.
- **Es el índice, no la comprobación previa, lo que garantiza la unicidad.** La
  comprobación resuelve el caso normal; cuando dos envíos llegan a la vez, el
  segundo INSERT choca (SQLSTATE 23505) y se trata como reproducción.
- **La huella del payload es de seguridad**, no de corrección: la respuesta
  reproducida incluye el `tracking_token`, que es credencial al portador. Sin
  comparar la huella, adivinar una clave sería una vía para cosechar pedidos
  ajenos. Clave igual + contenido distinto → **409**.
- El corte va **antes** de `findOrCreateCliente` y `applyDiscount`, que no son
  repetibles. Sin eso, reintentar devolvía `CODE_ALREADY_USED` (400) a un
  comensal cuyo pedido SÍ había entrado.

---

## 4. Resiliencia de Realtime

### Detección de caída y sondeo (`45bb30e`)

`src/hooks/waiter/useRealtimeDegraded.ts`. Si el canal cae, se sondea con un
intervalo plano mientras dure la degradación. Sin esto, la pantalla se quedaba
callada sin avisar a nadie.

### Timeout del service worker (`5dadcf8`)

`NetworkFirst` sin timeout deja la pantalla en blanco con red degradada, por la
razón del principio: `fetch()` no rechaza rápido si la red está mala, solo si
está ausente. Añadido timeout de 3 s para `/waiter/*` y `bell.mp3`.

### Scope de empresa en el canal de mesas (`a0eb7f2`)

Ver [`realtime-channels.md`](./realtime-channels.md). Resumen: el canal
`mesa-sesion-update` era global y público, así que cualquiera con la anon key
recibía la actividad de mesas de **todos los tenants**. Ahora lleva
`:<empresaId>`. Era además coste de latencia: cada dispositivo se despertaba a
re-consultar por actividad de empresas ajenas.

---

## 5. Por qué hubo que escribir tantos tests

Esta es la parte que más contexto futuro aporta.

### Qué había antes

**10 ficheros de test**, todos de cumplimiento legal/fiscal:

```
cron-secret-timing-safe · electron-security · fuzz-api-inputs · hash-chaining
hash-property · hmac-electron-snapshot · iva-breakdown · iva-property
secrets-scan · verifactu-qr-url
```

Buenos tests, y necesarios. Pero cubrían **una franja muy concreta**: hashes,
IVA, VeriFactu, secretos. **Cero cobertura** de comportamiento funcional: nada de
pagos, mesas, cocina, offline ni Realtime.

### Y no era una decisión — era una imposibilidad

Al ir a escribir el primer test de un caso de uso, apareció la causa raíz:

> **`vitest` no resolvía el alias `@/`.**

Todo `src/core` usa rutas `@/...`. El runner las daba por módulos inexistentes,
así que **ningún test podía importar la capa de aplicación ni la de
infraestructura**. Los 10 que existían vivían en territorio alcanzable por ruta
relativa.

Arreglado con cinco líneas de `resolve.alias` en `vitest.config.ts`.

**La consecuencia es la lección**: cuando probar es imposible, la complejidad no
encuentra resistencia. De ahí funciones de complejidad cognitiva 49 y 78 en
pagos y en la cuenta del comensal.

### Qué cubren los tests nuevos

De 10 ficheros a 25; de 123 a 268 casos. Los relevantes para offline y
resiliencia:

| Fichero | Qué congela |
|---|---|
| `waiter-command-queue` | idempotencia admitida, colapso por key, expiración, política de descarte, `isResumeSignal` en ambos sentidos |
| `idempotency` | estabilidad de la huella (orden de claves, `undefined` vs ausente), formato de clave, namespacing por pase |
| `redsys-webhook` | los tres caminos de cobro y **su idempotencia** — Redsys reintenta |
| `mesa-remove-item` | reindexado de `mesa_item_pagos`, que es donde un fallo silencioso desvía pagos |
| `mesa-manual-payment` | aislamiento de tenant y doble cobro |
| `sw-network-timeout` | que el `NetworkFirst` conserva su timeout |
| `mesa-sesion-channel` | que el trigger y el cliente componen el mismo nombre de canal |
| `qr-scanner-lazy` | que nadie devuelve `@zxing` al chunk inicial |

### El criterio: probar lo que falla EN SILENCIO

Los tests que más valen aquí no comprueban que algo funcione. Comprueban que
algo **no se rompa sin avisar**:

- Un nombre de canal mal escrito **no da error**: la suscripción se establece y
  no llega nada. El síntoma aparece días después como "a mí no me salta la
  comanda".
- Un `false || null` convierte un booleano en NULL y la columna vuelve a su
  DEFAULT: **apagar un interruptor lo dejaba encendido**.
- Un import estático de `@zxing` devuelve 1,4 MB al chunk inicial sin que falle
  nada.
- Un índice de `mesa_item_pagos` mal reasignado hace que el pago del vino apunte
  al postre. No se nota hasta dividir la cuenta.

Ninguno de esos aparece como un error. Todos aparecen como *"qué raro, esto
antes funcionaba"*.

---

## 6. Lo que la suite E2E NO estaba cubriendo

Descubierto al final, y conviene no olvidarlo:

`PLAYWRIGHT_BASE_URL` estaba fijado a la URL de producción **en los dos
workflows**. En un pull request, los 209 tests E2E interrogaban **el sitio ya
desplegado**, no el código propuesto. **Habrían pasado en verde con el PR
completamente roto.** Era monitorización disfrazada de puerta de calidad.

Arreglado con un gate de dos niveles (ver la cabecera de
`.github/workflows/e2e.yml`):

- **Pull request** → preview efímera de ese commit → 143 de 214.
- **Push a main** → se espera a que el despliegue termine, y se prueba el
  **alias** del entorno → 205 de 214.

La diferencia de cobertura no es arbitraria: el tenant se resuelve por
**hostname**, y una preview tiene un host efímero que no está en
`empresas.dominio`. Sin tenant, los flujos con sesión de camarero no pueden
correr. La cabecera `Host` tampoco se puede falsear: Vercel enruta con ella.

---

## Trampas que conviene recordar

- **`navigator.onLine` miente en positivo, pero no en negativo.** Si dice que no
  hay red, no la hay. Sirve para ahorrarse un intento condenado, no para confiar
  en que hay conexión.
- **Con la pantalla apagada los timers de la página se congelan.** Cualquier
  sincronización basada solo en `setInterval` tiene un agujero ahí.
- **`visibilitychange` se dispara en los dos sentidos.** Filtrar siempre.
- **Background Sync API no existe en el WebView de Android**, que es donde vive
  el APK de Capacitor, ni funciona de forma fiable en Electron. Se evaluó y se
  descartó: ver el commit `43da17c`.
- Al probar cualquier módulo de `src/core`, **moquear
  `@/core/infrastructure/logging/logger`** aunque el test sea de funciones
  puras: el logger construye el cliente de Supabase al cargarse.
