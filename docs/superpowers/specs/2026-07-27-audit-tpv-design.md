# Skill `audit-tpv` — Diseño Técnico
**Fecha:** 2026-07-27 (v4 — final)
**Proyecto:** multi-shop (TPV hostelería multi-tenant)
**Scope:** Auditoría interactiva de cumplimiento legal y técnico

> Esta skill está diseñada para este proyecto concreto. Conoce los nombres reales de triggers, funciones y endpoints — los verifica directamente, sin inferir equivalentes genéricos. Cada vez que se añada un elemento de compliance al proyecto, actualizar el Compliance Inventory y la matriz de trazabilidad.

---

## Sistema de Modos

Al invocar la skill, Claude pregunta el modo y lo documenta en el informe:

```
¿Qué modo querés usar?
  audit            — [ESTÁTICA] análisis + informe, sin generar ni ejecutar tests
  pre-certification — [ESTÁTICA + DINÁMICA] batería completa, umbrales mínimos, dictamen formal
  regression       — [DINÁMICA] diff de commits + ejecutar tests existentes
  ci               — [DINÁMICA] checks rápidos, no interactivo, falla rápido
```

| Fase | audit | pre-cert | regression | ci |
|------|:-----:|:--------:|:----------:|:--:|
| 1. Discovery + Project Profile | ✔ | ✔ | ✔ | ✔ |
| 2. Threat Model | ✔ | ✔ | — | — |
| 3. DB Validation [ESTÁTICA] | ✔ | ✔ | ✔ | ✔ |
| 4. Security Audit [ESTÁTICA] | ✔ | ✔ | — | — |
| 5. Gap Analysis + Trazabilidad | ✔ | ✔ | ✔ | — |
| 6. Test Generation [DINÁMICA] | — | ✔ | — | — |
| 7. Test Execution [DINÁMICA] | — | ✔ | ✔ | ✔ |
| 8. Evidence + Report | ✔ | ✔ | ✔ | ✔ |

**Umbrales mínimos en `pre-certification`** (si no se alcanzan → dictamen "NO LISTO"):
- Cobertura total >= 90%
- Ley 11/2021 >= 95% | SIALTI >= 95% | RGPD >= 75% | VeriFactu >= 60%

---

## Arquitectura del proyecto auditado

- **Stack:** Next.js 16, TypeScript, React 19, Supabase (PostgreSQL), pgcrypto, Electron, Capacitor
- **Auth:** JWT HttpOnly + double-submit CSRF
- **Tests:** Playwright (`e2e/`), pnpm
- **DDD:** `src/core/domain` / `src/core/application` / `src/core/infrastructure`

---

## Las 8 Fases

Después de cada fase activa, Claude muestra resumen de hallazgos, describe la siguiente fase y pregunta `¿Continuamos?` (excepto en modo `ci`).

---

### Fase 1 — Discovery + Project Profile

**Objetivo:** generar un Project Profile que todas las fases posteriores usan como contexto.

**Produce — Compliance Inventory (base de toda la auditoría):**

El primer output de la Fase 1 es el inventario de elementos críticos del proyecto. Se genera leyendo las migraciones y el código fuente. Si algún elemento esperado no se encuentra, se marca como `AUSENTE` inmediatamente — es un hallazgo de alta gravedad.

