# Analítica Avanzada — Contexto Técnico

Implementado: 2026-07-18 (Bloque 3 del roadmap F&B)

## Resumen

Cuatro módulos de analítica avanzada para restaurantes, accesibles desde el panel admin y el TPV.

---

## 3.1 Matriz BCG de Menú (`/admin/analytics/menu-engineering`)

Visualización scatter plot que clasifica los productos del menú en 4 cuadrantes según popularidad (nº ventas) y margen de contribución.

**Cuadrantes:**
- **Estrellas** — alto volumen + alto margen → mantener y promover
- **Vaca** — alto volumen + bajo margen → revisar precio o coste
- **Enigma** — bajo volumen + alto margen → analizar visibilidad
- **Perro** — bajo volumen + bajo margen → candidato a eliminar

**Implementación:**
- Reutiliza la RPC `analytics_margen_productos` existente (no requiere nuevas tablas)
- Clasificación por mediana: eje X = mediana de ventas, eje Y = mediana de margen
- `ScatterChart` de Recharts con `ReferenceArea` para fondos de cuadrante
- Componente: `src/components/analytics/BcgScatterChart.tsx`
- Página: `src/app/admin/(protected)/analytics/menu-engineering/page.tsx`

---

## 3.2 Heatmap de Ocupación (`/admin/analytics/ocupacion`)

Grid 7×24 (días × horas) que muestra la densidad de ocupación de mesas a lo largo de la semana.

**Útil para:** dimensionar personal, detectar horas pico y valle.

**Implementación:**
- Nueva RPC `analytics_ocupacion_heatmap(p_empresa_id, p_desde, p_hasta)`
  - Fuente: `mesa_sesiones.created_at`
  - Devuelve: `[{dow, hour, count, avg_duration_min}]`
  - Timezone: `Europe/Madrid`
- CSS grid puro (no Recharts) — 168 celdas `<div>` con opacidad proporcional al valor
- Toggle entre "Nº sesiones" y "Duración media (min)"
- Nuevo índice `idx_mesa_sesiones_empresa_created (empresa_id, created_at)`
- Componente: `src/components/analytics/HeatmapGrid.tsx`
- Página: `src/app/admin/(protected)/analytics/ocupacion/page.tsx`

---

## 3.3 Informe de Cierre de Turno (`/tpv/analytics/cierre/[turnoId]`)

Resumen completo generado automáticamente al cerrar un turno TPV. Imprimible con un clic.

**Datos incluidos:**
- Ventas netas (efectivo + tarjeta) y propinas
- Nº covers y ticket medio
- Top 5 productos del turno
- Mermas registradas durante el turno y su coste estimado

**Implementación:**
- Nueva RPC `analytics_cierre_turno(p_turno_id)`
  - Fuente: `tpv_cobros` (totales reales), `pedidos.detalle_pedido` (top productos), `movimientos_stock` (mermas)
  - Accede a `tpv_turnos.apertura_at` / `cierre_at` para acotar el período
  - `SECURITY DEFINER` — acceso controlado por `p_turno_id`
- Server component SSR — render óptimo para impresión
- `@media print` CSS oculta sidebar/nav. `PrintButton` client sub-component dispara `window.print()`
- Auth dual: acepta `admin_token` (admin) y `tpv_employee_token` (encargado/cajero)
- `TurnoCerrarForm` redirige a `/tpv/analytics/cierre/[turnoId]` tras cerrar. Botón "Volver al TPV" lleva a `/tpv/turno/abrir`
- Archivos: `src/app/tpv/analytics/cierre/[turnoId]/page.tsx` + `cierre-report-view.tsx`
- API: `src/app/api/tpv/analytics/cierre/[turnoId]/route.ts`

---

## 3.4 Comparativa de Períodos (`/admin/analytics/comparativa`)

Tarjetas delta que comparan dos períodos seleccionables: ventas, covers, ticket medio y margen.

**Implementación:**
- Dos llamadas paralelas a `getMargenProductos` con rangos de fecha distintos
- Delta % calculado en el use case — sin nueva RPC
- Componente `DeltaCard`: muestra valor, variación %, flecha ↑↓ con color
- Períodos predefinidos: semana actual vs anterior, mes actual vs anterior, o custom
- Página: `src/app/admin/(protected)/analytics/comparativa/page.tsx`

---

## Componentes Compartidos

| Componente | Ruta | Propósito |
|---|---|---|
| `PeriodPicker` | `src/components/analytics/PeriodPicker.tsx` | Selector semana/mes/custom reutilizable |
| `HeatmapGrid` | `src/components/analytics/HeatmapGrid.tsx` | Grid 7×24 CSS puro |
| `DeltaCard` | `src/components/analytics/DeltaCard.tsx` | Tarjeta con valor + variación % |
| `BcgScatterChart` | `src/components/analytics/BcgScatterChart.tsx` | ScatterChart Recharts con cuadrantes |
| `PrintButton` | `src/components/analytics/PrintButton.tsx` | Client sub-component para `window.print()` |

---

## Migraciones

| Archivo | Descripción |
|---|---|
| `20260717000001_analytics_ocupacion_heatmap.sql` | RPC heatmap + índice `mesa_sesiones` |
| `20260717000002_analytics_cierre_turno.sql` | RPC cierre de turno completo |

---

## Trampas (para sesiones futuras)

- **`tpv_turnos` usa `apertura_at` y `cierre_at`** — NO `created_at` / `closed_at`. La RPC cierre los usa para acotar el período.
- **`analytics_cierre_turno` usa `tpv_cobros`** para los totales — no lee `tpv_turnos.total_efectivo_cents` directamente. Esto evita que un turno aún abierto devuelva 0.
- **HeatmapGrid usa `<Fragment key={dow}>`** — requiere import explícito de `Fragment` de React. No usar `<>` en `.map()`.
- **BCG**: si no hay datos de margen (`precioCmpCents = 0` en todos los ingredientes), todos los productos aparecen en "Perro". Es comportamiento esperado — el food cost real requiere recetas con CMP.
- **Comparativa**: la división por cero en delta % está controlada (`prevVal === 0 → null`). El `DeltaCard` muestra "—" en ese caso.
