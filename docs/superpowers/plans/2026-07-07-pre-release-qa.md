# Pre-Release QA — Plan de Ejecucion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verificar que el sistema esta listo para packaging ejecutando QA en tres fases: filtro web rapido, luego QA nativo de cada plataforma (Electron para TPV, Capacitor para waiter).

**Architecture:**
- **Fase 1 (Web):** filtro funcional en navegador — detecta el 90% de bugs antes de empaquetar. Cubre admin, TPV y waiter en browser. Si falla algo critico, se corrige antes de seguir.
- **Fase 2 (Electron):** QA nativo del TPV en Windows. Verifica solo lo que el browser no puede: ventana, shortcuts, instalador, auto-update.
- **Fase 3 (Capacitor):** QA nativo del waiter en Android/PDA. Verifica: cookie SameSite, persistencia de sesion, bridge, offline.

**Tech Stack:** Next.js 15 (pnpm build/start), Supabase, Electron (Windows), APK Android en PDA, DevTools Chrome/Chromium.

---

## Datos de prueba necesarios (preparar antes de empezar)

Tener listos en Supabase (empresa de prueba):

- **Admin**: credenciales con `rol = 'admin'`
- **Cajero**: credenciales con `rol = 'cajero'`
- **Encargado**: credenciales con `rol = 'encargado'`
- **Waiter PIN**: PIN de un camarero activo
- **Producto con receta**: al menos 1 producto con ingredientes configurados en `/admin/stock/recetas`
- **Ingrediente con umbral**: al menos 1 ingrediente con `umbral_alerta > 0` y `cantidad_actual` cerca del umbral
- **Mesas**: al menos 2 mesas configuradas

---

# FASE 1 — QA Web (filtro funcional)

> Entorno: `pnpm build && pnpm start`, navegador desktop.
> Objetivo: detectar bugs funcionales antes de empaquetar cualquier plataforma.
> Criterio de salida: 0 fallos criticos en Bloques 0-1; 0 fallos criticos en flujos core (Bloques 2-7).

---

## Sesion 1 — Infraestructura y Autenticacion (Bloques 0 y 1)

### Task 1: Preparar el entorno

- [ ] **Step 1: Lint**

```bash
pnpm lint
```

Esperado: `EXIT:0`, 0 errores.

- [ ] **Step 2: Build**

```bash
pnpm build
```

Esperado: build completo. Ignorar warnings de `baseline-browser-mapping`. Si hay errores de compilacion, resolverlos antes de continuar.

- [ ] **Step 3: Levantar servidor**

```bash
pnpm start
```

Abrir `http://localhost:3000/admin/login`. Debe mostrar el formulario sin errores de red en consola.

---

### Task 2: Autenticacion y RBAC

- [ ] **Step 1: Login admin**

Navegar a `/admin/login`. Credenciales admin → redirige a `/admin`. Cookie `admin_token` presente en DevTools → Application → Cookies.

- [ ] **Step 2: Logout**

Cerrar sesion → redirige a `/admin/login`. Cookie `admin_token` eliminada.

- [ ] **Step 3: Acceso sin sesion**

Navegar directamente a `/admin` → redirige a `/admin/login`.

- [ ] **Step 4: Login superadmin**

Credenciales superadmin → redirige a `/superadmin`, lista de empresas visible.

- [ ] **Step 5: Login cajero**

Credenciales cajero → redirige a `/tpv`, NO a `/admin`. Sidebar sin opciones de backoffice.

- [ ] **Step 6: Cajero bloqueado en admin**

Con sesion cajero, navegar a `/admin` → redirige o 403. Navegar a `/admin/stock` → idem.

- [ ] **Step 7: Login encargado**

Credenciales encargado → accede a `/admin`. Ve Stock y Analytics en sidebar. NO ve "Configuracion de empresa" ni gestion de empleados.

- [ ] **Step 8: Encargado puede cerrar turno**

Con sesion encargado activa, navegar a `/tpv`. Si hay turno abierto, verificar que el boton "Cerrar turno" es accesible. (No hace falta cerrarlo — solo confirmar que no esta bloqueado.)

- [ ] **Step 9: Login waiter PIN**

Navegar a `/waiter` → formulario PIN. PIN correcto → grilla de mesas. PIN incorrecto → error visible, sin crash.

- [ ] **Step 10: Cookie waiter SameSite**

