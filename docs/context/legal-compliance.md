# Compliance Legal — multi-shop

Registro de normativas aplicables al sistema. Actualizar cada vez que se identifique una nueva obligación regulatoria durante el desarrollo.

---

## Módulo: TPV (Punto de Venta)

### Ley 11/2021 — Medidas de Prevención y Lucha contra el Fraude Fiscal (Ley Antifraude)
- **Qué prohíbe:** Software con doble contabilidad o que permita alterar, borrar o ocultar registros de ventas.
- **Donde aplica en el sistema:**
  - `tpv_turno_eventos` — tabla append-only con triggers BEFORE DELETE/UPDATE que lanzan excepción
  - `albaranes_compra` — trigger `trigger_albaranes_immutable` bloquea UPDATE si `estado = 'recibido'`
  - `movimientos_stock` — diseño append-only; descuadres siempre via nuevo movimiento, nunca editando el pasado
- **Fichero clave:** `supabase/migrations/20260714000002_tpv_turno_eventos.sql`

### RD 1619/2012 — Reglamento de Facturación
- **Qué exige:** Toda factura debe incluir los tipos de IVA aplicados y sus bases imponibles desglosadas.
- **Donde aplica en el sistema:**
  - `tpv_cobros.detalle_items` — desglose de líneas de producto en el ticket
  - `InformeZModal` — Informe Z con totales por tipo de IVA al cierre de turno
  - `facturas_proveedor` — columnas `base_imponible_0/4/10/21_cents` + `iva_soportado_cents`
- **Fichero clave:** `docs/context/tpv-informe-z.md`

### SII — Suministro Inmediato de Información (Hacienda)
- **Estado:** No implementado. Pendiente de evaluación si algún tenant supera el umbral de facturación.

---

## Módulo: Compras y Proveedores (SIALTI)

### Reglamento (CE) 178/2002 — Legislación Alimentaria General (Trazabilidad Sanitaria)
- **Qué exige:** Todo operador de hostelería debe poder identificar de qué proveedor procede cada lote de ingrediente y cuál es su fecha de caducidad. En caso de alerta sanitaria o intoxicación, Sanidad exige el historial del lote en cuestión.
- **Donde aplica en el sistema:**
  - `ingredientes.es_perecedero` — flag booleano que activa la obligación de trazabilidad
  - `albaranes_compra_items.numero_lote` y `.fecha_caducidad` — captura obligatoria en recepción si el ingrediente es perecedero
  - `recibir_albaran_transaccional` RPC — persiste `numero_lote` y `fecha_caducidad` en el `metadata` del `movimiento_stock`
  - Use Case `addItemToAlbaranUseCase` — lanza `VALIDATION_ERROR` con código `SANIDAD_TRAZABILIDAD_REQUERIDA` si faltan los campos
- **Error code:** `SANIDAD_TRAZABILIDAD_REQUERIDA`
- **Fichero clave:** `supabase/migrations/20260715000001_modulo_compras_sialti.sql`

### RD 1619/2012 — Reglamento de Facturación (IVA Soportado)
- **Qué exige:** Las facturas recibidas de proveedores deben registrarse con desglose de bases imponibles por tipo de IVA para que el negocio pueda deducir el IVA soportado en el Modelo 303 trimestral.
- **Tipos de IVA en restauración:**
  - **0%** — artículos exentos, operaciones intracomunitarias (maquinaria, vajilla de UE), régimen especial de agricultura, leyes temporales (ej: alimentos de primera necesidad)
  - **4%** — pan, leche, huevos, frutas, verduras, legumbres, cereales
  - **10%** — carne, pescado, aceite, conservas, bebidas no alcohólicas
  - **21%** — bebidas alcohólicas, refrescos, suministros, material de oficina
- **Donde aplica en el sistema:**
  - `catalogo_compra.porcentaje_iva` — fijado por artículo del proveedor: `CHECK IN (0, 4, 10, 21)`
  - `facturas_proveedor` — columnas `base_imponible_0_cents`, `base_imponible_4_cents`, `base_imponible_10_cents`, `base_imponible_21_cents`, `iva_soportado_cents`
  - Use Case `createFacturaProveedorUseCase` — valida la matemática del IVA con tolerancia ±2 cents

### Ley 11/2021 — Ley Antifraude (aplicación al módulo de compras)
- **Qué prohíbe:** Alterar retroactivamente registros de stock para ocultar compras o ventas no declaradas.
- **Donde aplica en el sistema:**
  - Trigger `trigger_albaranes_immutable` — bloquea cualquier UPDATE en `albaranes_compra` cuando `estado = 'recibido'`
  - Use Case `addItemToAlbaranUseCase` y similares — guard de estado antes de cualquier mutación
  - Descuadres de stock → siempre via nuevo `movimiento_stock` de tipo `ajuste`, nunca editando la entrada original

---

## Módulo: Fiscal / Reporting

### Ley 11/2021 — Informe Z y Número de Serie
- **Qué exige:** Cada cierre de turno debe generar un Informe Z con número correlativo, sin huecos.
- **Donde aplica:** `tpv_turnos.numero_z` — trigger `tpv_turno_assign_z` con `pg_advisory_xact_lock` para evitar race conditions
- **Fichero clave:** `docs/context/tpv-informe-z.md`

### AEAT QR en Ticket
- **Referencia:** Proyecto VERI*FACTU / SII (en fase de consulta pública)
- **Donde aplica:** `browser-printer.ts` → `buildAeatUrl()` genera URL AEAT con formato `DD-MM-YYYY`
- **Fichero clave:** `src/lib/browser-printer.ts`

---

## Protección de Datos

### RGPD / Ley Orgánica 3/2018 (LOPDGDD)
- **Donde aplica:**
  - PII (email, teléfono de clientes) — nunca se loguea (regla en CLAUDE.md)
  - `Sentry` — `maskAllText: true` + `blockAllMedia: true` obligatorios en Session Replay
  - Backups cifrados con HMAC-SHA256 para snapshots fiscales Electron
- **Fichero clave:** `docs/context/sentry-monitoring.md`