```md
## Compliance Inventory

### Triggers de inalterabilidad
| Trigger | Tabla | Estado |
|---------|-------|--------|
| tpv_cobro_hash_insert | tpv_cobros | ✔/AUSENTE |
| tpv_cobro_no_delete | tpv_cobros | ✔/AUSENTE |
| tpv_cobro_no_update_critical | tpv_cobros | ✔/AUSENTE |
| tpv_turno_hash_insert | tpv_turnos | ✔/AUSENTE |
| tpv_turno_no_delete | tpv_turnos | ✔/AUSENTE |
| tpv_turno_no_update_fields | tpv_turnos | ✔/AUSENTE |
| tpv_turno_assign_z | tpv_turnos | ✔/AUSENTE |
| tpv_turno_evento_no_delete | tpv_turno_eventos | ✔/AUSENTE |
| tpv_turno_evento_no_update | tpv_turno_eventos | ✔/AUSENTE |
| tpv_turno_audit_trigger | tpv_turnos | ✔/AUSENTE |
| trigger_albaranes_immutable | albaranes_compra | ✔/AUSENTE |
| trigger_albaranes_no_delete | albaranes_compra | ✔/AUSENTE |
| pedidos_no_delete | pedidos | ✔/AUSENTE |
| lc_fichajes_chain_before | lc_fichajes | ✔/AUSENTE |
| lc_fichajes_chain_verify | lc_fichajes | ✔/AUSENTE |
| lc_fichajes_immutable | lc_fichajes | ✔/AUSENTE |
| lc_chain_anchors_immutable | lc_chain_anchors | ✔/AUSENTE |
| lc_audit_log_immutable | lc_audit_log | ✔/AUSENTE |

### Funciones SQL críticas
| Función | Propósito | Estado |
|---------|-----------|--------|
| tpv_cobro_before_insert() | Hash chaining cobros | ✔/AUSENTE |
| tpv_turno_before_insert() | Hash chaining turnos | ✔/AUSENTE |
| lc_canonical_payload() | Serialización determinista fichajes | ✔/AUSENTE |
| lc_fichajes_chain_verify_after() | Verificación hash post-insert | ✔/AUSENTE |
| get_mi_empresa_id() | Tenant isolation en RLS | ✔/AUSENTE |

### Endpoints de auditoría
| Endpoint | Propósito | Estado |
|----------|-----------|--------|
| GET /api/tpv/audit/chain | Verificación cadena cobros | ✔/AUSENTE |
| GET /api/tpv/audit/export | Exportación para inspectores | ✔/AUSENTE |
| GET /api/laborcontrol/verify-chain | Verificación cadena fichajes | ✔/AUSENTE |

### Electron (si aplica)
| Elemento | Propósito | Estado |
|----------|-----------|--------|
| fiscal:save-snapshot IPC handler | Guardar snapshot local | ✔/AUSENTE |
| HMAC-SHA256 sobre snapshot JSON | Integridad local | ✔/AUSENTE |
| contextIsolation: true | Seguridad renderer | ✔/AUSENTE |
| nodeIntegration: false | Seguridad renderer | ✔/AUSENTE |
| contextBridge expuesto | API segura renderer↔main | ✔/AUSENTE |

### Helpers de seguridad
| Helper | Ubicación esperada | Estado |
|--------|-------------------|--------|
| handleAdminAuth() | src/core/infrastructure/api/ | ✔/AUSENTE |
| handleWaiterAuth() | src/core/infrastructure/api/ | ✔/AUSENTE |
| requireRole() | src/core/infrastructure/api/ | ✔/AUSENTE |
| resolveActor() | src/core/infrastructure/api/audit-actor.ts | ✔/AUSENTE |
| fetchWithCsrf() | src/lib/csrf-client.ts | ✔/AUSENTE |
| getSupabaseClient() | src/core/infrastructure/database/ | ✔/AUSENTE |
```

Este inventario se referencia en todas las fases posteriores. Si un elemento es `AUSENTE`, no se busca en fases posteriores — se documenta directamente como gap crítico.

---

**Qué inspecciona:**
- `package.json`, `tsconfig.json`, `.env.example`
- `next.config.*`, `middleware.ts`
- `supabase/config.toml`, `supabase/functions/`
- `.github/workflows/`
- `playwright.config.ts`
- `src/core/domain/`, `src/core/application/`, `src/core/infrastructure/`, `src/lib/`
- `electron/main.*`, `electron/preload.*`
- `docs/` — compliance, security, audit docs
- Todas las migraciones SQL
- Tests existentes

