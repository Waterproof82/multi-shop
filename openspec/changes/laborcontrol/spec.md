# LaborControl Specification

## Purpose

Delta spec for the `laborcontrol` bounded context. All capabilities are new. Defines what MUST be true after the change is applied; does not prescribe implementation.

Legal anchors: RD-Ley 8/2019 / Art. 34.9 ET (daily registration + 4-year retention), Art. 12.4.c ET (part-time monthly summary), draft RD on exclusive digital fichaje, RGPD Art. 6.1.c.

---

## LC-D — Data Integrity & Immutability

**LC-D-001** — `lc_fichajes` and `lc_audit_log` MUST have `REVOKE UPDATE, DELETE` applied to all database roles, including `service_role`.

**LC-D-002** — A `BEFORE UPDATE OR DELETE` trigger on `lc_fichajes` and `lc_audit_log` MUST raise an exception unconditionally, making row mutation impossible through any code path.

**LC-D-003** — FKs from `lc_fichajes` and `lc_perfil_laboral` to `empleados` MUST be declared `ON DELETE RESTRICT`. Employee deletion is rejected while fichajes exist.

**LC-D-004** — Employee offboarding MUST use soft-delete (an `activo` or equivalent flag on `empleados`). Hard-delete of an employee with fichajes MUST be rejected by the FK constraint.

**LC-D-005** — `lc_fichajes` MUST be partitioned by month on `timestamp_servidor` (not `timestamp_evento`). Rationale: chain segments are ordered by server insertion; partition and segment boundaries align by construction; a late offline sync lands in the current month's partition without crossing a sealed segment.

#### Scenario: Attempt row deletion as service_role

- GIVEN a fichaje record exists in `lc_fichajes`
- WHEN a `DELETE` is issued with the `service_role` key
- THEN the database raises an exception and no row is removed

#### Scenario: Employee hard-delete rejected

- GIVEN an `empleados` row has associated rows in `lc_fichajes`
- WHEN a `DELETE` is attempted on that employee
- THEN the FK constraint raises an error and the delete is aborted

#### Scenario: Late offline sync lands in current partition

- GIVEN a fichaje with `timestamp_evento` = July 31 is synced to the server on August 2
- WHEN the record is inserted
- THEN `timestamp_servidor` = August 2, the record lands in the August partition and the August chain segment

---

## LC-C — Integrity Chain

**LC-C-001** — Every row inserted into `lc_fichajes` MUST have its `hash` field computed by a `BEFORE INSERT` trigger. No insert path (API, service key, migration script) may bypass hashing.

**LC-C-002** — The hash input MUST be the canonical JSON serialization of: `{record_id, empresa_id, centro_id, empleado_id, tipo, accion, ref_correccion, timestamp_evento_utc, timestamp_servidor_utc, origen_offline, motivo, prev_hash}` with sorted keys and no raw concatenation.

**LC-C-003** — Chain writes for the same `empresa_id` MUST be serialized via `pg_advisory_xact_lock(hashtext(empresa_id::text)::bigint)` inside the trigger. Two simultaneous inserts for the same empresa MUST NOT read the same `prev_hash`.

**LC-C-004** — Chain segments MUST be monthly, defined by `timestamp_servidor`. Segment N+1's genesis `prev_hash` MUST equal the hash stored in the corresponding row of `lc_chain_anchors`.

**LC-C-005** — `lc_chain_anchors` MUST be an immutable table (same REVOKE + trigger guarantees as `lc_fichajes`). Anchors MUST NOT be purged when monthly partitions are dropped.

**LC-C-006** — A chain verifier MUST run on schedule (at minimum daily) and MUST be triggerable on-demand via an authenticated endpoint. It MUST produce an integrity report per empresa/segment listing: total records checked, last valid hash, broken links (if any), and verification timestamp.

**LC-C-007** — A detected chain break MUST generate a high-severity alert logged to `lc_audit_log` with `action_type = 'chain_break_detected'`.

#### Scenario: Concurrent fichajes from two TPVs

- GIVEN two Electron TPVs submit fichajes for the same empresa simultaneously
- WHEN both inserts reach the DB trigger concurrently
- THEN the advisory lock serializes them; both rows receive unique, consecutive `prev_hash` values; no fork occurs

