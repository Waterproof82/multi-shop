# Pre-Release QA — Plan de Ejecucion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ejecutar el smoke-test completo de operador antes de empaquetar con Electron/Capacitor y confirmar que el sistema esta listo para produccion.

**Architecture:** QA manual organizado en 6 sesiones de trabajo. Cada sesion cubre bloques funcionales del spec (`docs/superpowers/specs/2026-07-07-pre-release-qa-design.md`). Al final de cada sesion se hace commit del resultado. Si algun check critico falla, se abre un issue y se bloquea el packaging hasta resolverlo.

**Tech Stack:** Next.js 15 (pnpm build/start), Supabase, APK Android instalada en PDA, DevTools Chrome/Chromium.

---

## Datos de prueba necesarios (preparar antes de empezar)

Tener listos en Supabase (o en la empresa de prueba):

- **Admin completo**: credenciales de un usuario con `rol = 'admin'`
- **Cajero**: credenciales de un usuario con `rol = 'cajero'`
- **Encargado**: credenciales de un usuario con `rol = 'encargado'`
- **Waiter PIN**: PIN de un camarero activo en la empresa de prueba
- **Productos con receta**: al menos 1 producto con ingredientes y cantidades configuradas en `/admin/stock/recetas`
- **Ingrediente con umbral**: al menos 1 ingrediente con `umbral_alerta > 0` y `cantidad_actual` cerca del umbral
- **Mesa activa**: al menos 2 mesas configuradas en la empresa de prueba

---

## Sesion 1 — Infraestructura y Autenticacion (Bloques 0 y 1)

**Duracion estimada:** 20-30 min
**Entorno:** Navegador (pnpm start) + APK

### Task 1: Preparar el entorno

**Files:**
- No se modifica ningun archivo — solo setup

- [ ] **Step 1: Lint y build**

```bash
cd multi_shop
pnpm lint
```

Esperado: 0 errores. Si hay errores, resolverlos antes de continuar.

```bash
pnpm build
```

Esperado: build completo. Ignorar "Skipping validation of types". Si hay errores de compilacion, resolverlos antes de continuar.

- [ ] **Step 2: Levantar servidor de produccion**

```bash
pnpm start
```

Esperado: `ready - started server on 0.0.0.0:3000`

- [ ] **Step 3: Verificar servidor**

Abrir `http://localhost:3000/admin/login` en Chrome. Debe mostrar el formulario de login sin errores de red en consola.

- [ ] **Step 4: Instalar APK en PDA**

```
adb install -r waiter-N.apk
```

O instalar manualmente desde el gestor de archivos. Abrir la app y verificar que carga sin crash.

- [ ] **Step 5: Verificar Capacitor bridge**

En la WebView del PDA, navegar a `/waiter`. Abrir DevTools remoto (`chrome://inspect`). Verificar que la consola no muestra errores de `CapacitorBridge` ni `Failed to load`.

- [ ] **Step 6: Commit estado inicial**

```bash
# No hay cambios de codigo — solo verificar que el entorno esta OK
# Si hubo fixes de lint/build en Step 1, commitearlos antes de continuar
git status
```

---

### Task 2: Verificar autenticacion admin y RBAC

- [ ] **Step 1: Login admin**

Navegar a `http://localhost:3000/admin/login`. Introducir credenciales del admin. Esperado: redirige a `/admin`. La cookie `admin_token` debe estar presente en DevTools → Application → Cookies.

- [ ] **Step 2: Logout admin**

Hacer click en "Cerrar sesion". Esperado: redirige a `/admin/login`. Cookie `admin_token` eliminada.

- [ ] **Step 3: Acceso sin sesion**

Navegar directamente a `http://localhost:3000/admin`. Esperado: redirige a `/admin/login`.

- [ ] **Step 4: Login superadmin**

Introducir credenciales de superadmin. Esperado: redirige a `/superadmin`, lista de empresas visible.

- [ ] **Step 5: Login cajero**

Iniciar sesion con el usuario `rol = 'cajero'`. Esperado: redirige a `/tpv`, NO a `/admin`. El sidebar no muestra opciones de backoffice.

- [ ] **Step 6: Cajero bloqueado en admin**

Con la sesion de cajero activa, navegar a `http://localhost:3000/admin`. Esperado: redirige a `/admin/login` o devuelve 403. Navegar a `http://localhost:3000/admin/stock`. Esperado: idem.

- [ ] **Step 7: Login encargado**

