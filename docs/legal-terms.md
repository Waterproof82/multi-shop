# Glosario de Términos Legales, Normativos y de Calidad

> Documento unificado de referencia. Se actualiza cada vez que aparece un nuevo término legal,
> ISO, de calidad de software o normativa aplicable al proyecto.
> No sustituye a `docs/tpv-legal-compliance.md` (que es el tracker de implementación).

---

## Leyes y Reglamentos Nacionales (España)

### Ley 11/2021 — Ley Antifraude
**Nombre completo:** Ley 11/2021, de 9 de julio, de medidas de prevención y lucha contra el fraude fiscal.
**Impacto:** Prohíbe el software de doble uso ("software de ocultación"), es decir, sistemas que permitan llevar una contabilidad paralela, borrar o modificar registros de venta para que cuadren con el efectivo en caja. Cualquier TPV comercializado en España desde 2022 debe cumplirla.
**Sanciones:** Hasta 50.000 € para el establecimiento; hasta 150.000 € para el desarrollador/fabricante del software.

### RD 1007/2023 — Reglamento Veri*factu
**Nombre completo:** Real Decreto 1007/2023, de 5 de diciembre, por el que se aprueba el Reglamento que establece los requisitos que deben adoptar los sistemas y programas informáticos o electrónicos que soporten los procesos de facturación de empresarios y profesionales.
**Impacto:** Define técnicamente cómo deben construirse los sistemas de facturación: encadenamiento criptográfico de registros, inalterabilidad, exportación de datos para inspectores, declaración de responsabilidad del fabricante.
**Alias comunes:** "Verifactu", "Veri*factu", "RD 1007".

### RD 1619/2012 — Reglamento de Facturación
**Nombre completo:** Real Decreto 1619/2012, de 30 de noviembre, por el que se aprueba el Reglamento por el que se regulan las obligaciones de facturación.
**Impacto:** Define el contenido obligatorio de facturas y tickets simplificados: NIF emisor, número correlativo, fecha y hora, desglose de IVA, importe total. Es la base sobre la que el RD 1007/2023 añade los requisitos tecnológicos.

### TicketBAI
**Nombre completo:** Sistema de facturación del País Vasco (Álava, Guipúzcoa, Vizcaya).
**Impacto:** Cada ticket debe firmarse digitalmente con un certificado del cliente y enviarse en tiempo real a la hacienda foral. Requiere que el desarrollador esté dado de alta como "Empresa Desarrolladora" en cada diputación.
**Alias comunes:** "TBAI", "ZUENTZAT" (nombre en euskera).

### RGPD / GDPR
**Nombre completo:** Reglamento (UE) 2016/679 del Parlamento Europeo y del Consejo, de 27 de abril de 2016, relativo a la protección de las personas físicas en lo que respecta al tratamiento de datos personales.
**Impacto en este proyecto:** Contrato DPA con cada restaurante cliente; política de retención (mínimo 5 años por obligación fiscal); derechos ARCO para clientes de fidelización; no loguear PII (emails, teléfonos) en logs técnicos.

---

## Acrónimos y Conceptos Normativos

### SIALTI
**Significado:** Seguridad, Integridad, Accesibilidad, Legibilidad, Trazabilidad e Inalterabilidad.
**Origen:** Requisitos del RD 1007/2023 para sistemas de facturación.
**Aplicación práctica:**
- **Seguridad:** RLS, triggers de bloqueo, autenticación robusta.
- **Integridad:** Hash chaining SHA-256 encadenado entre registros.
- **Accesibilidad:** Endpoint de exportación para inspectores (`/api/tpv/audit/export`).
- **Legibilidad:** JSON legible sin herramientas especiales.
- **Trazabilidad:** `numero_ticket` correlativo sin saltos; audit trail de eventos de turno.
- **Inalterabilidad:** Trigger `BEFORE DELETE` y `BEFORE UPDATE` en tablas fiscales.

### Informe Z (Cierre Z)
**Qué es:** Ticket de cierre fiscal diario del TPV. Resume ventas totales, desglose por IVA, métodos de pago, descuadre de caja y hash del turno. Debe imprimirse o guardarse al cerrar cada turno.
**Contenido mínimo obligatorio:** NIF del local, fecha/hora de apertura y cierre, número secuencial de Informe Z, desglose por formas de pago, base imponible + cuota IVA/IGIC, descuadre, huella digital/hash.