**Produce — Project Profile (reutilizado en todas las fases):**
```md
## Project Profile
- Framework web: {detectado}
- Base de datos: {detectado}
- RLS habilitado: {sí/no/parcial}
- Electron: {sí/no}
- Hash algorithm: {detectado o "no encontrado"}
- HMAC: {detectado o "no encontrado"}
- VeriFactu: {implementado/parcial/no implementado}
- SIALTI: {implementado/parcial/no implementado}
- LaborControl: {implementado/parcial/no implementado}
- Framework de tests: {detectado}
- Package manager: {detectado}
- Triggers de inalterabilidad encontrados: {lista}
- Funciones SECURITY DEFINER encontradas: {lista}
- RPCs expuestas: {lista}
- Views / Materialized Views: {lista}
```

**Produce también — versión auditada:**
```md
## Versión auditada
- Versión software: {package.json version}
- Commit: {git rev-parse HEAD}
- Branch: {git branch --show-current}
- Git hash corto: {git rev-parse --short HEAD}
- Fecha auditoría: {ISO 8601}
- Skill audit-tpv versión: {versión del skill file}
- Modo: {audit | pre-certification | regression | ci}
```

**Modo `regression` — diff de commits:**
1. Busca en `reports/` el último informe generado → extrae el commit auditado
2. Ejecuta `git diff {último_commit}..HEAD --name-only` para listar archivos cambiados
3. Mapea archivos cambiados contra la matriz de trazabilidad → identifica qué requisitos pueden verse afectados
4. Determina qué tests deben ejecutarse (solo los relacionados con los cambios)
5. Documenta: "cambios detectados: X archivos, Y requisitos potencialmente afectados, Z tests a ejecutar"

---

### Fase 2 — Threat Model [ESTÁTICA]

**Objetivo:** razonar sobre amenazas ANTES del gap analysis para que los porcentajes de cobertura reflejen el contexto de riesgo real.

Produce tabla:
```md
| # | Amenaza | Vector | Prob (1-5) | Impacto (1-5) | Riesgo | Mitigación detectada | Estado |
```

Categorías a evaluar (ajustadas al Project Profile):
- Manipulación de registros fiscales (UPDATE/DELETE)
- Bypass de RLS / tenant isolation
- Corrupción de cadena de hashes
- Race conditions (apertura/cierre/cobro simultáneos, numeración)
- CSRF en rutas mutativas
- IDOR
- SQL Injection
- Electron IPC injection (si Electron: sí en el Profile)
- Manipulación de snapshots HMAC (si HMAC: sí en el Profile)
- Pérdida de eventos de auditoría
- Rollback parcial (ACID)
- Secrets expuestos
- Broken Access Control
- Path Traversal
- Manipulación de reloj / timezone

---

### Fase 3 — DB Validation [ESTÁTICA]

**Triggers de inalterabilidad:**
Para cada trigger del Compliance Inventory que no sea `AUSENTE`:
- Verificar que lanza `RAISE EXCEPTION` (no solo `RETURN OLD`)
- Verificar que el mensaje de error identifica la ley aplicable

**Funciones PostgreSQL:**
- Para cada función `SECURITY DEFINER` del Profile: verificar que tiene `REVOKE EXECUTE FROM PUBLIC` (no solo de `anon`)
- Para cada función que use operaciones criptográficas (buscar `digest(`, `hmac(`): verificar que el `search_path` incluye el schema donde vive pgcrypto
- Para las RPCs expuestas: verificar que requieren autenticación antes de ejecutarse
- Para Views y Materialized Views: verificar que no exponen datos de múltiples tenants

**Permisos:**
- `PUBLIC` sin acceso a funciones críticas (localizar en migraciones de REVOKE)
- `authenticated` vs `service_role` separados correctamente en GRANTs
- Tablas fiscales sin acceso `anon` directo