Iniciar sesion con el usuario `rol = 'encargado'`. Esperado: accede a `/admin`. Verificar que ve Stock y Analytics en el sidebar pero NO ve "Configuracion de empresa" ni "Empleados".

- [ ] **Step 8: Login waiter PIN en navegador**

Navegar a `http://localhost:3000/waiter`. Debe mostrar el formulario de PIN. Introducir PIN correcto. Esperado: redirige a la grilla de mesas.

- [ ] **Step 9: PIN incorrecto**

En el formulario PIN, introducir un PIN erroneo. Esperado: mensaje de error visible, sin crash.

- [ ] **Step 10: Verificar cookie waiter SameSite**

Con sesion waiter activa, abrir DevTools → Application → Cookies → `localhost`. Buscar `waiter_token`. Verificar que `SameSite` es `Lax`.

- [ ] **Step 11: Sesion waiter en APK**

En el PDA, abrir la app. Si ya habia sesion activa (del setup), debe mostrar la grilla de mesas directamente — NO el formulario PIN. Verificar que el spinner de `isCheckingAuth` aparece brevemente antes de la grilla (sin flash de PIN).

- [ ] **Step 12: Persistencia tras kill**

En el PDA, matar la app desde el gestor de aplicaciones recientes. Reabrir. Esperado: sesion intacta, grilla de mesas directamente.

- [ ] **Step 13: Anotar resultados**

En `docs/superpowers/specs/2026-07-07-pre-release-qa-design.md`, marcar con `[x]` los items que pasaron y con `[!]` los que fallaron (anotar el sintoma junto al `[!]`).

- [ ] **Step 14: Commit resultados Sesion 1**

```bash
git add docs/superpowers/specs/2026-07-07-pre-release-qa-design.md
git commit -m "qa: sesion 1 — infraestructura y autenticacion"
```

---

## Sesion 2 — TPV y Waiter/Mesas (Bloques 2 y 3)

**Duracion estimada:** 30-40 min
**Entorno:** Navegador (pnpm start)

### Task 3: Flujo completo de turno de caja

- [ ] **Step 1: Iniciar sesion como admin o encargado**

Navegar a `http://localhost:3000/tpv`. Si no hay turno activo, debe mostrar la pantalla "Abrir turno".

- [ ] **Step 2: Abrir turno**

Hacer click en "Abrir turno". Introducir los datos requeridos. Confirmar. Esperado: el TPV muestra la pantalla principal con nombre del operador y hora de apertura. Verificar en Supabase que hay un registro en `tpv_turnos` con `estado = 'abierto'`.

- [ ] **Step 3: Crear pedido en mostrador**

Seleccionar una mesa. Anadir al menos 2 productos al ticket. Esperado: productos aparecen en la lista de pendientes del ticket.

- [ ] **Step 4: Selector de pase**

Con items en el ticket, verificar que aparecen los botones "1er pase", "2 pase", "Postre", "Bebida". Seleccionar "1er pase". Esperado: boton queda activo (resaltado).

- [ ] **Step 5: Enviar pedido con pase**

Hacer click en "Enviar pedido". Verificar en Supabase (`SELECT pase FROM pedidos ORDER BY created_at DESC LIMIT 1`) que el campo `pase` es `'primer'`.

- [ ] **Step 6: Enviar pedido sin pase**

Crear otro pedido sin seleccionar pase. Enviar. Verificar en Supabase que `pase` es `NULL`.

- [ ] **Step 7: Arqueo ciego — campo vacio**

Navegar a "Cerrar turno". En el formulario, el campo de conteo de efectivo debe estar vacio. Verificar que el total teorico aparece como `—` (no como un numero).

- [ ] **Step 8: Arqueo ciego — campo relleno**

Introducir una cifra en el campo de conteo (por ejemplo, `100`). Verificar que el total teorico se revela y aparece la diferencia calculada.

- [ ] **Step 9: Cerrar turno**

Completar el formulario y confirmar el cierre. Esperado: turno cerrado, `/tpv` vuelve a mostrar la pantalla "Abrir turno". Verificar en Supabase que el registro en `tpv_turnos` tiene `estado = 'cerrado'`.

- [ ] **Step 10: RBAC cajero — abrir turno**

Iniciar sesion como cajero. Navegar a `/tpv`. Verificar que puede abrir turno.

### Task 4: Waiter — mesas y pedidos

- [ ] **Step 1: Login waiter**

Navegar a `http://localhost:3000/waiter`. Introducir PIN. Grilla de mesas visible.

- [ ] **Step 2: Estado de mesas**

