# audit-tpv Skill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear la skill `audit-tpv` — un archivo SKILL.md que Claude sigue cuando la invoca, implementando una auditoría interactiva de cumplimiento legal y técnico en 8 fases con 4 modos de operación.

**Architecture:** La skill es un documento markdown de instrucciones imperativas para Claude. Vive en `~/.claude/skills/audit-tpv/SKILL.md` (global, disponible en cualquier proyecto). Se registra en `.atl/skill-registry.md` del proyecto para que aparezca en autocomplete. El Compliance Inventory está embebido en la skill (project-specific).

**Tech Stack:** Markdown, frontmatter YAML. Sin dependencias de código. Tests: verificación estructural del archivo + lectura para confirmar que es invocable.

---

## Task 1: Crear el archivo de skill `audit-tpv/SKILL.md`

**Files:**
- Create: `C:/Users/PC/.claude/skills/audit-tpv/SKILL.md`

- [ ] **Step 1: Crear el directorio y el archivo SKILL.md con contenido completo**

Crear `C:/Users/PC/.claude/skills/audit-tpv/SKILL.md` con el siguiente contenido exacto:

```markdown
---
name: audit-tpv
description: >
  Auditoría interactiva de cumplimiento legal y técnico del TPV multi-shop.
  Cubre Ley 11/2021, RD 1007/2023 (VeriFactu), SIALTI, RD-Ley 8/2019 (LaborControl),
  RGPD y OWASP. Verifica triggers de inalterabilidad, hash chaining, RLS, ACID,
  cronología, Electron, secrets y dependencias. 4 modos: audit, pre-certification,
  regression, ci. Genera informe Markdown + JSON + SARIF + compliance score.
  Trigger: cuando el usuario pide auditoría TPV, cumplimiento legal, pre-certificación,
  verificación de integridad fiscal, o regression check.
license: MIT
metadata:
  author: multi-shop
  version: "1.0"
  spec: docs/superpowers/specs/2026-07-27-audit-tpv-design.md
---

## Contexto del proyecto

Esta skill está diseñada específicamente para el proyecto multi-shop. Conoce los nombres
reales de todos los triggers, funciones y endpoints de compliance. Cada vez que se añada
un nuevo elemento de compliance al proyecto, actualizar el Compliance Inventory de esta skill.

---

## Paso 0 — Preguntar modo

Antes de comenzar, preguntar al usuario:

```
¿Qué modo querés usar?
  audit            — [ESTÁTICA] análisis + informe sin ejecutar tests
  pre-certification — [ESTÁTICA + DINÁMICA] batería completa, umbrales mínimos, dictamen formal
  regression       — [DINÁMICA] diff de commits + ejecutar tests existentes
  ci               — [DINÁMICA] no interactivo, falla rápido