**Modelo de datos (anti-patrones fiscales):**
- Verificar que columnas monetarias usan `INTEGER` (cents) o `NUMERIC`, no `FLOAT`/`REAL`
- Verificar que timestamps en tablas fiscales son `TIMESTAMPTZ`
- Verificar que no hay `ON DELETE CASCADE` en tablas con datos fiscales
- Tablas sin PRIMARY KEY
- UUID sin DEFAULT de generación aleatoria

**Verificación cronológica:**
- Verificar que la lógica de numeración correlativa no permite saltos (localizar el mecanismo — puede ser `sequence`, `MAX()+1 FOR UPDATE`, `pg_advisory_lock`, u otro)
- Verificar que no existe lógica que permita reutilizar un número anulado
- Verificar que el hash del registro N referencia el hash del registro N-1 de la misma empresa (localizar la función de hash y revisar la cláusula WHERE)

**Validación del reloj / timezone:**
- Verificar que los timestamps fiscales se generan a partir del reloj del servidor, no del cliente
- Verificar que la función de hash usa conversión explícita a formato fijo (no depende de `now()` con locale)
- Verificar que los timestamps de cobro son siempre posteriores al timestamp de apertura del turno correspondiente
- Documentar la estrategia de timezone del proyecto y evaluar sus implicaciones para la integridad del hash

**Consistencia ACID:**
- Localizar las transacciones donde se insertan registros fiscales + sus eventos de auditoría
- Verificar que si el evento de auditoría falla, el registro fiscal hace rollback (trigger AFTER con RAISE EXCEPTION)
- Localizar la función de verificación de hash post-insert y verificar que un hash incorrecto impide la inserción

**Migraciones (integridad retrospectiva):**
- Verificar que ninguna migración posterior elimina constraints en tablas fiscales
- Verificar que ninguna migración posterior deshabilita RLS en tablas auditadas
- Verificar que ninguna migración elimina triggers de inalterabilidad

---

### Fase 4 — Security Audit [ESTÁTICA]

**Vulnerabilidades — búsqueda en código fuente (ajustada al Project Profile):**

| Vulnerabilidad | Buscar | Patrón de riesgo |
|---|---|---|
| SQL Injection | Repos e infrastructure | raw SQL con interpolación de strings |
| Stored XSS | Respuestas API que persisten texto | ausencia de sanitización |
| Reflected XSS | Query params en SSR/RSC | `dangerouslySetInnerHTML`, `innerHTML` sin escape |
| CSRF | Rutas POST/PATCH/DELETE | ausencia de verificación del patrón double-submit |
| SSRF | Fetch con URL dinámica | `fetch(userInput)` sin allowlist |
| Path Traversal | Subida de archivos | `../` en nombres de archivo sin sanitizar |
| IDOR | Endpoints con IDs en URL | ausencia de verificación de pertenencia al tenant |
| Broken Access Control | Rutas protegidas | verificación de rol ausente |
| Sensitive Data Exposure | Logs y respuestas | PII en `console.log`, campos sensibles en respuestas |
| Prototype Pollution | Parsing de input | ausencia de validación con schema |
| Electron IPC Injection | Handlers IPC (si Electron en Profile) | ausencia de validación de tipo en canales |

**Secrets hardcodeados (scan en código fuente y configuración):**
- Buscar patrones de JWT hardcodeados (strings `eyJ...`)
- Buscar claves de servicio cloud (patrones de service_role, sk_, pk_)
- Buscar claves HMAC o de firma en código fuente (no en electron-store ni env)
- Buscar cualquier string literal > 40 chars en archivos `.ts`/`.js` que no sean texto de UI
- Verificar que secrets se leen lazy (funciones) no como constantes de módulo

**Evidencia de auditoría (completitud):**
- Localizar el sistema de audit log del proyecto
- Para cada acción sensible detectada en las rutas: verificar que genera una entrada en el audit log
- Verificar que cada entrada incluye: acción, empresa, actor, timestamp
- Verificar si se captura IP del actor y origen (web/electron/mobile) — documentar si falta

