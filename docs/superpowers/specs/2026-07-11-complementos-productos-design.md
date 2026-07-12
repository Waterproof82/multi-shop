# Design: Sistema de Complementos por Producto

**Fecha:** 2026-07-11
**Estado:** Aprobado

---

## Contexto

El sistema actual tiene un mecanismo de complementos basado en **categorías** (`categorias.categoria_complemento_de`): una categoría-complemento apunta a una categoría padre y sus productos se convierten en las opciones disponibles para todos los productos de esa categoría. Este sistema es de granularidad gruesa (por categoría, no por producto) y solo admite un grupo de complementos por categoría, con un único modo de selección (radio toggle).

Este spec define un sistema nuevo, más flexible, que convive en paralelo con el existente.

---

## Objetivo

Permitir que **cada producto** tenga uno o más grupos de complementos con dos comportamientos:

1. **Obligatorio / radio** — el cliente debe elegir exactamente una opción (ej: Tamaño).
2. **Opcional / checkbox** — el cliente puede elegir cero o más opciones (ej: Sin ingredientes).

Los grupos son **reutilizables**: se crean una vez a nivel de empresa y se asignan a múltiples productos sin duplicar datos.

---

## Modelo de datos

### Nuevas tablas

```sql
-- Grupo de complementos (reutilizable por empresa)
complemento_grupos
  id               uuid PK
  empresa_id       uuid FK → empresas
  nombre_es        text NOT NULL
  nombre_en        text
  nombre_fr        text
  nombre_it        text
  nombre_de        text
  tipo             text CHECK ('radio' | 'checkbox')
  obligatorio      boolean DEFAULT false
  orden            integer DEFAULT 0
  created_at       timestamptz

-- Opciones dentro de un grupo
complemento_opciones
  id               uuid PK
  grupo_id         uuid FK → complemento_grupos ON DELETE CASCADE
  empresa_id       uuid FK → empresas
  nombre_es        text NOT NULL
  nombre_en        text
  nombre_fr        text
  nombre_it        text
  nombre_de        text
  precio_adicional numeric DEFAULT 0.00
  orden            integer DEFAULT 0
  activo           boolean DEFAULT true
  created_at       timestamptz

-- Join table: asignación de grupos a productos (N:M)
producto_complemento_grupos
  producto_id      uuid FK → productos ON DELETE CASCADE
  grupo_id         uuid FK → complemento_grupos ON DELETE CASCADE
  orden            integer DEFAULT 0
  PRIMARY KEY (producto_id, grupo_id)
```

### Relaciones clave

- `complemento_grupos` pertenece a una `empresa` — visibilidad y RLS por tenant.
- Un grupo puede estar asignado a N productos (reutilización sin duplicado).
- Un producto puede tener N grupos (múltiples grupos ordenados por `orden`).
- `complemento_opciones.activo` permite desactivar opciones sin borrarlas (para stock o temporada).

### Compatibilidad

El sistema de `categorias.categoria_complemento_de` **no se toca**. Convive en paralelo. Los productos que usen el nuevo sistema de grupos simplemente tendrán entradas en `producto_complemento_grupos`.

---

## Seguridad (RLS + GRANTs)

Siguiendo el patrón del proyecto (`CLAUDE.md` — Migraciones checklist):

- RLS habilitado en las 3 tablas nuevas.
- Policy `anon`: `USING (false)` — sin acceso directo.
- Policy `authenticated`: filtra por `empresa_id = get_mi_empresa_id()` para todos los verbos.
- `GRANT SELECT, INSERT, UPDATE, DELETE` a `service_role` y `authenticated`.
- `anon` no recibe ningún GRANT — las tres tablas quedan completamente cerradas. El menú público se sirve a través de `GET /api/menu` (Next.js), que consulta la DB usando `service_role` (bypasea RLS). No hay consulta directa desde el cliente.

---

## API Routes

### Admin (autenticadas con `requireRole`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/admin/complementos/grupos` | Lista grupos de la empresa |
| POST | `/api/admin/complementos/grupos` | Crea un grupo |
| PUT | `/api/admin/complementos/grupos?id=` | Edita grupo (nombre, tipo, obligatorio) |
| DELETE | `/api/admin/complementos/grupos?id=` | Elimina grupo (cascade a opciones y join) |
| GET | `/api/admin/complementos/grupos/[grupoId]/opciones` | Lista opciones de un grupo |
| POST | `/api/admin/complementos/grupos/[grupoId]/opciones` | Crea opción |
| PUT | `/api/admin/complementos/grupos/[grupoId]/opciones?id=` | Edita opción |
| DELETE | `/api/admin/complementos/grupos/[grupoId]/opciones?id=` | Elimina opción |
| GET | `/api/admin/productos/[productoId]/complementos` | Grupos asignados al producto |
| POST | `/api/admin/productos/[productoId]/complementos` | Asigna grupo al producto |
| DELETE | `/api/admin/productos/[productoId]/complementos?grupoId=` | Desasigna grupo del producto |
| PATCH | `/api/admin/productos/[productoId]/complementos/orden` | Reordena grupos del producto |

