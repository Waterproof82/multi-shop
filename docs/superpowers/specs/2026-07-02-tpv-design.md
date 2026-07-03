# TPV — Design Spec
**Date:** 2026-07-02
**Status:** Approved
**Phase:** 1 (MVP)

---

## 1. Objetivo

Añadir un módulo TPV (punto de venta) al sistema multi-shop existente, accesible como aplicación nativa en Windows (Electron) y Android (Capacitor), compartiendo la misma base de datos Supabase y las mismas rutas `/api/*` de Next.js.

El TPV sustituye el flujo manual de cobro en el mostrador y registra turnos de caja, métodos de pago y propinas. Coexiste con el panel waiter (`/waiter/*`) y el panel admin (`/admin/*`) sin modificarlos.

---

## 2. Arquitectura

### 2.1 Stack

| Capa | Tecnología | Notas |
|---|---|---|
| Frontend | Next.js (App Router) — rutas `/tpv/*` | Sin nueva app, sin nuevo repo |
| Shell Windows | Electron | Next.js en modo `standalone` como proceso hijo |
| Shell Android | Capacitor (segundo build) | Mismo patrón que el APK del camarero |
| Backend | Supabase + Next.js API routes existentes | Sin nuevo servidor |
| Storage offline | `better-sqlite3` (Electron) / `@capacitor-community/sqlite` (Android) | Solo para cobro offline |
| Auth | Supabase Auth — mismas credenciales de `perfiles_admin` | Sin tablas nuevas de usuarios |
| Hosting | Vercel (Next.js) + Supabase cloud | Sin servidor dedicado |

### 2.2 Estructura de rutas nuevas

```
/tpv                     → redirect a /tpv/mostrador
/tpv/mostrador           → pantalla principal (3 columnas)
/tpv/turno/abrir         → inicio de turno (si no hay turno activo)
/tpv/turno/cerrar        → cierre y arqueo de turno
/tpv/cobro/[sesionId]    → flujo de cobro para una sesión de mesa
/tpv/mesas               → vista de grilla de mesas (estado en tiempo real)
/tpv/historial           → pedidos y cobros del turno activo
```

### 2.3 Diagrama de flujo general

```
App abre
  ↓
¿Sesión admin activa?
  No → Login con credenciales admin (perfiles_admin)
  Sí ↓
¿Turno TPV activo?
  No → /tpv/turno/abrir (nombre operador + fondo de caja)
  Sí → /tpv/mostrador
```

---

## 3. Base de datos

### 3.1 Tabla nueva: `tpv_turnos`