**Dependencias:**
- `pnpm audit` — vulnerabilidades conocidas (severity: moderate+)
- Dependencias sin release en > 2 años
- Licencias GPL en dependencias de producción

---

### Fase 5 — Gap Analysis + Matriz de Trazabilidad

**Informado por las fases 1-4 para que los porcentajes sean precisos.**

**Tabla de cumplimiento:**
```md
| # | Requisito | Norma | Estado | Implementación | Trigger/Función | Test | Archivo | Línea |
```

**Métricas de requisitos:**
```md
| Norma | Total | Cubiertos | Parciales | No aplica | Gaps | Cobertura |
|-------|-------|-----------|-----------|-----------|------|-----------|
| Ley 11/2021 | | | | | | |
| RD 1007/2023 (VeriFactu) | | | | | | |
| SIALTI | | | | | | |
| RD-Ley 8/2019 (LaborControl) | | | | | | |
| RGPD / LOPDGDD | | | | | | |
| OWASP ASVS | | | | | | |
| **TOTAL** | | | | | | |
```

**Matriz de trazabilidad completa:**

La separación entre Requisito e Implementación permite mantener el informe aunque el código cambie. El Requisito es de la ley; la Implementación es de este proyecto.

```md
| # | Requisito legal (QUÉ exige la ley) | Norma | Implementación (CÓMO lo hace este proyecto) | Mecanismo | Test | Resultado |
|---|-------------------------------------|-------|---------------------------------------------|-----------|------|-----------|
| 1 | No permitir borrado de cobros | Ley 11/2021 | Trigger tpv_cobro_no_delete en tpv_cobros | RAISE EXCEPTION en BEFORE DELETE | tpv-cobros-inalterabilidad.spec.ts | ✔ |
| 2 | Encadenamiento criptográfico de cobros | RD 1007/2023 | tpv_cobro_before_insert() — SHA-256 de payload canónico | BEFORE INSERT en tpv_cobros | hash-chaining.test.ts | ✔ |
| 3 | Audit trail atómico de turnos | SIALTI | tpv_turno_audit_trigger — AFTER INSERT/UPDATE en tpv_turnos | Misma transacción que el cambio de estado | tpv-turnos-inalterabilidad.spec.ts | ✔ |
| ... | ... | ... | ... | ... | ... | ... |
```

**Gaps priorizados:**
```md
| Gap | Norma | Prob (1-5) | Impacto (1-5) | Riesgo | Prioridad |
```

**Hoja de ruta VeriFactu (si VeriFactu: parcial o no implementado):**
```md
- [ ] Generación XML según XSD oficial AEAT
- [ ] Validación XML contra XSD antes de envío
- [ ] Firma electrónica (X.509)
- [ ] Endpoint envío AEAT (sandbox + producción)
- [ ] Gestión respuesta AEAT (OK / error / reenvío)
- [ ] Cola offline para envíos diferidos
```

---

### Fase 6 — Test Generation [DINÁMICA] (solo `pre-certification`)

**Regla de decisión — framework por tipo de test:**

| Tipo | Framework | Criterio |
|------|-----------|----------|
| API → mutación prohibida → exception | Playwright | HTTP + autenticación real |
| Función de hash / payload canónico | Vitest | Función pura — localizada en Fase 1 |
| HMAC de snapshot Electron | Vitest | Crypto pura — solo si Electron en Profile |
| IVA / desglose impuesto | Vitest | Cálculo determinista |
| Property-based: importes, descuentos, hashes, UUID | Vitest + fast-check | Miles de casos aleatorios |
| Fuzz: JSON inválido, NaN, fechas imposibles, UTF-8 | Vitest | Inputs corruptos controlados |
| RLS multi-tenant | Playwright | 2 tokens + service_role |
| Concurrencia: doble apertura, doble cierre, doble cobro | Playwright | Requests paralelos |
| Race condition: numeración simultánea | Playwright | service_role |
| Cronología: sin saltos, sin retrocesos | Playwright | service_role + SQL |
| Chain verify (localizado en Fase 1) | Playwright | Endpoint encontrado |
| Export → re-hash → compare | Playwright | Ciclo completo |
| ACID: inserción + fallo auditoría → rollback | Playwright | service_role |
| Acción → evento en audit log | Playwright | Verifica completitud post-acción |
| Benchmarks latencia (hash, HMAC, trigger, RLS, 100/1.000 ventas) | Playwright | Mide P50/P95/P99 |
| Electron: flags, contextBridge, IPC channels | Vitest | Solo si Electron en Profile |
| Secrets hardcodeados ausentes | Vitest | grep de patrones |

