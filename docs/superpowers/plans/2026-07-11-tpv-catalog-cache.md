# Plan: TPV Catalog Cache — navegación instantánea

## Problema

Cada página TPV tiene `dynamic = 'force-dynamic'`, por lo que cada navegación
entre pestañas dispara un nuevo render server-side con queries a la DB.

En `/tpv/mostrador` se ejecutan en cada visita:
- `productUseCase.getAll(empresaId)` — catálogo completo
- `categoryUseCase.getAll(empresaId)` — categorías
- empresa (`tipo_impuesto`, `porcentaje_impuesto`) — config fiscal
- `repo.findTurnoActivo(empresaId)` — turno
- `mesaSesionUseCase.getMesasWithSessions(empresaId)` — grilla de mesas

En `/tpv/mesas`:
- `mesaSesionUseCase.getMesasWithSessions(empresaId)` — grilla de mesas
- turno activo

## Solución

El layout de Next.js App Router **no se re-ejecuta** en navegaciones client-side
(solo `{children}` cambia). Mover los datos estables al layout → un único fetch
por sesión → contexto cliente → cero queries adicionales al navegar.

Datos dinámicos (pedidos por mesa, historial, analytics) siguen en sus páginas.

## Arquitectura

```
TpvLayout (server, una vez por sesión)
  └─ fetchea en paralelo con auth:
       products, categories, empresa, turno, mesas
  └─ TpvCatalogProvider (client context — persiste entre navegaciones)
       ├─ Realtime: mesa_sesiones → refreshMesas()
       ├─ Realtime: productos + categorias → debounce 400ms → refreshCatalog()
       └─ TpvRolProvider (ya existe)
            └─ {children}
                 ├─ MostradorPage (server, solo fetchea pedidos de la mesa activa)
                 │    └─ MostradorClient (lee catalog del contexto)
                 ├─ MesasPage (server, solo parsea searchParams)
                 │    └─ MesasGrid (lee mesas + turnoId del contexto)
                 └─ HistorialPage / AnalyticsPage (sin cambios — datos 100% dinámicos)
```

## Interfaz del contexto

```ts
interface TpvCatalogContextValue {
  products: Product[];
  categories: Category[];
  tipoImpuesto: 'iva' | 'igic';
  porcentajeImpuesto: number;
  turno: TpvTurno | null;
  setTurno: (turno: TpvTurno | null) => void;   // ← cierre de turno
  mesas: MesaWithSession[];
  refreshMesas: () => Promise<void>;
  refreshCatalog: () => Promise<void>;           // ← invalidación manual
}
```

## Gaps críticos resueltos

### 1. "Turno Zombi" (cierre de caja)

El turno es semi-estable: se abre al inicio y se cierra al final del día.
Si el cajero pulsa "Cerrar Turno", la API muta en Supabase pero el layout no
re-ejecuta → el contexto mantiene el turno viejo (zombi) → el TPV no redirige y
el cajero puede intentar registrar pedidos sobre un turno fiscalmente cerrado.

**Fix:** Exponer `setTurno` en el contexto. El componente `TurnoCerrarForm`
llama `setTurno(null)` al confirmar el cierre exitoso en el servidor.
Al pasar a `null`, el layout React detecta el cambio de estado y el consumidor
de turno (MostradorClient / MesasGrid) reacciona de forma inmediata.

### 2. Invalidación desde el panel Admin (desfase del catálogo)

Un admin puede cambiar el precio de un plato o desactivar un producto a mitad
del servicio desde `/admin/productos`. Sin invalidación, el TPV seguirá con la
foto fija del arranque de la mañana.

**Fix (Reactivo + Debounced):** El `TpvCatalogProvider` se suscribe a Realtime
en las tablas `productos` y `categorias`. Si ocurre cualquier cambio, se programa
un refresh con debounce de 400ms. Si caen 15 eventos en ráfaga (edición masiva),
el timer se reinicia en cada evento y se ejecuta **una única** petición consolidada
a `GET /api/tpv/catalog` al acabar la ráfaga.

La suscripción usa nombre de canal con sufijo aleatorio (StrictMode safe).

## Notas de implementación

### Pathname en el Server Layout (Tarea 2)

Los Server Layouts de Next.js App Router **no reciben `params` con el pathname**
— solo reciben `params` de segmentos dinámicos.

La solución ya está en el proyecto: el proxy inyecta `x-pathname` en los headers
de cada request. El layout ya lo lee para el bypass de `/tpv/login` (línea 17).
Se reutiliza el mismo mecanismo para la lógica de exclusión del turno:

```ts
// src/app/tpv/layout.tsx — ya existe este bloque, solo añadir la lógica de turno
const pathname = headersList.get('x-pathname') ?? '';
const TURNO_NOT_REQUIRED = ['/tpv/turno', '/tpv/historial', '/tpv/analytics', '/tpv/mermas'];
const requiresTurno = !TURNO_NOT_REQUIRED.some(p => pathname.startsWith(p));

if (requiresTurno && (!turnoResult.success || !turnoResult.data)) {
  redirect('/tpv/turno/abrir');
}
```

NO hay que tocar `proxy.ts` — `x-pathname` ya está inyectado.

### Debounce del Realtime en catálogo (Tarea 1)

Un admin que edita 15 productos en lote dispara 15 eventos WebSocket en milisegundos.
Sin debounce, el TPV ejecutaría 15 peticiones concurrentes idénticas a `/api/tpv/catalog`.

```ts
// Dentro del TpvCatalogProvider
const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

function scheduleCatalogRefresh() {
  if (debounceRef.current) clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() => {
    void refreshCatalog();
  }, 400);
}

// En el listener de Realtime de productos/categorias:
.on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, scheduleCatalogRefresh)
.on('postgres_changes', { event: '*', schema: 'public', table: 'categorias' }, scheduleCatalogRefresh)
```

Un solo canal, dos listeners, un solo `debounceRef`. Cualquier combinación de
eventos en los primeros 400ms colapsa en una única petición.

### IndexedDB: clear() antes de bulkPut (Phase 2)

`bulkPut` actualiza e inserta por ID pero NO elimina registros borrados del servidor.
Si el admin elimina un producto, el store local acumulará un "producto fantasma".

En la hidratación inicial usar siempre:
```ts
await db.products.clear();
await db.products.bulkPut(freshProducts);
```

Esto garantiza que el store local es una réplica exacta de la foto del servidor,
sin acumulación de registros obsoletos entre sesiones.

## Tareas

### Tarea 1 — Crear `src/lib/tpv-catalog-ctx.tsx`

Context cliente con la interfaz completa definida arriba.

El provider:
- Inicializa con props del layout (server-fetched)
- Suscribe a `mesa_sesiones` via Realtime → `refreshMesas()` (nombre canal con uid)
- Suscribe a `productos` + `categorias` via Realtime → `scheduleCatalogRefresh()` con debounce 400ms
- `refreshMesas()` → `GET /api/tpv/mesas`
- `refreshCatalog()` → `GET /api/tpv/catalog`
- `debounceRef` compartido para ambos canales de catálogo

Hooks exportados: `useTpvCatalog()`

### Tarea 2 — Modificar `src/app/tpv/layout.tsx`

Después del bloque de auth (tenemos `empresaId`), fetchear en paralelo:

```ts
const repo = new SupabaseTpvRepository();
const [productsResult, categoriesResult, mesasResult, turnoResult, empresaRes] = await Promise.all([
  productUseCase.getAll(empresaId),
  categoryUseCase.getAll(empresaId),
  mesaSesionUseCase.getMesasWithSessions(empresaId),
  repo.findTurnoActivo(empresaId),
  getSupabaseClient()
    .from('empresas')
    .select('tipo_impuesto, porcentaje_impuesto')
    .eq('id', empresaId)
    .maybeSingle(),
]);
```

Reutilizar el `x-pathname` ya disponible (línea 17 del layout actual) para la
lógica de exclusión del turno (ver "Notas de implementación" arriba).

Wrappear con `TpvCatalogProvider` debajo de `TpvRolProvider`.

### Tarea 3 — Adelgazar `src/app/tpv/mostrador/page.tsx`

Eliminar: auth completo, fetches de products/categories/empresa/turno/mesas
(y la función `resolveEmpresaId` ya no se necesita aquí).

Conservar solo: `loadMesaData(mesaId, sesionIdParam)` — pedidos específicos de
la mesa activa. `loadMesaData` no usa `empresaId` — consulta por `mesaId` directo.

Props pasadas a `MostradorClient`: solo `initialMesa`.

### Tarea 4 — Modificar `src/components/tpv/MostradorClient.tsx`

Eliminar de `Props`:
- `turno: TpvTurno`
- `products: Product[]`
- `categories: Category[]`
- `tipoImpuesto`
- `porcentajeImpuesto`
- `mesas?: MesaWithSession[] | null`