Con sesion waiter activa, DevTools → Application → Cookies → buscar `waiter_token`. Verificar que `SameSite = Lax`.

- [ ] **Step 11: Commit resultados Sesion 1**

Marcar en `docs/superpowers/specs/2026-07-07-pre-release-qa-design.md` los Bloques 0 y 1 con `[x]` o `[!]`.

```bash
git add docs/superpowers/specs/2026-07-07-pre-release-qa-design.md
git commit -m "qa(web): sesion 1 — infraestructura y autenticacion"
```

---

## Sesion 2 — TPV y Waiter (Bloques 2 y 3)

### Task 3: Flujo completo de turno TPV

- [ ] **Step 1: Abrir turno**

Login admin o encargado. Navegar a `/tpv`. Si no hay turno, "Abrir turno" → completar y confirmar. Verificar nombre del operador y hora de apertura visible.

```sql
-- Verificar en Supabase:
SELECT estado, operador_nombre, abierto_at FROM tpv_turnos ORDER BY created_at DESC LIMIT 1;
```

Esperado: `estado = 'abierto'`.

- [ ] **Step 2: Pedido con pase**

Seleccionar una mesa en el mostrador. Anadir 2 productos. Seleccionar "1er pase". Enviar pedido.

```sql
SELECT pase FROM pedidos ORDER BY created_at DESC LIMIT 1;
```

Esperado: `pase = 'primer'`.

- [ ] **Step 3: Pedido sin pase**

Nuevo pedido, sin seleccionar pase. Enviar.

```sql
SELECT pase FROM pedidos ORDER BY created_at DESC LIMIT 1;
```

Esperado: `pase = NULL`.

- [ ] **Step 4: Arqueo ciego — vacio**

Navegar a "Cerrar turno". Campo de conteo vacio → total teorico debe mostrar `—`.

- [ ] **Step 5: Arqueo ciego — relleno**

Introducir una cifra (ej: `150`). El total teorico se revela y aparece la diferencia.

- [ ] **Step 6: Cerrar turno**

Completar el formulario y confirmar.

```sql
SELECT estado FROM tpv_turnos ORDER BY created_at DESC LIMIT 1;
```

Esperado: `estado = 'cerrado'`. `/tpv` muestra pantalla "Abrir turno".

- [ ] **Step 7: RBAC cajero — abrir turno**

Login cajero → navegar a `/tpv` → verificar que puede abrir turno sin bloqueo.

### Task 4: Waiter — mesas y pedidos

- [ ] **Step 1: Grilla de mesas**

Login waiter PIN → grilla de mesas con estado correcto (libre/ocupada).

- [ ] **Step 2: Crear pedido desde waiter**

Seleccionar mesa libre → anadir pedido → enviar. Verificar en `/waiter/pendientes` que aparece en `pendiente_validacion`.

- [ ] **Step 3: Validar pedido**

En pendientes, seleccionar pedido y validar sin pausar items. Pedido desaparece de pendientes no validados.

- [ ] **Step 4: Pausar y liberar item**

Crear pedido nuevo. En validacion, pausar 1 item. Confirmar. Verificar: badge de retenidos en banner visible, item NO aparece en `/waiter/kitchen`. Luego liberar el item desde el banner → aparece en kitchen.

- [ ] **Step 5: Commit Sesion 2**

Marcar Bloques 2 y 3 en el spec.

```bash
git add docs/superpowers/specs/2026-07-07-pre-release-qa-design.md
git commit -m "qa(web): sesion 2 — tpv y waiter mesas"
```

---

## Sesion 3 — Cocina, Bar y Realtime (Bloques 4 y 5)

### Task 5: Cocina y Bar

Abrir DOS ventanas: una con `/waiter/kitchen`, otra con el mostrador o mesas.

- [ ] **Step 1: Pedido validado aparece en kitchen**

Confirmar que el pedido validado en Sesion 2 aparece en `/waiter/kitchen`. Items en `pendiente_validacion` NO deben aparecer.

- [ ] **Step 2: Agrupacion por pase**

Verificar que el pedido con pase `'primer'` aparece en seccion "1er Pase". Items sin pase en "Sin pase". Si todos los pedidos son sin pase, crear uno con pase desde el mostrador, validarlo y verificar agrupacion.

- [ ] **Step 3: Item retenido no visible**

