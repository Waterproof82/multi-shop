# TooGoodToGo — Documentación del subsistema

> Ver también: [context.md](./context.md) | [bbdd.md](./bbdd.md) | [security.md](./security.md)

## Qué es

Subsistema inspirado en la mecánica de TooGoodToGo: el negocio crea campañas de **ofertas sorpresa** con precio de rescate (descuento sobre el precio original), las distribuye por email a los clientes suscritos, y los clientes reservan su cupo desde el email con un solo clic. El sistema gestiona cupones disponibles, reservas, y estadísticas completas.

Es completamente independiente del sistema de pedidos principal.

---

## Entidades de dominio

### `TgtgPromocion` (`core/domain/entities/types.ts`)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `string` | UUID |
| `empresaId` | `string` | Tenant |
| `horaRecogidaInicio` | `string` | Hora inicio recogida (`HH:MM`) |
| `horaRecogidaFin` | `string` | Hora fin recogida (`HH:MM`) |
| `fechaActivacion` | `string` | Fecha de la campaña (`YYYY-MM-DD`) |
| `numeroEnvios` | `number` | Emails enviados (se rellena al enviar) |
| `emailEnviado` | `boolean` | `true` una vez enviados los emails — **inmutable** |
| `createdAt` | `string` | Timestamp de creación |

### `TgtgItem`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `string` | UUID |
| `tgtgPromoId` | `string` | FK → `tgtg_promociones` |
| `empresaId` | `string` | Tenant (desnormalizado) |
| `titulo` | `string` | Nombre de la oferta |
| `descripcion` | `string \| null` | Descripción opcional |
| `imagenUrl` | `string \| null` | URL R2 WebP |
| `precioOriginal` | `number` | Precio sin descuento |
| `precioDescuento` | `number` | Precio de rescate |
| `cuponesTotal` | `number` | Cupones emitidos inicialmente |
| `cuponesDisponibles` | `number` | Cupones restantes (decrementado al reservar) |
| `orden` | `number` | Orden de visualización |
| `reservasCount?` | `number` | Agregado al hacer fetch (no columna DB) |

### `TgtgReserva`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `string` | UUID |
| `itemId` | `string` | FK → `tgtg_items` |
| `tgtgPromoId` | `string` | FK → `tgtg_promociones` |
| `empresaId` | `string` | Tenant |
| `email` | `string` | Email del cliente que reservó |
| `nombre` | `string \| null` | Nombre si es cliente conocido |
| `token` | `string` | Token de un solo uso (HMAC) — **unique** |
| `createdAt` | `string` | Timestamp |

---

## Esquema de base de datos

```sql
-- Campañas TGTG por tenant
CREATE TABLE tgtg_promociones (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id      uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  hora_recogida_inicio  text NOT NULL,   -- 'HH:MM'
  hora_recogida_fin     text NOT NULL,   -- 'HH:MM'
  fecha_activacion      date NOT NULL,
  numero_envios         integer DEFAULT 0,
  email_enviado         boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

-- Ofertas de cada campaña
CREATE TABLE tgtg_items (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tgtg_promo_id       uuid NOT NULL REFERENCES tgtg_promociones(id) ON DELETE CASCADE,
  empresa_id          uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  titulo              text NOT NULL,
  descripcion         text,
  imagen_url          text,
  precio_original     numeric NOT NULL,
  precio_descuento    numeric NOT NULL,
  cupones_total       integer NOT NULL,
  cupones_disponibles integer NOT NULL,
  orden               integer DEFAULT 0,
  created_at          timestamptz DEFAULT now()
);

-- Reservas de clientes (token de un solo uso)
CREATE TABLE tgtg_reservas (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id         uuid NOT NULL REFERENCES tgtg_items(id) ON DELETE CASCADE,
  tgtg_promo_id   uuid NOT NULL REFERENCES tgtg_promociones(id) ON DELETE CASCADE,
  empresa_id      uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  email           text NOT NULL,
  nombre          text,
  token           text NOT NULL UNIQUE,
  created_at      timestamptz DEFAULT now()
);
```

> RLS habilitada en las tres tablas. Escrituras solo via `service_role`. Lecturas públicas denegadas.

---

## Arquitectura de capas

