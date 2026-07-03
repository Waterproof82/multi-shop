# TPV Analytics — Spec Técnica (Fase 2)

> **Fecha:** 2026-07-03
> **Rama base:** develop
> **Dependencias:** TPV Fase 1 completa (tpv_cobros, tpv_turnos, cobro flow)

---

## 1. Objetivo

Añadir un dashboard de analítica TPV en `/tpv/analytics` que permita al operador consultar el rendimiento de caja para cualquier período (hoy, semana, mes, rango custom). Incluye también:

- KPIs de turno enriquecidos en `/tpv/historial` (sin nueva página)
- Configuración de tipo de impuesto por empresa (IVA vs IGIC) con label dinámico en todo el TPV

---

## 2. Alcance

### Incluido

- Página `/tpv/analytics` con selector de período
- Endpoint único `GET /api/tpv/analytics`
- KPIs: Facturado, Ticket medio, IVA/IGIC total, Propinas, Turnos
- Gráfico de barras: ventas por hora (Recharts, lazy-loaded)
- Split efectivo / tarjeta con barras de progreso
- Top 10 productos vendidos (via `pedidos.detalle_pedido`)
- Historial de turnos del período (operador, horario, total, cobros, estado)
- KPIs inline en `HistorialClient` existente (sin nueva página)
- Configuración IVA/IGIC por empresa (migración + admin form + labels dinámicos)
- Enlace "Analítica" en `AccionesPanel`

### Excluido (Fase 3+)

- Comparativa vs período anterior
- Desglose por mesa / sesión
- Exportación de analítica a CSV/PDF
- Tipos de IVA por producto (10% / 21% / 0%)

---

## 3. Cambios de Base de Datos

### Migración: `20260703000004_empresas_tipo_impuesto.sql`

```sql
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS tipo_impuesto      TEXT    NOT NULL DEFAULT 'iva'
    CHECK (tipo_impuesto IN ('iva', 'igic')),
  ADD COLUMN IF NOT EXISTS porcentaje_impuesto NUMERIC(5,2) NOT NULL DEFAULT 10;
```

No requiere nuevas tablas. No hay índices adicionales necesarios.

**Nota:** `tpv_cobros.iva_porcentaje` ya almacena el tipo por cobro — el histórico no se rompe al cambiar la config de la empresa.

---

## 4. Dominio

### 4.1 Tipos nuevos en `tpv-types.ts`

```typescript
export type TipoImpuesto = 'iva' | 'igic';

export interface TpvAnalytics {
  totalFacturadoCents: number;
  numCobros: number;
  ticketMedioCents: number;
  totalIvaCents: number;
  baseImponibleCents: number;
  totalPropinaCents: number;
  splitEfectivoCents: number;
  splitTarjetaCents: number;
  ventasPorHora: number[];          // 24 posiciones, índice = hora (0-23)
  topProductos: { nombre: string; cantidad: number }[];
  historialTurnos: TpvTurnoResumen[];
  numTurnos: number;
  duracionMediaMinutos: number | null;
}

export interface TpvTurnoResumen {
  id: string;
  operadorNombre: string;
  aperturaAt: string;
  cierreAt: string | null;
  totalCents: number;
  numCobros: number;
  activo: boolean;
}

export interface GetAnalyticsParams {
  empresaId: string;
  desde: string;  // ISO date YYYY-MM-DD
  hasta: string;  // ISO date YYYY-MM-DD
}
```

### 4.2 Interfaz del repositorio

```typescript
// ITpvRepository.ts — nuevo método
getAnalytics(params: GetAnalyticsParams): Promise<Result<TpvAnalytics>>;
```

---

## 5. Endpoint

### `GET /api/tpv/analytics`

**Auth:** `requireAuth` (admin de la empresa)
**Query params:** `desde` (YYYY-MM-DD), `hasta` (YYYY-MM-DD)
**Validación Zod:**
```typescript
z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
```

**Respuesta 200:**
```json
{
  "totalFacturadoCents": 128400,
  "numCobros": 68,
  "ticketMedioCents": 1888,
  "totalIvaCents": 11672,
  "baseImponibleCents": 116728,
  "totalPropinaCents": 4850,
  "splitEfectivoCents": 87312,
  "splitTarjetaCents": 41088,
  "ventasPorHora": [0,0,0,0,0,0,0,0,18400,35200,...],
  "topProductos": [{"nombre":"Menú del día","cantidad":34},...],
  "historialTurnos": [...],
  "numTurnos": 3,
  "duracionMediaMinutos": 320
}
```