```sql
CREATE TABLE public.tpv_turnos (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id               UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  user_id                  UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  -- audit: quién firmó digitalmente el turno (aunque operador_nombre sea texto libre)
  operador_nombre          TEXT NOT NULL,
  apertura_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  cierre_at                TIMESTAMPTZ,                    -- NULL = turno activo
  efectivo_apertura_cents  INTEGER NOT NULL DEFAULT 0,
  efectivo_cierre_cents    INTEGER,                        -- introducido en arqueo
  total_efectivo_cents     INTEGER,                        -- calculado al cerrar
  total_tarjeta_cents      INTEGER,                        -- calculado al cerrar
  diferencia_cents         INTEGER,                        -- cierre - teórico
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

RLS: mismo patrón que el resto — anon bloqueado, authenticated ve solo su `empresa_id`.

### 3.2 Tablas existentes utilizadas (sin cambios de schema)

| Tabla | Uso en TPV |
|---|---|
| `mesas` | Grilla de mesas y estado activo |
| `mesa_sesiones` | Sesión activa por mesa, total, propina |
| `pedidos` | Items del ticket activo |
| `pedido_item_estados` | Estado de cada ítem (cocina/bar) |
| `mesa_item_pagos` | Items ya pagados en división de cuenta |
| `mesa_pagos_personalizados` | Turnos de pago personalizado |
| `productos` | Catálogo para el grid de productos |
| `categorias` | Pestañas del menú |

---

## 4. Módulos — Fase 1

### 4.1 Inicio de turno

**Trigger:** Al abrir el TPV sin turno activo en `tpv_turnos`.

**UI:** Pantalla centrada con:
- Campo texto libre: nombre del operador (mín. 2 caracteres para habilitar el botón)
- Campo numérico: fondo de caja inicial en euros (puede ser 0)
- Hora de apertura en tiempo real
- Botón "Comenzar turno" → INSERT en `tpv_turnos` → redirige a `/tpv/mostrador`

**Mockup:** `docs/tpv-mockup-turno.html`

---

### 4.2 Pantalla principal

**Layout 3 columnas:**

```
┌──────────────┬──────────────────────────┬──────────────┐
│   TICKET     │         MENÚ             │   ACCIONES   │
│   (30%)      │         (50%)            │   (20%)      │
│              │  [Categorías]            │              │
│  Items       │  [Búsqueda]              │  Mesa        │
│  pedidos     │  [Grid productos]        │  Ticket      │
│              │                          │  Operaciones │
│  [Cobrar]    │                          │              │
└──────────────┴──────────────────────────┴──────────────┘
```

**Header:** Mesa activa · Sesión # · Comensales · Navegación (Mostrador / Mesas / Pendientes / Historial) · Reloj · Operador · Cierre de Caja

**Comportamiento del ticket:**
- Al pulsar un producto → se añade al ticket de la sesión activa via API existente
- Cantidad editable inline (tap en el badge azul)
- Eliminar ítem con ×
- Desglose: subtotal + IVA + propina (si se añadió antes)

**Grid de productos:**
- Categorías como pestañas horizontales con scroll
- Búsqueda por nombre
- Productos agotados: opacidad reducida, no clickeables
- Badge `Especial` y `Bebida` diferenciados

**Mockup:** `docs/tpv-mockup-main.html`

---

### 4.3 Flujo de cobro

**Trigger:** Botón "Cobrar" en el ticket activo.

**3 pasos:**

#### Paso 1 — Método + Propina
- Selección: **Efectivo** | **Tarjeta** (datáfono físico independiente)
- Campo propina: botones rápidos (+1€, +2€, +5€, Sin propina) + input numérico libre
- El total del resumen lateral se actualiza en tiempo real con la propina
- Botón "Continuar — cobrar X €" muestra el total final

#### Paso 2a — Efectivo
- Numpad táctil (16 teclas: 0-9, ., ⌫, Cobrar)
- Display "Entrega el cliente" + "Cambio a devolver" en tiempo real
- Si entregado < total → cambio en rojo
- Importes rápidos generados dinámicamente según el total (redondeos a 1€, 5€, 10€, 20€)
- Botón "Cobrar X €" confirma

#### Paso 2b — Tarjeta
- Muestra el importe total con desglose `(consumo + propina)` si hay propina
- El cajero introduce el importe en el datáfono físico manualmente
- Botón "Confirmar pago con tarjeta" registra el cobro

#### Paso 3 — Confirmado
- Resumen: consumo / propina / total cobrado / método / entregado / cambio / operador / hora
- Propina resaltada en amarillo, separada del consumo
- Botones: Imprimir ticket | Nueva operación

**Operaciones en BBDD al confirmar:**
1. `UPDATE mesa_sesiones SET propina_cents = ? WHERE id = ?`
2. `close_mesa_sesion(sesion_id)` — RPC existente
3. `UPDATE tpv_turnos` — acumula `total_efectivo_cents` o `total_tarjeta_cents`

**Nota:** Las mesas pagadas vía Redsys llegan al TPV como estado `pagada` directamente — nunca pasan por este flujo.

**Mockup:** `docs/tpv-mockup-cobro.html`

---

### 4.4 Cobro offline (resiliencia crítica)

**Contexto de conectividad:**
- Los camareros usan PWA en móviles con 4G/5G — **siempre tienen conectividad** independientemente del WiFi del local
- El TPV (Windows/Android mostrador) depende del WiFi — es el único punto de fallo
- Durante un corte de WiFi, los camareros siguen modificando mesas en Supabase en tiempo real
- El TPV **no puede asumir que conoce el estado actual de las mesas** mientras está offline — Supabase es la fuente de verdad

**Comportamiento offline:**

```
TPV pierde WiFi:
  → Banner prominente fijo: "Sin conexión — operando en modo local"
  → El resto del TPV sigue visible pero deshabilitado (menú, mesas, historial)
  → El cajero puede registrar cobros manualmente:
       mesa_numero (número visible en la mesa física)
       método (efectivo / tarjeta)
       importe cobrado
       propina
  → Cola local en IndexedDB: { mesa_numero, metodo, importe_cobrado_cents,
       propina_cents, operador_nombre, turno_id, ts }
  → NO intenta cerrar sesión (no conoce su estado real en Supabase)