Confirmar que el item pausado en Sesion 2 NO aparece en kitchen hasta liberarlo.

- [ ] **Step 4: Marcar preparado**

Marcar un item como preparado en kitchen → desaparece de "Nuevos", aparece en "Listos". Badge de "listos para servir" aparece en el banner waiter.

- [ ] **Step 5: Bar — bebidas**

En `/waiter/bar`, solo items de categorias `tipo_producto = 'bebida'`. Marcar bebida como lista → badge de bebidas en banner se actualiza.

### Task 6: Realtime

- [ ] **Step 1: Update en kitchen sin reload**

En la segunda ventana crear y validar un pedido nuevo. En `/waiter/kitchen` debe aparecer en menos de 3 segundos sin recargar.

- [ ] **Step 2: Badge waiter sin reload**

Marcar item preparado en kitchen → badge del banner waiter en la otra ventana se actualiza solo.

- [ ] **Step 3: Dos ventanas simultaneas**

Abrir `/waiter/kitchen` en dos pestanas. Marcar item en una → desaparece en la otra sin recargar.

- [ ] **Step 4: Inactividad 5 min**

Dejar ambas ventanas abiertas 5-10 min sin interaccion. Crear pedido → update llega sin recargar (WebSocket no se cierra silenciosamente).

- [ ] **Step 5: Commit Sesion 3**

Marcar Bloques 4 y 5 en el spec.

```bash
git add docs/superpowers/specs/2026-07-07-pre-release-qa-design.md
git commit -m "qa(web): sesion 3 — cocina bar y realtime"
```

---

## Sesion 4 — Cobro y Stock (Bloques 6 y 7)

### Task 7: Cobro y cierre de mesa

- [ ] **Step 1: Ticket de mesa**

Desde la grilla waiter, seleccionar mesa con pedidos. Ticket muestra todos los pedidos.

- [ ] **Step 2: Bloqueo de cobro**

Si hay items no servidos, el boton de cobro debe estar bloqueado. Mensaje claro.

- [ ] **Step 3: Servir items**

Marcar todos como servidos → boton de cobro se desbloquea.

- [ ] **Step 4: Propina**

Introducir propina → total se actualiza.

- [ ] **Step 5: Cobro efectivo**

Seleccionar "Efectivo" → confirmar → sesion de mesa cerrada. Mesa vuelve a libre en la grilla.

- [ ] **Step 6: Cobro tarjeta**

Repetir con otra mesa. Seleccionar "Tarjeta" → verificar que el redirect Redsys se inicia sin error 500.

### Task 8: Stock

- [ ] **Step 1: CRUD ingredientes**

`/admin/stock/ingredientes`: crear → editar nombre y umbral → verificar en lista → eliminar.

- [ ] **Step 2: Recetas**

`/admin/stock/recetas`: seleccionar producto → asignar ingredientes con cantidades → guardar → verificar que se muestra.

- [ ] **Step 3: Mermas**

`/admin/stock/mermas`: registrar merma. Verificar en `/admin/stock/movimientos` que aparece con tipo `merma`.

- [ ] **Step 4: Deduccion automatica**

Anotar `cantidad_actual` antes:

```sql
SELECT nombre, cantidad_actual FROM ingredientes WHERE nombre = 'nombre_del_ingrediente';
```

Crear pedido con ese producto en el TPV → enviar a cocina → marcar como servido. Verificar despues:

```sql
SELECT nombre, cantidad_actual FROM ingredientes WHERE nombre = 'nombre_del_ingrediente';
```

Esperado: `cantidad_actual` decrementado segun la receta.

- [ ] **Step 5: Badge de stock bajo**

Si el ingrediente quedo bajo `umbral_alerta`, badge de stock bajo visible en header TPV.

- [ ] **Step 6: Inventario fisico**

`/admin/stock/inventario`: introducir cantidades para 2-3 ingredientes → revisar desviaciones → confirmar.

```sql
SELECT tipo, cantidad, created_at FROM movimientos_stock WHERE tipo = 'inventario' ORDER BY created_at DESC LIMIT 5;
```

Esperado: filas con tipo `inventario`.

- [ ] **Step 7: Commit Sesion 4**

Marcar Bloques 6 y 7 en el spec.

```bash
git add docs/superpowers/specs/2026-07-07-pre-release-qa-design.md
git commit -m "qa(web): sesion 4 — cobro y stock"
```

