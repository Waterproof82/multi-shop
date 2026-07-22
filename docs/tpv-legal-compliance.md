# TPV — Cumplimiento Legal y Normativo

> Documento de seguimiento para auditabilidad interna.
> Cada requisito tiene un estado: `[ ]` pendiente · `[~]` parcial · `[x]` completado.
> Actualizar con la versión del software y la fecha al marcar como completado.

---

## 1. Ley Antifraude + Reglamento Verifactu (RD 1007/2023)

> Ámbito: Todo el territorio nacional. **Crítico para comercialización.**

### 1.1 Inalterabilidad e Integridad de registros

- [x] **Bloquear DELETE en `tpv_cobros`** — Trigger `tpv_cobro_block_delete` raises EXCEPTION (20260703).
- [x] **Bloquear UPDATE de campos económicos** — Trigger `tpv_cobro_block_update` (20260703).
- [x] **Ticket rectificativo** — `POST /api/tpv/cobro/rectificar` emite cobro de signo negativo con `rectifica_cobro_id` referenciando el original. Accesible desde el historial (tab Cobros) (20260703).
- [x] Columna `rectifica_cobro_id UUID REFERENCES tpv_cobros(id)` añadida a `tpv_cobros` (20260703).
- [x] Documentar en `CLAUDE.md` y en la declaración de responsabilidad que el borrado directo de registros de venta está prohibido (20260703).

### 1.2 Cadena de Hashes (Trazabilidad)

- [x] Añadir columnas a `tpv_cobros`: `hash TEXT NOT NULL`, `hash_anterior TEXT` (20260703).
- [x] **Función Postgres** SHA-256 en trigger `tpv_cobro_hash_insert` via pgcrypto (20260703).
- [x] El primer cobro de la cadena tiene `hash_anterior = NULL` (genesis) (20260703).
- [x] **Endpoint de verificación** `GET /api/tpv/audit/chain` — recomputa SHA-256 en Node.js y compara, accesible desde `/tpv/legal` (20260703).
- [x] Guardar `numero_ticket` auto-incremental por empresa (serie T + número sin saltos) (20260703).

### 1.3 Accesibilidad para inspectores (Volcado de datos)

- [x] **Endpoint de exportación** `GET /api/tpv/audit/export?desde=&hasta=` — JSON normalizado con todos los cobros del periodo con hash chain, descarga como archivo (20260703).
- [x] Formato JSON legible sin herramientas especiales, con cabecera `Content-Disposition: attachment` (20260703).
- [~] Protección: admin de la empresa. Pendiente: token de auditoría de un solo uso para inspectores externos.

### 1.4 Código QR / URL de verificación AEAT

- [x] **URL de verificación AEAT** mostrada en `CobroConfirmado` con formato correcto: `DD-MM-AAAA` (no ISO 8601). Parámetros: `nif`, `numserie` (serie+ticket 6 dígitos), `fecha`, `importe` (20260703).
- [x] **QR visual AEAT en ticket impreso** — `browser-printer.ts` genera imagen QR base64 con la librería `qrcode` y la incrusta en el HTML de impresión. `buildAeatUrl()` calcula la fecha con `DD-MM-YYYY` correcto (bug previo en `fecha.split('/').reverse()` generaba `YYYY-MM-DD`) (20260714).
- [ ] Verificar con la AEAT que el formato de `numserie` y `fecha` pasan la validación del servicio web.

### 1.5 Declaración de Responsabilidad del fabricante

- [x] **Declaración de Responsabilidad** mostrada en `/tpv/legal` (20260703).
- [x] Pantalla "Sobre este TPV / Conformidad legal" en `/tpv/legal` accesible desde el panel de acciones (20260703).
- [x] Versión del software (1.0.0), fecha de declaración (2026-07-03) y serie del sistema en pantalla (20260703).
- [ ] Adjuntar la declaración firmada en el contrato comercial con cada cliente.

---

## 2. TicketBAI (País Vasco)

> Ámbito: Solo si el cliente opera en Álava, Guipúzcoa o Vizcaya. Activar por empresa.

- [ ] Detectar automáticamente si `empresa.provincia` ∈ `['Álava', 'Guipúzcoa', 'Vizcaya']` y activar modo TicketBAI.
- [ ] **Firma digital XML** — Antes de cerrar cada venta, generar un XML con el formato TBAI y firmarlo con certificado electrónico del cliente (ZUENTZAT).
- [ ] **Envío en tiempo real** a la hacienda foral correspondiente vía API REST de cada diputación.
- [ ] Gestionar el modo offline: cola de envíos diferidos con justificación técnica (RD 1051/2022).
- [ ] **Alta como Empresa Desarrolladora** en las sedes electrónicas de Vizcaya, Guipúzcoa y Álava (gratuito). Obtener código de desarrollador.
- [ ] Incrustar el código de desarrollador en cada XML de factura TicketBAI.

