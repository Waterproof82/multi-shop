# Recogida en tienda y envío a domicilio para `tipo = 'tienda'` — Diseño

## 1. Contexto y problema

Hoy, `tipo === 'restaurante'` tiene un selector de recogida/delivery en el carrito
(`DeliveryMethodSelector`) integrado con Glovo Business (cotización de envío en
tiempo real, rider real) y Redsys (pago online obligatorio para delivery). Está
documentado en `docs/context/delivery.md`.

`tipo === 'tienda'` no tiene ningún selector — `showDeliverySelector()` en
`cart-drawer.tsx` devuelve `false` cuando `!isRestaurant`, así que el flujo de
compra de una tienda nunca pregunta cómo quiere recibir el pedido.

Se pidió llevar "recoger en el local" / "entrega a domicilio" a `tienda`, pero
**no** replicando Glovo/Redsys: un sistema donde el propio admin de la tienda
define a mano sus modalidades (icono, nombre, precio, y en el caso de envío un
rango de tiempo), sin cotización externa ni pago online obligatorio.

## 2. Decisión de arquitectura

**Sistema nuevo, independiente de Glovo/Redsys.** Restaurante sigue usando
exactamente lo que tiene hoy, sin tocar una línea de `DeliveryMethodSelector`,
`getDeliveryQuoteUseCase`, `processRedsysWebhookUseCase` ni las tablas/columnas
que ya usa ese flujo. Cero riesgo sobre un camino de pago que ya factura en
producción.

**Fuera de alcance (v1) — decisión explícita, no descuido:**
- Sin zona de cobertura por código postal. La tienda gestiona su propia
  logística de envío (mensajería, correo); la dirección es solo el destino, no
  se valida contra ninguna zona.
- Sin cotización externa de ningún tipo. El precio de cada modalidad lo fija
  el admin a mano.
- Sin nuevo gateway de pago. El precio de la modalidad se suma al total del
  pedido y se cobra por el medio que la tienda ya tenga activo hoy (Redsys si
  `pagosPickupHabilitados` está encendido, o lo que corresponda si no).
- Restaurante no se toca. Si en el futuro se quiere que restaurante también
  ofrezca modalidades manuales, es una iteración aparte.

## 3. Modelo de datos

### 3.1 Tabla nueva `modalidades_entrega`

```sql
CREATE TABLE public.modalidades_entrega (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('recogida', 'domicilio')),
  icono TEXT NOT NULL,
  nombre_es TEXT NOT NULL,
  nombre_en TEXT,
  nombre_fr TEXT,
  nombre_it TEXT,
  nombre_de TEXT,
  precio_cents INT NOT NULL DEFAULT 0,
  -- NULL en 'recogida' (siempre inmediata). Rango en 'domicilio' (ej. 120-180 min).
  tiempo_min_minutos INT,
  tiempo_max_minutos INT,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tiempo_solo_domicilio CHECK (
    (tipo = 'recogida' AND tiempo_min_minutos IS NULL AND tiempo_max_minutos IS NULL)
    OR tipo = 'domicilio'
  )
);

CREATE INDEX idx_modalidades_entrega_empresa ON public.modalidades_entrega(empresa_id, tipo, activo);
```

Sigue el checklist de migraciones del proyecto al pie de la letra:

```sql
ALTER TABLE public.modalidades_entrega ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to modalidades_entrega"
  ON public.modalidades_entrega AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve modalidades_entrega"
  ON public.modalidades_entrega FOR SELECT TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin inserta modalidades_entrega"
  ON public.modalidades_entrega FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin actualiza modalidades_entrega"
  ON public.modalidades_entrega FOR UPDATE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

CREATE POLICY "Admin borra modalidades_entrega"
  ON public.modalidades_entrega FOR DELETE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.modalidades_entrega TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modalidades_entrega TO authenticated;
```

> El **catálogo público** (qué modalidades activas tiene la tienda, para
> mostrarlas en el carrito de un visitante anónimo) se sirve por el
> `getSupabaseAnonClient()` a través del use-case de checkout, igual que
> categorías/productos — no por REST directo de `anon`, así que la policy de
> `anon` queda `RESTRICTIVE ... USING (false)` sin excepción, igual que el
> resto de tablas de catálogo administrable.

### 3.2 Dos columnas nuevas en `empresas`

```sql
ALTER TABLE public.empresas
  ADD COLUMN recogida_tienda_habilitada BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN envio_domicilio_habilitado BOOLEAN NOT NULL DEFAULT false;
```

Independientes entre sí — una tienda puede ofrecer solo una de las dos.
Autoservicio del admin de la tienda (no superadmin): a diferencia de
`glovo_*`/`redsys_*`, no hay credencial sensible de por medio.