```

Documentar el modo elegido. En modo `ci`, ejecutar todas las fases sin pausas ni confirmaciones.

**Fases activas por modo:**

| Fase | audit | pre-cert | regression | ci |
|------|:-----:|:--------:|:----------:|:--:|
| 1. Discovery + Inventory | ✔ | ✔ | ✔ | ✔ |
| 2. Threat Model | ✔ | ✔ | — | — |
| 3. DB Validation | ✔ | ✔ | ✔ | ✔ |
| 4. Security Audit | ✔ | ✔ | — | — |
| 5. Gap Analysis | ✔ | ✔ | ✔ | — |
| 6. Test Generation | — | ✔ | — | — |
| 7. Test Execution | — | ✔ | ✔ | ✔ |
| 8. Evidence + Report | ✔ | ✔ | ✔ | ✔ |

**Umbrales mínimos (pre-certification):** cobertura total >= 90%, Ley 11/2021 >= 95%,
SIALTI >= 95%, RGPD >= 75%, VeriFactu >= 60%. Si no se alcanzan → dictamen "NO LISTO".

**Pausa entre fases (excepto ci):** al finalizar cada fase, mostrar resumen de hallazgos,
describir qué hará la siguiente fase, y preguntar `¿Continuamos?`. Esperar respuesta antes
de avanzar.

---

## COMPLIANCE INVENTORY (fuente de verdad)

Leer estos elementos directamente en los archivos de migración y código fuente al inicio
de Fase 1. Si alguno no se encuentra → marcarlo `AUSENTE` y reportarlo como gap crítico.

### Triggers de inalterabilidad

| Trigger | Tabla | Migración | Ley |
|---------|-------|-----------|-----|
| `tpv_cobro_hash_insert` | `tpv_cobros` | 20260703000001_tpv_cobros.sql | RD 1007/2023 |
| `tpv_cobro_no_delete` | `tpv_cobros` | 20260703000001_tpv_cobros.sql | Ley 11/2021 |
| `tpv_cobro_no_update_critical` | `tpv_cobros` | 20260703000001_tpv_cobros.sql | Ley 11/2021 |
| `tpv_turno_hash_insert` | `tpv_turnos` | 20260714000001_tpv_turnos_inalterabilidad.sql | SIALTI |
| `tpv_turno_no_delete` | `tpv_turnos` | 20260714000001_tpv_turnos_inalterabilidad.sql | Ley 11/2021 |
| `tpv_turno_no_update_fields` | `tpv_turnos` | 20260714000001_tpv_turnos_inalterabilidad.sql | SIALTI |
| `tpv_turno_assign_z` | `tpv_turnos` | 20260714000003_tpv_numero_z_detalle_items.sql | SIALTI |
| `tpv_turno_evento_no_delete` | `tpv_turno_eventos` | 20260714000002_tpv_turno_eventos.sql | Ley 11/2021 |
| `tpv_turno_evento_no_update` | `tpv_turno_eventos` | 20260714000002_tpv_turno_eventos.sql | Ley 11/2021 |
| `tpv_turno_audit_trigger` | `tpv_turnos` | 20260714000002_tpv_turno_eventos.sql | SIALTI |
| `trigger_albaranes_immutable` | `albaranes_compra` | 20260715000001_modulo_compras_sialti.sql | Ley 11/2021 |
| `trigger_albaranes_no_delete` | `albaranes_compra` | 20260715000001_modulo_compras_sialti.sql | Ley 11/2021 |
| `pedidos_no_delete` | `pedidos` | 20260722000002_pedidos_block_delete.sql | Art.66 LGT |
| `lc_fichajes_chain_before` | `lc_fichajes` | 20260724000002_lc_fichajes_chain.sql | RD-Ley 8/2019 |
| `lc_fichajes_chain_verify` | `lc_fichajes` | 20260724000002_lc_fichajes_chain.sql | RD-Ley 8/2019 |
| `lc_fichajes_immutable` | `lc_fichajes` | 20260724000002_lc_fichajes_chain.sql | RD-Ley 8/2019 |
| `lc_chain_anchors_immutable` | `lc_chain_anchors` | 20260724000003_lc_aux_tables.sql | RD-Ley 8/2019 |
| `lc_audit_log_immutable` | `lc_audit_log` | 20260724000003_lc_aux_tables.sql | RD-Ley 8/2019 |

### Funciones SQL críticas

| Función | Propósito | Archivo |
|---------|-----------|---------|
| `tpv_cobro_before_insert()` | Hash chaining cobros — SHA-256 payload canónico | 20260703000001_tpv_cobros.sql |
| `tpv_turno_before_insert()` | Hash chaining turnos — SHA-256 con INICIO génesis | 20260714000001_tpv_turnos_inalterabilidad.sql |
| `lc_canonical_payload()` | Serialización determinista para hash fichajes | 20260724000002_lc_fichajes_chain.sql |
| `get_mi_empresa_id()` | Tenant isolation en políticas RLS | 20260527000002_create_get_mi_empresa_id.sql |

### Endpoints de auditoría

| Endpoint | Propósito | Ruta del archivo |
|----------|-----------|-----------------|
| `GET /api/tpv/audit/chain` | Verificación cadena de cobros | src/app/api/tpv/audit/chain/route.ts |
| `GET /api/tpv/audit/export` | Exportación para inspectores | src/app/api/tpv/audit/export/route.ts |
| `GET /api/laborcontrol/verify-chain` | Verificación cadena fichajes | src/app/api/laborcontrol/verify-chain/route.ts |
| `POST /api/tpv/cobro/rectificar` | Ticket rectificativo | src/app/api/tpv/cobro/rectificar/route.ts |

### Helpers de seguridad

| Helper | Propósito | Ubicación esperada |
|--------|-----------|-------------------|
| `handleAdminAuth()` | Auth + CSRF para rutas admin | src/core/infrastructure/api/ |
| `handleWaiterAuth()` | Auth + CSRF para rutas waiter | src/core/infrastructure/api/ |
| `requireRole()` | RBAC — exige rol mínimo | src/core/infrastructure/api/ |
| `resolveActor()` | Extrae identidad del actor para audit log | src/core/infrastructure/api/audit-actor.ts |
| `fetchWithCsrf()` | Cliente HTTP con CSRF automático | src/lib/csrf-client.ts |
| `getSupabaseClient()` | Cliente Supabase singleton | src/core/infrastructure/database/ |
| `buildAeatUrl()` | URL QR AEAT con formato DD-MM-YYYY | src/lib/browser-printer.ts |

### Electron

| Elemento | Propósito | Archivo |
|----------|-----------|---------|
| `fiscal:save-snapshot` IPC handler | Guardar snapshot local al cerrar turno | electron/main.ts |
| HMAC-SHA256 sobre snapshot JSON | Integridad local del backup fiscal | electron/main.ts |
| `contextIsolation: true` | Seguridad del renderer | electron/main.ts |
| `nodeIntegration: false` | Seguridad del renderer | electron/main.ts |
| `contextBridge` expuesto | API segura renderer ↔ main | electron/preload.ts |

---

## FASE 1 — Discovery + Project Profile + Compliance Inventory [todas los modos]

**Objetivo:** mapear el estado actual del proyecto y verificar el Compliance Inventory.

**Hacer:**

1. Leer: `package.json`, `tsconfig.json`, `.env.example`, `next.config.mjs`, `middleware.ts`,
   `supabase/config.toml`, `playwright.config.ts`, `.github/workflows/` (si existe)

2. Leer: `src/core/domain/`, `src/core/application/`, `src/core/infrastructure/`, `src/lib/`,
   `electron/main.ts`, `electron/preload.ts`

3. Leer: `docs/tpv-legal-compliance.md`, `docs/context/legal-compliance.md`,
   `docs/context/audit-log.md`, `docs/context/security.md`

4. Para cada elemento del Compliance Inventory: buscar en las migraciones SQL correspondientes
   que el trigger/función existe con ese nombre exacto. Marcar ✔ o `AUSENTE`.

5. En modo `regression`:
   a. Buscar en `reports/` el último informe generado → extraer el commit auditado
   b. Ejecutar `git diff {ultimo_commit}..HEAD --name-only` para listar archivos cambiados
   c. Identificar qué requisitos del inventory pueden verse afectados por esos cambios
   d. Documentar: "N archivos cambiados, M requisitos potencialmente afectados"

**Produce:**

```
## Project Profile
- Versión software: {package.json version}
- Commit: {git rev-parse HEAD}
- Branch: {git branch --show-current}
- Git hash corto: {git rev-parse --short HEAD}
- Fecha auditoría: {ISO 8601}
- Skill audit-tpv: v1.0
- Modo: {modo elegido}
- Framework web: Next.js {versión}
- Base de datos: Supabase (PostgreSQL)
- Electron: sí
- Hash: SHA-256 (pgcrypto)
- HMAC: sí (snapshots Electron)
- VeriFactu: parcial (hash chain + QR, sin XML signing)
- SIALTI: implementado
- LaborControl: implementado
- Framework de tests: Playwright
- Package manager: pnpm