Verificar que las mesas muestran su estado correcto (libre / ocupada). Las ocupadas deben mostrar badge con numero de items.

- [ ] **Step 3: Crear pedido desde waiter**

Seleccionar una mesa libre. Anadir un pedido. Enviar. Esperado: pedido aparece en `/waiter/pendientes` con estado `pendiente_validacion`.

- [ ] **Step 4: Validar pedido**

En `/waiter/pendientes`, seleccionar el pedido. Hacer click en validar (sin pausar nada). Esperado: pedido pasa a cocina, desaparece de pendientes sin validar.

- [ ] **Step 5: Pausar item (retener)**

Crear otro pedido. En el formulario de validacion, pausar al menos 1 item. Validar. Esperado: el item pausado aparece como retenido (badge en banner superior con icono pausa + numero). El item NO aparece en `/waiter/kitchen`.

- [ ] **Step 6: Liberar item retenido**

Desde el banner o la lista de retenidos, liberar el item pausado. Esperado: el item aparece ahora en `/waiter/kitchen`.

- [ ] **Step 7: Anotar resultados Sesion 2**

Marcar items en el spec con `[x]` o `[!]`.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/specs/2026-07-07-pre-release-qa-design.md
git commit -m "qa: sesion 2 — tpv turno y waiter mesas"
```

---

## Sesion 3 — Cocina, Bar y Realtime (Bloques 4 y 5)

**Duracion estimada:** 25-35 min
**Entorno:** Dos ventanas/dispositivos con sesion waiter activa

### Task 5: Cocina y Bar

- [ ] **Step 1: Verificar pedido en kitchen**

Navegar a `http://localhost:3000/waiter/kitchen`. Verificar que el pedido validado en Sesion 2 aparece aqui. Los pedidos en `pendiente_validacion` NO deben aparecer.

- [ ] **Step 2: Agrupacion por pase**

Si hay pedidos con pase asignado, verificar que el KDS muestra secciones separadas: "1er Pase", etc. Si todos los pedidos son sin pase, crear uno con pase desde el mostrador TPV, validarlo, y verificar la agrupacion en kitchen.

- [ ] **Step 3: Item retenido no visible**

Verificar que el item retenido de la Sesion 2 NO aparece en kitchen (hasta que se libere).

- [ ] **Step 4: Marcar item preparado**

En kitchen, hacer click en un item para marcarlo como preparado. Esperado: item desaparece de "Nuevos" y aparece en "Listos". El badge de "listos para servir" aparece en el banner del waiter.

- [ ] **Step 5: Bar — bebidas**

Navegar a `http://localhost:3000/waiter/bar`. Verificar que solo aparecen items de categorias con `tipo_producto = 'bebida'`. Marcar una bebida como lista. Verificar que el badge del icono de bebidas en el banner se actualiza.

- [ ] **Step 6: Items servidos no visibles**

Una vez servido un item desde el ticket de mesa, verificar que no reaparece en kitchen ni bar.

### Task 6: Realtime

Para este bloque, abrir DOS ventanas: una con `/waiter/kitchen` y otra con la vista de mesas o el mostrador TPV.

- [ ] **Step 1: Update en tiempo real — kitchen**

En la segunda ventana, crear un pedido nuevo y validarlo. En la primera ventana (`/waiter/kitchen`), verificar que el pedido aparece SIN recargar la pagina. Tiempo maximo de aparicion esperado: 2-3 segundos.

- [ ] **Step 2: Update en tiempo real — banner waiter**

Marcar un item como preparado en kitchen. En la ventana de mesas, verificar que el badge del banner se actualiza sin recargar.

- [ ] **Step 3: Llamada de mesa**

Desde la vista del cliente (o simulando la llamada en Supabase: `UPDATE mesa_sesiones SET llamada_activa = true WHERE id = '...'`), verificar que el badge de llamadas del banner waiter se actualiza en tiempo real.

- [ ] **Step 4: Dos dispositivos**

Abrir `/waiter/kitchen` en el PDA y en el navegador desktop. Marcar un item en el desktop. Verificar que desaparece en el PDA sin recargar. Idem en sentido inverso.

- [ ] **Step 5: Inactividad prolongada**

Dejar ambas ventanas abiertas 5-10 minutos sin interaccion. Luego crear un pedido. Verificar que el update llega sin necesidad de recargar (el WebSocket de Supabase no se cierra silenciosamente).

- [ ] **Step 6: Anotar resultados Sesion 3**

