# Tasks: LaborControl (Fichaje Digital)

> DB migrations (4 files) already applied. This task list covers the app layer only.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2,500–3,200 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 Foundation → PR2 Backend → PR3 API → PR4 UI |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Base branch |
|------|------|-----------|-------------|
| 1 | Foundation: types, interfaces, DTOs, deps, i18n, offboarding fix | PR 1 | `feat/laborcontrol` |
| 2 | Backend: repositories + use cases | PR 2 | PR 1 branch |
| 3 | API routes | PR 3 | PR 2 branch |
| 4 | UI: supervisor, RLT, TPV integration, offline sync | PR 4 | PR 3 branch |
| tracker | Merge feat/laborcontrol → develop | Tracker PR | `develop` |

---

## Phase 1: Foundation

- [x] 1.1 Install deps: `pnpm add @react-pdf/renderer exceljs bcryptjs` + types
- [x] 1.2 Create `src/core/laborcontrol/domain/types.ts` — all domain interfaces from design §Types
- [x] 1.3 Create `src/core/laborcontrol/domain/interfaces/IFichajeRepository.ts`
- [x] 1.4 Create `src/core/laborcontrol/domain/interfaces/IPerfilLaboralRepository.ts`
- [x] 1.5 Create `src/core/laborcontrol/domain/interfaces/IChainRepository.ts`
- [x] 1.6 Create `src/core/laborcontrol/domain/interfaces/IAuditRepository.ts`
- [x] 1.7 Create `src/core/laborcontrol/domain/interfaces/IExportRepository.ts`
- [x] 1.8 Create `src/core/laborcontrol/domain/interfaces/IHoldRepository.ts`
- [x] 1.9 Create `src/core/laborcontrol/application/dtos/fichaje.dto.ts` — `FichajeBodySchema` Zod
- [x] 1.10 Create `src/core/laborcontrol/application/dtos/correccion.dto.ts` — `CorreccionBodySchema` Zod
- [x] 1.11 Create `src/core/laborcontrol/application/dtos/export.dto.ts` — `ExportQuerySchema` Zod
- [x] 1.12 Create `src/core/laborcontrol/application/dtos/perfil-laboral.dto.ts` — `PerfilLaboralSchema` Zod
- [x] 1.13 Add i18n keys (`lc_*`) to `src/lib/translations.ts` (es + en + fr + it + de)
- [x] 1.14 Fix employee offboarding: `SupabaseEmpleadoTpvRepository.delete()` — check `lc_perfil_laboral` existence; redirect to soft-delete (`setActivo(false)`) if profile exists

## Phase 2: Repositories + Use Cases

- [ ] 2.1 Create `src/core/laborcontrol/infrastructure/SupabaseFichajeRepository.ts` — insert + query by empleado+range
- [ ] 2.2 Create `src/core/laborcontrol/infrastructure/SupabasePerfilLaboralRepository.ts` — CRUD + getByEmpleado
- [ ] 2.3 Create `src/core/laborcontrol/infrastructure/SupabaseChainRepository.ts` — sealAnchor, verifySegment (calls `lc_verify_chain_segment` RPC)
- [ ] 2.4 Create `src/core/laborcontrol/infrastructure/SupabaseAuditRepository.ts` — insert only
- [ ] 2.5 Create `src/core/laborcontrol/infrastructure/SupabaseHoldRepository.ts` — create, list, lift
- [ ] 2.6 Create `src/core/laborcontrol/infrastructure/renderers/PdfRenderer.ts` — `@react-pdf/renderer` renderToStream
- [ ] 2.7 Create `src/core/laborcontrol/infrastructure/renderers/ExcelRenderer.ts` — exceljs WorkbookWriter stream
- [ ] 2.8 Create `src/core/laborcontrol/infrastructure/SupabaseExportRepository.ts` — normalized fichaje query, injects renderers
- [ ] 2.9 Create `src/core/laborcontrol/application/use-cases/RegistrarFichaje.usecase.ts` — drift check, insert, audit
- [ ] 2.10 Create `src/core/laborcontrol/application/use-cases/RegistrarCorreccion.usecase.ts` — validate ref, insert correccion, orphan detection
- [ ] 2.11 Create `src/core/laborcontrol/application/use-cases/ObtenerMisFichajes.usecase.ts` — query + supersede resolution
- [ ] 2.12 Create `src/core/laborcontrol/application/use-cases/ObtenerEstadoSupervisor.usecase.ts` — current state per employee
- [ ] 2.13 Create `src/core/laborcontrol/application/use-cases/GenerarExport.usecase.ts` — orchestrates query → renderer
- [ ] 2.14 Create `src/core/laborcontrol/application/use-cases/GenerarResumenParcial.usecase.ts` — Art. 12.4.c ET monthly summary PDF
- [ ] 2.15 Create `src/core/laborcontrol/application/use-cases/GestionarHold.usecase.ts` — create + lift holds
- [ ] 2.16 Create `src/core/laborcontrol/application/use-cases/VerificarCadena.usecase.ts` — calls chain repo + audit log