Si Vitest no instalado: `pnpm add -D vitest @vitest/coverage-v8 fast-check`

**Estructura de archivos:**
```
e2e/compliance/
  [modulo]-inalterabilidad.spec.ts      ← nombres basados en tablas encontradas
  tpv-chain-verify.spec.ts
  tpv-rls-multitenant.spec.ts
  tpv-concurrency.spec.ts
  tpv-cronologia.spec.ts
  tpv-acid.spec.ts
  tpv-audit-evidence.spec.ts
  tpv-export-integrity.spec.ts
  tpv-benchmarks.spec.ts
  laborcontrol-chain.spec.ts            ← solo si LC en Profile
  albaranes-immutable.spec.ts           ← solo si módulo compras en Profile

tests/compliance/
  hash-chaining.test.ts
  hmac-snapshot.test.ts                 ← solo si HMAC en Profile
  iva-breakdown.test.ts
  iva-property.test.ts                  ← fast-check
  hash-property.test.ts                 ← fast-check
  fuzz-api-inputs.test.ts
  electron-security.test.ts             ← solo si Electron en Profile
  secrets-scan.test.ts
```

Tests con `PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY`: skipean si la variable no está presente.

---

### Fase 7 — Test Execution [DINÁMICA]

```bash
pnpm e2e e2e/compliance/                    # Playwright (pre-cert / regression / ci)
pnpm test:compliance:coverage               # Vitest con coverage (pre-cert)
```

**Modo `regression`:** ejecuta solo los tests identificados en Fase 1 como relevantes para los cambios del diff.

**Modo `ci`:** no interactivo, falla en el primer error, sin generación de archivos.

Documenta: ✅ pasados, ❌ fallidos, `-` skips intencionales.
Si un test falla: documenta gap con CVSS. Si el fix entra en la categoría de modificación segura → pregunta al usuario.

---

### Fase 8 — Evidence Collection + Report

**Evidence Collection — genera `reports/evidence/`:**
```
reports/evidence/
  schema-snapshot.sql          ← DDL de tablas fiscales (pg_dump --schema-only)
  triggers-snapshot.sql        ← lista de triggers activos
  functions-snapshot.sql       ← funciones SECURITY DEFINER
  rls-policies.sql             ← políticas RLS activas
  dependencies.txt             ← pnpm list --prod
  pnpm-audit.json              ← resultado de pnpm audit
  coverage.json                ← cobertura Vitest (si ejecutada)
  playwright-report/           ← reporte HTML de Playwright (si ejecutado)
  benchmark.json               ← resultados de benchmarks (si ejecutados)
  project-profile.json         ← Project Profile generado en Fase 1
```

**Informes según modo:**

| Modo | Contenido |
|------|-----------|
| `audit` | Threat Model + Gaps + Trazabilidad + Recomendaciones (sin resultados de tests) |
| `pre-certification` | Completo + dictamen formal + compliance score + umbrales |
| `regression` | Diff de cambios + tests ejecutados + requisitos afectados |
| `ci` | Solo checklist final de área |

**Archivos generados:**
```
reports/
  compliance-report.md          ← informe completo Markdown
  compliance-report.json        ← estructurado (CI/CD)
  findings.sarif                ← GitHub Code Scanning
  coverage-summary.json         ← porcentajes + métricas de requisitos
```

