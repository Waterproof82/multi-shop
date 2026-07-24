# Proposal: Labor Control (Fichaje Digital) — v3.2

## Intent

Spanish law (RD-Ley 8/2019, Art. 34.9 ET) mandates daily work-time registration with 4-year retention. A Real Decreto for exclusive digital registration is in advanced drafting (Consejo de Ministros approved urgent processing September 2025; Consejo de Estado issued a critical dictamen March 2026 requesting revisions; revised text expected before August 2026, entry into force 20 days after BOE publication, ~1-year grace period for SMEs under discussion). The draft requirements have been stable throughout: mandatory digital fichaje, real-time ITSS inspection access, immutability and traceability (who/when/why for every change, no unilateral modifications), sanctions per affected worker (up to €10,000 per employee), biometric restriction when less-invasive methods exist, and mandatory overtime registration with compensation type.

Additionally, Art. 12.4.c ET (in force today, independent of the pending RD) requires monthly totalization of part-time workers' hours with a copy of the summary delivered to the employee alongside the payslip — highly relevant for restaurant staffing.

multi-shop's restaurant clients currently lack compliant fichaje, exposing them to sanctions up to €10,000 per employee affected. This module adds legally compliant time registration as a bounded context inside multi-shop, reusing the existing `empleados` identity and TPV PIN auth. PIN is the correct method: the AEPD has effectively foreclosed biometric data (fingerprint, facial recognition) for mere attendance purposes.

## Scope

### In Scope (MVP — legally required)

**Event recording**
- 4 event types: `entrada`, `salida`, `inicio_pausa`, `fin_pausa` (all mandatory for compliance)
- PIN-based fichaje (reuses existing TPV PIN system); offline PIN validation via local cache (see Approach §9)
- TPV login/logout integration dialogs ("Fichar entrada" / "Fichar salida")
- Every fichaje carries `centro_id` (mapped to the existing multi-shop shop/tienda entity)

**Corrections (never mutations)**
- Corrections create new records: `tipo = 'correccion'` + mandatory `motivo` + actor identity + reference to corrected record + `accion` (`rectificar` | `anular`)
- Supersede rule: all computations (daily totals, overtime, exports) use the latest valid version of each event; superseded originals remain intact and visible in history
- Corrections of corrections supported via reference chain
- Employee notification + acknowledgment: affected employee sees every correction and can mark it `visto` or `disputado`; disputes don't block but are permanently recorded (draft RD prohibits unilateral modifications)
- Orphan-event handling: unmatched `entrada` without `salida` (or pause without close) is flagged for supervised correction — never auto-closed silently; annulling one half of a pair re-flags the remaining half

**Integrity chain**
- SHA256 chain **per empresa**, **segmented monthly**; segment N+1 genesis = anchor(N) hash
- Anchors live in a dedicated immutable table `lc_chain_anchors` (never purged; negligible size)
- Hash input: canonical JSON serialization (sorted keys, explicit delimiters) of `{record_id, empresa_id, centro_id, empleado_id, tipo, accion, ref_correccion, timestamp_evento_utc, timestamp_servidor_utc, origen_offline, motivo, prev_hash}` — no raw concatenation (ambiguity-attack safe)
- **Hash computed server-side in a `BEFORE INSERT` Postgres trigger** — every row is chained regardless of insert path (API, service key, support script); chaining cannot be bypassed by application code
- **Chain writes serialized per empresa** via `pg_advisory_xact_lock(empresa_id)` inside the trigger — eliminates the race where concurrent fichajes from multiple TPVs read the same `prev_hash` and fork the chain. Note: if `empresa_id` is UUID, hash to bigint via `hashtext(empresa_id::text)::bigint`; an int4 collision between two empresas would only cause them to share a lock (extra serialization, never a correctness error) — document this so nobody "fixes" it incorrectly
- Chain ordered by server insertion, not event chronology (no rechaining ever needed)
- **Segments defined by `timestamp_servidor`** — perfectly aligned with monthly partitions by construction (see DB-level immutability); late offline syncs fall naturally into the current segment; anchors sealed by scheduled job at month close
- Chain verifier: scheduled job + on-demand endpoint that validates full chain integrity per empresa/segment and alerts on breaks; verification report doubles as inspection-ready proof of immutability

