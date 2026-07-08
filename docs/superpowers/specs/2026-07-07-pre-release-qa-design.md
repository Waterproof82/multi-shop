# Pre-Release QA — Checklist de Smoke Test antes de Empaquetar

> Scope: flujos de operador únicamente (TPV, Waiter, Admin, Stock).
> Entorno requerido: `pnpm build && pnpm start` + APK instalada en PDA/dispositivo Android.
> Sin test runner automatizado — ejecución 100% manual.
> Marcar cada ítem con [x] al pasar o [!] si falla (anotar síntoma).

---

## Bloque 0 — Infraestructura

Verificar el entorno antes de empezar cualquier flujo funcional.

- [ ] `pnpm lint` termina sin errores
- [ ] `pnpm build` termina sin errores (ignorar "Skipping validation of types")
- [ ] `pnpm start` levanta el servidor y responde en `localhost:3000`
- [ ] Supabase alcanzable: abrir `/admin/login` y ver el formulario sin error de red
- [ ] APK instalada en el PDA y abre sin crash
- [ ] Capacitor bridge disponible: en la WebView, la app no muestra errores de `CapacitorBridge` en consola al cargar `/waiter`

---

## Bloque 1 — Autenticacion

### Admin / Superadmin

- [ ] Login admin con credenciales correctas → redirige a `/admin`
- [ ] Login admin con credenciales incorrectas → mensaje de error, sin crash
- [ ] Login superadmin → redirige a `/superadmin`, ve todas las empresas
- [ ] Cerrar sesion admin → cookie `admin_token` eliminada, redirige a `/admin/login`
- [ ] Acceder a `/admin` sin sesion → redirige a `/admin/login`

### RBAC — Cajero

- [ ] Login con rol `cajero` → redirige a `/tpv` (no a `/admin`)
- [ ] Intentar acceder a `/admin` con rol cajero → redirige o devuelve 403
- [ ] Intentar acceder a `/admin/stock` con rol cajero → bloqueado
- [ ] El sidebar del TPV visible para cajero no muestra opciones de admin

### RBAC — Encargado

- [ ] Login con rol `encargado` → accede a `/admin` con acceso restringido
- [ ] Encargado ve stock y analytics pero no configuracion de empresa ni empleados
- [ ] Encargado puede cerrar turno

### Waiter PIN

- [ ] Abrir `/waiter` en navegador prod → muestra formulario PIN
- [ ] PIN correcto → accede a grilla de mesas
- [ ] PIN incorrecto → mensaje de error, sin crash
- [ ] Abrir `/waiter` en APK → muestra spinner `isCheckingAuth` mientras verifica sesion, luego grilla de mesas (no flash de PIN si ya habia sesion)
- [ ] Matar la app y reabrir → sesion waiter persiste (cookie `waiter_token` sobrevive al kill gracias a `CookieManager.flush()`)
- [ ] `waiter_token` tiene `SameSite=lax` (verificar en DevTools → Application → Cookies)

---

## Bloque 2 — Turno de Caja (TPV)

- [ ] Sin turno activo: `/tpv` muestra pantalla de "Abrir turno"
- [ ] Abrir turno → queda registrado en DB, aparece nombre de operador y hora de apertura
- [ ] Cajero puede abrir turno
- [ ] Encargado puede abrir turno
- [ ] Mostrador: anadir producto al ticket → aparece en lista de pendientes
- [ ] Selector de pase: botones "1er pase / 2 pase / Postre / Bebida" visibles al tener items pendientes
- [ ] Seleccionar pase y enviar pedido → el pedido se guarda con el campo `pase` correcto
- [ ] Sin pase seleccionado → pedido se guarda con `pase = null` (sin error)
- [ ] Cerrar turno: formulario aparece con campo "Cuenta el efectivo sin mirar el sistema"
- [ ] Arqueo ciego: el total de efectivo teorico aparece como "—" mientras el campo de conteo esta vacio
- [ ] Introducir cifra contada → el teorico se revela y aparece la diferencia
- [ ] Cerrar turno → turno queda registrado, `/tpv` vuelve a mostrar pantalla de abrir turno

---

## Bloque 3 — Waiter / Mesas

- [ ] Grilla de mesas muestra mesas con su estado (libre / ocupada / llamada)
- [ ] Mesa ocupada: badge con numero de items pendientes o listos para servir
- [ ] Abrir sesion de mesa → mesa pasa a estado ocupada en la grilla
- [ ] Crear pedido desde waiter para una mesa → pedido aparece en lista de pendientes
- [ ] Lista de pendientes: pedido en estado `pendiente_validacion` visible
- [ ] Validar pedido → pasa a cocina/bar (deja de estar en pendientes como no validado)
- [ ] Pausar item (retener) en el formulario de validacion → item marcado como retenido
- [ ] Item retenido: aparece badge en el banner superior (icono pausa + numero)
- [ ] Liberar item retenido → pasa a cocina correctamente

---

## Bloque 4 — Cocina y Bar

- [ ] `/waiter/kitchen` muestra pedidos validados (no los en `pendiente_validacion`)
- [ ] Items agrupados por pase cuando hay mas de un pase en la vista: secciones "1er Pase", "2 Pase", etc.
- [ ] Items sin pase aparecen en seccion "Sin pase"
- [ ] Items retenidos NO visibles en cocina hasta que el camarero los libera
- [ ] Marcar item como preparado → desaparece de "Nuevos" y pasa a "Listos"
- [ ] `/waiter/bar` muestra solo items de categoria tipo `bebida`
- [ ] Marcar bebida como lista → desaparece de la lista de bar
- [ ] Items ya servidos NO aparecen en cocina ni en bar

