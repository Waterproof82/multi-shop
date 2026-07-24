# LaborControl — Design Review Corrections & Improvement Analysis

> Artifact store: openspec
> Change: laborcontrol
> Phase: design-review
> Date: 2026-07-24
> Status: corrections to be merged into the Technical Design before first migration

This document contains: (1) the full analysis of issues found in the Technical Design, (2) drafted corrections with concrete SQL/TypeScript, (3) consolidated deltas for the spec, the risk table, and the CI test plan.

Severity legend: 🔴 breaks the system or a legal guarantee as written · 🟠 functional gap, required before v1 · 🟡 hardening / minor.

---

## PART 1 — CRITICAL CORRECTIONS

### FIX-01 🔴 Chain tail lookup is ambiguous; batch inserts fork the chain deterministically

**Problem.** The trigger finds `prev_hash` with `ORDER BY timestamp_servidor DESC, created_at DESC`. Three stacked failures:

1. `now()` is **frozen at transaction start**. Any multi-insert transaction (the offline sync is exactly that) produces identical `timestamp_servidor` values → tail order undefined.
2. Worse: in a **multi-row INSERT statement**, the `BEFORE INSERT` trigger of row N does not see rows 1..N-1 of the same statement (the command counter does not advance mid-statement). All rows read the same `prev_hash` → guaranteed fork, advisory lock notwithstanding.
3. Even across separate transactions, timestamp ties are possible.

**Correction — three parts.**

**(a) Monotonic sequence as the chain order.** Plain sequence + default, not `GENERATED ALWAYS AS IDENTITY` (identity columns on partitioned tables are only fully supported from PG 17; a sequence default works everywhere):

```sql
CREATE SEQUENCE public.lc_fichajes_chain_seq AS BIGINT;

-- In the lc_fichajes DDL, add:
--   chain_seq BIGINT NOT NULL DEFAULT nextval('public.lc_fichajes_chain_seq'),
-- and change:
--   timestamp_servidor TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),  -- NOT now()

CREATE INDEX idx_lc_fichajes_empresa_seq ON public.lc_fichajes (empresa_id, chain_seq DESC);
```

Global uniqueness of `chain_seq` is guaranteed by the sequence itself (a partitioned table cannot carry a unique constraint that omits the partition key — document this; it is not a gap). The chain verifier MUST also order by `chain_seq`, never by timestamps.

**(b) Revised tail lookup in the trigger:**

```sql
  SELECT chain_hash INTO v_prev_hash
    FROM public.lc_fichajes
   WHERE empresa_id = NEW.empresa_id
   ORDER BY chain_seq DESC
   LIMIT 1;
```

**(c) Defense in depth: an AFTER trigger that turns any silent fork into a hard failure.** `AFTER` triggers *do* see all rows of the statement, so a batch insert that forked in `BEFORE` is caught here and the transaction aborts:

```sql
CREATE OR REPLACE FUNCTION lc_fichajes_chain_verify_after()
RETURNS TRIGGER AS $
DECLARE
  v_expected TEXT;
BEGIN
  SELECT chain_hash INTO v_expected
    FROM public.lc_fichajes
   WHERE empresa_id = NEW.empresa_id
     AND chain_seq < NEW.chain_seq
   ORDER BY chain_seq DESC
   LIMIT 1;

  IF v_expected IS NULL THEN
    -- first record of a segment: prev_hash must be the last anchor or genesis
    IF NEW.prev_hash NOT IN (
         COALESCE((SELECT final_hash FROM public.lc_chain_anchors
                    WHERE empresa_id = NEW.empresa_id
                    ORDER BY segment_year DESC, segment_month DESC LIMIT 1),
                  'SEGMENT_GENESIS'),
         'SEGMENT_GENESIS')
    THEN
      RAISE EXCEPTION 'lc_fichajes: chain fork detected (genesis mismatch) empresa=%', NEW.empresa_id;
    END IF;
  ELSIF NEW.prev_hash <> v_expected THEN
    RAISE EXCEPTION 'lc_fichajes: chain fork detected at chain_seq=% empresa=%', NEW.chain_seq, NEW.empresa_id;
  END IF;

  RETURN NULL;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER lc_fichajes_chain_verify
  AFTER INSERT ON public.lc_fichajes
  FOR EACH ROW EXECUTE FUNCTION lc_fichajes_chain_verify_after();
```

