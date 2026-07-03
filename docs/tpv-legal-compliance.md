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
- [ ] Documentar en `CLAUDE.md` y en la declaración de responsabilidad que el borrado directo de registros de venta está prohibido.

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

### 1.4 Código QR de verificación AEAT

- [ ] Generar QR en cada ticket impreso/digital con la URL de la AEAT:
  `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif={NIF}&numserie={SERIE}&fecha={FECHA}&importe={IMPORTE}`
- [ ] Implementar generación del QR en la capa de impresión térmica (Electron / Fase 2).
- [ ] Mostrar el QR también en la pantalla de confirmación de cobro (`CobroConfirmado`).

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

- [ ] **Número correlativo de ticket** sin saltos, con serie opcional (ej: `A-00001`).
- [ ] **Fecha y hora** de expedición (ISO 8601, zona horaria Europe/Madrid).
- [ ] **NIF, nombre y razón social** del emisor (el restaurante, desde `empresas`).
- [ ] **Desglose de ítems**: nombre del producto, cantidad, precio unitario.
- [ ] **Tipo impositivo** desglosado por línea o por total (IVA 10% restauración, 21% alcohol, 0% para exentos).
- [ ] **Importe total** con y sin IVA.
- [ ] Si es **ticket rectificativo**: referencia explícita al número de ticket original.
- [ ] Implementar tipos de IVA por categoría de producto (`tipo_iva` en tabla `categorias` o `productos`).

---

## 4. RGPD / GDPR

- [ ] **Informar a empleados** (template de cláusula de contrato laboral) sobre el registro de turnos y quién abre/cierra caja (`user_id` en `tpv_turnos`).
- [ ] **Política de retención de datos**: definir cuántos años se conservan los registros de venta (mínimo legal 5 años por obligaciones fiscales).
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

- [ ] Tabla o secuencia Postgres `tpv_numero_serie` por `empresa_id`: incremento atómico sin saltos.
- [ ] El número debe sobrevivir reinicios del servidor y ser único aunque haya múltiples instancias del TPV abiertas simultáneamente (usar `SELECT nextval()` en Postgres, no lógica en aplicación).
- [ ] Formato configurable por empresa: `{SERIE}-{AAAAMMDD}-{NUMERO}` ej: `A-20260702-00042`.

---

## 7. Auditoría Privada (Recomendado, no obligatorio)

- [ ] Antes de la primera venta comercial, contratar auditoría externa (1.000–3.000 €).
- [ ] Solicitar **Informe de Dictamen Técnico de Cumplimiento** que verifique: hashes, bloqueo de borrado, exportación de datos, contenido del ticket.
- [ ] Usar el informe como argumento de venta y escudo legal ante inspecciones.

---

## 8. Pantalla de conformidad en el software

- [ ] Crear `/tpv/legal` o sección "Acerca de" con:
  - Nombre del software y versión
  - Nombre y NIF del fabricante
  - Texto completo de la Declaración de Responsabilidad
  - Fecha de firma
  - Enlace al RD 1007/2023

---

## Historial de versiones de este documento

| Versión | Fecha      | Cambios                        |
|---------|------------|--------------------------------|
| 1.0     | 2026-07-02 | Creación inicial del documento |
