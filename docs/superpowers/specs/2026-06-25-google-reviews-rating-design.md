# Spec: Sistema de Valoraciones con Google Reviews

Date: 2026-06-25

## Overview

Add a 5-star rating widget (half-star increments, swipe gesture) to the mesa client ticket view. Ratings are stored in a new `valoraciones` table. If the customer rates 4+ stars and the empresa has a Google Reviews URL configured, they are redirected to leave a public review. Otherwise, a "Gracias por tu valoración" toast is shown. Admins can view rating metrics in a new `/admin/valoraciones` panel.

---

## 1. Database

### 1.1 New column on `empresas`

```sql
ALTER TABLE public.empresas ADD COLUMN google_reviews_url TEXT NULL;
```

No RLS changes needed — existing policies cover the column.

### 1.2 New table `valoraciones`

Multiple people can share the same mesa session (one per device). The unique constraint is therefore on `(mesa_sesion_id, rater_id)` — one rating per device per session.

`rater_id` is a UUID generated client-side on first render and persisted in `localStorage` under the key `rater_id`. It is device-scoped and never tied to a user account.

```sql
CREATE TABLE public.valoraciones (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  mesa_id        TEXT,
  mesa_sesion_id TEXT,
  rater_id       UUID NOT NULL,
  estrellas      NUMERIC(2,1) NOT NULL CHECK (estrellas >= 0.5 AND estrellas <= 5.0),
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Unique: one rating per device per session
CREATE UNIQUE INDEX valoraciones_device_sesion_unique
  ON public.valoraciones (mesa_sesion_id, rater_id)
  WHERE mesa_sesion_id IS NOT NULL;
```

RLS, GRANTs, and tenant isolation policy follow the project checklist:

```sql
ALTER TABLE public.valoraciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to valoraciones"
  ON public.valoraciones FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin ve valoraciones de su empresa"
  ON public.valoraciones FOR SELECT TO authenticated
  USING (empresa_id = get_mi_empresa_id());

GRANT SELECT, INSERT ON public.valoraciones TO service_role;
GRANT SELECT ON public.valoraciones TO authenticated;
```

---

## 2. Domain & Application

### 2.1 Empresa entity update

Add `googleReviewsUrl: string | null` to the `Empresa` domain type and its mapper.

### 2.2 Valoracion entity

```ts
interface Valoracion {
  id: string;
  empresaId: string;
  mesaId: string | null;
  mesaSesionId: string | null;
  raterId: string; // device-scoped UUID from localStorage
  estrellas: number; // 0.5–5.0
  createdAt: string;
}
```

### 2.3 CreateValoracionUseCase

- Input DTO: `{ empresaId, mesaId, mesaSesionId, raterId, estrellas }`
- Zod: `estrellas` is `z.number().min(0.5).max(5.0).multipleOf(0.5)`, `raterId` is `z.string().uuid()`
- Calls `IValoracionRepository.create()`
- On conflict on `(mesa_sesion_id, rater_id)` → upsert (update estrellas, created_at) so the same device can correct its rating before locking

### 2.4 GetValoracionesStatsUseCase

- Returns: `{ media: number, total: number, distribucion: Record<string, number> }`
- `distribucion` maps half-star values ("0.5"…"5.0") to count
- Used by the admin panel

---

## 3. Infrastructure

### 3.1 SupabaseValoracionRepository

Implements `IValoracionRepository`:
- `create(data)` → upsert by `(mesa_sesion_id, rater_id)`
- `getStatsByEmpresa(empresaId)` → aggregation query for stats

### 3.2 EmpresaRepository update

`getById` and `findByDomain` must now SELECT `google_reviews_url`.
Map to `googleReviewsUrl` in the mapper.

---

## 4. API

### 4.1 POST `/api/mesas/[mesaId]/valoracion`

Public endpoint (no auth). Rate-limited by the DB unique index on `(mesa_sesion_id, rater_id)`.

Request body (Zod validated):
```ts
{
  estrellas: number;      // 0.5–5.0, multiple of 0.5
  sesion_id: string;      // mesa_sesion_id
  rater_id: string;       // UUID from client localStorage
}
```

Response:
- `200 { ok: true }` — saved
- `409` — already rated this session (idempotent: return ok anyway)
- `400` — validation error

The route resolves `empresa_id` from `mesaId` via the existing session lookup pattern (same as `initiate-mesa`).

---

## 5. UI Components

### 5.1 `StarRating` component

Pure presentational, no API calls.

Props:
```ts
{
  value: number;          // 0–5, step 0.5
  onChange: (v: number) => void;
  disabled?: boolean;
  size?: number;          // px, default 24
}
```