TPV recupera WiFi:
  → Flush automático de la cola → /api/tpv/sync-offline
  → Por cada entrada de la cola:
      Busca mesa_sesiones activa para ese mesa_numero
      Si sesión abierta  → cierra normalmente + registra en tpv_turnos
      Si sesión ya cerrada → registra cobro en tpv_turnos + flag requiere_revision: true
  → Admin ve descuadres en el panel de control
  → Cola local se vacía tras sync exitoso
```

**Storage:** IndexedDB (disponible en cualquier WebView/Electron sin dependencias adicionales — no requiere SQLite nativo).

**Flag de revisión:** Se añade columna `requiere_revision BOOLEAN DEFAULT false` a `tpv_turnos` para los cobros offline que no pudieron reconciliarse automáticamente.

**App shell offline (Capacitor Android):**
El `public/sw.js` existente (scope actual `/waiter`) se extiende para cachear también los assets de `/tpv`. En la primera carga online, el SW cachea HTML/JS/CSS. Si el WiFi cae, el JS arranca desde caché y puede operar con IndexedDB. En Electron, Next.js standalone corre localmente — el JS siempre está disponible sin SW.

---

### 4.5 Cierre de turno

**Trigger:** Botón "Cierre de Caja" en el header.

**Flujo:**
1. Resumen del turno: total efectivo teórico / total tarjeta / nº operaciones
2. Arqueo ciego: el cajero introduce el efectivo físico contado
3. Sistema muestra diferencia (positivo = sobrante, negativo = faltante)
4. Confirmar cierre → `UPDATE tpv_turnos SET cierre_at, efectivo_cierre_cents, diferencia_cents`

---

## 5. Electron — Windows

- Next.js compilado en modo `standalone` → proceso hijo gestionado por Electron main process
- Carga `http://localhost:{PORT}/tpv` al arrancar
- Sesión JWT persistida en `electron-store` (cifrado) para no pedir login en cada arranque
- Auto-updater preparado pero sin implementar en Fase 1
- **Impresora térmica en Fase 1 — ambas plataformas** (requisito legal Ley Antifraude / TicketBAI)
- Sistema de impresión abstraído detrás de interfaz `ThermalPrinter` con tres transportes configurables:

```
ThermalPrinter (interfaz común)
  → USBPrinter       — Electron only. node-thermal-printer via USB/serie
  → BluetoothPrinter — Capacitor Android. Plugin capacitor-bluetooth-serial o similar
  → NetworkPrinter   — Ambas plataformas. TCP socket a IP:puerto de la impresora en red
```

- El cajero elige el transporte en la pantalla de configuración inicial del TPV
- Una vez configurado, el flujo de cobro llama siempre a `ThermalPrinter.print(ticket)` sin conocer el transporte
- IPC Electron: `tpv:print-ticket` y `tpv:open-drawer` (cajón monedero en efectivo)
- Contenido del ticket: empresa, nº mesa, items con cantidades, subtotal, IVA, propina, total, método de pago, operador, fecha/hora
- **WiFi/Red es el transporte recomendado** — funciona igual en Windows y Android sin drivers adicionales. La mayoría de impresoras modernas (Epson TM-T20, Star TSP100) lo incluyen
- **Bluetooth recomendado para Android** con impresoras portátiles (Star SM-L200, Epson TM-P20) — sin cables, ideal para tablet de mostrador