**Timestamps**
- Dual timestamps: `timestamp_evento` (client) + `timestamp_servidor` (reception) + `origen_offline` flag
- Precedence rule (explicit): **online** → legal event time = `timestamp_servidor`; **offline** → legal event time = `timestamp_evento` (drift-corrected), flagged `origen_offline`
- Electron client periodically syncs a clock offset against the server and applies it to offline event timestamps; discrepancies above a configurable threshold flag the record for supervisor review
- Work-center timezone stored per centro; daily totals and exports computed in local time (based on legal event time)
- Midnight-crossing shifts (restaurants close 1–2 AM): full shift is attributed to the local day of the `entrada`

**DB-level immutability**
- `lc_fichajes` and `lc_audit_log`: `REVOKE UPDATE, DELETE` for all roles + `BEFORE UPDATE OR DELETE` trigger raising exception (RLS alone is insufficient — service_role bypasses it)
- `lc_fichajes` **partitioned natively by month on `timestamp_servidor`** — NOT on `timestamp_evento`. Rationale: the chain orders by server insertion; a July-31 offline fichaje synced August 2 belongs to the August chain segment, and if partitioned by event date it would live in the July partition — dropping July after 4 years would rip a row out of the middle of the August segment and break verification. Partitioning by `timestamp_servidor` aligns partitions and segments exactly; retention becomes slightly conservative (≥4 years from event date), which is the safe side
- 4-year purge = controlled `DROP PARTITION` (DDL path), never row `DELETE` (which the trigger blocks) — resolves the purge/immutability conflict and improves range-query performance
- FK from `lc_fichajes` / `lc_perfil_laboral` to `empleados` is **`ON DELETE RESTRICT`** — never cascade; employee offboarding must be soft-delete while fichajes exist (4-year retention survives the employment relationship); verify multi-shop's current empleado deletion path and adjust if needed