Interaction:
- **Touch**: `touchstart` sets dragging; `touchmove` calculates star from `clientX` relative to component width; `touchend` commits value
- **Mouse**: same with `mousedown/mousemove/mouseup`
- Half-star: each star is divided in two — left half = N−0.5, right half = N
- Visual states: filled (★), half (◑), empty (☆) — rendered with inline SVG or CSS clip

### 5.2 `GoogleReviewsWidget` component

Placed in the ticket header, between the mesa label/date block and the first `DottedRule`.

Props:
```ts
{
  mesaId: string;
  sesionId: string | null;
  googleReviewsUrl: string | null;
  lang: Language;
}
```

Behavior:
1. If `sesionId` is null or `googleReviewsUrl` is null → render nothing
2. On mount:
   - Read `rater_id` from `localStorage.getItem('rater_id')`. If missing, generate `crypto.randomUUID()` and persist it under `'rater_id'` (permanent, device-scoped)
   - Check `localStorage.getItem('valoracion_' + sesionId)` — if present, show locked "rated" state with the previously submitted value
3. User swipes stars → local `hoverValue` state, no submission yet
4. On `touchend`/`mouseup` → submit value:
   - POST `/api/mesas/${mesaId}/valoracion` with `{ estrellas, sesion_id, rater_id }`
   - Save `localStorage.setItem('valoracion_' + sesionId, estrellas.toString())`
   - If `estrellas >= 4` AND `googleReviewsUrl` is set → `window.open(googleReviewsUrl, '_blank')`
   - Show inline "Gracias por tu valoración" confirmation text (no external modal)
5. Once submitted, stars are locked (disabled state)

Layout (inside ticket header):
```
[G icon 32px]  [★ ★ ★ ★ ★]
```
Centered row, small padding, monospace font for any text. Icon sits left of stars with 8px gap.

### 5.3 Ticket integration

File: `src/components/mesa-orders-client.tsx`

The `googleReviewsUrl` value is passed down from the page that loads `MesaOrdersClient`. The page already fetches empresa data — add `googleReviewsUrl` to that fetch.

The widget is rendered inside the ticket body between the header block (lines ~1843–1856) and the first `DottedRule` (line ~1858):

```tsx
<GoogleReviewsWidget
  mesaId={mesaId}
  sesionId={sessionData.sesionId}
  googleReviewsUrl={googleReviewsUrl}
  lang={lang}
/>
```

---

## 6. Admin Panel

### 6.1 Route: `/admin/valoraciones`

New page. Auth-guarded (admin/superadmin).

Sections:
- **Summary card**: media de estrellas (large number + star display), total de valoraciones
- **Star distribution**: 5 rows (5★ → 0.5★ not practical — group by integer star) showing percentage bar
- **Recent list**: table with columns `Fecha | Mesa | Estrellas` — paginated, 20 per page

### 6.2 Sidebar entry

Add "Valoraciones" to the admin sidebar, visible for `tipo === 'restaurante'` (same guard as Mesas).

---

## 7. Superadmin Panel

In `EmpresaTableRow`, add a new editable column "Google Reviews" — text input for `google_reviews_url`, same inline-edit pattern used for other columns. Visible for all tipos.

---

## 8. Translations

New keys needed in `src/lib/translations.ts`:
- `mesaRateUs` — "¿Cómo fue tu experiencia?" / "How was your experience?"
- `mesaRatingThanks` — "Gracias por tu valoración" / "Thanks for your rating!"
- `adminValoraciones` — "Valoraciones" / "Ratings"
- `adminValoracionesMedia` — "Media" / "Average"
- `adminValoracionesTotal` — "Total valoraciones" / "Total ratings"

---

## 9. Out of Scope

- Email notifications when a bad review is received
- Filtering valoraciones by date range in admin (v2)
- Anonymous vs. identified reviewer tracking

---

## 10. File Map

| File | Change |
|------|--------|
| `supabase/migrations/YYYYMMDD_valoraciones.sql` | New migration |
| `src/core/domain/types.ts` | Add `Valoracion`, update `Empresa` |
| `src/core/domain/interfaces/IValoracionRepository.ts` | New interface |
| `src/core/application/use-cases/create-valoracion.use-case.ts` | New |
| `src/core/application/use-cases/get-valoraciones-stats.use-case.ts` | New |
| `src/core/infrastructure/repositories/supabase-valoracion.repository.ts` | New |
| `src/core/infrastructure/repositories/supabase-empresa.repository.ts` | Add `google_reviews_url` to select + mapper |
| `src/app/api/mesas/[mesaId]/valoracion/route.ts` | New API route |
| `src/components/star-rating.tsx` | New component |
| `src/components/google-reviews-widget.tsx` | New component |
| `src/components/mesa-orders-client.tsx` | Add widget to ticket header |
| `src/app/[lang]/admin/valoraciones/page.tsx` | New admin page |
| `src/lib/translations.ts` | New keys |