#### Scenario: Induced tampering detected

- GIVEN a fichaje row's `hash` field is manually altered in a test environment
- WHEN the chain verifier runs
- THEN the report marks the segment as BROKEN and an alert is written to `lc_audit_log`

#### Scenario: On-demand verification

- GIVEN a user with admin role calls `GET /api/laborcontrol/chain/verify`
- WHEN the endpoint responds
- THEN the response contains per-segment integrity status and is also recorded in `lc_audit_log`

---

## LC-F — Fichaje (Event Recording)

**LC-F-001** — The system MUST support exactly 4 event types: `entrada`, `salida`, `inicio_pausa`, `fin_pausa`. No other event types are valid.

**LC-F-002** — Every fichaje record MUST include: `record_id`, `empresa_id`, `centro_id`, `empleado_id`, `tipo`, `timestamp_evento`, `timestamp_servidor`, `origen_offline`, `hash`, `prev_hash`. Corrections additionally require `accion`, `motivo`, `ref_correccion`.

**LC-F-003** — PIN authentication MUST reuse the existing TPV PIN system. The system MUST NOT introduce a separate PIN credential.

**LC-F-004** — Offline PIN validation MUST use a locally cached hash (argon2 or bcrypt) with a per-device salt and local rate limiting. The cache MUST be updated on each successful sync.

**LC-F-005** — For online fichajes, the legal event time is `timestamp_servidor`. For offline fichajes, the legal event time is the drift-corrected `timestamp_evento`; the record MUST have `origen_offline = true`.

**LC-F-006** — Clock drift above a configurable threshold (default: 5 minutes) MUST set a `supervisor_review` flag on the fichaje record.

**LC-F-007** — A shift crossing midnight is attributed in full to the local day of the `entrada` event, based on the work center's timezone.

**LC-F-008** — An unmatched `entrada` (no subsequent `salida`) or an unclosed `inicio_pausa` (no `fin_pausa`) MUST be flagged as an orphan and presented for supervised correction. They MUST NOT be auto-closed silently.

**LC-F-009** — Annulling one half of a matched pair MUST re-flag the remaining half as an orphan.

#### Scenario: Online fichaje — server timestamp is legal time

- GIVEN an employee is online at a TPV
- WHEN they register an `entrada` via PIN
- THEN `timestamp_servidor` is recorded as the legal event time and `origen_offline = false`

#### Scenario: Offline fichaje with drift below threshold

- GIVEN the Electron TPV is offline and the clock drift is 2 minutes
- WHEN the employee registers a `salida`
- THEN the record is queued with `origen_offline = true` and `supervisor_review = false`

#### Scenario: Offline fichaje with drift above threshold

- GIVEN the Electron TPV is offline and the clock drift is 8 minutes
- WHEN the employee registers a `salida`
- THEN the record is queued with `origen_offline = true` and `supervisor_review = true`

#### Scenario: Orphan event flagged

- GIVEN an employee has a `fin_pausa` with no preceding `inicio_pausa` in the current session
- WHEN the system processes the record
- THEN the event is flagged as an orphan and appears in the supervisor review queue

---

## LC-K — Corrections

**LC-K-001** — A correction MUST be a new `lc_fichajes` record with `tipo = 'correccion'`, a non-empty `motivo`, an `actor` identity, a `ref_correccion` referencing the corrected record, and `accion` = `rectificar` | `anular`.

**LC-K-002** — Corrections of corrections MUST be supported via chained `ref_correccion` references.

**LC-K-003** — All totals, overtime calculations, and exports MUST use the latest valid version of each event (supersede rule). Superseded originals MUST remain visible in history.

**LC-K-004** — The affected employee MUST be notified of every correction and MUST be able to mark it `visto` or `disputado`. A dispute MUST be permanently recorded and MUST NOT block any computation.

**LC-K-005** — `accion = 'anular'` on one half of a matched pair (e.g., annulling a `salida`) MUST set an orphan flag on the remaining matched record (the `entrada`).

#### Scenario: Supervisor corrects a fichaje

- GIVEN a fichaje record with a wrong timestamp exists
- WHEN a supervisor submits a correction with `accion = rectificar`, valid `motivo`, and `ref_correccion`
- THEN a new record is inserted; totals resolve using the corrected record; the original is still visible in history