Reemplazar con:
```ts
const { products, categories, tipoImpuesto, porcentajeImpuesto, turno, mesas } = useTpvCatalog();
```

### Tarea 5 — Adelgazar `src/app/tpv/mesas/page.tsx`

Eliminar: auth completo, fetch de mesas y turno.
Conservar: parseo de `seleccionar` searchParam.

```tsx
return <MesasGrid modo={modo} />;
```

### Tarea 6 — Modificar `src/components/tpv/MesasGrid.tsx`

Eliminar de `Props`: `mesas`, `turnoId`.
Leer del contexto:
```ts
const { mesas, turno } = useTpvCatalog();
const turnoId = turno?.id ?? null;
```

### Tarea 7 — Crear `GET /api/tpv/catalog` y `GET /api/tpv/mesas`

`/api/tpv/catalog` — devuelve `{ products, categories, tipoImpuesto, porcentajeImpuesto }`.
Requiere auth via `admin_token` o `tpv_employee_token`.

`/api/tpv/mesas` — devuelve `{ mesas: MesaWithSession[] }`.
Requiere auth via `admin_token` o `tpv_employee_token`.

Ambas rutas usan el patrón estándar: `Result<T, AppError>` + `handleResult`.

### Tarea 8 — Actualizar `TurnoCerrarForm` para invalidar el turno del contexto

`TurnoCerrarForm` ya es un componente cliente. Al recibir respuesta exitosa del
endpoint de cierre:

```ts
const { setTurno } = useTpvCatalog();
// ... dentro del handler de éxito:
setTurno(null);
router.push('/tpv/turno/abrir');
```

Esto invalida el turno en el contexto inmediatamente, antes incluso de que la
navegación ocurra, eliminando el riesgo de operaciones sobre un turno cerrado.

---

## Phase 2 — Hidratación IndexedDB (Local-First)

> No bloquea el plan actual. La infraestructura ya existe:
> `tpv_offline` DB con store `cobros_queue`, `sw-tpv.js` con NetworkFirst
> para `/tpv/*` y CacheFirst para chunks estáticos.

Al arrancar el `TpvCatalogProvider`, hidratar el IndexedDB local:

```ts
useEffect(() => {
  async function hydrateLocalDB() {
    // clear() garantiza réplica exacta — sin productos fantasma por DELETEs
    await db.products.clear();
    await db.products.bulkPut(initialProducts);
    await db.categories.clear();
    await db.categories.bulkPut(initialCategories);
    await db.configFiscal.put({ tipoImpuesto, porcentajeImpuesto });
  }
  if (initialProducts.length > 0) void hydrateLocalDB();
}, []); // solo en mount inicial
```

Requiere añadir stores `products`, `categories` y `configFiscal` a la DB
`tpv_offline` en un nuevo `src/lib/tpv/tpv-catalog-db.ts` (no tocar
`offline-queue.ts` — SRP).

Si el SW intercepta un reload offline, el provider lee del IndexedDB como
fallback antes de mostrar la pantalla de error.

---

## Archivos afectados

| Archivo | Operación |
|---------|-----------|
| `src/lib/tpv-catalog-ctx.tsx` | CREAR |
| `src/app/tpv/layout.tsx` | MODIFICAR |
| `src/app/tpv/mostrador/page.tsx` | MODIFICAR (adelgazar) |
| `src/components/tpv/MostradorClient.tsx` | MODIFICAR (leer de contexto) |
| `src/app/tpv/mesas/page.tsx` | MODIFICAR (adelgazar) |
| `src/components/tpv/MesasGrid.tsx` | MODIFICAR (leer de contexto) |
| `src/app/api/tpv/catalog/route.ts` | CREAR |
| `src/app/api/tpv/mesas/route.ts` | CREAR |
| `src/components/tpv/TurnoCerrarForm.tsx` | MODIFICAR (setTurno(null) en éxito) |

## Resultado esperado

| Navegación | Antes | Después |
|------------|-------|---------|
| → Mostrador | 5+ queries DB | 0 queries (solo pedidos de mesa si hay mesa activa) |
| → Mesas | 2 queries DB | 0 queries (Realtime mantiene estado fresco) |
| → Historial | sin cambios | sin cambios |
| → Analytics | sin cambios | sin cambios |
| Cambio de precio en Admin | TPV desactualizado | 1 request consolidado en ≤400ms |
| Edición masiva (15 productos) | 15 requests concurrentes | 1 request debounced |
| Cierre de turno | turno zombi posible | setTurno(null) invalida al instante |
