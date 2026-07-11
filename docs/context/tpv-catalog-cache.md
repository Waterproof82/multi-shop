# TPV Catalog Cache — Navegación Instantánea + Offline Resilience

## Por qué existe

Cada página TPV tiene `dynamic = 'force-dynamic'`. Sin este sistema, cada navegación
entre pestañas (Mostrador → Mesas → Historial) dispara un render server-side completo
con 5+ queries a la DB: catálogo, categorías, configuración fiscal, turno activo y
grilla de mesas.

**Resultado antes:** latencia visible en cada tab switch, carga duplicada de datos
que no cambian durante el servicio.

**Resultado después:** 0 queries adicionales al navegar. El catálogo vive en un
contexto React que persiste entre navegaciones client-side.

---

## Arquitectura

```
TpvLayout (server — ejecuta UNA VEZ por sesión)
  └── fetches en paralelo: products, categories, empresa, turno, mesas
  └── TpvCatalogProvider (client context — persiste entre navegaciones)
       ├── Realtime: productos + categorias → debounce 400ms → refreshCatalog()
       ├── Realtime: mesa_sesiones → refreshMesas()
       ├── IDB hydration: saveCatalogToIDB() al montar / loadCatalogFromIDB() como fallback
       └── TpvRolProvider
            └── {children}
                 ├── MostradorPage  → solo carga pedidos de la mesa activa
                 └── MesasPage      → solo parsea searchParams
```

### Por qué el layout no re-ejecuta

Next.js App Router: en navegaciones client-side, solo `{children}` cambia.
El layout y sus providers persisten en memoria. Esto es lo que hace posible el cache.

---

## Interfaz del contexto

```ts
// src/lib/tpv-catalog-ctx.tsx
interface TpvCatalogContextValue {
  products: Product[];
  categories: Category[];
  tipoImpuesto: 'iva' | 'igic';
  porcentajeImpuesto: number;
  turno: TpvTurno | null;
  setTurno: (turno: TpvTurno | null) => void;  // cierre de turno sin zombie
  mesas: MesaWithSession[];
  refreshMesas: () => Promise<void>;
  refreshCatalog: () => Promise<void>;
}
```

Hook de consumo: `const { products, turno, mesas } = useTpvCatalog();`

---

## Invalidación reactiva del catálogo

El admin puede cambiar precios o desactivar productos a mitad del servicio desde
`/admin/productos`. Sin invalidación, el TPV trabajaría con la foto fija del arranque.

**Solución:** `TpvCatalogProvider` se suscribe a Realtime en `productos` y `categorias`.
Un debounce de 400ms colapsa ráfagas de eventos en una única petición a `GET /api/tpv/catalog`.

```
15 ediciones en bulk → 15 eventos WebSocket → 1 request consolidado (tras 400ms de silencio)
```

El canal usa `useId()` para nombre único → safe en React StrictMode (double-mount).

---

## Turno Zombi — prevención

Si el cajero cierra el turno, la API muta en Supabase pero el layout server no
re-ejecuta → el contexto mantiene el turno anterior → el TPV no redirige.

**Fix:** `setTurno(null)` en `TurnoCerrarForm` al confirmar el cierre exitoso,
antes de `router.push('/tpv/turno/abrir')`. El contexto invalida el turno de
inmediato sin necesidad de reload.

---

## Redirect de turno en layout

El layout usa `x-pathname` (inyectado por el proxy en cada request) para detectar
si la ruta actual requiere turno activo:

```ts
const TURNO_OPTIONAL_PREFIXES = ['/tpv/turno', '/tpv/historial', '/tpv/analytics', '/tpv/mermas'];
const requiresTurno = !TURNO_OPTIONAL_PREFIXES.some(p => pathname.startsWith(p));
if (requiresTurno && (!turnoResult.success || turnoResult.data === null)) {
  redirect('/tpv/turno/abrir');
}
```

NO se modifica `proxy.ts` — `x-pathname` ya estaba inyectado.

---

## Phase 2 — IndexedDB (Offline Resilience)