**(d) Protocol rule (spec-level):** every fichaje insert MUST be a single-row statement. The offline sync loop already POSTs item by item; this rule makes it a hard requirement for any future script or integration. Batch multi-row INSERTs into `lc_fichajes` are prohibited (and now fail loudly instead of corrupting silently).

---

### FIX-02 🔴 Canonical JSON will never match across PL/pgSQL and TypeScript — replace the format

**Problem.** Beyond key ordering (already flagged), `json_build_object(...)::text` emits `{"accion" : null}` — **spaces around colons** — while `JSON.stringify` emits `{"accion":null}`. The hashes can never match. JSON serialization equality across two engines is a minefield (whitespace, unicode escapes, number/bool rendering).

**Correction.** Abandon JSON as the canonical format. Use a versioned, delimiter-separated `key=value` string where **every value comes from a fixed character set** (UUID, enum, hex, bool, timestamp) so no escaping is ever needed. The only free-text field, `motivo`, is included as its own SHA-256 (hex) — fixed charset, identical to compute in both languages.

**Canonical format `v1`:**

```
v1|accion=<val>|actor_id=<val>|centro_id=<val>|empleado_id=<val>|empresa_id=<val>|motivo_sha256=<val>|origen_offline=<true|false>|prev_hash=<val>|record_id=<val>|ref_correccion=<val>|timestamp_evento_utc=<val>|timestamp_servidor_utc=<val>|tipo=<val>
```

- NULL sentinel: the literal two characters `\N`
- Booleans: `true` / `false`
- Timestamps: `YYYY-MM-DDTHH:MI:SS.USZ` — **UTC with 6-digit microseconds** (see precision trap below)
- `motivo_sha256`: `sha256(utf8(motivo))` hex, or `\N` when motivo is null
- Note `actor_id` is now part of the payload (FIX-04)

**PL/pgSQL:**

```sql
CREATE OR REPLACE FUNCTION lc_canonical_payload(
  p_record_id UUID, p_empresa_id UUID, p_centro_id UUID, p_empleado_id UUID,
  p_tipo TEXT, p_accion TEXT, p_ref_correccion UUID,
  p_timestamp_evento TIMESTAMPTZ, p_timestamp_servidor TIMESTAMPTZ,
  p_origen_offline BOOLEAN, p_motivo TEXT, p_actor_id UUID, p_prev_hash TEXT
) RETURNS TEXT AS $
DECLARE
  v_null CONSTANT TEXT := '\N';
BEGIN
  RETURN 'v1'
    || '|accion='                 || COALESCE(p_accion, v_null)
    || '|actor_id='               || COALESCE(p_actor_id::text, v_null)
    || '|centro_id='              || p_centro_id::text
    || '|empleado_id='            || p_empleado_id::text
    || '|empresa_id='             || p_empresa_id::text
    || '|motivo_sha256='          || COALESCE(encode(digest(convert_to(p_motivo,'UTF8'),'sha256'),'hex'), v_null)
    || '|origen_offline='         || CASE WHEN p_origen_offline THEN 'true' ELSE 'false' END
    || '|prev_hash='              || p_prev_hash
    || '|record_id='              || p_record_id::text
    || '|ref_correccion='         || COALESCE(p_ref_correccion::text, v_null)
    || '|timestamp_evento_utc='   || to_char(p_timestamp_evento   AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    || '|timestamp_servidor_utc=' || to_char(p_timestamp_servidor AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    || '|tipo='                   || p_tipo;
END;
$ LANGUAGE plpgsql IMMUTABLE;
```

**TypeScript reference (independent verifier):**