## Phase 3: API Routes

- [ ] 3.1 Create `src/app/api/laborcontrol/fichaje/route.ts` — POST, `tpv_employee_token` auth
- [ ] 3.2 Create `src/app/api/laborcontrol/fichajes/[empleadoId]/route.ts` — GET with `from`/`to` params
- [ ] 3.3 Create `src/app/api/laborcontrol/correcciones/route.ts` — POST, requireRole admin/encargado
- [ ] 3.4 Create `src/app/api/laborcontrol/supervisor/route.ts` — GET, requireRole admin/encargado
- [ ] 3.5 Create `src/app/api/laborcontrol/export/route.ts` — GET, streams PDF/Excel
- [ ] 3.6 Create `src/app/api/laborcontrol/export/parcial/route.ts` — GET, Art. 12.4.c summary PDF
- [ ] 3.7 Create `src/app/api/laborcontrol/chain/verify/route.ts` — GET, requireRole admin
- [ ] 3.8 Create `src/app/api/laborcontrol/holds/route.ts` — GET + POST, requireRole admin
- [ ] 3.9 Create `src/app/api/laborcontrol/overtime/route.ts` — GET, requireRole admin/encargado
- [ ] 3.10 Create `src/app/api/laborcontrol/cron/partition/route.ts` — GET (Vercel Cron `CRON_SECRET` guard)
- [ ] 3.11 Create `src/app/api/laborcontrol/cron/seal/route.ts` — GET (Vercel Cron, seals prev month anchors)

## Phase 4: UI + TPV Integration + Offline

- [ ] 4.1 Create `src/app/laborcontrol/supervisor/page.tsx` — Realtime dashboard (`EstadoSupervisor[]`, `lc_fichajes` channel)
- [ ] 4.2 Create `src/app/laborcontrol/rlt/page.tsx` — read-only view for RLT users (requireRole rlt)
- [ ] 4.3 Create `src/app/tpv/fichajes/page.tsx` — employee self-view, 60s inactivity timeout, `tpv_employee_token` only
- [ ] 4.4 Create `src/components/laborcontrol/FichajeDialog.tsx` — modal "¿Fichar entrada/salida?" with online/offline branch
- [ ] 4.5 Integrate `FichajeDialog` into TPV login flow (`TpvLoginForm` — post-PIN success)
- [ ] 4.6 Integrate `FichajeDialog` into TPV turn-close flow (turno cerrar page)
- [ ] 4.7 Add "Mis fichajes" link to TPV mostrador layout
- [ ] 4.8 Create `src/lib/laborcontrol/offline-queue.ts` — IndexedDB `laborcontrol_offline` store, AES-GCM encryption, sync loop
- [ ] 4.9 Create `src/lib/laborcontrol/pin-cache.ts` — Electron-only bcryptjs PIN cache (electron-store key `lc_pin_cache`, rate limit 4 attempts/30s)
- [ ] 4.10 Add canonical hash TypeScript reference to `src/lib/laborcontrol/chain-hash.ts` (for verification tools)