### Base de datos local: `tpv_catalog`

Separada de `tpv_offline` (que maneja la cola de cobros). Principio de responsabilidad única.

**Stores:** `products`, `categories`, `config`
**Estrategia:** snapshot único por store (key `'snapshot'`). `put()` sobreescribe — sin
acumulación de registros fantasma por DELETEs del admin.

### Flujo de hidratación

```
Mount TpvCatalogProvider
  ├── Si initialProducts.length > 0  → saveCatalogToIDB() (sincroniza IDB con snapshot del server)
  └── Si initialProducts.length === 0 (Supabase no disponible)
       └── loadCatalogFromIDB() → setProducts/setCategories desde IDB
```

### Service Worker para /tpv/* (`public/sw-tpv.js`)

Separado del SW del waiter (`public/sw.js`). Scope `/tpv`.

| Ruta | Estrategia |
|------|------------|
| `/api/*` | NetworkOnly — auth y datos siempre frescos |
| `/_next/static/` | CacheFirst — chunks content-hashed |
| `/tpv/*` | NetworkFirst → cached page → `/tpv/offline` → 503 |

El fallback en cascada garantiza que si la red falla y la página no está cacheada,
se sirve al menos la shell offline. El SW se registra en `SwRegistrar` (producción only).

---

## Endpoints de refresco

| Endpoint | Retorna | Uso |
|----------|---------|-----|
| `GET /api/tpv/catalog` | `{ products, categories, tipoImpuesto, porcentajeImpuesto }` | `refreshCatalog()` |
| `GET /api/tpv/mesas` | `{ mesas: MesaWithSession[] }` | `refreshMesas()` |

Ambos requieren auth (`admin_token` o `tpv_employee_token`) y siguen el patrón `Result<T, AppError>`.

---

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `src/lib/tpv-catalog-ctx.tsx` | Contexto cliente + Realtime + IDB hydration |
| `src/lib/tpv/tpv-catalog-db.ts` | IndexedDB: open, save, load (tpv_catalog DB) |
| `src/app/tpv/layout.tsx` | Server layout: fetches paralelos + TpvCatalogProvider |
| `src/app/api/tpv/catalog/route.ts` | Endpoint de refresco de catálogo |
| `src/app/api/tpv/mesas/route.ts` | Endpoint de refresco de mesas |
| `src/components/tpv/TurnoCerrarForm.tsx` | Llama setTurno(null) al cerrar turno |
| `src/components/tpv/MostradorClient.tsx` | Lee catálogo del contexto (no props) |
| `src/components/tpv/MesasGrid.tsx` | Lee mesas + turno del contexto (no props) |
| `src/app/tpv/mostrador/page.tsx` | Solo carga pedidos de la mesa activa |
| `src/app/tpv/mesas/page.tsx` | Solo parsea searchParams |
| `public/sw-tpv.js` | Service Worker scope /tpv — 3 estrategias |

---

## Trampas Criticas

- **`useId()` en lugar de `Math.random()` para nombre de canal Realtime** — ESLint
  `react-hooks/purity` prohíbe side-effects en inicializadores de `useRef`. Usar
  `const instanceId = useId().replace(/:/g, '-')` para generar el sufijo del canal.

- **Rules of Hooks: early returns DESPUÉS de todos los hooks** — `if (!turno) return null`
  en `MostradorClient` debe ir DESPUÉS de todos los `useCallback`, `useRef`, `useState`,
  no antes. Violar esto provoca "rendered more hooks than previous render".

- **`put()` no acumula fantasmas** — a diferencia de `bulkPut()` con IDs, el esquema
  de snapshot único (`key: 'snapshot'`) sobreescribe el registro anterior. Un producto
  borrado en el server desaparece automáticamente en el próximo refresh.

- **SW solo en producción** — `SwRegistrar` no registra en dev. Testear con
  `pnpm build && pnpm start`.

- **`/api/*` siempre NetworkOnly en sw-tpv.js** — nunca cachear tokens ni estado.
