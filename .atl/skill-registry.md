# Skill Registry — multi-shop

Generated: 2026-07-17

## Project Context

**Stack**: Next.js 16 App Router, React 19, TypeScript 5, Tailwind v4, Supabase, Zod, Recharts, Electron, Capacitor
**Architecture**: Clean/Hexagonal — API Route → Use Case → Repository
**Testing**: E2E only (Playwright). No unit/integration runner. Strict TDD: disabled.
**Verify command**: `pnpm lint && pnpm build`

## Compact Rules (inject into sub-agents)

```
# multi-shop Project Standards

## Golden Rule
After EVERY change: `pnpm lint && pnpm build`. Do not mark task complete if they fail.

## Architecture
Clean/Hexagonal: API Route (Zod) → Use Case → Repository (Supabase).
- NEVER access DB from routes/pages — always via Use Case.
- NEVER `createClient()` directly — use `getSupabaseClient()` or `getSupabaseAnonClient()`.
- NEVER use `any` — use `Record<string, unknown>` or domain types.
- All functions return `Result<T, AppError>`. Use `handleResult()` in API routes.

## SonarLint (enforce from line 1)
- S3776: cognitive complexity ≤ 15. Extract complex blocks to module-level pure functions.
- S3358: NO nested ternaries. Use if/return functions instead.
- S6759: Props must be `Readonly<Props>`.
- S2004: max 4 levels of nested functions. Extract `.filter()` predicates to named functions.
- S7735: prefer positive conditions (=== over !==).
- S6819/S6848: semantic HTML — `<button>` not `<div role="button">`.

## Security
- Zod `safeParse` mandatory + `max()` on all strings + `try/catch` on `request.json()`.
- `requireRole(request, ['admin', 'superadmin'])` on all `/api/admin/*` mutations.
- Never log PII (emails, phones).

## DB / Migrations
- New table MUST have: RLS + explicit GRANTs (service_role + authenticated) + tenant isolation.
- `pedidos`: no `telefono` column (it's in `clientes`).
- Public `/api/mesas/*` routes: derive `empresaId` from domain — NOT from proxy header.

## UI
- Never hardcode colors — use CSS tenant variables.
- All UI text via `t()` from `@/lib/translations`.
- Touch targets min 44px.
```

## User Skills

| Skill | Trigger |
|-------|---------|
| `frontend-design` | Build UI components, pages, layouts |
| `taste-skill` | UI polish, design quality, component architecture |
| `emil-design-eng` | UI motion, polish, invisible details |
| `animate` | Add animations/micro-interactions |
| `adapt` | Responsive design, cross-device |
| `audit` | Accessibility, performance, theming audit |
| `harden` | Error handling, i18n, edge cases |
| `optimize` | Performance, bundle size, rendering |
| `polish` | Final quality pass before shipping |
| `graphify` | Codebase architecture questions, cross-file relationships |
| `judgment-day` | Parallel adversarial review of a target |
| `branch-pr` | Create pull requests |
| `chained-pr` | Split large changes into stacked PRs |
| `work-unit-commits` | Structure commits as deliverable work units |
| `comment-writer` | Draft PR/issue comments |
| `sdd-explore` | Investigate a feature/idea |
| `sdd-propose` | Create change proposal |
| `sdd-spec` | Write specifications |
| `sdd-design` | Technical design document |
| `sdd-tasks` | Break change into implementation tasks |
| `sdd-apply` | Implement tasks |
| `sdd-verify` | Validate implementation vs specs |
| `sdd-archive` | Archive completed change |
