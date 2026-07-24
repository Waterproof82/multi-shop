# Technical Design: Labor Control (Fichaje Digital)

> Artifact store: openspec
> Change: laborcontrol
> Phase: design
> Date: 2026-07-24

---

## Open Decisions — Closed

| # | Decision | Resolution | Rationale |
|---|----------|------------|-----------|
| 1 | Employee self-view v1.1 channel | **Auto-generated PDF** | No new auth surface; web portal in v2 |
| 2 | Drift threshold | **5 minutes** (configurable via `empresa_settings`, default 5 min) | Above threshold flags record for supervisor review; does not block |
| 3 | Chain segment period | **Monthly** | Aligns with partitions and payroll cycles; 48 partitions over 4 years is manageable |
| 4 | PDF/Excel library | **`@react-pdf/renderer` (PDF) + `exceljs` (Excel)** | Neither exists in package.json. `@react-pdf/renderer` is React-native and SSR-safe; renders in Node during Next.js API route. `exceljs` has a full streaming API (critical for large date ranges) and is the most-maintained option. `pdfkit` was considered but requires lower-level layout management incompatible with the existing component-first codebase |
| 5 | Part-time summary delivery v1 | **Generate PDF on demand via export layer; admin downloads and delivers alongside payslip** | Audit log records generation event as proof of compliance; digital acknowledgment deferred to v1.1 with web portal |
| 6 | TPV self-view inactivity timeout | **60 seconds** (configurable per empresa, default 60s) | Balances usability vs. shared-device privacy risk |

---

## Codebase Findings

### CRITICAL: Empleado offboarding path

`SupabaseEmpleadoTpvRepository.delete()` performs a **hard DELETE** (line 93–104). Once `lc_perfil_laboral` adds `FK (empleado_id) REFERENCES empleados_tpv(id) ON DELETE RESTRICT`, any hard delete of an employee with fichajes will be rejected at DB level with a foreign-key violation.

**Required fix**: the admin UI employee-delete flow must check for `lc_perfil_laboral` existence and redirect to `setActivo(false, empresaId)` (soft-delete / offboarding). Hard delete is only permitted when no `lc_perfil_laboral` record exists (i.e., employee was never enrolled in LaborControl).

The `activo` column already exists on `empleados_tpv` — offboarding = `setActivo(id, empresaId, false)`. No schema change needed on `empleados_tpv`.

### PDF/Excel libraries

Neither `@react-pdf/renderer`, `pdfkit`, nor `exceljs`/`xlsx` appears in `package.json`. Both must be added as production dependencies.

### Existing immutability precedent

`tpv_turnos_inalterabilidad` migration (20260714000001) already uses `BEFORE DELETE` and `BEFORE UPDATE` triggers with `RAISE EXCEPTION`. The laborcontrol module follows the same pattern. `pgcrypto` (`encode(digest(...,'sha256'),'hex')`) is already enabled from migration 20260703000001.

### Existing audit_log

`public.audit_log` exists and is used by the general TPV/admin flow. LaborControl uses a **separate** `lc_audit_log` table with its own immutability triggers and RLT-scoped RLS, to keep legal compliance audit trails independent of general operations.

---

## Architecture Decision Records

### ADR-01 — Bounded context vs. separate service

**Decision**: Bounded context inside the same repo and Supabase project.

**Rationale**: LaborControl reuses `empleados_tpv` identity, TPV PIN auth, shop/tienda as `centro_id`, and Supabase Realtime. Extracting to a separate service would require duplicating auth, a cross-service identity bridge, and additional infra (a second Supabase project or schema isolation). The compliance surface is entirely within the existing tenant model. All tables are namespaced `lc_*` to provide clear bounded-context separation without service extraction.

**Rejected**: Separate microservice — over-engineering at current scale; adds network latency to the fichaje hot path; duplicates identity management.

---

### ADR-02 — Partition key: timestamp_servidor vs. timestamp_evento

**Decision**: `timestamp_servidor` (server reception time).

**Rationale**: The chain orders by server insertion. An offline fichaje with `timestamp_evento = July 31` synced on August 2 belongs to the **August chain segment** — it was chained into August's chain, not July's. If partitioned by `timestamp_evento`, this row would live in the July partition. Dropping the July partition after 4 years would tear a row out of the middle of the August chain, breaking segment verification. Partitioning by `timestamp_servidor` makes partitions and segments perfectly aligned by construction. Retention is slightly conservative (≥4 years from event date), which is the legally safe side.

**Rejected**: `timestamp_evento` — breaks the partition/segment alignment invariant; requires special casing for every late sync.

---

### ADR-03 — BEFORE INSERT trigger for chaining vs. application-level chaining

**Decision**: `BEFORE INSERT` Postgres trigger.

**Rationale**: If chaining were done at the application layer (use case or repository), any insert that bypasses the application (service_role direct insert, support scripts, Supabase Studio, future integrations) would produce an unchained row, silently forking the chain. The trigger guarantees every insert through any path is chained. This is the same pattern used by `tpv_turno_hash_insert` already in production.

**Rejected**: Application-level chaining — bypassable, creates audit risk, requires all insert paths to implement the same algorithm correctly.

---

### ADR-04 — pg_advisory_xact_lock for chain serialization

**Decision**: `pg_advisory_xact_lock(hashtext(empresa_id::text)::bigint)` inside the BEFORE INSERT trigger.

**Rationale**: Without serialization, two concurrent fichaje inserts from two TPVs of the same empresa can both read the same `prev_hash` (the current chain tail) and produce two rows with identical `prev_hash`, forking the chain. The advisory lock is per-empresa (keyed by `hashtext` of the UUID empresa_id) and transaction-scoped (released automatically on commit/rollback). A hash collision between two different empresas results in them sharing a lock — extra serialization, never a correctness error; this is documented so nobody "fixes" it incorrectly.

**Rejected**: Application-level locking (Redis/Upstash) — doesn't protect service_role inserts; adds Redis dependency to a DB-trigger concern; risk of deadlock if app crashes between lock acquisition and release.

**Rejected**: `SERIALIZABLE` transaction isolation — too broad; slows all concurrent reads on the table.

---

### ADR-05 — DROP PARTITION as purge mechanism

**Decision**: Purge = `DROP PARTITION` (DDL), not row-level `DELETE`.

**Rationale**: `lc_fichajes` has a `BEFORE DELETE` trigger that raises an exception for every row deletion (immutability). Purging via `DELETE` would be blocked. `DROP PARTITION` operates at DDL level, bypasses the row trigger, and is the correct PostgreSQL mechanism for range-partition retention. It also improves range-query performance by eliminating old partitions from the query planner. The purge job checks `lc_legal_holds` before dropping; rows of empresas with overlapping holds are copied to `lc_fichajes_hold_archive` first.

**Rejected**: Soft-delete columns + periodic DELETE — conflicts with immutability trigger; violates the RGPD minimization principle (data still readable after retention window).

---

### ADR-06 — IndexedDB vs. localStorage for offline queue

**Decision**: IndexedDB.

**Rationale**: The offline queue may accumulate fichajes over a multi-hour network outage (restaurant close/reopen cycle). `localStorage` has a 5–10 MB quota in most browsers and is synchronous, blocking the UI thread on large payloads. IndexedDB is async, supports structured data, survives app crashes without corruption, and allows persistent storage requests (via `navigator.storage.persist()`). The queue is initialized with a persistence check on startup; failure to obtain persistent storage triggers a user-visible alert.