Marcar items en el spec.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-07-07-pre-release-qa-design.md
git commit -m "qa: sesion 3 — cocina bar y realtime"
```

---

## Sesion 4 — Cobro y Stock (Bloques 6 y 7)

**Duracion estimada:** 30-40 min
**Entorno:** Navegador (pnpm start) + acceso a Supabase SQL Editor

### Task 7: Cobro y cierre de mesa

- [ ] **Step 1: Acceder al ticket de mesa**

Desde la grilla de mesas waiter, seleccionar una mesa con pedidos. Navegar al ticket. Verificar que todos los pedidos de la mesa son visibles con sus items.

- [ ] **Step 2: Boton servir bloqueado**

Si hay items en estado `en_preparacion` o `pendiente`, verificar que el boton de cobro esta bloqueado (`hasPlatosPoServir`). El mensaje de bloqueo debe ser claro.

- [ ] **Step 3: Servir items**

Marcar todos los items como servidos desde el ticket. Esperado: boton de cobro se desbloquea.

- [ ] **Step 4: Propina**

Introducir una propina en euros. Verificar que el total se actualiza sumando la propina.

- [ ] **Step 5: Cobro efectivo**

Seleccionar "Efectivo". Introducir el importe. Confirmar. Esperado: sesion de mesa cerrada, mesa vuelve a estado libre en la grilla.

- [ ] **Step 6: Cobro tarjeta**

Repetir el flujo completo con otra mesa y seleccionar "Tarjeta". Verificar que el redirect de Redsys se inicia sin error 500. (No es necesario completar el pago real — verificar solo que el redirect ocurre correctamente.)

### Task 8: Stock

- [ ] **Step 1: CRUD ingredientes**

Navegar a `http://localhost:3000/admin/stock/ingredientes`. Crear un ingrediente nuevo. Editar su nombre y umbral. Verificar que aparece en la lista. Eliminarlo. Verificar que desaparece.

- [ ] **Step 2: Recetas**

Navegar a `/admin/stock/recetas`. Seleccionar un producto. Asignar ingredientes con cantidades. Guardar. Verificar que la receta se muestra correctamente.

- [ ] **Step 3: Mermas**

Navegar a `/admin/stock/mermas`. Registrar una merma para un ingrediente. Verificar que aparece en `/admin/stock/movimientos` con tipo `merma`.

- [ ] **Step 4: Deduccion automatica**

Antes del test, anotar el `cantidad_actual` del ingrediente con receta configurada:

```sql
SELECT nombre, cantidad_actual FROM ingredientes WHERE nombre = 'nombre_del_ingrediente';
```

Crear un pedido con ese producto en el TPV, enviarlo a cocina, marcarlo como servido. Luego verificar:

```sql
SELECT nombre, cantidad_actual FROM ingredientes WHERE nombre = 'nombre_del_ingrediente';
```

Esperado: `cantidad_actual` decrementado segun la cantidad de la receta.

- [ ] **Step 5: Badge de stock bajo**

Si el ingrediente cayo bajo `umbral_alerta`, verificar que el badge de stock bajo aparece en el header del TPV (`TpvHeader` y `CobroMetodoPropina`).

- [ ] **Step 6: Inventario fisico**

Navegar a `/admin/stock/inventario`. Verificar que aparecen todos los ingredientes con inputs. Introducir cantidades para 2-3 ingredientes. Hacer click en "Revisar desviaciones". Verificar que las desviaciones se muestran correctamente. Confirmar. Verificar en Supabase:

```sql
SELECT * FROM movimientos_stock WHERE tipo = 'inventario' ORDER BY created_at DESC LIMIT 5;
```

Esperado: filas con tipo `inventario` para los ingredientes modificados.

- [ ] **Step 7: Anotar resultados Sesion 4**