```
API Route (Zod + requireAuth)
    ↓
TgtgUseCase (lógica + validaciones)
    ↓
ITgtgRepository (interfaz)
    ↓
SupabaseTgtgRepository (implementación)
```

### Use Case — métodos

| Método | Descripción |
|--------|-------------|
| `create(empresaId, ...)` | Crea campaña con items. `emailEnviado=false`. Mantiene solo las 6 más recientes (borra excedente). |
| `getAllRecent(empresaId)` | Últimas 6 campañas con sus items |
| `getWithItems(empresaId)` | La campaña más reciente con items (sin reservas count) |
| `sendCampaignEmails(empresaId, promoId)` | Valida propiedad + no enviada. Devuelve `{ promo, emailTargets }` |
| `markEmailSent(empresaId, promoId, emailCount)` | Pone `email_enviado=true`, actualiza `numero_envios` |
| `getReservas(empresaId, promoId)` | Todas las reservas de una campaña |
| `adjustCupones(empresaId, itemId, delta)` | +1 / -1 en `cupones_disponibles`. Valida ownership. |
| `claimCupon(params)` | Intenta crear reserva. Devuelve `'ok'`, `'no_cupones'` o `'token_used'` |
| `updateHoras(empresaId, promoId, inicio, fin)` | Edita horario. Valida propiedad. Solo si no está enviada. |
| `deletePromo(empresaId, promoId)` | Elimina. Bloquea si `emailEnviado=true` o hay reservas. |
| `isTokenUsed(token)` | Comprueba si un token de reserva ya fue usado |
| `getPublicItem(itemId)` | Lectura pública de un item por ID |
| `getPublicPromo(promoId)` | Lectura pública de una promo por ID |

---

## Flujo completo — admin

### 1. Crear campaña

```
Admin rellena formulario:
  - Fecha de activación (debe ser ≥ hoy + hora fin > ahora)
  - Hora de recogida inicio / fin
  - 1–N ofertas (título, descripción, imagen, precio original, precio descuento, cupones)

POST /api/admin/tgtg
  → Zod: createTgtgSchema
  → requireAuth + requireRole(['admin','superadmin'])
  → Validación server-side: fechaActivacion + horaFin > now()
  → tgtgUseCase.create()
  → Guarda en tgtg_promociones + tgtg_items
  → Mantiene solo 6 campañas (borra la 7ª más antigua)
  → Responde { tgtgPromo }
  → Frontend actualiza lista local (no recarga)
```

**Regla**: La campaña se crea con `email_enviado=false` y `numero_envios=0`. Los emails NO se envían en este paso.

### 2. Seleccionar y enviar campañas

```
Admin marca checkboxes en campañas activas no enviadas
  → Sticky bottom bar: "X campaña(s) seleccionada(s)"
  → Botón "Enviar email seleccionadas"
  → Modal de confirmación: muestra fecha/hora + total ofertas + nº destinatarios
  → Admin confirma

POST /api/admin/tgtg/enviar
  Body: { promoIds: string[] }  (1–10 IDs)
  → Para cada promoId:
      tgtgUseCase.sendCampaignEmails() → valida ownership + !emailEnviado
      Recoge items de cada campaña
  → Construye destinatarios únicos (union de emailTargets de todas las promos)
  → Por destinatario: un solo email HTML con todas las campañas seleccionadas
  → Envía via Brevo
  → tgtgUseCase.markEmailSent() para cada promo
  → Responde { emailsSent, emailError?, updatedPromos }
  → Frontend actualiza emailEnviado=true, numeroEnvios en estado local
```

**Regla**: Una vez `email_enviado=true`, la campaña no puede volver a enviarse ni eliminarse.

### 3. Estados de una campaña activa

| Estado | Condición | UI |
|--------|-----------|-----|
| **Activa — borrador** | `emailEnviado=false` + no expirada | Checkbox para seleccionar, botón trash habilitado |
| **Activa — enviada** | `emailEnviado=true` + no expirada | Badge verde "Enviada ✓", sin checkbox, trash deshabilitado |
| **Cerrada** | Hora fin pasada OR todos los cupones agotados | Aparece en sección "Historial" |

### 4. Acciones en campañas activas