**Dónde conectarlas (para no perderlas en silencio):**
- `CAMPOS_DIRECTOS` en `src/core/infrastructure/database/supabase-empresa.repository.ts:30` —
  agregar `'recogida_tienda_habilitada'`, `'envio_domicilio_habilitado'` (son
  booleanos que pueden ser `false` legítimamente, van en `CAMPOS_DIRECTOS`
  nunca en `CAMPOS_TEXTO`, mismo motivo que `mostrar_promociones`).
- El `SELECT` de `getById()` en la línea 56 del mismo archivo — agregar ambas
  columnas a la lista o `getById` las devuelve como `undefined`.
- `UpdateEmpresaData` y `Empresa` en `core/domain/entities/types.ts`.
- El DTO Zod de `PUT /api/admin/empresa` (o el que corresponda) — agregar
  ambos campos como `z.boolean().optional()`.

## 4. API

### 4.1 CRUD de modalidades — `/api/admin/modalidades-entrega`

Mismo patrón que `/api/admin/categorias/route.ts`: un solo `route.ts` con
`GET` / `POST` / `PUT` / `DELETE`, `requireRole(request, ['admin', 'superadmin'])`,
Zod `safeParse` en el body, `handleResult()` para la respuesta.

```typescript
// DTOs (Zod)
CreateModalidadEntregaSchema = z.object({
  tipo: z.enum(['recogida', 'domicilio']),
  icono: z.string().max(50),
  nombre_es: z.string().min(1).max(100),
  nombre_en: z.string().max(100).optional(),
  nombre_fr: z.string().max(100).optional(),
  nombre_it: z.string().max(100).optional(),
  nombre_de: z.string().max(100).optional(),
  precioCents: z.number().int().min(0),
  tiempoMinMinutos: z.number().int().min(0).optional(),
  tiempoMaxMinutos: z.number().int().min(0).optional(),
  orden: z.number().int().min(0).default(0),
})
// refine: si tipo === 'recogida', tiempoMin/tiempoMax deben venir ausentes
// (el use case los fuerza a NULL igual, pero el 400 temprano evita confusión
// en el form).
```

Use case `ModalidadEntregaUseCase` (nuevo) + `SupabaseModalidadEntregaRepository`
(nuevo), siguiendo Clean Architecture como el resto del proyecto.

### 4.2 Catálogo público en el checkout

`GetMenuUseCase` (o un use case hermano liviano) expone las modalidades
activas de la empresa junto con el menú, para que `page.tsx` se las pase al
`CartDrawer` sin un fetch extra en el cliente — mismo espíritu que categorías y
productos ya viajan precargados.

### 4.3 `POST /api/pedidos` — campos nuevos

| Campo | Tipo | Notas |
|---|---|---|
| `modalidadEntregaId` | uuid, opcional | Solo si la tienda tiene algún toggle activo |
| `modalidadEntregaTipo` | `'recogida'` \| `'domicilio'` | Redundante con el id, pero evita un JOIN para saber qué badge mostrar en admin, mismo patrón que `origen` de restaurante |
| `modalidadEntregaPrecioCents` | int | Se suma al `total` del pedido, igual que `delivery_fee_cents` |
| `direccionEntrega` | string, opcional | Solo si `modalidadEntregaTipo === 'domicilio'` |
| `direccionLatitud` / `direccionLongitud` | float, opcional | De Mapbox, para guardar igual que restaurante (`latitude_entrega`/`longitude_entrega`) |

El use case revalida server-side que el `modalidadEntregaId` pertenece a la
empresa del pedido y sigue `activo` — nunca confiar en el precio que mande el
cliente, releer `precio_cents` de la DB antes de sumarlo al total (mismo
principio que ya aplica el proyecto en todo cálculo de precio).

## 5. Admin UI

**Reutilizo `/admin/delivery`** (ya es la "sección de entrega a domicilio" que
existe hoy, visible a todos los admins independientemente del tipo). Se
vuelve condicional por `empresa.tipo`:

- `tipo === 'restaurante'` → exactamente la página de hoy (Glovo + Redsys +
  zona), sin cambios.
- `tipo === 'tienda'` → dos toggles (`recogida_tienda_habilitada`,
  `envio_domicilio_habilitado`) y, para cada uno que esté encendido, un CRUD
  de modalidades de ese tipo: lista con drag-to-reorder (`orden`) o simplemente
  inputs numéricos de orden, botón "Añadir modalidad", cada fila con
  icono/nombre(s)/precio/tiempo (tiempo solo visible en domicilio) y
  activo/inactivo.

Selector de icono: un `<Select>` con un set fijo de opciones (emoji o
`lucide-react` icon keys, coherente con el resto del admin) — no upload de
imagen, para no meter `ImageUploader` en algo tan chico.