```typescript
import { createHash } from 'crypto';

const NUL = '\\N'; // two chars: backslash + N

function sha256hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/**
 * PRECISION TRAP: Postgres stores timestamptz with microsecond precision; JS Date
 * only has milliseconds. The verifier MUST NOT round-trip timestamps through Date.
 * Read the raw ISO string from PostgREST and reformat textually to 6-digit micros.
 */
export function toCanonicalTs(rawIso: string): string {
  const m = rawIso.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:?00)$/);
  if (!m) throw new Error(`Non-UTC or unparseable timestamp: ${rawIso}`);
  const micros = (m[3] ?? '').padEnd(6, '0');
  return `${m[1]}T${m[2]}.${micros}Z`;
}

export function canonicalPayload(r: {
  recordId: string; empresaId: string; centroId: string; empleadoId: string;
  tipo: string; accion: string | null; refCorreccion: string | null;
  timestampEventoRaw: string; timestampServidorRaw: string; // raw DB strings, NOT Date
  origenOffline: boolean; motivo: string | null; actorId: string; prevHash: string;
}): string {
  return 'v1'
    + `|accion=${r.accion ?? NUL}`
    + `|actor_id=${r.actorId}`
    + `|centro_id=${r.centroId}`
    + `|empleado_id=${r.empleadoId}`
    + `|empresa_id=${r.empresaId}`
    + `|motivo_sha256=${r.motivo == null ? NUL : sha256hex(r.motivo)}`
    + `|origen_offline=${r.origenOffline ? 'true' : 'false'}`
    + `|prev_hash=${r.prevHash}`
    + `|record_id=${r.recordId}`
    + `|ref_correccion=${r.refCorreccion ?? NUL}`
    + `|timestamp_evento_utc=${toCanonicalTs(r.timestampEventoRaw)}`
    + `|timestamp_servidor_utc=${toCanonicalTs(r.timestampServidorRaw)}`
    + `|tipo=${r.tipo}`;
}

export function chainHash(payload: string): string {
  return sha256hex(payload);
}
```

**Mandatory CI test:** insert a record through the API (4 variants: plain, correction, offline, null-motivo), read the raw row via PostgREST, recompute the hash in TS, assert equality with `chain_hash`. Runs on every change to either implementation.

---

### FIX-03 🔴 The "employee sees own fichajes" RLS policy is a tautology — and RLS is the wrong enforcement point for TPV employees

**Problem.** The cajero clause reduces to `empleado_id = empleado_id` (always true): any `authenticated` user of the empresa can read **everyone's** fichajes. Deeper issue: TPV employees authenticate with the `tpv_employee_token` cookie, not Supabase Auth — `auth.uid()` never identifies them, and their requests reach the DB through the service client, which bypasses RLS entirely. RLS cannot scope TPV employees; the API route must.

**Correction.**

**(a) Replace the SELECT policy:**

```sql
DROP POLICY IF EXISTS "Empleado ve sus propios fichajes" ON public.lc_fichajes;

CREATE POLICY "Admin/encargado ve fichajes de su empresa"
  ON public.lc_fichajes FOR SELECT TO authenticated
  USING (
    empresa_id = get_mi_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.perfiles_admin pa
       WHERE pa.user_id = auth.uid()
         AND pa.empresa_id = lc_fichajes.empresa_id
    )
  );
```

**(b) Self-view enforcement lives in the API route** (`GET /api/laborcontrol/fichajes/[empleadoId]`): resolve the employee identity from `tpv_employee_token`; if the token's `empleadoId ≠` the path param and the caller is not an admin JWT, return `403` before any query.

**(c) Spec correction (LC-V):** scenario's THEN clause changes from "(RLS enforced)" to: "the API route rejects the request with 403; the test attacks the route with employee A's token requesting employee B's records."

---

### FIX-04 🔴 `actor_id` is outside the hash — authorship is not tamper-evident

**Problem.** The canonical payload covered `motivo` but not `actor_id`. The draft RD's core traceability requirement is *who/when/why*; the "who" of a correction could be altered without the chain verifier noticing.