#### Scenario: Employee disputes a correction

- GIVEN an employee has been notified of a correction
- WHEN they mark it `disputado`
- THEN the dispute is recorded in `lc_audit_log`; the correction stands and computations are unaffected

#### Scenario: Anulación orphans remaining half

- GIVEN a matched `entrada`/`salida` pair exists
- WHEN the `salida` is annulled via `accion = anular`
- THEN the original `entrada` is flagged as an orphan for supervised correction

---

## LC-T — Timestamps

**LC-T-001** — Every fichaje MUST store both `timestamp_evento` (client clock) and `timestamp_servidor` (server reception time) as separate UTC fields.

**LC-T-002** — `origen_offline` MUST be a boolean field present on every fichaje record.

**LC-T-003** — Daily totals and all exports MUST be computed in the work center's local timezone, using legal event time (LC-F-005).

**LC-T-004** — The work center timezone MUST be stored per `centro_id`.

#### Scenario: Timezone-correct daily total

- GIVEN a centro in Europe/Madrid and a shift from 23:00 to 01:30 the next calendar day (UTC)
- WHEN daily totals are computed
- THEN the full 2.5 hours are attributed to the local date of the `entrada`

---

## LC-V — Views & Access

**LC-V-001** — The employee self-view MUST be accessible from the TPV after PIN auth and MUST display only the authenticated employee's own fichajes, daily/monthly totals, and correction history with `visto`/`disputado` actions.

**LC-V-002** — The TPV self-view MUST auto-lock after a configurable inactivity period (default: 60 seconds) to prevent privacy leaks on shared devices.

**LC-V-003** — The RLT role MUST have read-only access to `lc_fichajes` and `lc_horas_extra` scoped exclusively to their `centro_id` via RLS.

**LC-V-004** — The supervisor dashboard MUST display in real time: who is clocked in, who is missing, current pause status, and flagged records. It MUST receive Supabase Realtime events from the partitioned table via `publish_via_partition_root = true`.

#### Scenario: Employee cannot see peer's fichajes

- GIVEN employee A is authenticated in the TPV self-view
- WHEN they query fichaje history
- THEN only employee A's records are returned; employee B's records are invisible (RLS enforced)

#### Scenario: Self-view auto-lock

- GIVEN an employee opened "Mis fichajes" and stepped away
- WHEN 60 seconds of inactivity elapse
- THEN the screen locks and requires PIN re-entry before showing data again

#### Scenario: Supervisor dashboard receives partition inserts

- GIVEN `publish_via_partition_root = true` on the Realtime publication
- WHEN a fichaje is inserted into the August partition
- THEN the supervisor dashboard receives a Realtime event without polling

---

## LC-O — Overtime

**LC-O-001** — Overtime MUST be calculated as: registered effective hours minus theoretical hours defined in `lc_perfil_laboral` for the relevant period.

**LC-O-002** — `lc_horas_extra` MUST store one entry per overtime event with a compensation type: `salario` | `descanso`. Compensation type is a management decision; it MUST NOT be an attribute of the fichaje.

#### Scenario: Overtime registered

- GIVEN an employee worked 2 hours beyond their theoretical jornada for the week
- WHEN the system calculates overtime
- THEN a row is inserted in `lc_horas_extra` with the delta and a pending compensation type

---

## LC-M — Part-Time Monthly Summary (Art. 12.4.c ET)

**LC-M-001** — `lc_perfil_laboral` MUST include a `tiempo_parcial` boolean field and a `jornada_teorica` field.

**LC-M-002** — A monthly totalization summary MUST be generated for every part-time employee.

**LC-M-003** — In v1, the PDF MUST be generated and delivered alongside the payslip by the client. Generation and delivery MUST be recorded in `lc_audit_log`.

#### Scenario: Monthly summary generated

- GIVEN a part-time employee exists with `tiempo_parcial = true`
- WHEN the monthly summary job runs
- THEN a PDF totalization is produced and an `lc_audit_log` entry records generation with actor and timestamp

---

## LC-E — Export

**LC-E-001** — The export layer MUST expose a normalized query layer at `GET /api/laborcontrol/export` that renderers consume. PDF and Excel renderers MUST be separate consumers of this layer.