---

## Sesion 5 — Admin, Analytics y PWA (Bloques 8 y 9-parcial)

### Task 9: Admin y Analytics

- [ ] **Step 1: CRUD productos**

`/admin/productos`: crear con imagen → editar nombre → verificar en lista → eliminar.

- [ ] **Step 2: Categorias tipo producto**

`/admin/categorias`: cambiar tipo de una categoria de "comida" a "bebida" → los productos de esa categoria aparecen en `/waiter/bar`. Revertir.

- [ ] **Step 3: TPV Analytics**

`/tpv/analytics`: KPIs cargan. Si no hay datos hoy, cambiar selector a "Esta semana". Grafico de horas se renderiza sin error. Top productos e historial visibles.

- [ ] **Step 4: Historial de turnos**

`/tpv/historial`: turnos cerrados anteriores visibles con totales.

- [ ] **Step 5: Cajero bloqueado en admin**

Login cajero → navegar a `/admin` → bloqueado.

### Task 10: Service Worker (PWA — browser)

- [ ] **Step 1: SW registrado**

DevTools → Application → Service Workers: SW activo con scope `/waiter`.

- [ ] **Step 2: Offline**

DevTools → Network → marcar Offline → navegar a `/waiter` → pagina offline visible (no pantalla en blanco).

- [ ] **Step 3: API no cacheada**

Desmarcar Offline → verificar en Network que requests a `/api/*` NO muestran "from ServiceWorker".

- [ ] **Step 4: Commit Sesion 5**

Marcar Bloques 8 y 9 (parcial) en el spec.

```bash
git add docs/superpowers/specs/2026-07-07-pre-release-qa-design.md
git commit -m "qa(web): sesion 5 — admin analytics y pwa"
```

---

## Decision Go / No-Go — Fase 1

### Task 11: Evaluar resultados web

- [ ] **Step 1: Contar fallos por bloque**

Abrir el spec y contar items `[!]` por bloque.

- [ ] **Step 2: Criterio**

- Bloques 0-1 (infraestructura + auth): **0 fallos tolerados**
- Bloques 2-7 (flujos core): **0 fallos criticos** (crash, dato incorrecto, flujo bloqueado)
- Bloques 8-9 (admin, analytics, PWA): se admite 1 fallo menor si no bloquea el flujo principal

- [ ] **Step 3a: Si NO-GO web**

Abrir tarea por cada `[!]` critico con: sintoma, bloque/step, reproduccion minima. Resolver y re-ejecutar solo los bloques afectados.

- [ ] **Step 3b: Si GO web**

```bash
git tag qa-web-passed-v1
```

Proceder a Fase 2 (Electron) y Fase 3 (Capacitor) segun prioridad.

---

# FASE 2 — QA Electron (TPV Windows)

> Entorno: instalador Electron ejecutado en Windows.
> Objetivo: verificar solo lo que el browser no puede — ventana nativa, shortcuts, auto-update.
> El build de Electron se genera DESPUES de que Fase 1 sea GO.

---

### Task 12: Build y setup Electron

- [ ] **Step 1: Generar build Electron**

Seguir el proceso de packaging Electron del proyecto (consultar `docs/context/` o el script de build correspondiente). Instalar el `.exe` o ejecutar el `.AppImage` en Windows.

- [ ] **Step 2: Abrir la app**

La app debe abrir sin crash. La ventana carga `/tpv` directamente.

- [ ] **Step 3: Login TPV en Electron**

Hacer login con rol admin o cajero dentro de la ventana Electron. Flujo de autenticacion identico al web.

### Task 13: Checks Electron-especificos

- [ ] **Step 1: Ventana y pantalla completa**

Verificar que la app entra en modo kiosk / pantalla completa correctamente (segun la configuracion del proyecto).

- [ ] **Step 2: Shortcuts de teclado**

Verificar que los shortcuts TPV (si los hay) funcionan dentro de la ventana Electron.

- [ ] **Step 3: Flujo TPV core**

Ejecutar el flujo minimo: abrir turno → pedido → cobro efectivo → cerrar turno. Todo dentro de la ventana Electron. Esperado: identico al web.

- [ ] **Step 4: Auto-update check**

La app consulta `/api/app/version`. Verificar que no crashea al checkear (aunque no haya actualizacion disponible).

- [ ] **Step 5: Cierre de app**