## Compliance Inventory — Estado
[tabla del inventory con ✔ / AUSENTE por elemento]
```

---

## FASE 2 — Threat Model [audit, pre-certification]

**Objetivo:** razonar sobre amenazas antes del gap analysis.

**Hacer:** para cada amenaza de la lista, evaluar con datos reales encontrados en Fase 1.

**Amenazas a evaluar:**

- Manipulación de registros fiscales (UPDATE/DELETE directo en DB)
- Bypass de RLS / tenant isolation (empresa A lee datos de empresa B)
- Corrupción de cadena de hashes (cobros, turnos, fichajes)
- Race conditions: doble apertura caja, doble cierre, doble cobro, numeración simultánea
- CSRF en rutas mutativas (POST/PATCH/DELETE sin token)
- IDOR (acceso a recurso de otra empresa por ID en URL)
- SQL Injection (interpolación de strings en queries)
- Electron IPC injection (renderer envía datos sin validación al main)
- Manipulación de snapshots HMAC (edición externa del archivo fiscal)
- Pérdida de eventos de auditoría (acción sensible sin entrada en audit_log)
- Rollback parcial (cobro insertado sin evento de auditoría por fallo AFTER trigger)
- Secrets expuestos (JWT, keys hardcodeados en código fuente)
- Broken Access Control (ruta admin accesible sin requireRole)
- Path Traversal (nombre de archivo en uploads con `../`)
- Manipulación de reloj / timezone (timestamps en cliente vs servidor)

**Produce tabla:**
```
| # | Amenaza | Vector | Prob (1-5) | Impacto (1-5) | Riesgo (P×I) | Mitigación actual | Estado |
```

---

## FASE 3 — DB Validation [audit, pre-certification, regression, ci]

**Objetivo:** verificar la integridad del modelo de datos, triggers, permisos y ACID.

**Hacer:**

**Triggers (usar el Compliance Inventory):**
- Para cada trigger marcado ✔: verificar en la migración correspondiente que:
  - Lanza `RAISE EXCEPTION` (no solo `RETURN OLD`)
  - El mensaje identifica la ley aplicable (ej: "Ley 11/2021", "SIALTI")
- Para cada trigger marcado `AUSENTE`: documentar como gap crítico

**Funciones PostgreSQL:**
- `tpv_cobro_before_insert()`: verificar que `search_path` incluye `extensions` (para pgcrypto)
- `tpv_turno_before_insert()`: misma verificación de search_path
- `lc_canonical_payload()`: misma verificación
- Buscar todas las funciones `SECURITY DEFINER` en las migraciones → verificar que tienen
  `REVOKE EXECUTE FROM PUBLIC` (buscar en `20260725000003_revoke_and_search_path.sql`,
  `20260725000004_revoke_public_security_definer.sql`)
- Verificar que RPCs críticas requieren autenticación

**Permisos:**
- Verificar en `20260710000001_security_hardening.sql` y `20260710000002_security_hardening_revoke_explicit.sql`
  que `PUBLIC` no tiene acceso a funciones críticas
- Verificar GRANTs en `20260527000000_explicit_grants_data_api.sql`

**Modelo de datos:**
- Buscar columnas `FLOAT` o `REAL` en tablas fiscales (`tpv_cobros`, `tpv_turnos`,
  `pedidos`, `lc_fichajes`) → deben ser `INTEGER` o `NUMERIC`
- Buscar `TIMESTAMP` (sin TZ) en esas mismas tablas → deben ser `TIMESTAMPTZ`
- Buscar `ON DELETE CASCADE` en relaciones con tablas fiscales
- Buscar tablas sin `PRIMARY KEY`

**Verificación cronológica:**
- En `tpv_cobros`: verificar que `tpv_cobro_before_insert()` usa `FOR UPDATE` para evitar
  race conditions en `numero_ticket` (línea con `FOR UPDATE` en la query de MAX)
- Verificar que el payload del hash de cobros incluye `numero_ticket` y `empresa_id`,
  haciendo imposible la reutilización de un número entre empresas
- Verificar que el hash de turnos encadena con `COALESCE(prev_hash, 'INICIO')`

**Timezone:**
- Verificar que `tpv_cobro_before_insert()` usa `to_char(NEW.cobrado_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`
  (conversión explícita a UTC fijo, no dependiente del locale del servidor)
- Verificar que `tpv_turno_before_insert()` hace lo mismo con `apertura_at`
- Documentar: Supabase almacena en UTC; el riesgo de manipulación de reloj desde el cliente
  no afecta al hash (calculado server-side en trigger)

**ACID:**
- Verificar que `tpv_turno_audit_trigger` es `AFTER INSERT OR UPDATE` → si el INSERT del
  evento falla, el cambio de estado del turno hace rollback automáticamente (misma tx)
- Verificar que `lc_fichajes_chain_verify` es `AFTER INSERT` con `RAISE EXCEPTION` →
  un hash incorrecto revierte el INSERT del fichaje

**Migraciones retrospectivas:**
- Buscar en todas las migraciones posteriores al 20260703 cualquier `DROP TRIGGER`,
  `ALTER TABLE ... DISABLE`, `DROP POLICY` en tablas fiscales → flag inmediato si existe

**Produce:** tabla de validación DB con estado por ítem + lista de anomalías encontradas.

---

## FASE 4 — Security Audit [audit, pre-certification]

**Objetivo:** detectar vulnerabilidades OWASP y exposición de secrets.

**Hacer:**

**SQL Injection:** buscar en `src/core/infrastructure/repositories/` cualquier template
literal de TypeScript con SQL dinámico. Todo acceso a DB debe ir por el cliente Supabase
(parametrizado automáticamente) o por RPCs con parámetros tipados. Flag si hay raw SQL.

**XSS:** buscar `dangerouslySetInnerHTML` en `src/`. Verificar que campos de texto libre
de pedidos/productos no se renderizan como HTML sin escape.

**CSRF:** verificar que todas las rutas mutativas en `src/app/api/` tienen:
- Rutas `/api/admin/*`: `handleAdminAuth()` con CSRF check
- Rutas `/api/waiter/*`: `handleWaiterAuth()` con CSRF check
- Rutas `/api/tpv/*`: `handleAdminAuth()` o verificación de `tpv_employee_token` según la ruta
- Verificar cobertura existente: `e2e/waiter-csrf.spec.ts`, `e2e/kitchen-bar-csrf.spec.ts`

**IDOR:** en rutas con `[id]` en la URL, verificar que el handler comprueba que el recurso
pertenece a la empresa del actor (`empresa_id` check, no solo autenticación).

**Broken Access Control:** buscar rutas en `src/app/api/admin/` que NO llamen a `requireRole()`.

**Sensitive Data Exposure:**
- Buscar `console.log` en `src/app/api/` con campos `email`, `telefono`, `pinHash`
- Buscar `pinHash` en respuestas de endpoints de empleados
  (debe hacerse strip con `({ pinHash: _, ...rest }) => rest`)

**Electron IPC:**
- En `electron/main.ts`: verificar que los handlers IPC validan el tipo y formato del
  argumento antes de procesarlo (especialmente `fiscal:save-snapshot`)
- Verificar que `contextBridge` en `electron/preload.ts` solo expone los canales necesarios

**Secrets hardcodeados:** buscar en `src/` y `electron/`:
- Strings que empiecen con `eyJ` (JWT hardcodeado)
- Strings que contengan `service_role`, `anon`, `sk_`, `pk_`
- Strings de longitud > 40 chars que no sean texto UI ni SQL
- Verificar que `getTokenSecret()` es una función lazy (no constante de módulo)

**Evidencia de auditoría:**
- Leer `docs/context/audit-log.md` → lista de acciones instrumentadas
- Comparar con las rutas mutativas críticas → identificar acciones sin instrumentar
- Verificar que `resolveActor()` captura `actor_id` y `actor_tipo` correctamente

**Dependencias:**
- Ejecutar `pnpm audit --json` → documentar vulnerabilidades severity moderate+
- Revisar deps en `package.json` con fecha de último release > 2 años (via npm registry)
- Verificar que no hay deps GPL en producción

**Produce:** tabla OWASP con estado por vulnerabilidad + lista de secrets/deps problemáticos.

---

## FASE 5 — Gap Analysis + Matriz de Trazabilidad [audit, pre-certification, regression]

**Objetivo:** producir la tabla de cumplimiento completa y la matriz de trazabilidad.

**Hacer:** con toda la información de las fases anteriores, generar:

**Tabla de cumplimiento:**
```
| # | Requisito | Norma | Estado | Implementación | Mecanismo | Test | Archivo | Línea |
```

**Métricas de requisitos:**
```
| Norma | Total | Cubiertos | Parciales | No aplica | Gaps | Cobertura |
|-------|-------|-----------|-----------|-----------|------|-----------|
| Ley 11/2021 | | | | | | XX% |
| RD 1007/2023 | | | | | | XX% |
| SIALTI | | | | | | XX% |
| RD-Ley 8/2019 | | | | | | XX% |
| RGPD | | | | | | XX% |
| OWASP | | | | | | XX% |
| TOTAL | | | | | | XX% |
```

**Matriz de trazabilidad (separando Requisito de Implementación):**
```
| # | Requisito legal (QUÉ exige la ley) | Norma | Implementación (CÓMO lo hace este proyecto) | Mecanismo | Test | Resultado |
|----|--------------------------------------|-------|---------------------------------------------|-----------|------|-----------|
| 1 | No permitir borrado de cobros | Ley 11/2021 | Trigger tpv_cobro_no_delete en tpv_cobros | RAISE EXCEPTION en BEFORE DELETE | tpv-cobros-inalterabilidad.spec.ts | ✔/❌ |
| 2 | Encadenamiento criptográfico de cobros | RD 1007/2023 | tpv_cobro_before_insert() — SHA-256 canónico | BEFORE INSERT en tpv_cobros | hash-chaining.test.ts | ✔/❌ |
| 3 | Número correlativo sin saltos | RD 1007/2023 | tpv_cobro_before_insert() — MAX()+1 FOR UPDATE | Atómico en trigger | tpv-cronologia.spec.ts | ✔/❌ |
| 4 | Audit trail atómico de turnos | SIALTI | tpv_turno_audit_trigger — AFTER INSERT/UPDATE | Misma tx que cambio de estado | tpv-turnos-inalterabilidad.spec.ts | ✔/❌ |
| 5 | Inalterabilidad de eventos de turno | Ley 11/2021 | tpv_turno_evento_no_delete + tpv_turno_evento_no_update | RAISE EXCEPTION | tpv-turnos-inalterabilidad.spec.ts | ✔/❌ |
| 6 | No borrar turnos | Ley 11/2021 | tpv_turno_no_delete | RAISE EXCEPTION | tpv-turnos-inalterabilidad.spec.ts | ✔/❌ |
| 7 | Campos de apertura inmutables | SIALTI | tpv_turno_no_update_fields | RAISE EXCEPTION en BEFORE UPDATE | tpv-turnos-inalterabilidad.spec.ts | ✔/❌ |
| 8 | Número Z sin saltos | SIALTI | tpv_turno_assign_z — pg_advisory_xact_lock | BEFORE UPDATE en tpv_turnos | tpv-cronologia.spec.ts | ✔/❌ |
| 9 | Inalterabilidad albaranes recibidos | Ley 11/2021 | trigger_albaranes_immutable | RAISE EXCEPTION si estado='recibido' | albaranes-immutable.spec.ts | ✔/❌ |
| 10 | Retención pedidos 5 años | Art.66 LGT | pedidos_no_delete | RAISE EXCEPTION en BEFORE DELETE | tpv-cobros-inalterabilidad.spec.ts | ✔/❌ |
| 11 | Fichajes inalterables | RD-Ley 8/2019 | lc_fichajes_immutable | RAISE EXCEPTION | laborcontrol-chain.spec.ts | ✔/❌ |
| 12 | Hash chaining fichajes | RD-Ley 8/2019 | lc_fichajes_chain_before + lc_canonical_payload() | BEFORE INSERT + AFTER INSERT verify | laborcontrol-chain.spec.ts | ✔/❌ |
| 13 | Anonimización RGPD | RGPD | POST /api/admin/rgpd/anonimizar-cliente | Use case con override de PII | — | ✔/⚠ |
| 14 | Purga automática 5 años | Art.66 LGT + RGPD | Vercel Cron GET /api/cron/rgpd-purge | CRON_SECRET protegido | — | ✔/⚠ |
| 15 | Desglose IVA multi-tipo | RD 1619/2012 | tpv_cobro_before_insert() → desglose_iva JSONB | Calculado en trigger | iva-breakdown.test.ts | ✔/❌ |
| 16 | QR AEAT en ticket | RD 1007/2023 | buildAeatUrl() en browser-printer.ts | DD-MM-YYYY format | — | ✔/⚠ |
| 17 | XML signing VeriFactu | RD 1007/2023 | NO IMPLEMENTADO | — | — | ❌ |
| 18 | CSRF en rutas mutativas | OWASP | handleAdminAuth() / handleWaiterAuth() | Double-submit cookie+header | waiter-csrf.spec.ts | ✔/❌ |
| 19 | Tenant isolation RLS | OWASP | get_mi_empresa_id() en todas las policies | USING (empresa_id = get_mi_empresa_id()) | tpv-rls-multitenant.spec.ts | ✔/❌ |
| 20 | Integridad snapshot Electron | SIALTI | HMAC-SHA256 en electron/main.ts | fiscal:save-snapshot handler | hmac-snapshot.test.ts | ✔/❌ |
```

**Gaps priorizados:**
```
| Gap | Norma | Prob | Impacto | Riesgo | Prioridad |
|-----|-------|------|---------|--------|-----------|
| VeriFactu XML signing + envío AEAT | RD 1007/2023 | 5 | 5 | 25 | P1 |
| DPA con clientes restaurante | RGPD | 4 | 4 | 16 | P2 |
| Verificación AEAT numserie/fecha | RD 1007/2023 | 3 | 4 | 12 | P2 |
| IP actor en audit_log | RGPD/Auditoría | 3 | 3 | 9 | P2 |
| Token auditoría un solo uso (inspectores) | RD 1007/2023 | 2 | 4 | 8 | P2 |
```

**Hoja de ruta VeriFactu:**
```
- [ ] Generación XML según XSD oficial AEAT
- [ ] Validación XML contra XSD antes de envío
- [ ] Firma electrónica (X.509)
- [ ] Endpoint envío AEAT (sandbox + producción)
- [ ] Gestión respuesta AEAT (OK / error / reenvío)
- [ ] Cola offline para envíos diferidos
```

---

## FASE 6 — Test Generation [solo pre-certification]

**Objetivo:** generar los archivos de tests que no existen aún.

**Verificar primero:** si Vitest no está instalado, ejecutar:
```bash
pnpm add -D vitest @vitest/coverage-v8 fast-check
```
Y añadir a `package.json` (solo si no existen):
```json
"test:compliance": "vitest run tests/compliance",
"test:compliance:watch": "vitest tests/compliance",
"test:compliance:coverage": "vitest run tests/compliance --coverage"
```

**Tests Playwright a crear (en `e2e/compliance/`):**
- `tpv-cobros-inalterabilidad.spec.ts` — DELETE y UPDATE a `tpv_cobros` via service_role → verificar exception
- `tpv-turnos-inalterabilidad.spec.ts` — DELETE/UPDATE a `tpv_turnos` y `tpv_turno_eventos` → exception; verificar que `tpv_turno_audit_trigger` inserta eventos
- `tpv-chain-verify.spec.ts` — `GET /api/tpv/audit/chain` → responde 200 con chain válida
- `tpv-rls-multitenant.spec.ts` — empresa A no puede leer datos de empresa B via service_role con JWT de empresa A
- `tpv-concurrency.spec.ts` — 2 requests paralelos de apertura de caja → solo 1 turno abierto al finalizar; 2 cobros simultáneos → `numero_ticket` único
- `tpv-cronologia.spec.ts` — insertar cobros consecutivos y verificar que `numero_ticket` no tiene saltos ni retrocesos; misma verificación para `numero_z`
- `tpv-acid.spec.ts` — simular fallo de auditoría y verificar rollback del cobro (via función SQL de prueba)
- `tpv-audit-evidence.spec.ts` — acción sensible (abrir turno, cobrar) → verificar entrada en `audit_log` con `action`, `empresa_id`, `actor_id`, `created_at`
- `tpv-export-integrity.spec.ts` — `GET /api/tpv/audit/export` → descargar → recomputar hashes → comparar con los almacenados
- `tpv-benchmarks.spec.ts` — insertar 100 cobros vía service_role → medir P50/P95/P99 de latencia; repetir con 1.000
- `laborcontrol-chain.spec.ts` — `GET /api/laborcontrol/verify-chain` → responde 200 con integridad OK
- `albaranes-immutable.spec.ts` — intentar UPDATE en albarán con `estado='recibido'` → exception

**Tests Vitest a crear (en `tests/compliance/`):**
- `hash-chaining.test.ts` — recomputar SHA-256 del payload canónico de cobros con los mismos datos y comparar con el hash almacenado
- `hmac-electron-snapshot.test.ts` — generar un snapshot JSON, calcular HMAC, modificar el JSON, verificar que la validación falla
- `iva-breakdown.test.ts` — dado un importe y porcentaje, verificar que `base_imponible + iva = importe_neto` con tolerancia ±1 cent
- `iva-property.test.ts` — con fast-check: para todo importe entre 1 y 1.000.000 cents y porcentaje en {0, 4, 7, 10, 21}, verificar que la matemática del IVA es consistente
- `hash-property.test.ts` — con fast-check: para cualquier payload de cobro válido, el SHA-256 recalculado siempre es idéntico al original (determinismo)
- `fuzz-api-inputs.test.ts` — enviar payloads corruptos (NaN, null, string enorme, fecha inválida) a las funciones de validación Zod → verificar que siempre devuelven error sin lanzar excepción no controlada
- `electron-security.test.ts` — leer `electron/main.ts` y verificar que `contextIsolation: true`, `nodeIntegration: false`; leer `electron/preload.ts` y verificar que `contextBridge.exposeInMainWorld` solo expone los canales permitidos
- `secrets-scan.test.ts` — buscar en `src/` y `electron/` strings que coincidan con patrones de JWT (`eyJ`), service_role keys, o strings > 40 chars que no sean traducciones/SQL

Todos los tests de Playwright que usen `PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY`: añadir guard al inicio:
```typescript
test.skip(!process.env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY, 'Requiere service_role key');
```

---

## FASE 7 — Test Execution [pre-certification, regression, ci]

**Ejecutar:**
```bash
# Playwright (compliance/)
pnpm e2e e2e/compliance/

# Vitest con coverage (solo pre-certification)
pnpm test:compliance:coverage
```

**Modo regression:** ejecutar solo los tests identificados en Fase 1 como relevantes para los cambios del diff.

**Modo ci:** ejecutar `pnpm e2e e2e/compliance/` sin interactividad; salir con código 1 en el primer fallo.

**Documentar resultados:**
```
✅ pasados: N
❌ fallidos: N (documentar cada uno con causa + gap CVSS)
-  skips: N (documentar variable de entorno faltante)
```

Si un test falla y el fix entra en la categoría de modificación segura (índice, REVOKE, script, test, doc): preguntar al usuario antes de aplicarlo.

---

## FASE 8 — Evidence Collection + Report [todos los modos]

**Evidence Collection — crear `reports/evidence/`:**

Ejecutar y guardar:
```bash
# Schema de tablas fiscales (requiere CLI de Supabase o psql)
# Si no disponible: documentar como "pendiente de extracción manual"

# Lista de triggers activos (extraída de las migraciones)
grep -r "CREATE TRIGGER" supabase/migrations/ > reports/evidence/triggers-snapshot.txt

# Dependencias de producción
pnpm list --prod > reports/evidence/dependencies.txt

# Auditoría de vulnerabilidades
pnpm audit --json > reports/evidence/pnpm-audit.json 2>&1 || true
```

Copiar a `reports/evidence/`:
- `project-profile.json` — el Project Profile generado en Fase 1
- `playwright-report/` — link al HTML report de Playwright (si ejecutado)
- `coverage.json` — resultado de Vitest coverage (si ejecutado)

**Generar informe según modo:**

`reports/compliance-report.md` — siempre, con:
```markdown
# Informe de Auditoría TPV
## Versión auditada
[cabecera con version/commit/branch/fecha/modo]

## Project Profile
[del Fase 1]

## Compliance Inventory — Estado
[tabla con ✔/AUSENTE]

[Si modo != ci:]
## Threat Model
[tabla de amenazas]

## Validación DB
[hallazgos de Fase 3]

[Si modo != ci y modo != regression:]
## Security Audit
[hallazgos de Fase 4]

## Gap Analysis — Tabla de cumplimiento
[tabla completa]

## Métricas de requisitos
[tabla con totales y porcentajes]

## Matriz de trazabilidad
[tabla Requisito / Implementación / Mecanismo / Test / Resultado]

[Si tests ejecutados:]
## Resultados de tests
[✅/❌/- por test]

[Si modo == pre-certification:]
## Compliance Score
| Categoría | Puntuación |
|-----------|-----------|
| Cumplimiento legal (Ley 11/2021 + RD 1007/2023) | XX/100 |
| Integridad (hash chain + ACID + cronología) | XX/100 |
| Seguridad (OWASP + secrets + permisos) | XX/100 |
| Auditoría (audit log + evidencias + trazabilidad) | XX/100 |
| Rendimiento (benchmarks P95) | XX/100 |
| Mantenibilidad (deps + cobertura + CI) | XX/100 |
| **Score global** | **XX,X/100** |

## Checklist final de área
| Área | Estado |
|------|--------|
| DB — Triggers inalterabilidad | ✔/⚠/❌ |
| DB — Hash chaining + cronología | ✔/⚠/❌ |
| DB — RLS + permisos | ✔/⚠/❌ |
| DB — Consistencia ACID | ✔/⚠/❌ |
| Seguridad — OWASP | ✔/⚠/❌ |
| Seguridad — Secrets | ✔/⚠/❌ |
| Seguridad — Dependencias | ✔/⚠/❌ |
| Electron | ✔/⚠/❌ |
| RGPD | ✔/⚠/❌ |
| VeriFactu | ✔/⚠/❌ |
| LaborControl | ✔/⚠/❌ |
| Tests — Cobertura | ✔/⚠/❌ |
| CI/CD | ✔/⚠/❌ |

[Si modo == pre-certification:]
## Dictamen
Estado: LISTO PARA CERTIFICACIÓN / NO LISTO
Bloqueantes: [lista]
Recomendaciones priorizadas:
- [P1] ...
- [P2] ...
```

`reports/compliance-report.json` — siempre:
```json
{
  "version": "{software version}",
  "commit": "{git hash}",
  "date": "{ISO 8601}",
  "mode": "{modo}",
  "skill_version": "1.0",
  "summary": { "total": N, "passed": N, "partial": N, "failed": N, "coverage_pct": N },
  "by_norm": { "ley_11_2021": {"coverage_pct": N}, ... },
  "gaps": [...],
  "score": N  // solo pre-certification
}
```

`reports/findings.sarif` — siempre (para GitHub Code Scanning):
```json
{
  "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
  "version": "2.1.0",
  "runs": [{
    "tool": { "driver": { "name": "audit-tpv", "version": "1.0" } },
    "results": [
      // Un resultado por gap o vulnerabilidad encontrada
      {
        "ruleId": "{norma}-{requisito-id}",
        "level": "error|warning|note",
        "message": { "text": "{descripción del gap}" },
        "locations": [{ "physicalLocation": { "artifactLocation": { "uri": "{archivo}" } } }]
      }
    ]
  }]
}
```

`reports/coverage-summary.json` — siempre:
```json
{
  "date": "{ISO 8601}",
  "mode": "{modo}",
  "by_norm": { "ley_11_2021": {"total": N, "covered": N, "pct": N}, ... },
  "total": {"total": N, "covered": N, "pct": N}
}
```

**CI/CD:** si no existe `.github/workflows/compliance.yml`, ofrecerlo al usuario antes de crearlo:
```yaml
name: Compliance Audit
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  compliance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: latest }
      - run: pnpm install
      - run: pnpm audit --audit-level=moderate
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm e2e e2e/compliance/
        env:
          PLAYWRIGHT_BASE_URL: ${{ secrets.PLAYWRIGHT_BASE_URL }}
          PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: compliance-reports
          path: reports/
```

---

## RESTRICCIONES

1. **Compliance Inventory como fuente de verdad** — si un elemento es `AUSENTE` en Fase 1, documentar como gap crítico sin buscar en fases posteriores. Al añadir un trigger/endpoint/función de compliance al proyecto, actualizar este Inventory.

2. **pnpm siempre** — nunca `npm` ni `yarn`

3. **TicketBAI:** ignorado en todas las fases

4. **Pausa entre fases** (excepto modo `ci`) — mostrar resumen, describir siguiente fase, preguntar `¿Continuamos?`

5. **Tests con service_role:** añadir siempre `test.skip(!process.env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY, '...')`

6. **Benchmarks de 10.000+ ventas:** fuera de scope

7. **Modificaciones permitidas** (con confirmación del usuario):
   - Índice faltante en tabla no-fiscal
   - `REVOKE EXECUTE FROM PUBLIC` faltante en función nueva
   - `NOT NULL` en columna sin datos existentes afectados
   - `.github/workflows/compliance.yml` (ofrecer antes de crear)
   - `package.json` scripts
   - Archivos de tests y documentación

8. **Modificaciones prohibidas** (nunca, sin excepción):
   - Lógica de negocio, use cases, handlers
   - Triggers fiscales (los del Compliance Inventory)
   - Reglas RLS en tablas fiscales
   - Cálculo de hashes o HMAC
   - Migraciones SQL existentes
```

- [ ] **Step 2: Verificar que el archivo fue creado y tiene el frontmatter correcto**

```bash
head -15 "C:/Users/PC/.claude/skills/audit-tpv/SKILL.md"
```

Resultado esperado: líneas del frontmatter YAML con `name: audit-tpv` y `description:`.

- [ ] **Commit (del skill file)**

```bash
git -C "C:/Users/PC/.claude" add skills/audit-tpv/SKILL.md
git -C "C:/Users/PC/.claude" commit -m "feat: add audit-tpv skill for multi-shop TPV compliance"
```

> Nota: este commit es en el repo de configuración global de Claude (`~/.claude`), no en multi-shop.
> Si `~/.claude` no es un repositorio git, saltar este paso y solo confirmar que el archivo existe.

---

## Task 2: Registrar la skill en el skill registry del proyecto

**Files:**
- Modify: `C:/Users/PC/Desktop/multi_shop/.atl/skill-registry.md`

- [ ] **Step 1: Añadir entrada en la tabla User Skills**

Añadir la siguiente línea en `.atl/skill-registry.md`, al final de la tabla `## User Skills`:

```markdown
| `audit-tpv` | Auditoría de cumplimiento legal TPV (Ley 11/2021, VeriFactu, SIALTI, RGPD) — modos: audit, pre-certification, regression, ci |
```

- [ ] **Step 2: Verificar que la línea fue añadida correctamente**

```bash
grep "audit-tpv" C:/Users/PC/Desktop/multi_shop/.atl/skill-registry.md
```

Resultado esperado: la línea con `audit-tpv` y su descripción.

- [ ] **Step 3: Commit del registry y el plan**

```bash
cd C:/Users/PC/Desktop/multi_shop
git add .atl/skill-registry.md docs/superpowers/plans/2026-07-27-audit-tpv-skill.md docs/superpowers/specs/2026-07-27-audit-tpv-design.md
git commit -m "feat: add audit-tpv skill registration and implementation plan"
```

---

## Task 3: Verificación de invocabilidad

**Files:**
- Read: `C:/Users/PC/.claude/skills/audit-tpv/SKILL.md`

- [ ] **Step 1: Verificar que la skill aparece en la lista de skills disponibles**

Invocar la Skill tool con `skill: "audit-tpv"` en una nueva sesión (o verificar que el archivo está en el path correcto). Si el sistema de skills carga desde `~/.claude/skills/`, debería estar disponible inmediatamente.

- [ ] **Step 2: Dry-run mental de la Fase 1**

Leer el SKILL.md generado y verificar que:
- [ ] El frontmatter tiene `name: audit-tpv`
- [ ] El Compliance Inventory tiene los 18 triggers con sus migraciones exactas
- [ ] Los 4 endpoints de auditoría están listados con sus rutas de archivo
- [ ] Las 8 fases tienen instrucciones claras en modo imperativo
- [ ] Los modos `ci` están marcados como no interactivos
- [ ] Las restricciones están al final y son precisas

---

## Self-Review

**Spec coverage:**
- ✔ Sistema de modos (audit/pre-cert/regression/ci)
- ✔ Tabla de fases activas por modo
- ✔ Compliance Inventory con todos los triggers reales
- ✔ Fase 1: Discovery + Project Profile
- ✔ Fase 2: Threat Model con 15 categorías
- ✔ Fase 3: DB Validation (triggers, permisos, modelo, cronología, timezone, ACID, migraciones)
- ✔ Fase 4: Security Audit (OWASP, secrets, evidencia, dependencias)
- ✔ Fase 5: Gap Analysis + métricas + matriz de trazabilidad (Requisito separado de Implementación)
- ✔ Fase 6: Test Generation con listado de archivos por tipo de test
- ✔ Fase 7: Test Execution con comandos exactos
- ✔ Fase 8: Evidence Collection + reports (Markdown + JSON + SARIF + coverage-summary)
- ✔ CI/CD: `.github/workflows/compliance.yml`
- ✔ Política de modificaciones (permitidas vs prohibidas)
- ✔ Umbrales mínimos pre-certification
- ✔ Compliance Score (Fase 8, pre-certification)
- ✔ Checklist final de área

**Placeholder scan:** ningún "TBD", "TODO" o "fill in" en el plan. ✔

**Consistencia de nombres:** todos los triggers/funciones/endpoints en el skill coinciden con los nombres reales verificados en las migraciones. ✔