### Arqueo Ciego (Blind Cash Count)
**Qué es:** El empleado cuenta el efectivo físico sin ver el total teórico que el sistema espera. Esto evita el "ajuste creativo" (contar lo que conviene hasta que cuadre).
**Implicación técnica:** La pantalla de cierre debe mostrar el campo de entrada del efectivo contado ANTES de que el sistema calcule y muestre el teórico. Nunca mostrar el teórico en el mismo paso.

### Factura Rectificativa
**Qué es:** Documento que corrige o anula una factura ya emitida. No se borra el original; se emite un documento nuevo de signo negativo con referencia explícita al original.
**Implicación técnica:** En `tpv_cobros`, campo `rectifica_cobro_id` apunta al cobro original. Prohibido hacer `DELETE` o `UPDATE` del original.

### Hash Encadenado (Hash Chaining)
**Qué es:** Técnica criptográfica donde el hash de cada registro incluye el hash del registro anterior. Cualquier inserción, borrado o modificación retroactiva rompe la cadena y es detectable.
**Implementación en este proyecto:** SHA-256 vía `pgcrypto` en triggers `BEFORE INSERT` de `tpv_cobros`. Pendiente: encadenamiento equivalente en `tpv_turnos`.

### Audit Trail (Registro de Auditoría Inalterable)
**Qué es:** Log de eventos donde cada fila representa un hecho irrevocable. Ninguna fila puede modificarse ni borrarse.
**Implementación técnica:** Tabla `tpv_turno_eventos` (pendiente de crear). Triggers `BEFORE DELETE` y `BEFORE UPDATE` que lanzan EXCEPTION. Sin política RLS de UPDATE/DELETE para ningún rol.

### Número Correlativo (Serie)
**Qué es:** Secuencia de numeración de tickets sin saltos, sin duplicados y sin posibilidad de reutilización. Obligatoria por RD 1619/2012.
**Implementación en este proyecto:** `SELECT MAX(numero_ticket) + 1 FOR UPDATE` en trigger `BEFORE INSERT` de `tpv_cobros`.

---

## Estándares de Seguridad

### PCI-DSS
**Nombre completo:** Payment Card Industry Data Security Standard.
**Impacto:** Aplica si los datos de tarjeta pasan por los servidores. La arquitectura actual (datáfono físico independiente) está en nivel SAQ-A (exento). Si se integra API de datáfono, se requiere tokenización (SAQ-P2PE).

---

## Estándares de Calidad de Software

### OWASP Top 10
**Nombre completo:** Open Web Application Security Project — Top 10 Web Application Security Risks.
**Relevancia:** Checklist de seguridad aplicado en la auditoría de julio 2026. Cubre: inyección SQL, XSS, CSRF, exposición de datos sensibles, control de acceso roto, configuración insegura, etc.
**Referencia interna:** `docs/context/security.md`, rama `security/owasp-audit-july-2026`.

### SOLID
**Qué es:** Conjunto de cinco principios de diseño orientado a objetos (Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion).
**Relevancia:** Aplicado como parte de la auditoría de julio 2026. Refactorizaciones: extracción de templates de email, lazy service locator, etc.

### Clean Architecture (Arquitectura Limpia)
**Autor:** Robert C. Martin ("Uncle Bob").
**Qué es:** Separación en capas concéntricas: Dominio → Aplicación → Infraestructura. Las capas internas no conocen las externas.
**Implementación en este proyecto:** `core/domain/` → `core/application/` → `core/infrastructure/` → `app/api/`.

### SonarLint / SonarQube
**Qué es:** Herramienta de análisis estático de código que detecta bugs, code smells y vulnerabilidades de seguridad. Las reglas S-XXXX referenciadas en `CLAUDE.md` son de SonarLint.
**Reglas clave del proyecto:** S3776 (complejidad cognitiva ≤ 15), S2004 (máximo 4 niveles de anidamiento), S3358 (prohibido ternario anidado), S6759 (Readonly<Props>), S7735 (condiciones en positivo).

---

## Historial de este documento

| Versión | Fecha      | Cambios |
|---------|------------|---------|
| 1.0     | 2026-07-14 | Creación inicial con términos del prompt de sistema de turnos Veri*factu + términos previos del proyecto |