- **Editar horario** (`PATCH /api/admin/tgtg/[id]/horas`): solo si no está enviada. Inline edit con inputs de tiempo.
- **Ajustar cupones** (`PATCH /api/admin/tgtg/items/[id]/cupones`): +1 / -1 en `cupones_disponibles`.
- **Ver reservas** (`GET /api/admin/tgtg/reservas?tgtgPromoId=...`): por item o todas a la vez.
- **Eliminar** (`DELETE /api/admin/tgtg/[id]`): bloqueado si `emailEnviado=true` o hay reservas.

### 5. Historial

Las campañas expiradas (hora fin < ahora) o con todos los cupones agotados pasan a sección de historial. Muestran miniatura, fecha, horario y títulos. Botón "Reutilizar" precarga el formulario con los mismos datos (fecha = hoy).

---

## Flujo completo — cliente

### Email recibido

El email contiene un bloque HTML por cada campaña seleccionada:
- Imagen de cada oferta
- Precio original (tachado) + precio descuento
- Botón "Reservar" → `https://{dominio}/api/promo/item/{itemId}?token={HMAC_TOKEN}`

El **token** es un HMAC-SHA256 único por destinatario+item, generado server-side al enviar. Cada token es de un solo uso.

### Reserva desde el email

```
Cliente hace clic en "Reservar"

GET /api/promo/item/[itemId]?token={token}
  → Verifica token HMAC válido
  → tgtgUseCase.isTokenUsed(token) → si ya usado → 409
  → Comprueba cupones disponibles → si 0 → 409
  → Guarda reserva en tgtg_reservas (token UNIQUE en DB)
  → Decrementa cupones_disponibles en tgtg_items
  → Redirige a página de confirmación

Si el token ya fue usado:
  GET /api/promo/item/[itemId]/new-token → genera nuevo token HMAC
  → Permite reintentar la reserva (caso de reenvío de email)
```

### Página de confirmación

Muestra la oferta reservada con:
- Título, imagen, precio
- Horario de recogida
- Fecha

---

## API Routes — resumen

