# TPV — Pases / Marchas en KDS

> Funcionalidad que permite al operador del mostrador asignar un "pase" (marcha) a cada pedido antes de enviarlo a cocina, y agrupa los ítems por pase en la pantalla KDS.

---

## Propósito

En restaurantes de varias marchas (entrante, principal, postre) el cocinero necesita saber en qué orden preparar los platos de distintas mesas. El campo `pase` resuelve esto sin cambiar el modelo de pedidos existente: es opcional y no afecta al flujo de cobro ni al audit trail.

---

## Valores permitidos

| Valor | Etiqueta mostrador | Etiqueta KDS |
|-------|--------------------|--------------|
| `primer` | 1er pase | 1er Pase |
| `segundo` | 2º pase | 2º Pase |
| `postre` | Postre | Postre |
| `bebida` | Bebida | Bebidas |
| `NULL` | — (sin asignar) | Sin pase |

---

## Base de datos

```sql
-- Migration: 20260706000006_pedidos_pase.sql
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS pase TEXT
    CHECK (pase IS NULL OR pase IN ('primer', 'segundo', 'postre', 'bebida'));
```

La columna es nullable. Un pedido sin pase asignado (`NULL`) aparece en la sección "Sin pase" del KDS si coexiste con pedidos que sí tienen pase; si todos los pedidos son `NULL`, el KDS no muestra secciones (comportamiento histórico sin cambios).

---

## Flujo

```
Operador añade ítems al ticket
  → Elige pase opcional (botones toggle)
  → POST /api/tpv/pedidos { mesaId, items, nota, pase }
       → createMesaOrder (use case) → pedido creado
       → UPDATE pedidos SET pase=? WHERE id=? (best-effort)

KDS /waiter/kitchen
  → GET /api/waiter/kitchen/items
       → fetchAllComidaItems selecciona pase de pedidos
       → KitchenItemRecord.pase propagado
  → render: items agrupados por pase si hay distintos valores activos
```

---

## API

### POST /api/tpv/pedidos

Campo adicional en el body (opcional):

```typescript
{
  mesaId: string;
  items: ItemSchema[];
  nota?: string;
  pase?: 'primer' | 'segundo' | 'postre' | 'bebida';  // nuevo
}
```

El `pase` se aplica al pedido completo (no por ítem). Después de crear el pedido via `pedidoUseCase.createMesaOrder`, se hace un UPDATE independiente para setear `pase`. Si el UPDATE falla, el pedido se crea igualmente sin pase.

### GET /api/tpv/pedidos

La respuesta incluye `pase: string | null` en cada orden:

```typescript
{
  orders: {
    id: string;
    numeroPedido: number;
    estado: string;
    items: [...];
    total: number;
    nota: string | null;
    pase: string | null;  // nuevo
  }[];
  yaCobradoCents: number;
}
```

### GET /api/waiter/kitchen/items

Cada `KitchenItemRecord` incluye `pase: string | null` (tomado del pedido padre).

---

## Componentes afectados

### TicketPanel.tsx

- Estado `pendingPase: 'primer' | 'segundo' | 'postre' | 'bebida' | ''`
- Cuatro botones toggle antes del textarea de nota del pedido
- Badge de pase en la cabecera de cada pedido existente
- `pase: pendingPase || undefined` incluido en el body del POST
- Reset de `pendingPase` tras enviar

### ExistingOrder (MostradorClient.tsx)

```typescript
export interface ExistingOrder {
  // ... campos previos ...
  pase: string | null;  // añadido
}
```

### KitchenItemRecord (IPedidoRepository.ts)

```typescript
export interface KitchenItemRecord {
  // ... campos previos ...
  pase: string | null;  // añadido
}
```

### KitchenItem (waiter/kitchen/page.tsx)

```typescript
interface KitchenItem {
  // ... campos previos ...
  pase: string | null;  // añadido
}
```

---

## Lógica de agrupación en KDS

```typescript
const PASE_ORDER = ['primer', 'segundo', 'postre', 'bebida', null];

const nuevosByPase = PASE_ORDER
  .map(pase => ({
    pase,
    label: pase ? PASE_LABEL[pase] : 'Sin pase',
    items: nuevosItems.filter(i => (i.pase ?? null) === pase),
  }))
  .filter(g => g.items.length > 0);
```

- Las cabeceras de sección solo se muestran si `nuevosByPase.length > 1` o si el único grupo tiene pase no nulo.
- Dentro de cada sección los pedidos se agrupan por `pedidoId` con la función `groupByPedido` existente.
- Los ítems de "Listos" y "Retenidos" no se agrupan por pase (sin impacto operativo).

---

## Migraciones

| Archivo | Descripción |
|---------|-------------|
| `supabase/migrations/20260706000006_pedidos_pase.sql` | Añade columna `pase TEXT CHECK(...)` a `pedidos` |