## 6. Cart UI

### 6.1 `TiendaFulfillmentSelector` (nuevo componente)

Hermano de `DeliveryMethodSelector`, mucho más chico: sin cotización, sin
validación de CP. Tabs "Recoger en tienda" / "Envío a domicilio" — un tab solo
aparece si **su toggle está encendido Y tiene al menos una modalidad
`activo=true`** (evita un tab vacío o roto si el admin prendió el toggle pero
todavía no cargó ninguna modalidad). Si ningún tab cumple ambas condiciones,
el componente entero no se monta (la tienda queda como hoy). Cada tab lista
las modalidades activas como radio-cards: icono, nombre (vía
`t()`/translations del item, igual que categorías), precio formateado
(`formatPrice`), y rango de tiempo si es domicilio.

### 6.2 `MapboxAddressInput` (extracción, no componente nuevo desde cero)

Extraigo el `SearchBox` de Mapbox Search JS React que hoy vive dentro de
`DeliveryMethodSelector` a un componente propio y reutilizable. Mismo look &
feel que restaurante — es literalmente el mismo input, no una reimplementación.
`DeliveryMethodSelector` pasa a consumir este componente compartido en vez de
tener el `SearchBox` inline (mejora incidental de paso, sin cambiar su
comportamiento). `TiendaFulfillmentSelector` lo monta solo cuando la tab activa
es "Envío a domicilio".

### 6.3 Wizard de 2 pasos en `cart-drawer.tsx`

**Solo aplica cuando `tipo === 'tienda'` y al menos un toggle está encendido.**
Mesa, waiter y restaurante quedan bit a bit iguales a hoy — no se toca su
código de estado ni su render.

```typescript
const [step, setStep] = useState<'items' | 'checkout'>('items');
```

- **Paso `items`**: lista de productos + cantidades + subtotal + botón
  "Continuar" (deshabilitado si el carrito está vacío). Es lo que el drawer
  muestra siempre hoy, sin recortar nada.
- **Paso `checkout`**: resumen colapsado de una línea ("N productos · X,XX€ —
  volver") + `TiendaFulfillmentSelector` + `MapboxAddressInput` condicional +
  `DatosDelComensal` + código de descuento + total + "Confirmar pedido".

Al abrir el drawer o vaciar el carrito, `step` vuelve a `'items'`. El paso
`checkout` no re-valida el carrito completo, solo lee el subtotal ya calculado
— no hay lógica de precio duplicada entre pasos.

## 7. i18n

`nombre_{lang}` de cada modalidad sigue el mismo patrón de traducciones
opcionales con fallback a `nombre_es` que ya usan categorías/productos —
reutilizar el mapper existente (`getTranslatedField` en `menu-section.tsx` es
el ejemplo a seguir), no inventar uno nuevo. Textos fijos de UI ("Recoger en
tienda", "Envío a domicilio", "Continuar", "Confirmar pedido") van a
`src/lib/translations.ts` vía `t()`, como exige `CLAUDE.md`.

## 8. Testing

- **Unit**: `ModalidadEntregaUseCase` — CRUD, y sobre todo el `refine` de
  tiempo-solo-en-domicilio y la revalidación server-side de precio contra DB
  al crear un pedido (no confiar en el precio que manda el cliente).
- **Compliance**: test de que `activo=false` no aparece en el catálogo
  público (mismo espíritu que categorías/productos).
- **UI**: test de que `TiendaFulfillmentSelector` no se monta si ambos toggles
  están apagados, y que `MapboxAddressInput` solo aparece con la tab
  "domicilio" activa.
- **DB smoke**: agregar la tabla nueva a la revisión de RLS/GRANTs del
  `pnpm db:smoke` si el script barre todas las tablas nuevas automáticamente;
  si no, agregarla a mano.

## 9. Manejo de errores

- Falta `modalidadEntregaId` cuando el toggle correspondiente está activo →
  400 antes de crear el pedido (Zod `refine` a nivel de schema del pedido).
- `modalidadEntregaId` no pertenece a la empresa o está `activo=false` →
  `DB_ERROR` / 400, mismo patrón `handleResult`.
- Dirección vacía con "Envío a domicilio" seleccionado → bloqueo client-side
  del botón "Confirmar pedido", igual que hoy hace `computeIsDeliveryIncomplete`
  para restaurante (función hermana nueva, mismo patrón).

## 10. Fuera de alcance / futuro

- Zona de cobertura por código postal para `tienda`.
- Migrar restaurante a este mismo sistema de modalidades manuales.
- Reordenar modalidades por drag-and-drop (v1 usa un input numérico de
  `orden`).