### Menú público (incluida en `GET /api/menu`)

El use case `getMenuUseCase` ya ensambla el menú. Se extiende para incluir los grupos y opciones de cada producto en el payload del menú.

---

## Capa de dominio y aplicación

### Nuevas entidades (`core/domain/entities/types.ts`)

```ts
export interface ComplementoGrupo {
  id: string;
  empresaId: string;
  nombre_es: string;
  nombre_en: string | null;
  // ... i18n
  tipo: 'radio' | 'checkbox';
  obligatorio: boolean;
  orden: number;
  opciones?: ComplementoOpcion[];
}

export interface ComplementoOpcion {
  id: string;
  grupoId: string;
  empresaId: string;
  nombre_es: string;
  // ... i18n
  precioAdicional: number;
  orden: number;
  activo: boolean;
}
```

### Nuevos repositorios

- `IComplementoGrupoRepository` — CRUD de grupos + opciones + asignaciones
- `SupabaseComplementoGrupoRepository` — implementación

### Extensión del ViewModel

```ts
// menu-view-model.ts
export interface ComplementGroupVM {
  id: string;
  name: string;
  tipo: 'radio' | 'checkbox';
  obligatorio: boolean;
  translations?: { en?: string; fr?: string; it?: string; de?: string };
  opciones: ComplementVM[];  // ComplementVM ya existente, sin cambios
}

// MenuItemVM — se agrega:
complementGroups?: ComplementGroupVM[];  // nuevo campo
// El campo `complements` y `requiresComplement` se mantienen para
// compatibilidad con el sistema de categorías existente
```

### Mapper

`MenuMapper.toCategoryVM` ya maneja `complements` del sistema antiguo. Se agrega lógica en `mapProductToItem` para adjuntar `complementGroups` desde los datos del nuevo sistema.

---

## Panel de administración

### Nuevo ítem en sidebar

"Complementos" — visible solo si `empresaTipo === 'restaurante'` (misma lógica que Stock).

### Página `/admin/complementos`

**Layout:** dos columnas en desktop, tabs en mobile.

**Columna izquierda — Grupos:**
- Lista de grupos con nombre, tipo (badge radio/checkbox), si es obligatorio, y cuántos productos lo usan.
- Botón "+ Nuevo grupo" → modal con nombre (i18n), tipo, obligatorio.
- Click en un grupo → muestra sus opciones en la columna derecha.

**Columna derecha — Opciones del grupo seleccionado:**
- Lista de opciones con nombre, precio adicional, activo (toggle).
- Drag-and-drop para reordenar (o flechas arriba/abajo).
- Botón "+ Añadir opción" → inline form o modal.

### Formulario de producto (extensión)

En `ProductFormDialog` se agrega una sección "Grupos de complementos" al final del formulario:

- **Chips de grupos asignados** con botón `×` para desasignar.
- **Botón "Asignar grupo existente"** → dropdown/popover con todos los grupos de la empresa (excluye los ya asignados). Click → asigna instantáneamente.
- **Botón "Crear nuevo grupo"** → abre la página de complementos en nueva pestaña (no inline, para mantener el formulario simple).
- Drag-and-drop para reordenar los grupos asignados al producto.

---

## Selector de complementos (cliente)

### Componente: `QuantitySelectorDialog` (refactor)

El componente actual usa `selectedComplement: ComplementVM | null` (single-select). Se refactoriza para soportar múltiples grupos.

**Estado interno:**
```ts
// Por grupo
selectedOptions: Map<string, Set<string>>
// grupoId → Set de opcionIds seleccionadas
```

**Comportamiento radio opcional:**

Para grupos con `tipo: 'radio'` y `obligatorio: false`: hacer click sobre la opción ya seleccionada la deselecciona (vuelve al estado sin selección). Esto es un custom radio behavior — no usar `<input type="radio">` nativo (no permite deselección). Usar `<button role="radio" aria-checked>` con toggle en el handler.

**Validación:**
- `isValid`: todos los grupos con `obligatorio: true` tienen al menos una opción seleccionada (aplica a `radio` y `checkbox`).
- El botón "Añadir al carrito" está deshabilitado si `!isValid`.
- Al hacer click en el botón deshabilitado: mensaje inline + auto-scroll al primer grupo pendiente.

**Progress bar:**
- Una barra por grupo, anclada debajo del header del dialog.
- Roja hasta completar (obligatorio) → verde al seleccionar.
- Azul para opcionales (siempre "completa" — no bloquea).
- Badge por grupo:
  - `radio` + `obligatorio: true` + sin selección → `"Obligatorio · elige 1"`
  - `radio` + `obligatorio: true` + con selección → `"✓ Seleccionado"`
  - `radio` + `obligatorio: false` → `"Opcional"` (con o sin selección)
  - `checkbox` + `obligatorio: true` + sin selección → `"Obligatorio · elige al menos 1"`
  - `checkbox` + `obligatorio: true` + con selección → `"✓ N elegidos"`
  - `checkbox` + `obligatorio: false` → `"Opcional"` / `"N elegidos"` si hay selección