**Correction.** `actor_id` is part of the canonical payload (already reflected in FIX-02's format and both implementations). Rule of thumb: **the hash covers every field that constitutes the registered fact; it excludes derived state** (`drift_flag`, `orphan_flag` — removed by FIX-07; `created_at` — redundant with `timestamp_servidor`).

---

### FIX-05 🔴 The hold-archive DDL contradicts its own purge design

**Problem.** The DDL still creates immutability triggers and revokes DELETE from `service_role` on `lc_fichajes_hold_archive`, recreating the exact purge-vs-immutability deadlock resolved in proposal v3.

**Correction — consistent DDL:**

```sql
-- NO immutability triggers on lc_fichajes_hold_archive (see ADR-11).
-- Authenticity proven by copied chain_hash values, verifiable against sealed anchors.

REVOKE UPDATE, DELETE ON public.lc_fichajes_hold_archive FROM authenticated;
-- service_role RETAINS DELETE: the post-hold purge job needs it.
GRANT SELECT, INSERT, DELETE ON public.lc_fichajes_hold_archive TO service_role;
GRANT SELECT                  ON public.lc_fichajes_hold_archive TO authenticated;
```

**ADR-11 — Hold archive is deletable by design.** Authenticity proven via chain hashes; legally mandated purge requires DELETE; every archive DELETE written to `lc_audit_log` (`action_type = 'hold_archive.purge'`).

---

## PART 2 — FUNCTIONAL GAPS (required for v1)

### FIX-06 🟠 The RLT role has no model — table, policies, endpoint

```sql
CREATE TABLE public.lc_rlt_asignaciones (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES public.empresas(id)  ON DELETE RESTRICT,
  user_id     UUID        NOT NULL,
  centro_id   UUID        NOT NULL REFERENCES public.tiendas(id)   ON DELETE RESTRICT,
  activo      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID        NOT NULL,
  UNIQUE (empresa_id, user_id, centro_id)
);

CREATE INDEX idx_lc_rlt_user ON public.lc_rlt_asignaciones (user_id) WHERE activo;

ALTER TABLE public.lc_rlt_asignaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No anon access to lc_rlt_asignaciones"
  ON public.lc_rlt_asignaciones FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve asignaciones de su empresa"
  ON public.lc_rlt_asignaciones FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

GRANT SELECT, INSERT, UPDATE ON public.lc_rlt_asignaciones TO service_role;
GRANT SELECT                  ON public.lc_rlt_asignaciones TO authenticated;
```

**Additional SELECT policies** on `lc_fichajes` and `lc_horas_extra`:

```sql
CREATE POLICY "RLT ve fichajes de su centro"
  ON public.lc_fichajes FOR SELECT TO authenticated
  USING (
    empresa_id = get_mi_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.lc_rlt_asignaciones r
       WHERE r.user_id = auth.uid()
         AND r.empresa_id = lc_fichajes.empresa_id
         AND r.centro_id  = lc_fichajes.centro_id
         AND r.activo
    )
  );
```

**RLT MUST NOT see `motivo` free text** (data-protection limitation). Add `centro_id` to `lc_horas_extra` for direct policy and simpler exports.

**API:** `GET /api/laborcontrol/rlt/fichajes?from=&to=` (auth: authenticated user with active RLT assignment) + admin CRUD for assignments (`requireRole(['admin','superadmin'])`), audit-logged as `rlt.assign` / `rlt.revoke`.

---

### FIX-07 🟠 Acknowledgments and orphan/drift state need a home outside the chain: `lc_review_queue`

```sql
CREATE TABLE public.lc_review_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  centro_id     UUID        NOT NULL,
  empleado_id   UUID        NOT NULL,
  record_id     UUID,
  tipo_revision TEXT        NOT NULL CHECK (tipo_revision IN
                              ('orphan','drift','sync_failed','ack_pendiente','disputa')),
  estado        TEXT        NOT NULL DEFAULT 'pendiente' CHECK (estado IN
                              ('pendiente','visto','disputado','resuelto')),
  detalle       JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ,
  resolved_by   UUID
);

CREATE INDEX idx_lc_review_pendientes ON public.lc_review_queue (empresa_id, estado)
  WHERE estado IN ('pendiente','disputado');
CREATE INDEX idx_lc_review_empleado   ON public.lc_review_queue (empleado_id, created_at DESC);

ALTER TABLE public.lc_review_queue ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.lc_review_queue TO service_role;
GRANT SELECT                  ON public.lc_review_queue TO authenticated;
```

**Consequences:**
- **Drop `orphan_flag` and `drift_flag` from `lc_fichajes`** — registered fact stays pure; workflow lives here.
- Use cases insert queue items: `drift` when above threshold, `orphan` when unpaired, `ack_pendiente` for every correction targeting the affected employee.
- Employee acknowledgment: `POST /api/laborcontrol/fichajes/ack { queueId, accion: 'visto'|'disputado' }` (auth: `tpv_employee_token`; route verifies ownership). `disputado` → audit entry; totals unchanged.
- Supervisor dashboard reads `lc_review_queue WHERE estado IN ('pendiente','disputado')` — indexed, no partition scans.
- Sync failures → `sync_failed` with client payload in `detalle`.

---

### FIX-08 🟠 Nobody seals the anchors — missing cron + function

```sql
CREATE OR REPLACE FUNCTION public.lc_seal_month_anchors(p_year INT, p_month INT)
RETURNS TABLE (empresa_id UUID, final_hash TEXT, record_count BIGINT)
SECURITY DEFINER SET search_path = public AS $
BEGIN
  RETURN QUERY
  WITH tails AS (
    SELECT DISTINCT ON (f.empresa_id)
           f.empresa_id, f.chain_hash,
           COUNT(*) OVER (PARTITION BY f.empresa_id) AS cnt
      FROM public.lc_fichajes f
     WHERE f.timestamp_servidor >= make_timestamptz(p_year, p_month, 1, 0,0,0, 'UTC')
       AND f.timestamp_servidor <  make_timestamptz(p_year, p_month, 1, 0,0,0, 'UTC') + INTERVAL '1 month'
     ORDER BY f.empresa_id, f.chain_seq DESC
  )
  INSERT INTO public.lc_chain_anchors (empresa_id, segment_year, segment_month, final_hash, record_count, sealed_by)
  SELECT t.empresa_id, p_year, p_month, t.chain_hash, t.cnt,
         '00000000-0000-0000-0000-000000000000'
    FROM tails t
  ON CONFLICT (empresa_id, segment_year, segment_month) DO NOTHING
  RETURNING lc_chain_anchors.empresa_id, lc_chain_anchors.final_hash, lc_chain_anchors.record_count;
END;
$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.lc_seal_month_anchors(INT, INT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.lc_seal_month_anchors(INT, INT) TO service_role;
```

**Cron:** day 1 each month, 04:00 UTC — seal previous month → run chain verifier → audit `chain.anchor`. Idempotent (`ON CONFLICT DO NOTHING`).

---

### FIX-09 🟠 Vercel crons cannot run partition DDL as `service_role` — SECURITY DEFINER RPCs

```sql
CREATE OR REPLACE FUNCTION public.lc_create_next_partition()
RETURNS TEXT SECURITY DEFINER SET search_path = public AS $
DECLARE
  v_start DATE := date_trunc('month', now() AT TIME ZONE 'UTC')::date + INTERVAL '1 month';
  v_end   DATE := v_start + INTERVAL '1 month';
  v_name  TEXT := format('lc_fichajes_%s', to_char(v_start, 'YYYY_MM'));
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = v_name) THEN
    RETURN v_name || ' (already exists)';
  END IF;
  EXECUTE format(
    'CREATE TABLE public.%I PARTITION OF public.lc_fichajes FOR VALUES FROM (%L) TO (%L)',
    v_name, v_start, v_end);
  RETURN v_name;
END;
$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.lc_drop_expired_partition(p_name TEXT)
RETURNS TEXT SECURITY DEFINER SET search_path = public AS $
DECLARE v_year INT; v_month INT; v_seg_end TIMESTAMPTZ;
BEGIN
  IF p_name !~ '^lc_fichajes_\d{4}_\d{2}$' THEN
    RAISE EXCEPTION 'lc_drop_expired_partition: invalid partition name %', p_name;
  END IF;
  v_year  := split_part(p_name, '_', 3)::INT;
  v_month := split_part(p_name, '_', 4)::INT;
  v_seg_end := make_timestamptz(v_year, v_month, 1, 0,0,0, 'UTC') + INTERVAL '1 month';

  IF v_seg_end > now() - INTERVAL '4 years' THEN
    RAISE EXCEPTION 'lc_drop_expired_partition: % is inside the retention window', p_name;
  END IF;

  IF EXISTS (
    SELECT 1 FROM (SELECT DISTINCT empresa_id FROM public.lc_fichajes
                    WHERE timestamp_servidor >= v_seg_end - INTERVAL '1 month'
                      AND timestamp_servidor <  v_seg_end) e
     WHERE NOT EXISTS (SELECT 1 FROM public.lc_chain_anchors a
                        WHERE a.empresa_id = e.empresa_id
                          AND a.segment_year = v_year AND a.segment_month = v_month)
  ) THEN
    RAISE EXCEPTION 'lc_drop_expired_partition: unsealed segment(s) in %', p_name;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lc_legal_holds h
     WHERE h.activo
       AND daterange(h.fecha_inicio, h.fecha_fin, '[]')
           && daterange((v_seg_end - INTERVAL '1 month')::date, v_seg_end::date, '[)')
       AND NOT EXISTS (SELECT 1 FROM public.lc_fichajes_hold_archive ar
                        WHERE ar.hold_id = h.id
                          AND ar.timestamp_servidor >= v_seg_end - INTERVAL '1 month'
                          AND ar.timestamp_servidor <  v_seg_end)
  ) THEN
    RAISE EXCEPTION 'lc_drop_expired_partition: active hold not yet archived for %', p_name;
  END IF;

  EXECUTE format('DROP TABLE public.%I', p_name);
  RETURN p_name || ' dropped';
END;
$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.lc_create_next_partition()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lc_drop_expired_partition(TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.lc_create_next_partition()      TO service_role;
GRANT  EXECUTE ON FUNCTION public.lc_drop_expired_partition(TEXT) TO service_role;
```

Guards: (1) strict name pattern, (2) retention window, (3) sealed anchor required, (4) holds archived. Guard 3 makes anchor-sealing (FIX-08) a hard precondition of any purge.

---

### FIX-10 🟠 Online fichajes while the offline queue is non-empty cause avoidable sequence violations

**Rule (spec-level, LC-X):** if the offline queue contains any `pending` item for the device, every new fichaje is appended to the queue (never sent directly) and an immediate flush is triggered.

```typescript
async function registrarFichaje(evento: FichajeInput) {
  const pending = await queue.countPending();
  if (!navigator.onLine || pending > 0) {
    await queue.enqueue(evento);
    if (navigator.onLine) void triggerSync();
    return { queued: true };
  }
  return await postFichaje(evento);
}
```

---

## PART 3 — MINOR HARDENING

**H-01** PIN cache scoped per `(empresaId, centroId)`, not just empresa — smaller attack surface on device theft.

**H-02** Persist PIN rate-limit counter in `electron-store` (in-memory resets on restart = attacker's move).

**H-03** `ref_correccion` cannot be a real FK (partitioned table PK includes partition key). Document in DDL; validate existence + same empresa + not already annulled in `RegistrarCorreccion` use case. All lookups by `record_id` must include `empresa_id` for partition pruning.

**H-04** Export routes: `export const dynamic = 'force-dynamic'` + `Cache-Control: no-store` on all export/summary routes.

**H-05** Verify assumed primitives (`perfiles_admin`, `get_mi_empresa_id()`, `tiendas`) against live schema before writing any policy.

**H-06** System actor UUID: define `LC_SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000'` as a documented constant used by all automated jobs.

**H-07** Chain verifier and export queries: order by `chain_seq` for chain semantics, by legal event time for reporting — never mix the two meanings in one query.

---

## PART 4 — CONSOLIDATED DELTAS

### 4.1 Spec deltas

| ID | Change |
|----|--------|
| **LC-C-008 (new)** | `lc_fichajes` MUST carry a globally monotonic `chain_seq` (sequence-backed). Chain order and tail lookup MUST use `chain_seq`, never timestamps. `timestamp_servidor` default MUST be `clock_timestamp()`. |
| **LC-C-009 (new)** | An `AFTER INSERT` trigger MUST verify `prev_hash` equals the predecessor's `chain_hash` (or segment genesis) and abort the transaction on mismatch. |
| **LC-C-010 (new)** | Fichaje inserts MUST be single-row statements. Multi-row INSERT into `lc_fichajes` is prohibited. |
| **LC-C-002 (modified)** | Canonical format is the versioned `v1\|key=value` string (fixed-charset values, `\N` null sentinel, 6-digit-microsecond UTC timestamps, `motivo_sha256`). `actor_id` IS part of the payload. |
| **LC-C-011 (new)** | Monthly anchors MUST be sealed by a scheduled job on day 1; sealing is a hard precondition for dropping the corresponding partition. |
| **LC-V-001/scenario (modified)** | Employee self-view isolation is enforced at the API route (token identity vs. requested employee); RLS scopes only browser-authenticated roles. |
| **LC-V-005 (new)** | RLT access modeled via `lc_rlt_asignaciones`; RLT views MUST NOT expose `motivo` free text. |
| **LC-K-006 (new)** | Workflow state (orphan, drift, sync-failure, acknowledgment, dispute) lives in mutable `lc_review_queue`. `orphan_flag`/`drift_flag` removed from `lc_fichajes`. Every state transition mirrored to `lc_audit_log`. |
| **LC-R-007 (new)** | Partition create/drop run via `SECURITY DEFINER` RPCs with internal guards. |
| **LC-R-003 (modified)** | `lc_fichajes_hold_archive` carries NO immutability triggers; `service_role` retains DELETE (ADR-11). |
| **LC-X-007 (new)** | If the offline queue has any pending item, new fichajes MUST be enqueued and an immediate flush triggered — FIFO order preserved by construction. |
| **LC-S-006 (new)** | Offline PIN cache scoped per centro; rate-limit counter persisted on device. |

### 4.2 Risk table (updated)

| Risk | Severity | Status |
|------|----------|--------|
| Chain fork on batch/concurrent insert | 🔴 | Resolved: `chain_seq` + `clock_timestamp()` + AFTER-verify trigger + single-row rule |
| Canonical hash mismatch PL/pgSQL vs TS | 🔴 | Resolved: pipe-separated format; CI equality test mandatory |
| Tautological RLS exposes all fichajes | 🔴 | Resolved: route-level 403 enforcement |
| `actor_id` outside tamper evidence | 🔴 | Resolved: included in canonical payload |
| Hold-archive purge deadlocked by own triggers | 🔴 | Resolved: ADR-11 |
| RLT unmodeled | 🟠 | Resolved: `lc_rlt_asignaciones` + policies + endpoint |
| Acknowledgments/orphan state homeless | 🟠 | Resolved: `lc_review_queue` |
| Anchors never sealed | 🟠 | Resolved: seal function + cron; purge guard enforces it |
| Cron cannot run partition DDL | 🟠 | Resolved: SECURITY DEFINER RPCs with guards |
| Online-after-offline sequence violations | 🟠 | Resolved: queue-first rule |
| Hard-delete empleado vs FK RESTRICT | 🔴 | In-scope fix: admin delete flow → soft-delete when `lc_perfil_laboral` exists |
| `publish_via_partition_root` plan support | 🟡 | Verify early; fallback = 10s polling |
| Vercel 60s timeout on large PDF | 🟡 | Stream per employee; background job beyond ~50 |

### 4.3 CI / integration test plan (10 tests)

1. **Hash equality**: 4 insert variants → TS recompute → assert equal to `chain_hash`
2. **Fork under concurrency**: 50 parallel inserts same empresa → verifier OK; no duplicate `prev_hash`
3. **Batch insert rejected**: 3-row INSERT → transaction aborts with chain-fork exception
4. **Peer access via route**: employee A token → B's fichajes → 403; admin JWT → 200; authenticated non-admin direct PostgREST → 0 rows
5. **RLT scoping**: RLT centro 2 queries centro 3 → 0 rows; centro 2 → rows without `motivo`
6. **Ack flow**: correction → `ack_pendiente` → employee `disputado` → estado updated + audit; totals unchanged
7. **Purge guards**: drop on unsealed segment → exception; on unarchived hold → exception; happy path drops and audits
8. **Queue ordering**: enqueue `entrada` offline, go online, register `salida` → both delivered in order, no `LC_SEQUENCE_VIOLATION`
9. **Tamper detection**: manual `chain_hash` edit → verifier BROKEN + alert
10. **Empleado hard-delete**: delete employee with perfil → FK error; admin UI path uses `setActivo(false)`

### 4.4 Migration order (updated)

1. `lc_perfil_laboral`, `lc_rlt_asignaciones`
2. Sequence + `lc_fichajes` (with `chain_seq`, WITHOUT orphan/drift flags) + partitions current & next month + canonical function + BEFORE INSERT trigger + AFTER verify trigger + immutability triggers + corrected RLS/GRANTs
3. `lc_chain_anchors` (+ seal function), `lc_legal_holds`, `lc_fichajes_hold_archive` (ADR-11 DDL), `lc_audit_log`, `lc_review_queue`, `lc_horas_extra` (+ `centro_id`)
4. Partition-management SECURITY DEFINER functions + Realtime publication config
5. App-layer: empleado soft-delete fix in admin UI (same change set)

---

## Closing note

With these corrections merged, every guarantee the module advertises is enforced at the database layer or covered by a CI test that fails loudly: the chain cannot fork silently, the hash is reproducible by an independent verifier, access isolation is tested at its real enforcement point, and every scheduled job (partition create, anchor seal, purge, verify) exists, has the privileges it needs, and audits itself.