### Badge "Listos para servir"

- [ ] Al marcar item como preparado, aparece circulo con numero en el icono de bebidas del banner waiter (para bebidas) o en icono de cocina (para comida) — segun la categoria
- [ ] Al servir el item desde el ticket de mesa, el badge decrementa

---

## Bloque 5 — Realtime

- [ ] Crear pedido desde TPV/mostrador → aparece en `/waiter/kitchen` sin recargar la pagina
- [ ] Marcar item preparado en cocina → badge en banner waiter se actualiza sin recargar
- [ ] Validar pedido en pendientes → cocina lo recibe sin recargar
- [ ] Mesa llama al camarero → badge de llamadas en banner waiter se actualiza sin recargar
- [ ] Abrir `/waiter/kitchen` en dos pestanas/dispositivos: marcar item en uno → se refleja en el otro
- [ ] Sin reconexion manual tras 5 min inactivo: los updates siguen llegando (Supabase WS no se cierra silenciosamente)

---

## Bloque 6 — Cobro y Cierre de Mesa

- [ ] Acceder al ticket de mesa → ver todos los pedidos de la mesa con sus items
- [ ] Items con estado `preparado` muestran boton "Servir"
- [ ] Servir todos los items → boton de cobro desbloqueado
- [ ] Si hay items pendientes de servir → cobro bloqueado (`hasPlatosPoServir`)
- [ ] Cobro efectivo: introducir importe, confirmar → sesion de mesa cerrada
- [ ] Cobro tarjeta: flujo Redsys iniciado (verificar que el redirect no da error 500)
- [ ] Propina: introducir propina en euros → se suma al total cobrado
- [ ] Tras cobro: mesa vuelve a estado libre en la grilla

---

## Bloque 7 — Stock

- [ ] `/admin/stock/ingredientes`: listar, crear ingrediente, editar nombre/umbral, eliminar
- [ ] `/admin/stock/recetas`: crear receta para producto, asignar ingredientes con cantidades
- [ ] `/admin/stock/mermas`: registrar merma → aparece en movimientos con tipo `merma`
- [ ] `/admin/stock/movimientos`: historial visible con tipos entrada/deduccion/ajuste/merma/inventario
- [ ] Deduccion automatica: servir un item con receta configurada → `cantidad_actual` del ingrediente decremente en DB (verificar via SQL o panel de ingredientes)
- [ ] Umbral de alerta: si `cantidad_actual < umbral_alerta` → badge de stock bajo visible en header TPV
- [ ] Producto se deshabilita automaticamente cuando su ingrediente principal cae bajo el umbral
- [ ] `/admin/stock/inventario`: conteo ciego, mostrar desviaciones, confirmar → movimiento tipo `inventario` registrado en DB

---

## Bloque 8 — Admin y Analytics

- [ ] `/admin/productos`: CRUD completo sin errores
- [ ] `/admin/categorias`: CRUD, cambiar tipo (comida/bebida) actualiza productos en cascada
- [ ] `/tpv/analytics`: selector de periodo (hoy / semana / mes), KPIs cargan sin error
- [ ] `/tpv/analytics`: grafico por hora visible (Recharts carga correctamente con dynamic import)
- [ ] `/tpv/analytics`: top productos e historial de turnos visibles
- [ ] `/tpv/historial`: lista de turnos anteriores con totales
- [ ] Cajero intentando acceder a `/admin` → bloqueado (403 o redirect)
- [ ] Superadmin: cambiar tipo de empresa (restaurante/tienda) → sidebar reacciona sin recargar

---

## Bloque 9 — PWA y Capacitor

### Service Worker (requiere pnpm start)

- [ ] DevTools → Application → Service Workers: SW registrado con scope `/waiter`
- [ ] Desconectar red en DevTools → navegar a `/waiter` → muestra pagina offline (no pantalla en blanco)
- [ ] Reconectar red → app funciona normalmente sin recargar manualmente
- [ ] Requests a `/api/*` no se cachean (NetworkOnly): verificar en DevTools → Network que no hay "from ServiceWorker" en llamadas API

### Capacitor / APK

- [ ] APK abre directamente en la grilla de mesas si habia sesion activa (no muestra PIN)
- [ ] Matar app desde recientes → reabrir → sesion intacta (cookie persistida)
- [ ] Borrar datos de la app → reabrir → muestra formulario PIN (sesion limpia)
- [ ] Check de actualizacion: si hay una version nueva en el servidor, la app muestra aviso (o al menos no crashea al checkear)
- [ ] Sin conexion → la app muestra la pagina offline de `/waiter/offline` en lugar de pantalla en blanco
- [ ] Con conexion restaurada → la app recupera estado sin crash

---

## Criterio de Paso

El build esta listo para empaquetar cuando:

- Todos los items de Bloque 0 y Bloque 1 pasan sin excepcion
- Bloques 2-6 (flujos core de negocio): 0 fallos criticos (crash, dato incorrecto, flujo bloqueado)
- Bloques 7-9: se admite 1 fallo menor por bloque siempre que no bloquee el flujo principal y quede documentado como known issue

Cualquier fallo critico (crash, perdida de datos, autenticacion rota) bloquea el packaging hasta resolverse.