**Electron note**: Electron's IndexedDB is backed by LevelDB in the user data directory — same persistence guarantees as native storage. `localStorage` in Electron is cleared on `session.clearStorageData()` calls, which some update flows trigger.

**Rejected**: `localStorage` — synchronous, small quota, no structured query, cleared by some Electron update flows.

---

### ADR-07 — argon2 vs. bcrypt for offline PIN cache

**Decision**: **bcrypt** (work factor 12) for the offline PIN hash cache.

**Rationale**: 4-digit PINs have only 10,000 combinations — brute-forceable in seconds if the cache is extracted as plaintext hashes. A slow hash (bcrypt/argon2) with per-device salt (stored in `electron-store`) raises the cost to minutes/hours per PIN. `argon2` is the stronger choice algorithmically, but `node-argon2` requires native bindings that must be rebuilt per Electron target via `electron-rebuild` — adding build complexity and a potential Windows build failure. The project already uses `electron-rebuild` in the build pipeline (package.json `build:electron:rebuild`), so this is viable, but `bcrypt` via `bcryptjs` (pure JS, no native bindings) is safer for cross-platform Electron builds and already achieves the necessary latency at work factor 12 (~200ms on commodity hardware). If argon2 native bindings are verified to build cleanly in CI, it can be upgraded without changing the interface.

**Rejected**: argon2 — stronger but native bindings add build risk on Windows; deferred to post-v1 if bcryptjs proves insufficient.

**Rejected**: SHA-256 (fast hash) — unacceptable for 4-digit PIN protection; brute-forceable in <1s.

---

### ADR-08 — PDF library: @react-pdf/renderer

**Decision**: `@react-pdf/renderer`.

**Rationale**: The codebase is React 19 + Next.js 16. `@react-pdf/renderer` renders JSX to PDF in Node.js (SSR-safe) — the export route handler calls `renderToStream()` and pipes it to the response, no browser DOM required. The component model maps naturally to the existing design system vocabulary (rows, columns, styled text). No native bindings; pure JS.

**Rejected**: `pdfkit` — imperative API requires manual coordinate-based layout; mismatches the component-first codebase; no React integration.

**Rejected**: Puppeteer/headless Chrome — heavy, requires a running browser in a serverless/Vercel context; not practical.

---

### ADR-09 — Excel library: exceljs

**Decision**: `exceljs`.

**Rationale**: Streaming write via `WorkbookWriter` (important for large date-range exports); full cell formatting API (date formats, number formats, column widths); actively maintained; TypeScript types included. No native bindings.

**Rejected**: `xlsx` (SheetJS community edition) — license changed in 2023; Pro required for streaming; read-heavy API design.

**Rejected**: `csv` (plain text) — insufficient; clients expect formatted Excel with headers, date formatting, and multiple sheets (daily totals + monthly summary).

---

### ADR-10 — Correction model: append-only supersede vs. soft-delete

**Decision**: Append-only supersede — corrections create new records (`tipo='correccion'`, `accion IN ('rectificar','anular')`, `ref_correccion = original_record_id`, mandatory `motivo`, `actor_id`).

**Rationale**: The draft RD explicitly prohibits unilateral modification of registered fichajes. Any approach that mutates the original record (UPDATE) or hides it (soft-delete with a flag) is legally insufficient — the original must remain readable in the history. The supersede model satisfies: (a) immutability of originals, (b) correct computation via a supersede resolution function (latest valid version wins), (c) full audit trail of who/when/why for every correction, (d) correction chains (correcting a correction). The orphan-flag propagation on anulación (annulling one half of an entrada/salida pair orphans the remaining half) is handled by the `RegistrarCorreccion` use case after insert.

**Rejected**: Soft-delete with `superseded_by` FK on the original — mutates the original row (violates immutability trigger); requires UPDATE permission.

**Rejected**: Separate correction table — splits the chain; corrections must be in the chain to be tamper-evident.

---

## Database Schema

> All migrations follow the project checklist: RLS + explicit GRANTs + `empresa_id` scoping + `get_mi_empresa_id()`.
> Migration file naming convention: `20260800000001_laborcontrol_*.sql` (use date stamps at implementation time).

### Table 1: `lc_perfil_laboral`

```sql
CREATE TABLE public.lc_perfil_laboral (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  empleado_id           UUID        NOT NULL REFERENCES public.empleados_tpv(id) ON DELETE RESTRICT,
  centro_id             UUID        NOT NULL REFERENCES public.tiendas(id)  ON DELETE RESTRICT,
  jornada_teorica_horas NUMERIC(5,2) NOT NULL CHECK (jornada_teorica_horas > 0),
  tipo_contrato         TEXT        NOT NULL CHECK (char_length(tipo_contrato) <= 100),
  tiempo_parcial        BOOLEAN     NOT NULL DEFAULT false,
  convenio              TEXT        CHECK (char_length(convenio) <= 200),
  timezone              TEXT        NOT NULL DEFAULT 'Europe/Madrid' CHECK (char_length(timezone) <= 60),
  activo                BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, empleado_id)           -- one profile per employee per empresa
);

CREATE INDEX idx_lc_perfil_laboral_empresa   ON public.lc_perfil_laboral (empresa_id);
CREATE INDEX idx_lc_perfil_laboral_centro    ON public.lc_perfil_laboral (centro_id);
CREATE INDEX idx_lc_perfil_laboral_empleado  ON public.lc_perfil_laboral (empleado_id);

ALTER TABLE public.lc_perfil_laboral ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No anon access to lc_perfil_laboral"
  ON public.lc_perfil_laboral FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve su empresa lc_perfil_laboral"
  ON public.lc_perfil_laboral FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin gestiona lc_perfil_laboral"
  ON public.lc_perfil_laboral FOR INSERT TO authenticated
  WITH CHECK (empresa_id = get_mi_empresa_id());

CREATE POLICY "Admin actualiza lc_perfil_laboral"
  ON public.lc_perfil_laboral FOR UPDATE TO authenticated
  USING (empresa_id = get_mi_empresa_id())
  WITH CHECK (empresa_id = get_mi_empresa_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lc_perfil_laboral TO service_role;
GRANT SELECT, INSERT, UPDATE           ON public.lc_perfil_laboral TO authenticated;
```

> `tiendas` is the existing shop/store table mapped as `centro de trabajo`. Confirm exact table name at implementation time (may be `shops` or `tiendas`).

---

### Table 2: `lc_fichajes` (partitioned)