**Precio en tiempo real:**
- `totalComplementsPrice = sum(precio_adicional de todas las opciones seleccionadas)`.
- El total se actualiza en cada toggle.

**Scroll hint:**
- Fade gradient en la parte inferior del área de scroll cuando hay contenido oculto.
- Texto "↓ deslizá para ver más".

### Cambio en `CartItem`

`selectedComplements` se mantiene como `Complement[]` (flat array) — se aplanan todas las opciones seleccionadas de todos los grupos. El `cartId` y `getItemKey` continúan funcionando sin cambios.

---

## Carrito y pedido

- `cart-context.tsx` — sin cambios en la interfaz. `selectedComplements` recibe el array aplanado.
- `cart-drawer.tsx` — sin cambios en la lógica de renderizado (ya muestra complementos como lista).
- `PedidoItem.complementos[]` — sin cambios en el schema del pedido. Las opciones seleccionadas llegan como `{ nombre, precio }` igual que hoy.

---

## TPV — Selector de complementos

El TPV tiene su propio `ComplementDialog` en `MenuPanel.tsx` que actualmente usa el sistema antiguo de categorías. Se actualiza para usar el nuevo sistema de grupos.

### Estado actual del TPV

- `MenuPanel.tsx` renderiza productos del catálogo (`Product[]`) y construye un mapa de complementos desde `Category.categoriaComplementoDe`.
- `ComplementDialog` internamente solo soporta single-select (radio toggle) con un único grupo.
- `PendingItem.complementos: string[]` almacena solo nombres de opciones seleccionadas.
- El precio del ítem se fija en el momento del `addItem` — los complementos no suman precio por separado en el tipo.

### Cambios en TPV

**`TpvCatalogProvider` (`src/lib/tpv-catalog-ctx.tsx`):**
- Agregar fetch de `complemento_grupos` con sus `complemento_opciones` para la empresa.
- Exponer `complementoGruposByProductId: Map<string, ComplementoGrupo[]>` en el contexto.
- Se extiende `GET /api/tpv/catalog` para devolver también los grupos y opciones: campo `complementoGrupos: ComplementoGrupo[]` con `opciones[]` embebidas. El provider construye el `Map<productoId, ComplementoGrupo[]>` desde la join table.

**`MenuPanel.tsx` — `ComplementDialog`:**
- Reemplazar la lógica de `buildComplementMaps` (basada en categorías) por los grupos del nuevo sistema.
- El diálogo usa el mismo diseño aprobado: grupos apilados, radio/checkbox, progress bar, validación.
- Estado: `selectedOptions: Map<string, string | Set<string>>` — radio → `string` (opcionId), checkbox → `Set<string>`.

**Precio en `PendingItem`:**

`PendingItem.complementos` cambia de `string[]` a `{ nombre: string; precio: number }[]`:

```ts
export interface PendingItem {
  productId: string;
  nombre: string;
  precio: number;          // precio BASE del producto — inmutable
  precioTotal: number;     // precio + sum(complementos[].precio) — calculado
  cantidad: number;
  complementos: { nombre: string; precio: number }[];
  nota?: string;
}
```

- `precio` almacena solo el precio base del producto — nunca se modifica.
- `precioTotal` se recalcula dinámicamente al agregar/quitar complementos o cambiar cantidad.
- `pendingTotal` en el hook se calcula como `sum(item.precioTotal * item.cantidad)`.
- `TicketPanel` renderiza `complementos` como `item.complementos.map(c => c.nombre)` para display — sin breaking change visual.
- Esta estructura permite analítica futura: cuánto sumaron los complementos con precio > 0 por turno/día.
- `nota` sin cambios.

**Compatibilidad con sistema antiguo en TPV:**
- `buildComplementMaps` se elimina de `MenuPanel.tsx` — se reemplaza completamente.
- Los productos que aún usan el sistema de categorías (`categoria_complemento_de`) NO tendrán `complementGroups` en el nuevo sistema, así que el diálogo no se abrirá para ellos desde el TPV. Esto es aceptable: el sistema de restaurante de prueba usa "Salsas → Pastas" que seguirá funcionando en la carta digital, pero en el TPV no tendrá el selector hasta que se migre manualmente al nuevo sistema.

---

## Fuera de scope (explícito)

- Migración del sistema antiguo de `categoria_complemento_de` al nuevo.
- Imágenes por opción de complemento.
- Límites de selección (ej: "elegí entre 1 y 3") — el tipo `checkbox` no tiene límite superior por ahora.