**LC-E-002** — Exports MUST include: daily totals per employee, effective time vs. pauses, overtime with compensation type, and part-time monthly summaries. Filters MUST include employee and date range.

**LC-E-003** — The query layer MUST be the single plug-in point for future ITSS remote-access integration.

#### Scenario: Export filtered by employee and date range

- GIVEN a supervisor requests an export for employee X, date range Jan 1–31
- WHEN the export endpoint responds
- THEN the PDF/Excel contains only that employee's data within the date range

---

## LC-R — Retention & Legal Holds

**LC-R-001** — Monthly partitions MUST be dropped (DDL `DROP PARTITION`) by a Vercel Cron job after 4 years from the `timestamp_servidor` of the oldest record in that partition. Row-level `DELETE` MUST NOT be used.

**LC-R-002** — `lc_legal_holds` MUST store: `empresa_id`, optional `empleado_id`, date range, `motivo`, and actor.

**LC-R-003** — Before dropping a partition, the cron job MUST copy rows belonging to empresas with an overlapping hold to `lc_fichajes_hold_archive`. `lc_fichajes_hold_archive` MUST have the same immutability guarantees as `lc_fichajes`.

**LC-R-004** — Archived rows MUST be purged at `max(event_date + 4 years, hold_lifted)`. If the 4-year window already elapsed when the hold is lifted, the rows MUST be purged immediately.

**LC-R-005** — `lc_chain_anchors` and `lc_audit_log` MUST be retained beyond any partition drop.

**LC-R-006** — All purge and hold-archive actions MUST be recorded in `lc_audit_log`.

#### Scenario: Partition drop with active hold

- GIVEN empresa A has a legal hold and empresa B does not; both have data in the July-2022 partition
- WHEN the cron job processes the July-2022 partition (4 years elapsed for empresa B)
- THEN empresa A's rows are copied to `lc_fichajes_hold_archive` before the partition is dropped; empresa B's rows are purged on schedule

#### Scenario: Post-hold cleanup — window already elapsed

- GIVEN a hold is lifted 5 years after the event dates in `lc_fichajes_hold_archive`
- WHEN the cleanup job runs
- THEN the archived rows are purged immediately, and the action is logged in `lc_audit_log`

---

## LC-S — Security & RBAC

**LC-S-001** — `REVOKE UPDATE, DELETE` MUST be applied to `lc_fichajes` and `lc_audit_log` for all roles including `service_role` and `authenticated`.

**LC-S-002** — All `lc_*` tables MUST have RLS enabled with `empresa_id` scoping. GRANTs MUST follow the project's migration checklist.

**LC-S-003** — TPV fichaje routes MUST authenticate via the existing `tpv_employee_token`. Routes MUST be scoped to the authenticated employee's own records for write operations.

**LC-S-004** — Admin routes for corrections, hold management, and export MUST call `requireRole(request, ['admin', 'superadmin'])`.

**LC-S-005** — The RLT role MUST be a new role type (`rlt`) with read-only access to `lc_fichajes` and `lc_horas_extra`, scoped to their `centro_id`.

#### Scenario: Anon cannot read fichajes

- GIVEN an unauthenticated request is made to any `lc_*` table
- WHEN the query executes
- THEN RLS returns zero rows or raises an error

#### Scenario: RLT cannot access another centro

- GIVEN an RLT user is assigned to `centro_id = 2`
- WHEN they query fichajes for `centro_id = 3`
- THEN RLS returns zero rows

---

## LC-G — RGPD & Compliance

**LC-G-001** — The legal basis for processing MUST be documented as Art. 6.1.c RGPD (legal obligation). The system MUST display an informative clause in the UI before an employee's first fichaje.

**LC-G-002** — The client's Registro de actividades de tratamiento MUST be updated to include the laborcontrol processing activity.

**LC-G-003** — An EIPD assessment MUST be documented (even if the conclusion is that a full DPIA is not required).

**LC-G-004** — The client onboarding checklist MUST include: an Art. 64.5 ET prior-notification checklist and an RLT prior-report template.

#### Scenario: First fichaje informative clause

- GIVEN an employee has never registered a fichaje in the system
- WHEN they attempt their first fichaje via the TPV
- THEN an informative RGPD clause is displayed and must be dismissed before proceeding

---

## LC-A — Audit Log