**Header del informe (siempre):**
```md
## Versión auditada
- Software: {version} | Commit: {hash} | Branch: {branch} | Fecha: {ISO}
- Skill audit-tpv: v{versión del skill}
- Modo: {modo}
- Project Profile: {framework}/{bd}/{tests}
```

**Compliance Score (solo `pre-certification`):**
```md
| Categoría | Puntuación |
|-----------|-----------|
| Cumplimiento legal (Ley 11/2021 + RD 1007/2023) | XX/100 |
| Integridad (hash chain + ACID + cronología) | XX/100 |
| Seguridad (OWASP + secrets + permisos) | XX/100 |
| Auditoría (audit log + evidencias + trazabilidad) | XX/100 |
| Rendimiento (benchmarks P95) | XX/100 |
| Mantenibilidad (dependencias + cobertura + CI) | XX/100 |
| **Score global** | **XX,X/100** |
```

**Checklist final de área (siempre):**
```md
| Área | Estado |
|------|--------|
| DB — Triggers inalterabilidad | ✔/⚠/❌ |
| DB — Hash chaining + cronología | ✔/⚠/❌ |
| DB — RLS + permisos | ✔/⚠/❌ |
| DB — Consistencia ACID | ✔/⚠/❌ |
| Seguridad — OWASP | ✔/⚠/❌ |
| Seguridad — Secrets | ✔/⚠/❌ |
| Seguridad — Dependencias | ✔/⚠/❌ |
| Electron (si aplica) | ✔/⚠/❌ |
| RGPD | ✔/⚠/❌ |
| VeriFactu | ✔/⚠/❌ |
| LaborControl (si aplica) | ✔/⚠/❌ |
| Tests — Cobertura | ✔/⚠/❌ |
| CI/CD | ✔/⚠/❌ |
```

**Dictamen formal (solo `pre-certification`):**
```md
## Dictamen
Estado: LISTO PARA CERTIFICACIÓN / NO LISTO
Bloqueantes:
- [requisitos por norma que no alcanzan el umbral mínimo]
Recomendaciones priorizadas:
- [P1] ...
- [P2] ...
```

**CI/CD:** si no existe `.github/workflows/compliance.yml`, lo crea.

**Scripts en `package.json`** (solo si no existen):
```json
"test:compliance": "vitest run tests/compliance",
"test:compliance:watch": "vitest tests/compliance",
"test:compliance:coverage": "vitest run tests/compliance --coverage"
```

---

## Política de modificaciones

**Permitido con confirmación del usuario:**
- Índice faltante en tabla no-fiscal
- `REVOKE EXECUTE FROM PUBLIC` faltante en función nueva
- `NOT NULL` en columna sin datos existentes afectados
- `.github/workflows/compliance.yml`
- `package.json` scripts
- Archivos de tests y documentación

**Prohibición absoluta:**
- Lógica de negocio
- Triggers fiscales
- Reglas RLS en tablas fiscales
- Cálculo de hashes o HMAC
- Generación VeriFactu
- Migraciones SQL existentes

---

## Restricciones operacionales

1. **Compliance Inventory como fuente de verdad** — si un elemento es `AUSENTE` en Fase 1, se documenta como gap crítico sin buscar en fases posteriores. Al añadir un trigger/endpoint/función de compliance al proyecto, actualizar el Inventory en esta skill.
2. **pnpm siempre** — nunca `npm` ni `yarn`
3. **TicketBAI:** ignorado
4. **Pausa entre fases** (excepto modo `ci`)
5. **Tests con service_role:** skipean si `PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY` no está en env
6. **Benchmarks de 10.000+ ventas:** fuera de scope
7. **Modo `ci`:** no interactivo, falla rápido, sin generación de archivos nuevos
8. **Project Profile:** generado en Fase 1 y referenciado por todas las fases posteriores — las fases condicionadas por Electron, HMAC, LC, etc. se activan o skipean según el Profile