```sql
-- Parent table — partitioned by timestamp_servidor (server reception time, NOT event time)
CREATE TABLE public.lc_fichajes (
  record_id           UUID        NOT NULL DEFAULT gen_random_uuid(),
  empresa_id          UUID        NOT NULL,
  centro_id           UUID        NOT NULL,
  empleado_id         UUID        NOT NULL,
  tipo                TEXT        NOT NULL CHECK (tipo IN ('entrada','salida','inicio_pausa','fin_pausa','correccion')),
  accion              TEXT        CHECK (accion IN ('rectificar','anular')),
  ref_correccion      UUID,           -- points to the record_id being corrected/annulled
  timestamp_evento    TIMESTAMPTZ NOT NULL,
  timestamp_servidor  TIMESTAMPTZ NOT NULL DEFAULT now(),
  origen_offline      BOOLEAN     NOT NULL DEFAULT false,
  motivo              TEXT        CHECK (char_length(motivo) <= 500),
  actor_id            UUID        NOT NULL,  -- empleado_id or admin UUID who performed the action
  drift_flag          BOOLEAN     NOT NULL DEFAULT false,
  orphan_flag         BOOLEAN     NOT NULL DEFAULT false,
  chain_hash          TEXT        NOT NULL,  -- computed by BEFORE INSERT trigger
  prev_hash           TEXT        NOT NULL,  -- set by BEFORE INSERT trigger; 'SEGMENT_GENESIS' for first record
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Constraints
  CONSTRAINT lc_fichajes_empresa_fk   FOREIGN KEY (empresa_id)  REFERENCES public.empresas(id)       ON DELETE RESTRICT,
  CONSTRAINT lc_fichajes_centro_fk    FOREIGN KEY (centro_id)   REFERENCES public.tiendas(id)         ON DELETE RESTRICT,
  CONSTRAINT lc_fichajes_empleado_fk  FOREIGN KEY (empleado_id) REFERENCES public.empleados_tpv(id)   ON DELETE RESTRICT,
  CONSTRAINT lc_fichajes_correccion_check CHECK (
    (tipo = 'correccion' AND accion IS NOT NULL AND motivo IS NOT NULL)
    OR (tipo != 'correccion' AND accion IS NULL)
  ),
  PRIMARY KEY (record_id, timestamp_servidor)  -- composite PK required for partitioned tables
) PARTITION BY RANGE (timestamp_servidor);

-- Monthly partitions created by a maintenance job or DDL script at implementation
-- Example for August 2026:
-- CREATE TABLE public.lc_fichajes_2026_08
--   PARTITION OF public.lc_fichajes
--   FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

-- Indexes on parent table (inherited by partitions automatically in PG 11+)
CREATE INDEX idx_lc_fichajes_empresa_ts      ON public.lc_fichajes (empresa_id, timestamp_servidor DESC);
CREATE INDEX idx_lc_fichajes_empleado_ts     ON public.lc_fichajes (empleado_id, timestamp_servidor DESC);
CREATE INDEX idx_lc_fichajes_centro_ts       ON public.lc_fichajes (centro_id, timestamp_servidor DESC);
CREATE INDEX idx_lc_fichajes_ref_correccion  ON public.lc_fichajes (ref_correccion) WHERE ref_correccion IS NOT NULL;
CREATE INDEX idx_lc_fichajes_orphan          ON public.lc_fichajes (empresa_id, orphan_flag) WHERE orphan_flag = true;

-- Immutability: block all UPDATE and DELETE at row level
CREATE OR REPLACE FUNCTION lc_fichajes_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'lc_fichajes: registro inmutable — use correccion con tipo=correccion (RD-Ley 8/2019 / Art.34.9 ET)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lc_fichajes_no_delete
  BEFORE DELETE ON public.lc_fichajes
  FOR EACH ROW EXECUTE FUNCTION lc_fichajes_block_mutation();

CREATE TRIGGER lc_fichajes_no_update
  BEFORE UPDATE ON public.lc_fichajes
  FOR EACH ROW EXECUTE FUNCTION lc_fichajes_block_mutation();

-- REVOKE on parent propagates to partitions via inheritance
REVOKE UPDATE, DELETE ON public.lc_fichajes FROM authenticated;
REVOKE UPDATE, DELETE ON public.lc_fichajes FROM service_role;

-- RLS
ALTER TABLE public.lc_fichajes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No anon access to lc_fichajes"
  ON public.lc_fichajes FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Empleado ve sus propios fichajes"
  ON public.lc_fichajes FOR SELECT TO authenticated
  USING (
    empresa_id = get_mi_empresa_id()
    AND (
      -- Admin/encargado sees all for their empresa
      EXISTS (SELECT 1 FROM public.perfiles_admin WHERE user_id = auth.uid() AND empresa_id = lc_fichajes.empresa_id)
      -- Cajero sees only own records
      OR empleado_id = (SELECT id FROM public.empleados_tpv WHERE empresa_id = lc_fichajes.empresa_id AND id = lc_fichajes.empleado_id LIMIT 1)
    )
  );

-- INSERT only via service_role (API routes use service client); authenticated cannot insert directly
CREATE POLICY "Solo service_role inserta fichajes"
  ON public.lc_fichajes FOR INSERT TO authenticated
  WITH CHECK (false);

GRANT SELECT, INSERT ON public.lc_fichajes TO service_role;
GRANT SELECT         ON public.lc_fichajes TO authenticated;
```

---

### Chain Hash Trigger (BEFORE INSERT on `lc_fichajes`)

```sql
-- Canonical JSON serialization function (sorted keys, deterministic)
CREATE OR REPLACE FUNCTION lc_canonical_json(
  p_record_id           UUID,
  p_empresa_id          UUID,
  p_centro_id           UUID,
  p_empleado_id         UUID,
  p_tipo                TEXT,
  p_accion              TEXT,
  p_ref_correccion      UUID,
  p_timestamp_evento    TIMESTAMPTZ,
  p_timestamp_servidor  TIMESTAMPTZ,
  p_origen_offline      BOOLEAN,
  p_motivo              TEXT,
  p_prev_hash           TEXT
) RETURNS TEXT AS $$
BEGIN
  -- Keys in alphabetical order, explicit nulls, ISO 8601 UTC timestamps
  RETURN json_build_object(
    'accion',                 p_accion,
    'centro_id',              p_centro_id,
    'empresa_id',             p_empresa_id,
    'empleado_id',            p_empleado_id,
    'motivo',                 p_motivo,
    'origen_offline',         p_origen_offline,
    'prev_hash',              p_prev_hash,
    'record_id',              p_record_id,
    'ref_correccion',         p_ref_correccion,
    'timestamp_evento_utc',   to_char(p_timestamp_evento  AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'timestamp_servidor_utc', to_char(p_timestamp_servidor AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'tipo',                   p_tipo
  )::TEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Chain hash BEFORE INSERT trigger
CREATE OR REPLACE FUNCTION lc_fichajes_before_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_prev_hash  TEXT;
  v_anchor     TEXT;
  v_lock_key   BIGINT;
  v_payload    TEXT;
BEGIN
  -- Serialize chain writes per empresa using advisory transaction lock
  -- hashtext returns int4 (may collide across empresas — documented, not a correctness bug)
  v_lock_key := hashtext(NEW.empresa_id::TEXT)::BIGINT;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Find the current chain tail for this empresa
  SELECT chain_hash INTO v_prev_hash
    FROM public.lc_fichajes
   WHERE empresa_id = NEW.empresa_id
   ORDER BY timestamp_servidor DESC, created_at DESC
   LIMIT 1;

  IF v_prev_hash IS NULL THEN
    -- Check if there is a sealed anchor for the previous segment
    SELECT final_hash INTO v_anchor
      FROM public.lc_chain_anchors
     WHERE empresa_id = NEW.empresa_id
     ORDER BY segment_year DESC, segment_month DESC
     LIMIT 1;

    v_prev_hash := COALESCE(v_anchor, 'SEGMENT_GENESIS');
  END IF;

  NEW.prev_hash := v_prev_hash;

  v_payload := lc_canonical_json(
    NEW.record_id,
    NEW.empresa_id,
    NEW.centro_id,
    NEW.empleado_id,
    NEW.tipo,
    NEW.accion,
    NEW.ref_correccion,
    NEW.timestamp_evento,
    NEW.timestamp_servidor,
    NEW.origen_offline,
    NEW.motivo,
    v_prev_hash
  );

  NEW.chain_hash := encode(digest(v_payload, 'sha256'), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lc_fichajes_chain_insert
  BEFORE INSERT ON public.lc_fichajes
  FOR EACH ROW EXECUTE FUNCTION lc_fichajes_before_insert();
```