**LC-A-001** — `lc_audit_log` MUST record an entry for every action: fichaje, correction, acknowledgment, export, part-time summary generation/delivery, legal hold creation/lifting, hold-archive copy, partition purge, and chain verification run.

**LC-A-002** — Every `lc_audit_log` entry MUST include: `actor`, `timestamp`, `action_type`, `entity_id`, `reason` (where applicable), and `empresa_id`.

**LC-A-003** — `lc_audit_log` MUST share the same immutability guarantees as `lc_fichajes` (LC-D-001, LC-D-002).

#### Scenario: Export action logged

- GIVEN a supervisor generates a PDF export
- WHEN the export is produced
- THEN an entry with `action_type = 'export'`, the actor's identity, and a timestamp is written to `lc_audit_log`

#### Scenario: Audit log row cannot be updated

- GIVEN an `lc_audit_log` row exists
- WHEN an `UPDATE` is attempted
- THEN the trigger raises an exception and the row is unchanged

---

## LC-I — TPV Integration

**LC-I-001** — At TPV login, if the authenticated employee has no `entrada` recorded for the current local day, the system MUST display a "Fichar entrada" prompt.

**LC-I-002** — At TPV logout, if the authenticated employee has an open `entrada` (no matching `salida`), the system MUST display a "Fichar salida" prompt.

**LC-I-003** — Both dialogs MUST be dismissible. A dismissal without fichaje MUST be recorded in `lc_audit_log`.

**LC-I-004** — "Mis fichajes" MUST be accessible from the TPV after PIN re-authentication and MUST auto-lock after the configured inactivity timeout.

#### Scenario: Login prompt shown

- GIVEN it is Monday and employee A has no `entrada` for Monday
- WHEN employee A logs into the TPV
- THEN the "Fichar entrada" dialog is shown before the TPV home screen

#### Scenario: Dismissed login prompt recorded

- GIVEN the "Fichar entrada" dialog is shown
- WHEN the employee dismisses it without fichando
- THEN a `dismissal` entry is written to `lc_audit_log` with the employee and timestamp

---

## LC-X — Offline (Electron TPV)

**LC-X-001** — Offline fichajes MUST be queued in IndexedDB. On queue initialization, the system MUST verify that persistent storage is active. IndexedDB MUST NOT be used without confirming persistence.

**LC-X-002** — Queue contents MUST be minimized to: `empleado_id`, `timestamp_evento`, `tipo`, `centro_id`, `local_hash`. Sensitive fields MUST NOT be stored.

**LC-X-003** — Queue contents MUST be encrypted at rest.

**LC-X-004** — The queue MUST be purged immediately after confirmed sync with the server.

**LC-X-005** — Records MUST be synced in insertion order. The server MUST stamp `timestamp_servidor` on each record at reception; the DB trigger MUST chain them as any other insert.

**LC-X-006** — If queue age exceeds a configurable maximum, the system MUST display a visible alert to prompt reconnection.

#### Scenario: Offline queue synced and purged

- GIVEN 3 fichajes are queued in IndexedDB while offline
- WHEN the Electron TPV reconnects and syncs
- THEN all 3 records are received by the server in insertion order, each gets a `timestamp_servidor`, the chain trigger fires, and the IndexedDB queue is cleared

#### Scenario: Persistence check on init

- GIVEN the Electron TPV starts with a non-persistent IndexedDB storage
- WHEN the offline queue initializes
- THEN the system logs a warning and displays an alert; queueing may be degraded or blocked depending on policy

#### Scenario: Stale queue alert

- GIVEN a fichaje has been queued for longer than the configured max age
- WHEN the TPV detects the age
- THEN a visible alert prompts the operator to reconnect and sync

---

## Open Decisions Carried Into Spec

The following proposal items have configurable defaults specified here; final values are design-phase decisions:

| Item | Default in Spec |
|------|----------------|
| Clock drift threshold | 5 minutes (LC-F-006) |
| TPV self-view inactivity timeout | 60 seconds (LC-V-002) |
| Chain verifier schedule | Daily minimum (LC-C-006) |
| Offline max queue age | Configurable; no default — design phase |
| Employee self-view v1.1 channel (web portal vs PDF) | Deferred to v1.1 |
| Part-time summary digital acknowledgment | Deferred to v1.1 |