---

## 6. Capacitor — Android

- Segundo build independiente del APK del camarero
- `capacitor.config.ts` apunta al dominio de la empresa en producción
- Mismo patrón de autenticación que el APK del camarero (cookie `waiter_token` → aquí `tpv_token`)
- Orientación landscape forzada (pantalla de mostrador)

---

## 7. Fuera de scope — Fase 1

Los siguientes módulos quedan documentados para Fase 2:

| Módulo | Descripción |
|---|---|
| **Escandallos / Stock** | `ingredientes`, `recetas` (producto→ingredientes+cantidades), `movimientos_stock`. Descuento automático de inventario al servir. Alertas de stock crítico que bloquean producto en el menú |
| **Integración datáfono físico vía API** | Automatizar envío de importe al datáfono y recibir confirmación sin intervención manual |
| **Integración datáfono** | API del terminal físico para enviar importe y recibir confirmación automática |
| **Offline completo** | Menú y pedidos nuevos desde SQLite local. Requiere seed completo del catálogo y resolución de conflictos multi-dispositivo |
| **Analítica** | Dashboard: ventas por hora/día, ticket medio, productos más vendidos, tiempo medio de servicio, comparativa de turnos |
| **Mermas** | Registro de producto tirado/caducado para cuadrar stock teórico vs. real |
| **VERI\*FACTU** | Cumplimiento Ley Antifraude 11/2021. Cada registro fiscal se firma digitalmente y se envía a la AEAT en tiempo real. Requiere certificación del software. Investigar si aplica integración directa o delegación a un intermediario homologado |
| **TicketBAI** | Para uso en País Vasco / Navarra / Guipúzcoa. QR en cada ticket + envío a Hacienda Foral en tiempo real. Valorar si implementar como módulo regional activable por empresa |

---

## 8. Decisiones de diseño registradas

| Decisión | Alternativa descartada | Motivo |
|---|---|---|
| Rutas `/tpv/*` en Next.js existente | App Vite separada | Evita reescribir admin panel; comparte API routes y tipos de dominio |
| Auth con `perfiles_admin` | Tabla nueva de cajeros | Sin overhead; el operador se registra como texto libre en el turno |
| `user_id` en `tpv_turnos` | Solo `operador_nombre` | Auditoría digital — nombre libre puede suplantarse, JWT no |
| Operador como texto libre | Lista de empleados | Simplicidad de Fase 1; sin gestión de RRHH |
| Cobro offline acotado (solo cobro) | Offline completo | El 95% del valor con el 20% de la complejidad |
| IndexedDB para cola offline (no SQLite nativo) | `better-sqlite3` / `@capacitor-community/sqlite` | Disponible en cualquier WebView/Electron sin dependencias nativas; suficiente para encolar cobros simples |
| TPV offline no cachea estado de mesas | Snapshot de sesiones en local | Camareros tienen 4G/5G y siguen actualizando Supabase; el snapshot local quedaría obsoleto inmediatamente |
| SW extiende scope a `/tpv` (Android offline) | `next export` estático | App Router con rutas dinámicas no compatible con export puro; SW coherente con patrón waiter existente |
| Impresora en Fase 1 ambas plataformas | Solo Electron en Fase 1 | Requisito legal aplica a Android también; Bluetooth resuelve la complejidad de USB en Android |
| Tres transportes (USB / BT / WiFi) abstraídos | Una sola implementación por plataforma | Restaurantes usan distintos modelos de impresora; la abstracción evita reescribir lógica de impresión |
| Datáfono físico manual | Integración API datáfono | Fase 1; la integración va a Fase 2 |
| Redsys: flujo externo a cobro | Redsys como método en cobro modal | Si llega Redsys, la mesa ya está pagada — nunca pasa por el modal |