---

### Realtime Publication

```sql
-- Configure Supabase Realtime to surface partition inserts as root-table events
-- Run after creating the publication (Supabase enables publication by default)
ALTER PUBLICATION supabase_realtime ADD TABLE public.lc_fichajes;

-- publish_via_partition_root ensures partition INSERTs appear as lc_fichajes events
-- This setting is set at the publication level:
-- ALTER PUBLICATION supabase_realtime SET (publish_via_partition_root = true);
-- Note: verify Supabase version supports this; test with integration test per proposal success criteria
```

---

### Table 3: `lc_chain_anchors`

```sql
CREATE TABLE public.lc_chain_anchors (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  segment_year   INTEGER     NOT NULL CHECK (segment_year >= 2026),
  segment_month  INTEGER     NOT NULL CHECK (segment_month BETWEEN 1 AND 12),
  final_hash     TEXT        NOT NULL CHECK (char_length(final_hash) = 64),  -- SHA-256 hex
  record_count   BIGINT      NOT NULL CHECK (record_count >= 0),
  sealed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sealed_by      UUID        NOT NULL,  -- actor_id (admin or system job)
  UNIQUE (empresa_id, segment_year, segment_month)
);

CREATE INDEX idx_lc_chain_anchors_empresa ON public.lc_chain_anchors (empresa_id, segment_year DESC, segment_month DESC);

-- Immutability: anchors are permanent
CREATE OR REPLACE FUNCTION lc_chain_anchors_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'lc_chain_anchors: immutable once sealed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lc_chain_anchors_no_update
  BEFORE UPDATE ON public.lc_chain_anchors
  FOR EACH ROW EXECUTE FUNCTION lc_chain_anchors_block_mutation();

CREATE TRIGGER lc_chain_anchors_no_delete
  BEFORE DELETE ON public.lc_chain_anchors
  FOR EACH ROW EXECUTE FUNCTION lc_chain_anchors_block_mutation();

REVOKE UPDATE, DELETE ON public.lc_chain_anchors FROM authenticated;
REVOKE UPDATE, DELETE ON public.lc_chain_anchors FROM service_role;

ALTER TABLE public.lc_chain_anchors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No anon access to lc_chain_anchors"
  ON public.lc_chain_anchors FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve sus anchors"
  ON public.lc_chain_anchors FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

GRANT SELECT, INSERT ON public.lc_chain_anchors TO service_role;
GRANT SELECT         ON public.lc_chain_anchors TO authenticated;
```

---

### Table 4: `lc_horas_extra`

```sql
CREATE TABLE public.lc_horas_extra (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  empleado_id      UUID        NOT NULL REFERENCES public.empleados_tpv(id) ON DELETE RESTRICT,
  fecha            DATE        NOT NULL,
  horas_extra      NUMERIC(5,2) NOT NULL CHECK (horas_extra > 0),
  compensacion     TEXT        NOT NULL CHECK (compensacion IN ('salario', 'descanso')),
  notas            TEXT        CHECK (char_length(notas) <= 500),
  registrado_por   UUID        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, empleado_id, fecha)
);

CREATE INDEX idx_lc_horas_extra_empresa    ON public.lc_horas_extra (empresa_id);
CREATE INDEX idx_lc_horas_extra_empleado   ON public.lc_horas_extra (empleado_id, fecha DESC);

ALTER TABLE public.lc_horas_extra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No anon access to lc_horas_extra"
  ON public.lc_horas_extra FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin gestiona horas_extra"
  ON public.lc_horas_extra FOR ALL TO authenticated
  USING (empresa_id = get_mi_empresa_id())
  WITH CHECK (empresa_id = get_mi_empresa_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lc_horas_extra TO service_role;
GRANT SELECT, INSERT, UPDATE         ON public.lc_horas_extra TO authenticated;
```

---

### Table 5: `lc_legal_holds`

```sql
CREATE TABLE public.lc_legal_holds (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  empleado_id   UUID        REFERENCES public.empleados_tpv(id) ON DELETE RESTRICT,  -- null = hold for entire empresa
  fecha_inicio  DATE        NOT NULL,
  fecha_fin     DATE        NOT NULL CHECK (fecha_fin >= fecha_inicio),
  motivo        TEXT        NOT NULL CHECK (char_length(motivo) <= 1000),
  actor_id      UUID        NOT NULL,
  activo        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  lifted_at     TIMESTAMPTZ
);

CREATE INDEX idx_lc_legal_holds_empresa  ON public.lc_legal_holds (empresa_id, activo);
CREATE INDEX idx_lc_legal_holds_empleado ON public.lc_legal_holds (empleado_id) WHERE empleado_id IS NOT NULL;

ALTER TABLE public.lc_legal_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No anon access to lc_legal_holds"
  ON public.lc_legal_holds FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve sus holds"
  ON public.lc_legal_holds FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

-- Only superadmin/service_role can create/modify holds (enforced at API layer via requireRole)
CREATE POLICY "Solo service_role gestiona holds"
  ON public.lc_legal_holds FOR INSERT TO authenticated
  WITH CHECK (false);

GRANT SELECT, INSERT, UPDATE ON public.lc_legal_holds TO service_role;
GRANT SELECT                 ON public.lc_legal_holds TO authenticated;
```

---

### Table 6: `lc_fichajes_hold_archive`

```sql
-- Same columns as lc_fichajes but NOT partitioned.
-- Rows copied here before a partition drop when the empresa has an active legal hold.
CREATE TABLE public.lc_fichajes_hold_archive (
  record_id           UUID        NOT NULL,
  empresa_id          UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  centro_id           UUID        NOT NULL,
  empleado_id         UUID        NOT NULL REFERENCES public.empleados_tpv(id) ON DELETE RESTRICT,
  tipo                TEXT        NOT NULL,
  accion              TEXT,
  ref_correccion      UUID,
  timestamp_evento    TIMESTAMPTZ NOT NULL,
  timestamp_servidor  TIMESTAMPTZ NOT NULL,
  origen_offline      BOOLEAN     NOT NULL,
  motivo              TEXT,
  actor_id            UUID        NOT NULL,
  drift_flag          BOOLEAN     NOT NULL,
  orphan_flag         BOOLEAN     NOT NULL,
  chain_hash          TEXT        NOT NULL,
  prev_hash           TEXT        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL,
  -- Archive metadata
  hold_id             UUID        NOT NULL REFERENCES public.lc_legal_holds(id) ON DELETE RESTRICT,
  archived_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  archive_purge_at    TIMESTAMPTZ NOT NULL,  -- max(timestamp_evento + 4 years, hold lifted_at)
  PRIMARY KEY (record_id)
);

CREATE INDEX idx_lc_hold_archive_empresa      ON public.lc_fichajes_hold_archive (empresa_id, timestamp_servidor DESC);
CREATE INDEX idx_lc_hold_archive_purge        ON public.lc_fichajes_hold_archive (archive_purge_at) WHERE archive_purge_at IS NOT NULL;

-- Same immutability as lc_fichajes
CREATE TRIGGER lc_hold_archive_no_delete
  BEFORE DELETE ON public.lc_fichajes_hold_archive
  FOR EACH ROW EXECUTE FUNCTION lc_fichajes_block_mutation();

CREATE TRIGGER lc_hold_archive_no_update
  BEFORE UPDATE ON public.lc_fichajes_hold_archive
  FOR EACH ROW EXECUTE FUNCTION lc_fichajes_block_mutation();

REVOKE UPDATE, DELETE ON public.lc_fichajes_hold_archive FROM authenticated;
REVOKE UPDATE, DELETE ON public.lc_fichajes_hold_archive FROM service_role;

ALTER TABLE public.lc_fichajes_hold_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No anon access to lc_hold_archive"
  ON public.lc_fichajes_hold_archive FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve su archivo"
  ON public.lc_fichajes_hold_archive FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

GRANT SELECT, INSERT ON public.lc_fichajes_hold_archive TO service_role;
GRANT SELECT         ON public.lc_fichajes_hold_archive TO authenticated;
```