Cerrar la ventana Electron. Reabrir. Sesion admin debe persistir (cookie en electron store).

- [ ] **Step 6: Sin conexion**

Desconectar red. Abrir la app. Esperado: pagina offline o mensaje claro, no crash.

- [ ] **Step 7: Commit resultado Electron**

Marcar checks Electron en el spec con `[x]` o `[!]`.

```bash
git add docs/superpowers/specs/2026-07-07-pre-release-qa-design.md
git commit -m "qa(electron): checks nativos tpv windows"
```

### Task 14: Go / No-Go Electron

- [ ] **Step 1: Criterio**

0 fallos criticos (crash, flujo core bloqueado, autenticacion rota).

- [ ] **Step 2a: Si GO**

```bash
git tag qa-electron-passed-v1
```

- [ ] **Step 2b: Si NO-GO**

Abrir issue con reproduccion en Electron. Resolver y re-ejecutar Task 13.

---

# FASE 3 — QA Capacitor (Waiter Android/PDA)

> Entorno: APK instalada en PDA Android.
> Objetivo: verificar solo lo que el browser no puede — cookie SameSite, persistencia de sesion, bridge, offline nativo.
> El build APK se genera DESPUES de que Fase 1 sea GO.

---

### Task 15: Build y setup APK

- [ ] **Step 1: Generar APK**

Seguir el proceso documentado en `docs/context/capacitor-android-pda.md`:

```bash
# 1. Editar www/index.html si es necesario
# 2. Copiar assets
npx cap copy android
# 3. Bump versionCode en android/app/build.gradle
# 4. Build firmado
KEYSTORE_PASSWORD=... KEY_PASSWORD=... ./gradlew assembleRelease
```

- [ ] **Step 2: Instalar APK en PDA**

```bash
adb install -r waiter-N.apk
```

O instalar manualmente. Verificar que abre sin crash.

### Task 16: Checks Capacitor-especificos

- [ ] **Step 1: Sesion directa sin PIN**

Si habia sesion previa activa, abrir la app → spinner breve → grilla de mesas directamente. Sin flash de PIN.

- [ ] **Step 2: Persistencia tras kill**

Matar la app desde recientes → reabrir → sesion intacta.

- [ ] **Step 3: Borrar datos → sesion limpia**

Ajustes → Apps → [nombre app] → Borrar datos → reabrir → formulario PIN.

- [ ] **Step 4: Cookie SameSite**

Con sesion activa, abrir DevTools remoto (`chrome://inspect` en desktop conectado por USB). Verificar `waiter_token` tiene `SameSite = Lax`.

- [ ] **Step 5: Capacitor bridge**

En la consola de DevTools remoto, verificar que no hay errores de `CapacitorBridge` al cargar `/waiter`.

- [ ] **Step 6: Offline en APK**

Desactivar WiFi y datos en el PDA. Abrir la app → pagina offline, no pantalla en blanco. Reactivar WiFi → app recupera estado sin crash.

- [ ] **Step 7: Auto-update check**

Verificar que la app no crashea al consultar la version disponible.

- [ ] **Step 8: Flujo waiter core en APK**

Ejecutar el flujo minimo: login PIN → abrir sesion de mesa → crear pedido → validar → marcar preparado en kitchen → servir → cerrar mesa. Todo dentro de la APK.

- [ ] **Step 9: Commit resultado APK**

Marcar checks Capacitor en el spec con `[x]` o `[!]`.

```bash
git add docs/superpowers/specs/2026-07-07-pre-release-qa-design.md
git commit -m "qa(capacitor): checks nativos waiter android"
```

### Task 17: Go / No-Go final

- [ ] **Step 1: Criterio**

0 fallos criticos en flujo waiter core ni en persistencia de sesion. Fallos menores documentados como known issues.

- [ ] **Step 2a: Si GO en las 3 fases**

```bash
git tag qa-passed-v1
git push origin develop --tags
```

Sistema listo para release.

- [ ] **Step 2b: Si NO-GO en alguna fase**

Resolver fallos, re-ejecutar solo los tasks afectados de esa fase. No es necesario repetir fases anteriores salvo que el fix toque codigo compartido.

- [ ] **Step 3: Commit final**

```bash
git add docs/superpowers/specs/2026-07-07-pre-release-qa-design.md
git commit -m "qa: resultado final — go/no-go documentado por fase"
```