Todas las rutas admin requieren JWT + CSRF. Las rutas públicas (`/api/promo/*`) no requieren auth.

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/api/admin/tgtg` | Admin | Últimas 6 campañas con items + reservasCount por item |
| `POST` | `/api/admin/tgtg` | Admin | Crear campaña (sin enviar emails) |
| `DELETE` | `/api/admin/tgtg/[id]` | Admin | Eliminar campaña (bloqueado si enviada o con reservas) |
| `PATCH` | `/api/admin/tgtg/[id]/horas` | Admin | Editar hora inicio/fin |
| `POST` | `/api/admin/tgtg/enviar` | Admin | Enviar emails de campañas seleccionadas |
| `GET` | `/api/admin/tgtg/reservas` | Admin | Reservas de una campaña |
| `PATCH` | `/api/admin/tgtg/items/[id]/cupones` | Admin | Ajustar cupones disponibles (+1/-1) |
| `GET` | `/api/promo/item/[id]` | Público | Visualizar oferta + estado del token |
| `GET` | `/api/promo/item/[id]/new-token` | Público | Generar nuevo token si el anterior ya fue usado |
| `POST` | `/api/promo/reservar` | Público | Crear reserva (descontar cupón) |

> Las rutas públicas `/api/promo/*` no están en `isPublicRoute` del proxy porque no son rutas `/api/admin/*` — no necesitan ser listadas allí.

---

## Diseño del email

El email se construye en `POST /api/admin/tgtg/enviar`:

- **Header**: gradiente verde con logo/nombre del negocio
- **Por campaña**: fecha + horario en pills de color, cards de oferta con imagen + precios + botón "Reservar" individual por destinatario
- **Un email por destinatario**: si se seleccionan 3 campañas, el cliente recibe 1 email con las 3 secciones
- `escapeHtml()` en todos los campos de usuario (título, descripción)
- Tokens HMAC por destinatario × item (distintos para cada persona)

---

## Validaciones críticas

### Server-side al crear
- `fechaActivacion + horaFin` debe ser estrictamente posterior a `new Date()` — retorna 400

### Server-side al enviar
- Cada `promoId` debe pertenecer al tenant del admin
- `emailEnviado` debe ser `false` — retorna error `ALREADY_SENT`

### Server-side al eliminar
- `emailEnviado=true` → error `ALREADY_SENT` → HTTP 409
- `reservas.length > 0` → error `HAS_RESERVAS` → HTTP 409

### Client-side
- Botón "Eliminar" deshabilitado visualmente si `emailEnviado || totalReservas > 0`
- No se puede abrir el modal de confirmación si 0 destinatarios suscritos
- Fecha/hora validada antes de POST

### Tokens de reserva
- HMAC-SHA256 con secret dedicado
- `UNIQUE` en DB — si el cliente intenta reservar dos veces con el mismo token → DB constraint
- Endpoint `new-token` permite generar uno nuevo si el original ya fue usado (ej: email reenviado)

---

## Archivos relevantes

```
src/
├── app/
│   ├── admin/(protected)/toogoodtogo/page.tsx     # Página admin (crear, gestionar, historial)
│   ├── api/
│   │   ├── admin/tgtg/
│   │   │   ├── route.ts                           # GET (listar) + POST (crear)
│   │   │   ├── enviar/route.ts                    # POST (enviar emails multi-campaña)
│   │   │   ├── reservas/route.ts                  # GET (reservas de una campaña)
│   │   │   ├── [id]/route.ts                      # DELETE (eliminar campaña)
│   │   │   ├── [id]/horas/route.ts                # PATCH (editar horario)
│   │   │   └── items/[id]/cupones/route.ts         # PATCH (ajustar cupones)
│   │   └── promo/
│   │       ├── item/[id]/route.ts                 # GET (página de reserva pública)
│   │       ├── item/[id]/new-token/route.ts        # GET (nuevo token si ya usado)
│   │       └── reservar/route.ts                  # POST (confirmar reserva)
│
├── core/
│   ├── domain/
│   │   ├── entities/types.ts                      # TgtgPromocion, TgtgItem, TgtgReserva
│   │   └── repositories/ITgtgRepository.ts        # Interfaz del repositorio
│   ├── application/
│   │   ├── dtos/tgtg.dto.ts                       # createTgtgSchema (Zod)
│   │   └── use-cases/tgtg.use-case.ts             # TgtgUseCase + interfaces de resultado
│   └── infrastructure/
│       └── database/supabase-tgtg.repository.ts   # Implementación Supabase
```

---

## Integración en el panel admin

### Sidebar
- Entrada independiente: **TooGoodToGo** con icono `ShoppingBag`, ruta `/admin/toogoodtogo`
- Aparece después de Promociones

### Dashboard (header)
- Tarjeta secundaria en la segunda fila del header
- Muestra: campañas activas en este momento / cupones canjeados / campañas enviadas
- Link directo a `/admin/toogoodtogo`

### Estadísticas (`/admin/estadisticas`)
- Sección dedicada al final de la página
- **5 KPI cards**: campañas enviadas total, enviadas este mes, reservas totales, ingreso este mes, ingreso total
- **Banner de ahorro**: total € ahorrados por clientes (precio original − descuento × reservas)
- **Gráfico de barras dual**: reservas e ingresos por campaña (últimas 6), eje X = `#N`
- **Tabla detallada**: `#N`, título del primer ítem, fecha, horario, badge "Enviada"/"Borrador", emails, reservas, ingresos

---

## Reglas de negocio destacadas

1. **Máximo 6 campañas almacenadas** — al crear la 7ª se borra la más antigua automáticamente
2. **Una campaña enviada es inmutable** — ni eliminable, ni re-enviable; el horario tampoco se puede editar una vez enviada (TODO: validar en `updateHoras`)
3. **El token de reserva es por destinatario × item** — dos clientes con el mismo email no pueden tener el mismo token; un cliente no puede reservar dos veces el mismo item
4. **Un email por destinatario** — aunque se envíen N campañas seleccionadas, el cliente recibe 1 email con todas las secciones
5. **`numero_envios` refleja emails enviados**, no reservas; las reservas se cuentan via `tgtg_reservas`
6. **`cupones_disponibles` es la fuente de verdad** para disponibilidad, no `reservasCount`
7. **Campaña "cerrada"** = hora fin superada OR todos los cupones agotados (lógica solo en frontend, no hay campo en DB)