---

## 3. Contenido obligatorio del ticket (RD 1619/2012)

> Aplica a cada ticket impreso o digital que emita el TPV.

- [x] **Número correlativo de ticket** sin saltos (`serie-NNNNNN`), atómico en DB con `SELECT nextval()` (20260703).
- [x] **Fecha y hora** de expedición (ISO 8601, zona horaria Europe/Madrid) (20260714).
- [x] **NIF, nombre y razón social** del emisor — `empresas.nif` configurable desde el panel admin. `empresas.razon_social TEXT` (nullable) para S.L./S.A. — si está presente, se usa en el header del ticket en lugar de `nombre`; si es NULL, fallback a `nombre`. Configurable desde panel admin → Configuración (20260720).
- [x] **Desglose de ítems**: nombre del producto, cantidad, precio unitario (20260714).
- [x] **Tipo impositivo configurable por empresa** — `empresas.tipo_impuesto` (`'iva'|'igic'`) y `empresas.porcentaje_impuesto`. Auto-relleno al cambiar tipo (IVA → 10%, IGIC → 7%). Propagado como prop SSR a todos los componentes del TPV. `tpv_cobros.iva_porcentaje` graba la tasa en el momento del cobro para preservar el histórico (20260703).
- [x] **Importe IVA/IGIC y base imponible** calculados en trigger PostgreSQL — `iva_cents` y `base_imponible_cents` en `tpv_cobros`. No delegados al cliente (20260703).
- [x] **Importe total** con y sin IVA mostrado en ticket impreso/digital (20260714).
- [x] Si es **ticket rectificativo**: referencia explícita al número de ticket original — `rectifica_cobro_id UUID REFERENCES tpv_cobros(id)` en DB; mostrado en pantalla de confirmación y en el historial del turno como "Rectificativo · anula SERIE-NNNNNN" (20260703).
- [x] **Cross-turno**: el rectificativo puede emitirse en un turno distinto al del cobro original (legal). El historial resuelve esto server-side mostrando "Rectificado" en el original y la referencia cruzada en el negativo (20260703).
- [x] **Tipos de IVA diferenciados por producto** — `productos.porcentaje_impuesto_override NUMERIC(5,2)` permite sobreescribir la tasa global de empresa por producto. `detalle_items[i].impuestoPorcentaje` lleva la tasa efectiva al trigger de cobro (20260720).
- [x] **Desglose de IVA/IGIC multi-tipo en cobro** — `tpv_cobros.desglose_iva JSONB` almacena `[{porcentaje, baseCents, ivaCents}]` calculado por el trigger `tpv_cobro_before_insert` agrupando items por tasa (20260720).
- [x] **Desglose multi-tipo en ticket impreso** — `browser-printer.ts` renderiza una línea por bracket de IVA/IGIC si `desgloseIva` existe; fallback a línea única para cobros históricos (20260720).

---

## 4. RGPD / GDPR

- [ ] **Informar a empleados** (template de cláusula de contrato laboral) sobre el registro de turnos y quién abre/cierra caja (`user_id` en `tpv_turnos`).
- [x] **Política de retención de datos**: `clientes.ultima_actividad` (DEFAULT NOW(), actualizada por trigger `trg_pedidos_ultima_actividad` en cada INSERT a `pedidos`). Purga automática a los 5 años de inactividad, alineado con Art.66 LGT (20260720/20260722).
- [x] **Derecho de supresión (Art. 17 RGPD)** — `POST /api/admin/rgpd/anonimizar-cliente` sustituye PII (`nombre`, `email`, `telefono`) con valores anonimizados; `id` y relaciones con `pedidos` se preservan. Operación idempotente — segunda llamada devuelve 200 sin modificar datos. Requiere rol `admin` o `superadmin` (20260720).
- [x] **`anonimizado_en TIMESTAMPTZ`** en `clientes` — marca el momento de anonimización para auditoría (20260720).
- [x] **Purga automática via Vercel Cron** — `GET /api/cron/rgpd-purge` protegido por `CRON_SECRET`. Ejecución mensual (día 1, 03:00 UTC). Anonimiza `clientes` con `ultima_actividad < now() - 5 años AND anonimizado_en IS NULL`. pg_cron no disponible (plan Free Supabase) — Vercel Cron es el mecanismo activo (20260722).
- [ ] **Cifrado en reposo**: verificar que Supabase tiene habilitado el cifrado a nivel de disco (AES-256). Documentar en la Declaración de Responsabilidad.
- [ ] **Contrato de Encargado del Tratamiento (DPA)** con cada restaurante cliente, dado que procesas datos personales de sus empleados y/o clientes.
- [ ] Si se implementa fidelización/reservas: añadir consentimiento explícito del cliente final, derecho de supresión y portabilidad.
- [ ] Los logs de auditoría internos (`tpv_cobros.hash`, cadena de hashes) no deben ser manipulables ni por el propio restaurante.