**Retention & legal holds**
- 4-year retention enforced via Vercel Cron dropping expired monthly partitions
- Separate `lc_legal_holds` table (empresa, optional empleado, date range, motivo, actor)
- Hold handling on shared partitions: before the scheduled drop, rows of empresas with an overlapping hold are **copied to `lc_fichajes_hold_archive`** (same immutability guarantees), then the partition is dropped on schedule — the held empresa keeps its data, all other tenants get their purge on time (RGPD minimization is not compromised by another tenant's hold)
- Post-hold cleanup rule: archived rows are purged at **`max(event date + 4 years, hold lifted)`** — if the 4-year window already elapsed when the hold is lifted, purge immediately (the hold was the only remaining retention basis); otherwise follow the original cycle. Single deterministic rule, RGPD-aligned
- Anchors and audit log retained beyond purge as integrity checkpoints

**Access & views**
- Employee self-view: own fichajes, daily/monthly totals, correction history with acknowledgment actions (Art. 34.9 ET — mandatory). v1 channel: "Mis fichajes" screen on TPV after PIN; **auto-timeout / session lock on the shared TPV** so the next employee cannot see the previous one's data; web portal deferred to v1.1 (open decision, see below)
- Workers' representative (RLT) role: read-only access to records of their work center, scoped by `centro_id`, with data-protection limitations
- Supervisor dashboard: real-time who's in / who's missing / current pause status (Supabase Realtime)

**Overtime**
- Derived calculation: registered effective hours − theoretical hours from `lc_perfil_laboral`
- Dedicated `lc_horas_extra` table registering compensation decision (`salario` | `descanso`) per overtime entry — compensation is a management decision subsequent to calculation, not a fichaje attribute

**Part-time monthly summary (Art. 12.4.c ET — in force today)**
- `lc_perfil_laboral` flags part-time contracts (`tiempo_parcial boolean` + jornada teórica)
- Monthly totalization report per part-time employee, generated by the export layer, for delivery alongside the payslip
- Generation and delivery recorded in the audit log (proof of compliance)

**Export**
- PDF / Excel: daily totals per employee, effective time vs. pauses, overtime with compensation, date-range filters, part-time monthly summaries
- Structured as internal API layer (`GET /api/laborcontrol/export` → normalized query → renderers) so the future ITSS remote-access mechanism plugs into the same query layer

**Audit**
- `lc_audit_log`: all fichaje-related actions (fichaje, corrección, acknowledgment, export, part-time summary generation/delivery, legal hold, purge, hold-archive copy, verification runs) with actor, timestamp, reason; same immutability guarantees as `lc_fichajes`

**Offline (Electron TPV)**
- Queue in IndexedDB (not localStorage): persistence check on init, contents minimized (`empleado_id`, `timestamp_evento`, `tipo`, `centro_id`, `local_hash`), encrypted at rest, purged immediately after confirmed sync, max queue age limit with alert
- Offline PIN validation: local cache of PIN hashes updated on each sync; hashes use a slow algorithm (argon2/bcrypt) with per-device salt + local rate limiting (4-digit PINs are brute-forceable if the cache is extracted)
- Sync in insertion order; server stamps `timestamp_servidor` on reception; server-side trigger chains synced records on arrival like any other insert

**RGPD & deployment obligations**
- Data minimization; legal basis Art. 6.1.c RGPD (legal obligation); informative clause in UI
- Registro de actividades de tratamiento updated
- Documented EIPD assessment (real-time supervisor monitoring warrants documenting the evaluation, even if the conclusion is that a full EIPD is not required)
- Client onboarding checklist: prior report to workers' representatives where a comité/delegados exist (Art. 64.5 ET — implementing a work-control system requires it), template included

### Out of Scope (deferred)
- QR / NFC / RFID / mobile app / GPS / geofencing methods
- Vacaciones / ausencias / incidencias module
- Full KPI dashboard with charts
- Inspector mode / ITSS remote access mechanism (technical specification not yet published; export API layer designed to plug in when available)
- Automatic alerts (no-show, overtime) — model supports it, not triggered in v1
- Employee web portal (v1.1; v1 uses TPV self-view)

## Capabilities

### New Capabilities
- `lc-fichaje`: event recording (4 types), segmented per-empresa SHA256 chain, corrections with motivo/accion/acknowledgment, PIN auth integration, dual timestamps with precedence rule
- `lc-chain`: DB-trigger hashing + advisory-lock serialization, anchor management (month-close sealing), chain verifier job + endpoint, integrity reports
- `lc-perfil-laboral`: employee labor profile extension (jornada teórica, contrato, tiempo_parcial, convenio, centro_id)
- `lc-supervisor`: real-time dashboard (who's in, missing, pause status, flagged records for review)
- `lc-employee-view`: TPV self-view with session auto-timeout — own fichajes, totals, correction history, visto/disputado actions
- `lc-rlt-view`: workers' representative read-only view scoped by centro
- `lc-overtime`: derived overtime calculation + `lc_horas_extra` compensation registry
- `lc-export`: PDF/Excel export via normalized query layer (ITSS-ready) + part-time monthly summaries (Art. 12.4.c ET)
- `lc-audit`: immutable audit log for all actions
- `lc-retention`: partition-drop purge job + `lc_legal_holds` management + hold-archive copy + post-hold cleanup rule

### Modified Capabilities
- TPV login/logout flow: fichaje dialog + "Mis fichajes" self-view screen (auto-timeout) + offline PIN cache
- Translations (`@/lib/translations`): new i18n keys for laborcontrol UI

## Approach

**Bounded context** within multi-shop: same repo, same Supabase, same auth. Directory: `src/core/laborcontrol/` (domain/application/infrastructure) + `src/app/laborcontrol/` (pages) + `src/app/api/laborcontrol/` (API routes).

**Key decisions:**
1. **Identity reuse** — `lc_perfil_laboral` extends `empleados` (FK `ON DELETE RESTRICT`); `centro_id` maps to existing shop entity; no identity duplication
2. **Segmented per-empresa chain** — monthly segments defined by `timestamp_servidor`; segment sealed by anchor in `lc_chain_anchors` at month close; next segment's genesis prev_hash = previous anchor's hash; hash over canonical JSON (sorted keys), never raw concatenation; chain ordered by server insertion
3. **Timestamp precedence** — online: `timestamp_servidor` is the legal event time; offline: drift-corrected `timestamp_evento` is, flagged `origen_offline`; above-threshold drift → supervisor review flag
4. **DB immutability + partitioning** — `REVOKE UPDATE, DELETE` + exception-raising trigger on `lc_fichajes` and `lc_audit_log`; `lc_fichajes` partitioned by month **on `timestamp_servidor`** (aligned with chain segments — purge can never break a live segment); purge is `DROP PARTITION` gated by `lc_legal_holds` check with hold-archive copy
5. **Corrections as append-only supersede** — `rectificar`/`anular` via new records; computations resolve latest valid version; employee acknowledgment recorded
6. **Realtime** — Supabase Realtime for supervisor live view (already in stack); publication configured with `publish_via_partition_root = true` so partition inserts surface as root-table events
7. **Offline** — IndexedDB queue, encrypted, minimized, persistence-checked; sync in insertion order
8. **Multi-tenant** — all tables scoped by `empresa_id`, RLS policies + GRANTs per migration checklist
9. **Offline PIN auth** — synced local cache of argon2/bcrypt PIN hashes, per-device salt, local rate limiting
10. **Export API layer** — normalized query → PDF/Excel renderers (inspection reports + part-time monthly summaries); single query layer reused by future ITSS access
11. **Server-side chaining** — hash computed in `BEFORE INSERT` trigger; `pg_advisory_xact_lock` on hashed `empresa_id` serializes chain writes per empresa; no insert path can bypass or fork the chain

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/laborcontrol/` | New | Domain, application, infrastructure layers |
| `src/app/laborcontrol/` | New | Supervisor, RLT pages |
| `src/app/api/laborcontrol/` | New | API routes: fichaje, profiles, export, overtime, holds, chain verification |
| `supabase/migrations/` | New | `lc_fichajes` (partitioned on `timestamp_servidor`), `lc_perfil_laboral`, `lc_horas_extra`, `lc_chain_anchors`, `lc_legal_holds`, `lc_fichajes_hold_archive`, `lc_audit_log`; chain trigger + immutability triggers; Realtime publication config |
| `src/app/tpv/` | Modified | Login/logout fichaje dialogs + "Mis fichajes" self-view screen (auto-timeout) + offline PIN cache |
| `src/lib/translations/` | Modified | New i18n keys for laborcontrol UI |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| RD published during development (entry into force in 20 days) | **High** | Stable draft requirements (pausas, motivo, employee/RLT access, overtime, no unilateral changes) are v1 requirements; only the ITSS remote-access mechanism is deferred, and the export query layer is its plug-in point |
| Concurrent fichajes fork the chain | Resolved | Advisory lock per empresa inside the insert trigger serializes chain writes |
| Chain bypassed by direct inserts (service key, scripts) | Resolved | Hash computed in DB trigger — every insert path is chained by construction |
| Purge breaks a live chain segment (late offline syncs) | Resolved | Partition key = `timestamp_servidor` — partitions and segments aligned by construction |
| Chain integrity vs. offline sync | Low | Chain ordered by server insertion — no rechain by design; verifier job detects any anomaly |
| Clock drift on Electron clients | Low | Online: server time is legal time; offline: synced clock offset corrects event timestamps; threshold breach → review flag |
| Purge conflicts with immutability | Resolved | Purge = `DROP PARTITION` (DDL), row-level trigger untouched; gated by `lc_legal_holds` |
| Legal hold retains other tenants' data past 4 years | Resolved | Held empresa's rows copied to `lc_fichajes_hold_archive` before scheduled drop; archive purged at `max(event+4y, hold lifted)`; other tenants purged on time |
| Employee deletion cascades away legally retained fichajes | Resolved | FK `ON DELETE RESTRICT` + soft-delete offboarding while fichajes exist |
| IndexedDB cleared on Electron | Low | Persistent storage default + persistence check on queue init + max-age alert |
| Offline PIN cache extraction | Low | Slow hash (argon2/bcrypt), per-device salt, local rate limiting; cache scoped to centro staff only |
| Employee disputes correction | Low | Dispute recorded, doesn't block; audit trail is the protection for both parties |
| Shared-TPV privacy leak in self-view | Low | Session auto-timeout / lock after inactivity on "Mis fichajes" |
| Supervisor dashboard misses partition events | Resolved | `publish_via_partition_root = true` on the Realtime publication (verified in integration test) |

## Rollback Plan

1. Drop migration tables (`lc_fichajes` + partitions, `lc_perfil_laboral`, `lc_horas_extra`, `lc_chain_anchors`, `lc_legal_holds`, `lc_fichajes_hold_archive`, `lc_audit_log`) — no FK dependencies on core tables
2. Remove `src/core/laborcontrol/`, `src/app/laborcontrol/`, `src/app/api/laborcontrol/`
3. Revert TPV changes (fichaje dialogs, self-view, PIN cache) — single commit scope
4. Bounded context means zero impact on existing functionality
5. Note: if the module has been in production use, exported records must be archived before rollback (4-year legal retention survives the software)

## Dependencies

- Existing `empleados` table and PIN auth system (already in production); verify empleado offboarding is soft-delete
- Existing shop/tienda entity (mapped as centro de trabajo)
- Supabase Realtime (already configured; publication needs `publish_via_partition_root`)
- Postgres native partitioning + advisory locks (available in Supabase)
- PDF generation library (design phase — likely `@react-pdf/renderer` or `pdfkit`)
- Excel generation (design phase — likely `exceljs`)
- argon2/bcrypt implementation for Electron PIN cache

## Open Decisions

1. Employee self-view channel for v1.1: web portal with credentials vs. monthly auto-generated PDF delivery — v1 ships TPV screen
2. Drift threshold value for offline timestamp review flag (proposal: 5 minutes)
3. Monthly vs. quarterly chain segments (proposal: monthly — aligns with partitions and payroll cycles)
4. PDF/Excel library selection
5. Part-time monthly summary delivery mechanism: printed with payslip by the client vs. digital delivery with acknowledgment (v1 proposal: generate PDF, client delivers with payslip; digital acknowledgment in v1.1 with the portal)
6. TPV self-view inactivity timeout value (proposal: 60 seconds)

## Success Criteria

- [ ] Employee can register entrada, salida, inicio_pausa, fin_pausa via PIN from TPV (online and offline)
- [ ] TPV login/logout prompts fichaje dialog
- [ ] All fichaje records belong to a valid per-empresa SHA256 chain (canonical serialization), verifiable per monthly segment against anchors
- [ ] Hash is computed by the DB insert trigger: a direct insert via service key produces a correctly chained row; concurrent inserts from two clients never fork the chain (load test)
- [ ] Partition key is `timestamp_servidor`; test: a fichaje with prior-month event date synced in the current month lands in the current partition and current chain segment; dropping the oldest partition never breaks verification of remaining segments
- [ ] Chain verifier job runs on schedule and produces an integrity report; induced tampering in a test environment is detected
- [ ] Records cannot be updated or deleted (REVOKE + trigger on `lc_fichajes` and `lc_audit_log`; verified by test attempting UPDATE/DELETE as service_role)
- [ ] Deleting an empleado with existing fichajes is rejected (FK RESTRICT); offboarding path uses soft-delete
- [ ] Corrections include motivo, accion, actor, reference to original; totals use supersede rule; affected employee is notified and can mark visto/disputado
- [ ] Orphan events (missing salida / unclosed pausa, including halves orphaned by anulación) are flagged for supervised correction
- [ ] Timestamp precedence rule enforced: server time online, drift-corrected client time offline; above-threshold drift flagged
- [ ] Midnight-crossing shifts attributed to the local day of entrada; totals computed in centro timezone
- [ ] Supervisor sees real-time clock-in/pause status and review flags (partition events verified via publish_via_partition_root)
- [ ] Employee can view own fichajes, daily/monthly totals, and correction history from TPV; self-view session auto-locks after inactivity
- [ ] RLT role has read-only access scoped to their centro
- [ ] Overtime calculated from perfil laboral and registered in `lc_horas_extra` with compensation type
- [ ] Part-time employees have a monthly totalization summary generated (Art. 12.4.c ET); generation/delivery recorded in audit log
- [ ] PDF/Excel export shows daily totals, effective time, pauses, overtime + compensation per employee and date range
- [ ] Audit log captures all actions (fichajes, corrections, acknowledgments, exports, part-time summaries, holds, hold-archive copies, purges, verifications) with actor identity
- [ ] Offline fichaje syncs correctly: IndexedDB persistence verified, queue encrypted/minimized/purged post-sync, offline PIN validated against local hash cache
- [ ] 4-year retention enforced via partition drop; empresas with active holds have rows archived to `lc_fichajes_hold_archive` before drop; archive purged at `max(event+4y, hold lifted)`; other tenants purged on schedule; purge actions audited
- [ ] All tables have RLS, GRANTs, `empresa_id` scoping, and (where applicable) REVOKE + trigger per migration checklist
- [ ] RGPD: registro de actividades updated, informative clause in UI, documented EIPD assessment, purge log
- [ ] Client onboarding includes Art. 64.5 ET checklist + RLT prior-report template