**Errores:**
- `400` — parámetros inválidos o rango > 365 días
- `401` — sin autenticación

---

## 6. Implementación del Repositorio

### `supabase-tpv.repository.ts` — método `getAnalytics`

**Query 1 — KPIs de cobros** (filtro: `cobrado_at` en rango, `rectifica_cobro_id IS NULL`):
```sql
SELECT
  SUM(importe_cobrado_cents)   AS total_facturado,
  COUNT(*)                     AS num_cobros,
  SUM(iva_cents)               AS total_iva,
  SUM(base_imponible_cents)    AS base_imponible,
  SUM(propina_cents)           AS total_propina,
  SUM(CASE WHEN metodo_pago='efectivo' THEN importe_cobrado_cents ELSE 0 END) AS efectivo,
  SUM(CASE WHEN metodo_pago='tarjeta'  THEN importe_cobrado_cents ELSE 0 END) AS tarjeta
FROM tpv_cobros
WHERE empresa_id = $1
  AND cobrado_at >= $2::date
  AND cobrado_at <  ($3::date + interval '1 day')
  AND rectifica_cobro_id IS NULL
```

**Query 2 — Ventas por hora** (mismo filtro, agrupado):
```sql
SELECT EXTRACT(hour FROM cobrado_at AT TIME ZONE 'Europe/Madrid')::int AS hora,
       SUM(importe_cobrado_cents) AS total
FROM tpv_cobros
WHERE ...
GROUP BY hora
```
→ Se convierte a array de 24 posiciones en el repositorio.

**Query 3 — Turnos del período** (filtro: `apertura_at` en rango):
```sql
SELECT id, operador_nombre, apertura_at, cierre_at,
       total_efectivo_cents + total_tarjeta_cents AS total_cents
FROM tpv_turnos
WHERE empresa_id = $1
  AND apertura_at >= $2::date
  AND apertura_at <  ($3::date + interval '1 day')
ORDER BY apertura_at DESC
```
`num_cobros` por turno se calcula con subquery o query separada.

**Query 4 — Top productos** (via RPC o query directa):
```sql
SELECT elem->>'nombre' AS nombre, SUM((elem->>'cantidad')::int) AS cantidad
FROM pedidos, jsonb_array_elements(detalle_pedido) AS elem
WHERE empresa_id = $1
  AND created_at >= $2::date
  AND created_at <  ($3::date + interval '1 day')
  AND estado != 'cancelado'
GROUP BY nombre
ORDER BY cantidad DESC
LIMIT 10
```

---

## 7. Capa de UI

### 7.1 `/tpv/analytics/page.tsx` (Server Component)

1. Verifica sesión admin (`authAdminUseCase.verifyToken`)
2. Verifica turno activo (redirect a `/tpv/turno/abrir` si no hay)
3. Fetch inicial con `desde = hoy, hasta = hoy`
4. Lee `empresa.tipo_impuesto` para pasar como prop
5. Renderiza `<AnalyticsClient initialData={...} tipoImpuesto={...} />`

### 7.2 `AnalyticsClient.tsx` (Client Component)

**Estado:**
```typescript
const [periodo, setPeriodo] = useState<'hoy'|'semana'|'mes'|'custom'>('hoy')
const [desde, setDesde] = useState(today)
const [hasta, setHasta] = useState(today)
const [data, setData] = useState<TpvAnalytics>(initialData)
const [loading, setLoading] = useState(false)
```

**Selector de período:** botones Hoy / Semana / Mes / Custom. Al seleccionar, calcula fechas y hace fetch a `/api/tpv/analytics`.

**Secciones en orden (scroll):**
1. Header con título + selector de período
2. Fila de 5 KPIs
3. Grid 2 columnas: gráfico barras por hora (Recharts lazy) + split pago
4. Grid 2 columnas: top productos + historial de turnos

**Gráfico:** `<BarChart>` de Recharts con los 24 valores de `ventasPorHora`. Lazy-loaded con `dynamic()` igual que `AdminCharts`. Solo muestra horas con actividad (±1 hora de margen).

**Label impuesto:** prop `tipoImpuesto: 'iva' | 'igic'` → `tipoImpuesto.toUpperCase()` en todos los labels.

### 7.3 Cambios en `HistorialClient.tsx`

Se calculan desde los cobros ya cargados (sin fetch extra):
```typescript
const ticketMedioCents = cobros.length > 0
  ? Math.round(cobros.reduce((s, c) => s + c.importeCobradoCents, 0) / cobros.length)
  : 0;
```