---

## 5. PCI-DSS (Medios de Pago)

- [ ] **MVP (Fase 1) — EXENTO**: El cobro con tarjeta se registra solo el importe en el TPV; el datáfono es un dispositivo físico independiente. Los datos de tarjeta nunca tocan la aplicación. ✅ Arquitectura correcta.
- [ ] **Fase 2 — si se integra API de datáfono**: usar integración de tipo pass-through o tokenizada (ej: Adyen, Stripe Terminal) para que los datos de tarjeta no pasen por los servidores. Documentar que esto mantiene el SAQ-P2PE (nivel de certificación reducido).
- [ ] Nunca almacenar PAN, CVV ni datos de banda magnética en Supabase.

---

## 6. Numeración Correlativa y Serie

- [x] Secuencia Postgres `tpv_numero_serie` por `empresa_id`: incremento atómico sin saltos (20260703).
- [x] El número es único y sobrevive reinicios del servidor — generado con `SELECT nextval()` en trigger, no en lógica de aplicación (20260703).
- [~] Formato actual: `{SERIE}-{NNNNNN}` (ej: `T-000042`). Formato con fecha (`{SERIE}-{AAAAMMDD}-{NUMERO}`) pendiente como opción configurable.

---

## 7. Auditoría Privada (Recomendado, no obligatorio)

- [ ] Antes de la primera venta comercial, contratar auditoría externa (1.000–3.000 €).
- [ ] Solicitar **Informe de Dictamen Técnico de Cumplimiento** que verifique: hashes, bloqueo de borrado, exportación de datos, contenido del ticket.
- [ ] Usar el informe como argumento de venta y escudo legal ante inspecciones.

---

## 8. Pantalla de conformidad en el software

- [x] Crear `/tpv/legal` con nombre del software y versión, NIF del fabricante, texto completo de la Declaración de Responsabilidad, fecha de firma y enlace al RD 1007/2023 (20260703).

---

---

## 9. SIALTI — Trazabilidad e Inalterabilidad de Turnos (RD 1007/2023)

### 9.1 Inalterabilidad de `tpv_turnos`

- [x] **No-DELETE en `tpv_turnos`** — Trigger `tpv_turno_no_delete` raises EXCEPTION (20260714).
- [x] **Inmutabilidad de campos de apertura durante turno abierto** — Trigger `tpv_turno_no_update_fields`: protege `efectivo_apertura_cents`, `hash_encadenado`, `apertura_at`, `empresa_id`, `user_id`, `operador_id`, `operador_nombre` aunque el turno siga abierto. Bloquea TODO si ya está cerrado (20260714).
- [x] **Hash chaining en `tpv_turnos`** — Columna `hash_encadenado TEXT`. Trigger BEFORE INSERT `tpv_turno_hash_insert`: SHA-256 de `empresa_id|id|efectivo_apertura|apertura_at|prev_hash`. El primer turno arranca con `INICIO` (20260714).
- [x] **`efectivo_cierre_teorico_cents`** persistido explícitamente. No solo la diferencia — el teórico también es inalterable en el registro (20260714).
- [x] **`empleado_cierre_id`** en `tpv_turnos` — queda grabado el UUID de quien cerró para que el trigger AFTER UPDATE lo use en el evento de auditoría (20260714).

### 9.2 Audit Trail atómico (`tpv_turno_eventos`)

- [x] **Tabla `tpv_turno_eventos`** — Append-only: triggers BEFORE DELETE y BEFORE UPDATE lanzan EXCEPTION (20260714).
- [x] **Atomicidad garantizada por la DB** — Trigger AFTER INSERT OR UPDATE en `tpv_turnos` inserta los eventos en la misma transacción. Si el evento falla, el cambio de estado del turno se revierte. Sin posibilidad de silent failure legal (20260714).
- [x] **Evento 'apertura'** — auto-insertado por AFTER INSERT trigger en `tpv_turnos` (20260714).
- [x] **Evento 'cierre'** — auto-insertado por AFTER UPDATE trigger cuando `cierre_at` pasa de NULL a NOT NULL (20260714).
- [x] **Evento 'descuadre'** — auto-insertado en la misma transacción que 'cierre' si `diferencia_cents <> 0` (20260714).
- [x] **Tipos de evento** validados via CHECK constraint: `apertura`, `cierre`, `entrada_caja`, `salida_caja`, `apertura_cajon_sin_venta`, `arqueo_parcial`, `descuadre` (20260714).

