# Pendientes (multi_shop)

Registro de trabajo diferido y decisiones del owner. Cada entrada dice qué,
por qué queda abierto y cómo se cierra.

---

## Configurador de personas (store-people-configurator) — post-activación 2026-11-15

Estado: **LIVE** en los 2 kits (migración `20261114000001_store_people_configurator`
+ backfill aplicados en `multi_tienda` con autorización del owner; PRs #170/#171
mergeados y desplegados). Lo que queda es edición, deudas heredadas y un gate manual.

### 1. Admin UI para el configurador (deferred)
- Hoy las reglas y los límites se editan por SQL:
  - `receta_items.regla_personas` + `receta_items.tabla_fila` (por fila de receta).
  - `productos.personas_min` / `personas_max` / `personas_paso_cents` (contador y paso de precio).
- Vocabulario válido (CHECK): `'por_persona'` | `'compartido'` | `'pack:C'` | `NULL`
  (legacy ×1). Los packs escalan `ceil(N/C)`. NO existe `'por_persona:C'`:
  "C unidades por persona" se modela con cantidad base C y regla `'por_persona'`
  (así está hecha la ración del Plus, base 2).
- **Regla de oro**: un producto con configurador debe tener su receta 100 % cubierta
  (cada fila con regla válida y `tabla_fila` en rango, sin duplicados). Lo vigila el
  test de compliance live-DB `tests/compliance/store-people-config-coverage.test.ts`:
  si se rompe, la suite falla.
- Para extender el configurador a otro kit: columnas del producto + reglas por fila
  (plantilla en `supabase/backfill/20261114-store-people-config-backfill.sql`).

### 2. Bug legacy del trigger (decisión del owner; otros tenants)
- Para filas de receta con `regla_personas NULL` el trigger v2 deduce
  `cantidad_necesaria × 1` (NO `× cantidad` del ítem). Preservado byte-igual a
  propósito (blast radius acotado): un pedido con cantidad > 1 de un producto sin
  regla sub-deduce stock.
- Afecta a otros tenants con recetas; arreglarlo cambia deducciones históricas →
  decisión separada del owner (no es parte de este cambio).

### 3. Smoke manual del serve-path (owner)
- Gate definido por el spec: pedido **real** a N>1 (p. ej. Estándar ×3) verificando:
  1. `detalle_pedido` lleva el precio server-side (399 €/línea a 3 personas, no el
     que mande el cliente) y el campo `personas`.
  2. Al pasar el ítem a `'servido'`, la deducción por regla: `por_persona ×N`,
     packs `ceil(N/C)`, compartidos ×1 — y `movimientos_stock` tipo `'deduccion'`.
- Pre-requisito: registrar albaranes (los `ingredientes.cantidad_actual` deben
  quedar por encima del umbral tras restar; el CHECK ≥ 0 abortaría la transacción).
- Hoy los kits están en modo reserva (sin cobro), así que este gate se activa cuando
  se cobre el primer pedido real a N>1.

### 4. Flip de PRICES_CONFIRMED (web → carry automático)
- El CTA "Comprar" del PDP web ya construye `multishopProductUrl(slug, personas)`
  y solo se muestra con `isPurchasable` (`PRICES_CONFIRMED` + `in_stock`). Al hacer
  el flip de honestidad de precios (gate pre-existente, `docs/PENDIENTES.md` del
  repo web), el carry `?personas=N` queda activado **automáticamente**: el server
  de la tienda ya preselecciona y clampa el valor (verificado en vivo 2026-11-15).

### 5. Mejoras sugeridas (del verify-report)
- Añadir casos de `factor_regla()` / `deducir_stock_on_servido()` a
  `supabase/tests/smoke-db-functions.sql` (hogar natural del espejo SQL).
- Test jsdom del selector del PDP con `?personas` preseleccionado (hoy la
  preselección está verificada por SSR en vivo, no por test de componente).