> Archive purge logic: `archive_purge_at = GREATEST(timestamp_evento + INTERVAL '4 years', hold.lifted_at)`. Computed and stored at archive-copy time. The Vercel Cron purge job reads this column and purges (via service_role DELETE on the hold_archive table — which is allowed since the immutability trigger is on the main `lc_fichajes`, not on `lc_fichajes_hold_archive`). Wait — the archive table also has the immutability trigger. Use DDL-level approach: the purge job copies rows to a staging table, calls a stored procedure that temporarily disables the trigger, copies, and re-enables. Alternatively: add a `purged` boolean column and the cron marks rows as purged, then a separate offline job truncates. Simplest safe approach: **`lc_fichajes_hold_archive` does NOT get the immutability trigger** (it's a copy; its authenticity is proven by the unmodifiable `chain_hash` values copied from the original chain). Document this explicitly.

---

### Table 7: `lc_audit_log`

```sql
CREATE TABLE public.lc_audit_log (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  actor_id          UUID        NOT NULL,
  action_type       TEXT        NOT NULL CHECK (char_length(action_type) <= 100),
  -- Examples: fichaje.registrar, fichaje.correccion, fichaje.acknowledgment,
  --           export.pdf, export.excel, export.parcial, hold.create, hold.lift,
  --           chain.verify, chain.anchor, partition.drop, partition.archive_copy
  entity_type       TEXT        CHECK (char_length(entity_type) <= 100),
  entity_id         UUID,
  reason            TEXT        CHECK (char_length(reason) <= 500),
  metadata          JSONB       NOT NULL DEFAULT '{}',
  timestamp_servidor TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lc_audit_log_empresa_ts  ON public.lc_audit_log (empresa_id, timestamp_servidor DESC);
CREATE INDEX idx_lc_audit_log_actor       ON public.lc_audit_log (actor_id, timestamp_servidor DESC);
CREATE INDEX idx_lc_audit_log_entity      ON public.lc_audit_log (entity_type, entity_id) WHERE entity_id IS NOT NULL;

-- Immutability
CREATE OR REPLACE FUNCTION lc_audit_log_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'lc_audit_log: immutable audit record (RD-Ley 8/2019)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lc_audit_log_no_delete
  BEFORE DELETE ON public.lc_audit_log
  FOR EACH ROW EXECUTE FUNCTION lc_audit_log_block_mutation();

CREATE TRIGGER lc_audit_log_no_update
  BEFORE UPDATE ON public.lc_audit_log
  FOR EACH ROW EXECUTE FUNCTION lc_audit_log_block_mutation();

REVOKE UPDATE, DELETE ON public.lc_audit_log FROM authenticated;
REVOKE UPDATE, DELETE ON public.lc_audit_log FROM service_role;

ALTER TABLE public.lc_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No anon access to lc_audit_log"
  ON public.lc_audit_log FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve su audit log"
  ON public.lc_audit_log FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

CREATE POLICY "Authenticated no inserta audit_log directamente"
  ON public.lc_audit_log FOR INSERT TO authenticated
  WITH CHECK (false);

GRANT SELECT, INSERT ON public.lc_audit_log TO service_role;
GRANT SELECT         ON public.lc_audit_log TO authenticated;
```

---

## Directory Structure

```
src/
  core/
    laborcontrol/
      domain/
        types.ts                          — all domain types (FichajeEvento, PerfilLaboral, etc.)
        interfaces/
          IFichajeRepository.ts
          IPerfilLaboralRepository.ts
          IChainRepository.ts
          IAuditRepository.ts
          IExportRepository.ts
          IHoldRepository.ts
      application/
        dtos/
          fichaje.dto.ts                  — Zod schemas for fichaje input validation
          perfil-laboral.dto.ts
          correccion.dto.ts
          export.dto.ts
        use-cases/
          RegistrarFichaje.usecase.ts
          RegistrarCorreccion.usecase.ts
          ObtenerMisFichajes.usecase.ts
          ObtenerEstadoSupervisor.usecase.ts
          GenerarExport.usecase.ts         — orchestrates query → PDF or Excel renderer
          GenerarResumenParcial.usecase.ts — part-time monthly summary (Art. 12.4.c ET)
          GestionarHold.usecase.ts
          VerificarCadena.usecase.ts
      infrastructure/
        SupabaseFichajeRepository.ts
        SupabasePerfilLaboralRepository.ts
        SupabaseChainRepository.ts        — sealAnchor, verifySegment
        SupabaseAuditRepository.ts
        SupabaseExportRepository.ts       — normalized query; renderers injected via constructor
        SupabaseHoldRepository.ts
        renderers/
          PdfRenderer.ts                  — @react-pdf/renderer implementation
          ExcelRenderer.ts                — exceljs WorkbookWriter implementation
  app/
    api/
      laborcontrol/
        fichaje/
          route.ts                        — POST /api/laborcontrol/fichaje
        fichajes/
          [empleadoId]/
            route.ts                      — GET /api/laborcontrol/fichajes/[empleadoId]
        correcciones/
          route.ts                        — POST /api/laborcontrol/correcciones
        supervisor/
          route.ts                        — GET /api/laborcontrol/supervisor
        export/
          route.ts                        — GET /api/laborcontrol/export
          parcial/
            route.ts                      — GET /api/laborcontrol/export/parcial
        chain/
          verify/
            route.ts                      — GET /api/laborcontrol/chain/verify
        holds/
          route.ts                        — GET + POST /api/laborcontrol/holds
        overtime/
          route.ts                        — GET /api/laborcontrol/overtime
    laborcontrol/
      supervisor/
        page.tsx                          — real-time supervisor dashboard
      rlt/
        page.tsx                          — workers' representative read-only view
    tpv/
      [existing files — integration points only:]
      login/
        TpvLoginContent.tsx               — add fichaje dialog hook post-login
      mostrador/
        page.tsx                          — add "Mis fichajes" button + fichaje logout hook
      fichajes/                           — new sub-route under /tpv
        page.tsx                          — employee self-view (auto-timeout 60s)
```

---

## Domain Types (`src/core/laborcontrol/domain/types.ts`)

```typescript
// Fichaje event types
export type FichajeTipo = 'entrada' | 'salida' | 'inicio_pausa' | 'fin_pausa' | 'correccion';
export type FichajeAccion = 'rectificar' | 'anular';
export type Compensacion = 'salario' | 'descanso';

// Core domain entity — mirrors lc_fichajes columns
export interface FichajeEvento {
  recordId: string;
  empresaId: string;
  centroId: string;
  empleadoId: string;
  tipo: FichajeTipo;
  accion: FichajeAccion | null;
  refCorreccion: string | null;          // record_id of the corrected/annulled record
  timestampEvento: Date;
  timestampServidor: Date;
  origenOffline: boolean;
  motivo: string | null;
  actorId: string;
  driftFlag: boolean;
  orphanFlag: boolean;
  chainHash: string;
  prevHash: string;
  createdAt: Date;
}

// Labor profile — extends empleados_tpv identity
export interface PerfilLaboral {
  id: string;
  empresaId: string;
  empleadoId: string;
  centroId: string;
  jornadaTeoricaHoras: number;
  tipoContrato: string;
  tiempoParcial: boolean;
  convenio: string | null;
  timezone: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Correction domain entity (a FichajeEvento with tipo='correccion')
export interface Correccion {
  recordId: string;
  empresaId: string;
  centroId: string;
  empleadoId: string;
  accion: FichajeAccion;
  refCorreccion: string;                 // required for corrections
  timestampEvento: Date;                 // corrected event time
  motivo: string;                        // required for corrections
  actorId: string;
  origenOffline: boolean;
}

// Overtime entry
export interface HorasExtra {
  id: string;
  empresaId: string;
  empleadoId: string;
  fecha: string;                         // ISO date YYYY-MM-DD
  horasExtra: number;
  compensacion: Compensacion;
  notas: string | null;
  registradoPor: string;
  createdAt: Date;
}

// Legal hold
export interface LegalHold {
  id: string;
  empresaId: string;
  empleadoId: string | null;             // null = entire empresa
  fechaInicio: string;
  fechaFin: string;
  motivo: string;
  actorId: string;
  activo: boolean;
  createdAt: Date;
  liftedAt: Date | null;
}

// Chain anchor — sealed monthly segment summary
export interface ChainAnchor {
  id: string;
  empresaId: string;
  segmentYear: number;
  segmentMonth: number;
  finalHash: string;
  recordCount: number;
  sealedAt: Date;
  sealedBy: string;
}

// Audit log entry
export interface AuditEntry {
  id: string;
  empresaId: string;
  actorId: string;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  timestampServidor: Date;
}

// View model for supervisor dashboard
export interface EstadoSupervisor {
  empleadoId: string;
  empleadoNombre: string;
  centroId: string;
  estado: 'dentro' | 'pausa' | 'fuera' | 'sin_datos';
  ultimoEvento: FichajeEvento | null;
  tiempoDesdeUltimoEvento: number | null;   // seconds
  fichajesPendientesRevision: number;         // orphans + drift_flag records
}

// Export query — use case input
export interface ExportQuery {
  empresaId: string;
  empleadoId: string | null;              // null = all employees
  centroId: string | null;
  from: Date;
  to: Date;
  format: 'pdf' | 'excel';
  incluirPausas: boolean;
  incluirHorasExtra: boolean;
  incluirResumenParcial: boolean;
}
```

---

## API Endpoints Design

### Auth note
All `/api/laborcontrol/*` routes derive `empresaId` from domain headers (same as `/api/mesas/*` pattern — `getDomainFromHeaders()` → `parseMainDomain()` → `findByDomain()`). Employee routes additionally require a valid `tpv_employee_token` cookie. Admin/supervisor routes require `requireRole(request, ['admin', 'superadmin', 'encargado'])`.

---

### `POST /api/laborcontrol/fichaje`

**Auth**: `tpv_employee_token` (employee) or admin JWT
**Purpose**: Record a fichaje event (all 4 non-correction types)

**Request body (Zod)**:
```typescript
const FichajeBodySchema = z.object({
  empleadoId:       z.string().uuid(),
  centroId:         z.string().uuid(),
  tipo:             z.enum(['entrada', 'salida', 'inicio_pausa', 'fin_pausa']),
  timestampEvento:  z.string().datetime(),      // ISO 8601 — client clock
  origenOffline:    z.boolean().default(false),
  driftSegundos:    z.number().optional(),       // client-measured drift vs. server
});
```

**Response**: `{ recordId, chainHash, timestampServidor }` on success
**Error cases**: `422` if validation fails; `409` if employee already has an open fichaje for the wrong state (e.g., entrada when already inside — orphan guard); `403` if employee does not belong to empresa

**Side effects**: drift > 300s (5 min) → `drift_flag = true`; use case checks orphan state and sets `orphan_flag` on the previous unpaired event if applicable

---

### `GET /api/laborcontrol/fichajes/[empleadoId]?from=&to=`

**Auth**: `tpv_employee_token` (own only, enforced by RLS) or admin/encargado JWT (any employee in empresa)
**Purpose**: Retrieve fichaje history for an employee in a date range

**Query params**:
- `from`: ISO date string (required)
- `to`: ISO date string (required)
- `includeCorrecciones`: boolean (default true)

**Response**: `FichajeEvento[]` ordered by `timestamp_servidor ASC`
**Error cases**: `403` if employee tries to access another employee's records (RLS enforces this at DB level)

---

### `POST /api/laborcontrol/correcciones`

**Auth**: admin/superadmin/encargado JWT
**Purpose**: Register a correction (rectificar or anular) over a prior fichaje record

**Request body (Zod)**:
```typescript
const CorreccionBodySchema = z.object({
  empleadoId:      z.string().uuid(),
  centroId:        z.string().uuid(),
  refCorreccion:   z.string().uuid(),             // record_id to correct/annul
  accion:          z.enum(['rectificar', 'anular']),
  timestampEvento: z.string().datetime().optional(), // new corrected event time (for rectificar)
  motivo:          z.string().min(1).max(500),
});
```

**Response**: `{ recordId, chainHash }` of the new correction record
**Error cases**: `404` if `refCorreccion` not found in empresa's fichajes; `422` if correcting an already-annulled record; `409` if an active correction chain already exists for this record

**Side effects**: if `accion = 'anular'`, the sibling event of the annulled record (its pair) is flagged `orphan_flag = true` via the use case (requires finding the paired event and UPDATE — but UPDATE is blocked. Solution: the use case inserts a synthetic `correccion` with `accion='anular'` on the paired record too, or uses a DB function via RPC with service_role to set the `orphan_flag`. **Implementation note**: `orphan_flag` must be set via service_role RPC, since authenticated UPDATE is blocked. The immutability trigger blocks all UPDATEs including service_role. Alternative: orphan detection is computed at query time, not stored. The export and supervisor queries derive orphan status from the correction chain. This avoids the UPDATE problem entirely. The `orphan_flag` column becomes a materialized cache, set only at INSERT time based on the incoming correction context, not via UPDATE. Revise: set `orphan_flag` on the NEW correction record, and the sibling is detected by the query as having no valid matching pair.

**Revised orphan model**: `orphan_flag` on `lc_fichajes` is set at INSERT time for the sibling if identifiable (use case computes), or it is **computed at query time** as a derived field. For the design, prefer computed-at-query (no UPDATE needed, always correct) but expose it as a virtual field in the query result. The column is removed from the schema OR kept for index performance (pre-computed on insert only, never updated).

---

### `GET /api/laborcontrol/supervisor`

**Auth**: admin/superadmin/encargado JWT
**Purpose**: Real-time status — who's in, who's on pause, flags

**Response**: `EstadoSupervisor[]` — one entry per active employee with `lc_perfil_laboral`
**Notes**: This endpoint returns a snapshot; the supervisor dashboard subscribes to Supabase Realtime `lc_fichajes` channel for live updates

---

### `GET /api/laborcontrol/export?tipo=pdf|excel&empleadoId=&from=&to=`

**Auth**: admin/superadmin JWT
**Purpose**: Export fichaje records as PDF or Excel

**Query params**:
- `tipo`: `pdf` | `excel` (required)
- `empleadoId`: UUID (optional — all employees if omitted)
- `centroId`: UUID (optional)
- `from`: ISO date (required)
- `to`: ISO date (required)
- `incluirHorasExtra`: boolean (default true)

**Response**: binary stream with `Content-Type: application/pdf` or `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
**Error cases**: `400` if date range > 366 days (protection against memory exhaustion); `404` if no records in range

**Side effects**: logs `export.pdf` or `export.excel` action in `lc_audit_log`

---

### `GET /api/laborcontrol/export/parcial?mes=&anio=`

**Auth**: admin/superadmin JWT
**Purpose**: Part-time monthly summary (Art. 12.4.c ET) for all part-time employees in the empresa

**Query params**:
- `mes`: 1–12 (required)
- `anio`: YYYY (required)

**Response**: PDF binary stream with one summary page per part-time employee
**Side effects**: logs `export.parcial` in `lc_audit_log` with `{ mes, anio, empleadosCount }` in metadata

---

### `GET /api/laborcontrol/chain/verify?segment=YYYY-MM&empresaId=`

**Auth**: admin/superadmin JWT
**Purpose**: Verify chain integrity for a given segment

**Query params**:
- `segment`: `YYYY-MM` string (required)
- `empresaId`: UUID (optional — defaults to own empresa; superadmin can specify any)

**Response**:
```typescript
{
  segment: string;
  status: 'ok' | 'broken' | 'empty';
  recordCount: number;
  anchorHash: string | null;
  firstBreakAtRecordId: string | null;
  verifiedAt: string;
}
```
**Side effects**: logs `chain.verify` in `lc_audit_log`

---

### `POST /api/laborcontrol/holds`

**Auth**: admin/superadmin JWT (requireRole enforced)
**Purpose**: Create a legal hold

**Request body (Zod)**:
```typescript
const HoldBodySchema = z.object({
  empleadoId:  z.string().uuid().optional(),   // null = empresa-wide hold
  fechaInicio: z.string().date(),
  fechaFin:    z.string().date(),
  motivo:      z.string().min(10).max(1000),
});
```

**Response**: `{ id, empresaId, fechaInicio, fechaFin, activo: true }`
**Side effects**: logs `hold.create` in `lc_audit_log`

### `GET /api/laborcontrol/holds`

**Auth**: admin/superadmin JWT
**Response**: `LegalHold[]` for the empresa (active and lifted)

---

### `GET /api/laborcontrol/overtime?empleadoId=&from=&to=`

**Auth**: admin/superadmin/encargado JWT
**Purpose**: Retrieve overtime records

**Query params**: `empleadoId` (optional), `from` (ISO date), `to` (ISO date)
**Response**: `HorasExtra[]`

---

## Offline Sync Protocol

### IndexedDB Queue Structure

```typescript
// Store name: 'lc_offline_queue'
// Database name: 'laborcontrol_offline'
// Database version: 1

interface OfflineQueueItem {
  localId: string;           // UUID generated client-side
  empleadoId: string;
  centroId: string;
  tipo: FichajeTipo;
  timestampEvento: string;   // ISO 8601 — client clock at event time
  clockOffsetMs: number;     // server_time - client_time at last sync (signed, ms)
  localHash: string;         // SHA-256 of (localId + empleadoId + tipo + timestampEvento) — integrity check
  encryptedPayload: string;  // AES-GCM encrypted JSON of the full item (see encryption)
  createdAt: string;         // insertion timestamp (for max-age alerting)
  attempts: number;          // sync attempt count
  status: 'pending' | 'failed' | 'synced';
  errorMessage: string | null;
}
```

**Object store**: `keyPath: 'localId'`
**Index**: `by-status` on `status` (for efficient pending-only queries)
**Persistence check**: On init, call `navigator.storage.persist()`. If denied, show user-visible warning.
**Max queue age**: 8 hours. Items older than 8 hours without sync trigger a supervisor alert (configurable).

### Encryption (Electron Web Crypto API)

```typescript
// Key derivation per device:
// 1. On first install: generate a random 256-bit AES key via crypto.subtle.generateKey
// 2. Persist key in electron-store (Electron's encrypted store backed by safeStorage)
// 3. Each queue item: IV = crypto.getRandomValues(new Uint8Array(12))
//    ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
//    stored as: base64(IV) + '.' + base64(ciphertext)
//
// On decrypt: split on '.', decode IV and ciphertext, decrypt
// The key never leaves the device; if electron-store is wiped, the queue is unreadable
// (items will fail decryption → mark as failed → supervisor alert)
```

### Sync Trigger

1. **Reconnect event**: `window.addEventListener('online', triggerSync)` — triggered when Electron recovers network
2. **Periodic check**: `setInterval(triggerSync, 60_000)` — every 60 seconds, attempt sync if items in queue
3. **Post-login**: after TPV PIN login, trigger sync before allowing fichaje registration

### Sync Process

```
1. Open IndexedDB transaction (readonly) → query items WHERE status='pending' ORDER BY createdAt ASC
2. For each item (insertion order):
   a. Decrypt encryptedPayload
   b. POST /api/laborcontrol/fichaje with { ...payload, origenOffline: true, clockOffsetMs }
   c. On 2xx: open readwrite transaction → set item.status = 'synced' → delete from store
   d. On 4xx (validation error): set status='failed', errorMessage=response.detail, attempts++
      → notify supervisor via UI alert (badge on fichajes dashboard)
   e. On 5xx / network error: set attempts++; if attempts >= 3, status='failed'; retry on next cycle
3. After full pass: if any 'failed' items remain, show persistent supervisor alert
```

### Conflict handling

Server rejects a synced record (e.g., sequence violation — offline employee registered `salida` before a prior `entrada` was synced): the server returns `422` with a structured error code (`LC_SEQUENCE_VIOLATION`). The client marks the item as `failed` and surfaces it in the supervisor review queue. The supervisor can then register a correction.

---

## Chain Hash Function (TypeScript Reference Implementation)

This function documents the canonical format. Actual computation is in the Postgres `lc_fichajes_before_insert()` trigger. Verification tools can use this to recompute hashes independently.

```typescript
import { createHash } from 'crypto';

interface FichajeRecord {
  recordId: string;
  empresaId: string;
  centroId: string;
  empleadoId: string;
  tipo: string;
  accion: string | null;
  refCorreccion: string | null;
  timestampEvento: Date;
  timestampServidor: Date;
  origenOffline: boolean;
  motivo: string | null;
}

function toUtcMs(d: Date): string {
  // Matches to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') in PL/pgSQL
  return d.toISOString().replace('T', 'T').slice(0, 23) + 'Z';
}

export function canonicalHash(record: FichajeRecord, prevHash: string): string {
  // Keys MUST be in exactly this alphabetical order — matches json_build_object in PL/pgSQL
  const payload = {
    accion:                 record.accion,
    centro_id:              record.centroId,
    empresa_id:             record.empresaId,
    empleado_id:            record.empleadoId,
    motivo:                 record.motivo,
    origen_offline:         record.origenOffline,
    prev_hash:              prevHash,
    record_id:              record.recordId,
    ref_correccion:         record.refCorreccion,
    timestamp_evento_utc:   toUtcMs(record.timestampEvento),
    timestamp_servidor_utc: toUtcMs(record.timestampServidor),
    tipo:                   record.tipo,
  };

  // JSON.stringify with sorted replacer — must match Postgres json_build_object key order
  const canonical = JSON.stringify(payload, Object.keys(payload).sort() as (keyof typeof payload)[]);
  return createHash('sha256').update(canonical).digest('hex');
}
```

> **Critical alignment note**: `json_build_object` in Postgres produces a JSON string where keys appear in the ORDER they are specified in the call, not alphabetically. The `lc_canonical_json` PL/pgSQL function must therefore specify keys in the SAME alphabetical order as the TypeScript reference. The TypeScript sort and the PL/pgSQL explicit key order must match exactly. A divergence would cause hash mismatches detectable only at verification time — add an integration test that inserts a record, recomputes the hash in TypeScript, and asserts equality.

---

## TPV Integration Points

### Login flow (post-PIN validation)

In `TpvLoginForm` (client component), after successful PIN auth:
1. Show `FichajeDialog` modal: "¿Deseas fichar entrada?" with [Sí / No]
2. If "Sí": POST `/api/laborcontrol/fichaje` with `tipo='entrada'`; show confirmation toast
3. If "No": continue to TPV without fichaje (recorded as `sin_fichaje` in audit log for supervisor visibility)
4. If offline: add to IndexedDB queue; show "Fichaje guardado offline" toast

### Logout / turn close flow

In TPV layout or turn-close page:
1. Show `FichajeDialog`: "¿Deseas fichar salida?" before completing turn close
2. Same online/offline logic as login

### "Mis fichajes" self-view

New page at `/tpv/fichajes`:
- Accessible only with valid `tpv_employee_token`
- Renders `FichajeListView` with own records (date filter, daily totals, correction history)
- Inactivity timer: 60s via `useEffect` + `addEventListener('mousemove'/'keydown')`; on timeout, `router.push('/tpv/login')`
- NO `admin_token` cookie interaction — uses `tpv_employee_token` only

### Offline PIN cache

Location: Electron only (guarded by `typeof window !== 'undefined' && window.electronAPI`)
Storage: `electron-store` key `lc_pin_cache` → `Record<empresaId, { empleadoId: string; bcryptHash: string; nombre: string; rol: string }[]>`
Update trigger: on each successful online sync (or on any successful `/api/tpv/empleados/login` response)
Rate limiting: 4 failed PIN attempts → 30-second lockout (in-memory counter, reset on success or app restart)

---

## Data Flow Diagram

```
TPV (Electron)                   Next.js API                  Supabase
──────────────                   ───────────                  ────────
[PIN Dialog]
    │ POST /api/laborcontrol/fichaje
    │────────────────────────────────►
                                 [Zod validate]
                                 [requireEmployeeToken]
                                 [RegistrarFichajeUseCase]
                                      │ INSERT lc_fichajes
                                      │──────────────────────────►
                                      │                     [BEFORE INSERT trigger]
                                      │                     [pg_advisory_xact_lock]
                                      │                     [read prev_hash]
                                      │                     [compute chain_hash]
                                      │                     [write row]
                                      │◄──────────────────────────
                                      │ INSERT lc_audit_log
                                      │──────────────────────────►
                                 [return { recordId, chainHash }]
    │◄────────────────────────────────
    │
[Supervisor WS]◄─────── Realtime (publish_via_partition_root) ◄──── partition INSERT
```

---

## i18n Keys (additions to `src/lib/translations.ts`)

```typescript
// Add to both 'es' and 'en' (and other supported locales) blocks:
// Spanish (es):
lc_fichar_entrada:            'Fichar entrada',
lc_fichar_salida:             'Fichar salida',
lc_fichaje_confirmado:        'Fichaje registrado correctamente',
lc_fichaje_offline:           'Fichaje guardado offline — se sincronizará al recuperar conexión',
lc_mis_fichajes:              'Mis fichajes',
lc_supervisor_panel:          'Panel supervisor — fichajes',
lc_sesion_expirada:           'Sesión expirada por inactividad',
lc_correccion_motivo:         'Motivo de la corrección',
lc_orphan_flag:               'Evento sin pareja detectado — revisar',
lc_drift_flag:                'Desfase de reloj superior al umbral',
lc_resumen_parcial:           'Resumen mensual jornada parcial',
lc_export_pdf:                'Exportar PDF',
lc_export_excel:              'Exportar Excel',
lc_clausula_rgpd_fichaje:     'El registro de jornada se realiza en base al Art. 6.1.c RGPD (obligación legal) en cumplimiento del Art. 34.9 ET.',
```

---

## Risks (Architectural)

| Risk | Severity | Mitigation |
|------|----------|------------|
| `json_build_object` key order in PL/pgSQL diverges from TypeScript canonical sort | HIGH | Integration test: insert via API → recompute hash in TS → assert equality. Must be a CI test, not a one-time check. |
| `publish_via_partition_root` requires Supabase publication ALTER — may require support ticket on some plans | MEDIUM | Verify before implementation; fallback is polling the supervisor endpoint on a 10s interval |
| `bcryptjs` (pure JS) is 3-5x slower than native bcrypt for high work factors | LOW | Work factor 12 ≈ 200–400ms in pure JS on Electron — acceptable for PIN verification (single operation, user-perceived as normal). Monitor if employee count per centro grows significantly. |
| Part-time summary PDF generation for large employee counts may timeout on Vercel (60s limit) | MEDIUM | Chunk generation: one employee at a time; stream the PDF. If empresa has >50 part-time employees, implement background job (Vercel Cron or Edge Queue). |
| `lc_fichajes` Realtime subscription may miss events if supervisor page mounts before partition root publication is active | LOW | Integration test per proposal success criteria; document required Supabase configuration step in onboarding. |
| Monthly partition DDL script (CREATE TABLE ... PARTITION OF) must run before month start | MEDIUM | Vercel Cron job creates next month's partition on the 25th of each month. Alert if partition creation fails. |
| Empleado hard-delete in existing admin UI conflicts with ON DELETE RESTRICT FK | HIGH | See codebase finding above — fix the admin delete flow to check for `lc_perfil_laboral` before hard-deleting; redirect to `setActivo(false)`. This must be done as part of this change. |
| `hashtext(empresa_id::text)::bigint` collisions between empresas cause extra serialization | NEGLIGIBLE | Documented in ADR-04. Not a correctness issue. |