### 9.3 Movimientos de Caja Intermedios

- [x] **Endpoint `POST /api/tpv/turno/[id]/movimiento-caja`** — `entrada_caja` / `salida_caja`. Solo encargado/admin. Descripción obligatoria min 3 chars (20260714).
- [x] **Endpoint `GET /api/tpv/turno/[id]/movimiento-caja`** — historial de todos los eventos del turno (20260714).
- [x] **Teórico de cierre correcto** — incluye `fondo_apertura + ventas_efectivo + Σentradas - Σsalidas`. Antes ignoraba el fondo de apertura y los movimientos intermedios (20260714).
- [x] **`registrarMovimientoCajaUseCase`** — valida `montoCents > 0` y `descripcion` no vacía antes de persistir (20260714).

---

## 10. Backup Fiscal Local (Electron)

- [x] **Snapshot fiscal en disco al cerrar turno** — Handler `fiscal:save-snapshot` en `electron/main.ts`. Guarda `InformeZData` completo en `{userData}/fiscal/{empresa-slug}/{fecha}-Z{numeroZ}.json` (20260714).
- [x] **Escritura asíncrona** — `fs.promises.writeFile` para no bloquear el main thread de Electron (sin tirón visual en TPV táctil) (20260714).
- [x] **HMAC-SHA256 de integridad** — Firma calculada sobre el JSON completo con clave de dispositivo (32 bytes aleatorios) generada en primer arranque y persistida en `electron-store`. Cualquier edición externa del archivo rompe la firma. `sialti_metadata.integrity_hash` almacenado en el propio JSON (20260714).
- [x] **Clave de firma por dispositivo** — No hardcodeada. Generada con `crypto.randomBytes(32)` y almacenada en `electron-store` bajo `signingKey`. Si se pierde el store, los archivos previos pierden verificabilidad local pero la fuente de verdad (Supabase + `hashEncadenado` de la cadena de turnos) sigue siendo auditab (20260714).
- [x] **Trazabilidad de errores** — Fallo en guardado local reportado vía `logClientError` → Sentry. No bloquea el flujo visual del cajero (20260714).

---

## Historial de versiones de este documento

| Versión | Fecha      | Cambios                        |
|---------|------------|--------------------------------|
| 1.0     | 2026-07-02 | Creación inicial del documento |
| 1.1     | 2026-07-03 | Marcados como completados: bloqueo DELETE/UPDATE, ticket rectificativo, cadena de hashes, endpoints de auditoría, pantalla `/tpv/legal`, Declaración de Responsabilidad |
| 1.2     | 2026-07-03 | Fase 2: tipo impuesto IVA/IGIC configurable por empresa, porcentaje grabado por cobro, numeración correlativa atómica, NIF en ticket, sección 3 actualizada |
| 1.3     | 2026-07-03 | Fase 3: URL AEAT con fecha DD-MM-AAAA corregida; rectificativo cross-turno documentado y visualizado en historial; fix bug guardado tipo_impuesto en panel admin (camelCase→snake_case) |
| 1.4     | 2026-07-14 | Sección 9: SIALTI turnos — hash chaining, no-delete, inmutabilidad campos apertura, audit trail atómico vía DB triggers (sin silent failure), movimientos de caja, teórico de cierre corregido |
| 1.5     | 2026-07-14 | Fase 4: desglose de ítems en ticket (detalle_items JSONB), Informe Z con numero_z secuencial por trigger, InformeZModal con auto-print |
| 1.6     | 2026-07-14 | Sección 10: backup fiscal local en Electron — snapshot JSON + HMAC-SHA256 con clave por dispositivo, escritura async, trazabilidad Sentry |
| 1.7     | 2026-07-14 | Sección 1.4: QR visual AEAT en ticket impreso (`browser-printer.ts`); fix bug fecha DD-MM-YYYY en URL AEAT |
| 1.8     | 2026-07-20 | Sección 3: IVA multi-tipo por producto (`porcentaje_impuesto_override`), `desglose_iva` JSONB en cobros, ticket impreso con desglose por bracket. Sección 3 (NIF/razón social): `razon_social` en `empresas`, campo en panel admin. Sección 4: derecho de supresión RGPD (`POST /api/admin/rgpd/anonimizar-cliente`), `ultima_actividad`, pg_cron auto-purge 2 años. 5 migrations nuevas (20260720000001–20260720000005). |
| 1.9     | 2026-07-22 | Sección 4: purga automática migrada de pg_cron (no disponible en plan Free) a Vercel Cron mensual (`GET /api/cron/rgpd-purge`, `CRON_SECRET`). Intervalo corregido a 5 años (Art.66 LGT). Ver `docs/context/rgpd-clientes.md`. |