Marcar items en el spec.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/specs/2026-07-07-pre-release-qa-design.md
git commit -m "qa: sesion 4 — cobro y stock"
```

---

## Sesion 5 — Admin, Analytics, PWA y Capacitor (Bloques 8 y 9)

**Duracion estimada:** 25-35 min
**Entorno:** Navegador (pnpm start) + PDA con APK

### Task 9: Admin y Analytics

- [ ] **Step 1: CRUD productos**

Navegar a `/admin/productos`. Crear un producto nuevo con imagen. Editar su nombre. Verificar que aparece en la carta publica. Eliminarlo.

- [ ] **Step 2: Categorias — tipo producto**

Navegar a `/admin/categorias`. Cambiar el tipo de una categoria de "comida" a "bebida". Verificar que los productos de esa categoria ahora aparecen en la vista de bar (`/waiter/bar`) y no en kitchen. Revertir el cambio.

- [ ] **Step 3: TPV Analytics — carga**

Navegar a `/tpv/analytics`. Verificar que los KPIs cargan (ventas, covers, ticket medio). Si no hay datos del dia, cambiar el selector a "Esta semana" o "Este mes".

- [ ] **Step 4: TPV Analytics — grafico**

Verificar que el grafico de ventas por hora se renderiza sin errores de consola. (Recharts se carga con `dynamic()` — verificar que no hay flash de "loading" permanente.)

- [ ] **Step 5: Historial de turnos**

Navegar a `/tpv/historial`. Verificar que aparecen los turnos cerrados en sesiones anteriores.

- [ ] **Step 6: Cajero bloqueado en admin**

Iniciar sesion como cajero. Intentar navegar a `/admin`. Esperado: bloqueado (403 o redirect a login TPV).

### Task 10: PWA — Service Worker

- [ ] **Step 1: Verificar registro del SW**

Con el servidor en `pnpm start` (produccion), abrir DevTools → Application → Service Workers. Verificar que hay un SW activo con scope `/waiter`.

- [ ] **Step 2: Offline — waiter**

Con el SW activo, ir a DevTools → Network → marcar "Offline". Navegar a `http://localhost:3000/waiter`. Esperado: se muestra la pagina offline (`/waiter/offline`), no una pantalla en blanco.

- [ ] **Step 3: API no cacheada**

Desmarcar "Offline". En DevTools → Network, verificar que los requests a `/api/*` NO muestran "from ServiceWorker" (son siempre NetworkOnly).

- [ ] **Step 4: Reconexion**

Volver a marcar Online. Navegar en la app. Verificar que todo funciona normalmente sin recargar manualmente.

### Task 11: Capacitor — checks especificos del PDA

- [ ] **Step 1: Apertura directa con sesion**

Con sesion previa activa en el PDA, abrir la app. Verificar que va directamente a la grilla de mesas sin mostrar PIN (spinner breve, luego grilla).

- [ ] **Step 2: Kill y persistencia**

Matar la app. Reabrir. Sesion intacta.

- [ ] **Step 3: Borrar datos**

En Ajustes → Apps → [nombre app] → Borrar datos. Reabrir la app. Debe mostrar el formulario PIN (sesion limpia).

- [ ] **Step 4: Check de version**

Verificar que la app no muestra un error al checkear la version (aunque no haya una actualizacion disponible, no debe crashear).

- [ ] **Step 5: Offline en APK**

En el PDA, desactivar WiFi y datos. Abrir la app. Esperado: muestra la pagina offline, no pantalla en blanco.

- [ ] **Step 6: Reconexion en APK**

Reactivar WiFi. La app debe recuperar estado sin crash.

- [ ] **Step 7: Anotar resultados Sesion 5**

Marcar todos los items restantes del spec con `[x]` o `[!]`.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/specs/2026-07-07-pre-release-qa-design.md
git commit -m "qa: sesion 5 — admin analytics pwa capacitor"
```

---

## Sesion 6 — Decision Go / No-Go

### Task 12: Evaluar resultados y decidir

- [ ] **Step 1: Contar fallos**

Abrir `docs/superpowers/specs/2026-07-07-pre-release-qa-design.md`. Contar items marcados con `[!]` por bloque.

- [ ] **Step 2: Aplicar criterio de paso**

Del spec:
- Bloque 0 y 1 (infraestructura + autenticacion): **0 fallos tolerados**. Cualquier fallo bloquea.
- Bloques 2-6 (flujos core de negocio): **0 fallos criticos** (crash, dato incorrecto, flujo bloqueado).
- Bloques 7-9 (stock, admin, PWA, Capacitor): se admite **1 fallo menor por bloque** si no bloquea el flujo principal.

- [ ] **Step 3a: Si GO**

```bash
git tag qa-passed-v1
git push origin develop --tags
```

Continuar con el proceso de packaging (Electron o Capacitor segun corresponda).

- [ ] **Step 3b: Si NO-GO**

Para cada item `[!]` critico, abrir un issue o tarea con:
- Sintoma exacto observado
- Bloque y numero de step donde fallo
- Reproduccion minima

Resolver los fallos, volver a ejecutar solo los bloques afectados, y re-evaluar.

- [ ] **Step 4: Commit final**

```bash
git add docs/superpowers/specs/2026-07-07-pre-release-qa-design.md
git commit -m "qa: resultado final pre-release — go/no-go documentado"
```