Se añaden 3 KPI cards al header existente: Ticket medio, Efectivo/Tarjeta (split visual), IVA/IGIC total. Recibe `tipoImpuesto` como nueva prop.

### 7.4 `AccionesPanel.tsx`

Añadir enlace "Analítica" en el grupo "Sistema", junto a "Conformidad legal".

---

## 8. Cambios en Admin

### 8.1 `UpdateEmpresaData` (IEmpresaRepository.ts)

```typescript
tipo_impuesto?: 'iva' | 'igic';
porcentaje_impuesto?: number;
```

### 8.2 `empresa.dto.ts`

```typescript
tipo_impuesto: z.enum(['iva', 'igic']).optional(),
porcentaje_impuesto: z.number().min(0).max(30).optional(),
```

### 8.3 `empresa-datos-form.tsx`

Dropdown "Tipo de impuesto" (IVA / IGIC). Al cambiar a IGIC → auto-rellena `porcentaje_impuesto` a 7. Al cambiar a IVA → auto-rellena a 10. Campo numérico editable para casos especiales.

### 8.4 Tipo `Empresa` en `types.ts`

```typescript
tipoImpuesto?: 'iva' | 'igic';
porcentajeImpuesto?: number;
```

---

## 9. Propagación del Label IVA/IGIC

Los siguientes componentes reciben `tipoImpuesto` como prop desde su página padre (SSR):

| Componente | Cambio |
|---|---|
| `CobroConfirmado.tsx` | "IVA" → `tipoImpuesto.toUpperCase()` |
| `HistorialClient.tsx` | label en KPI y en filas de cobro |
| `AnalyticsClient.tsx` | KPI "IVA/IGIC total" |
| `TurnoCerrarForm.tsx` | si muestra IVA en el arqueo (TBD Fase 3) |

La página `/tpv/cobro/[sesionId]/page.tsx` ya consulta `empresas` — añadir `tipo_impuesto` al SELECT.

---

## 10. Seguridad

- `GET /api/tpv/analytics` usa `requireAuth` — mismo patrón que otros endpoints TPV
- Rango máximo: 365 días (validado en Zod, evita queries abusivas)
- `empresa_id` siempre derivado del token JWT (nunca del body/query)
- La query de top productos filtra por `empresa_id` antes de expandir el JSONB

---

## 11. Archivos Afectados

### Nuevos
- `supabase/migrations/20260703000004_empresas_tipo_impuesto.sql`
- `src/app/tpv/analytics/page.tsx`
- `src/components/tpv/AnalyticsClient.tsx`
- `src/app/api/tpv/analytics/route.ts`

### Modificados
- `src/core/domain/entities/tpv-types.ts` — nuevos tipos
- `src/core/domain/entities/types.ts` — `tipoImpuesto`, `porcentajeImpuesto` en `Empresa`
- `src/core/domain/repositories/ITpvRepository.ts` — `getAnalytics`
- `src/core/infrastructure/repositories/supabase-tpv.repository.ts` — implementación
- `src/core/domain/repositories/IEmpresaRepository.ts` — `UpdateEmpresaData`
- `src/core/application/dtos/empresa.dto.ts` — campos nuevos
- `src/core/infrastructure/database/supabase-empresa.repository.ts` — SELECT + update
- `src/app/api/admin/empresa/route.ts` — GET devuelve `tipo_impuesto`
- `src/components/admin/empresa-datos-form.tsx` — dropdown IVA/IGIC
- `src/components/admin/configuracion-page-client.tsx` — nuevos campos
- `src/app/admin/(protected)/configuracion/page.tsx` — pasar nuevos campos
- `src/components/tpv/AccionesPanel.tsx` — enlace Analítica
- `src/components/tpv/HistorialClient.tsx` — KPIs inline + prop tipoImpuesto
- `src/app/tpv/historial/page.tsx` — pasar tipoImpuesto
- `src/app/tpv/cobro/[sesionId]/page.tsx` — SELECT tipo_impuesto
- `src/components/tpv/cobro/CobroConfirmado.tsx` — label dinámico
- `src/core/infrastructure/repositories/supabase-tpv.repository.ts` — `crearCobroCompleto` usa `porcentajeImpuesto` de empresa como default

---

## Historial

| Versión | Fecha      | Cambios                        |
|---------|------------|--------------------------------|
| 1.0     | 2026-07-03 | Spec inicial aprobada          |
