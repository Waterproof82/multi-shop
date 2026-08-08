# Cart Access Token Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dead `cart-access` JWT flow (verification-only, no generator, no consumers) from `src/proxy.ts` and `src/core/infrastructure/env-validation.ts`, and update the three docs that describe it.

**Architecture:** Pure deletion, no new logic. The `?access=` query param handling is removed from the proxy middleware; the env var stops being required at startup. No tests exist for this path today (confirmed via repo-wide grep) and none are added — this is a removal of unreferenced code, not a behavior change to test.

**Tech Stack:** Next.js middleware (`proxy.ts`), TypeScript, no new dependencies.

Full rationale and investigation trail: `docs/superpowers/specs/2026-08-01-cart-access-token-removal-design.md`.

---

### Task 1: Remove `handleCartAccessToken` from the proxy

**Files:**
- Modify: `src/proxy.ts:146-192` (function definition)
- Modify: `src/proxy.ts:460-464` (call site)

- [ ] **Step 1: Confirm no other callers exist**

Run: `rg "handleCartAccessToken" src/`
Expected: only 2 matches — the function definition and its single call site (both in `src/proxy.ts`). If more appear, stop and investigate before continuing.

- [ ] **Step 2: Delete the call site**

In `src/proxy.ts`, find this block (currently around line 460):

```ts
  // Access token for cart
  const accessToken = url.searchParams.get('access');
  if (accessToken) {
    return handleCartAccessToken(url, accessToken);
  }

```

Delete it entirely (including the blank line after, keep the blank line before as normal spacing between the superadmin block above and the nonce-generation block below).

- [ ] **Step 3: Delete the function definition**

In `src/proxy.ts`, find this function (currently around line 146):

```ts
async function handleCartAccessToken(url: URL, accessToken: string): Promise<NextResponse> {
  const sanitizedToken = accessToken.replaceAll(/[^a-zA-Z0-9._-]/g, '');
  const secretKey = process.env.CART_TOKEN_SECRET;

  if (!secretKey) {
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse('Server configuration error', { status: 500 });
    }
    return NextResponse.next();
  }

  try {
    const secret = new TextEncoder().encode(secretKey);
    // Require 'cart-access' audience to prevent token confusion with admin JWTs
    const { payload } = await jwtVerify(sanitizedToken, secret, { audience: 'cart-access' });

    // If the cart token has a jti, check revocation (fail-closed in prod).
    // Cart tokens generated without jti are accepted today (short 15-min TTL);
    // once generation includes jti this will revoke on-demand.
    if (payload.jti && await isTokenRevoked(payload.jti)) {
      url.searchParams.delete('access');
      return NextResponse.redirect(url);
    }

    url.searchParams.delete('access');
    const response = NextResponse.redirect(url);

    let maxAge = 15 * 60;
    if (payload?.exp) {
      const now = Math.floor(Date.now() / 1000);
      maxAge = Math.max(payload.exp - now, 0);
    }

    response.cookies.set('access_token', sanitizedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge,
    });

    return response;
  } catch {
    url.searchParams.delete('access');
    return NextResponse.redirect(url);
  }
}

```

Delete it entirely (the whole function, including the trailing blank line before `function normalizeR2Origin`).

- [ ] **Step 4: Verify `jwtVerify` and `isTokenRevoked` imports are still used**

Run: `rg "jwtVerify\(|isTokenRevoked\(" src/proxy.ts`
Expected: `jwtVerify` still appears (used in `handleAdminAuth`, ~line 91) and `isTokenRevoked` still appears (used in `handleAdminAuth`, ~line 102). Do NOT remove their imports at the top of the file — they're still needed.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. This confirms no other code referenced the deleted function or its types.

- [ ] **Step 6: Commit**

```bash
git add src/proxy.ts
git commit -m "fix(security): remove dead cart-access JWT verification from proxy"
```

---

### Task 2: Remove `CART_TOKEN_SECRET` from env validation

**Files:**
- Modify: `src/core/infrastructure/env-validation.ts:23`

- [ ] **Step 1: Delete the entry**

In `src/core/infrastructure/env-validation.ts`, delete this line from the `ENV_VARS` array:

```ts
  { name: 'CART_TOKEN_SECRET', required: true },
```

The `Auth` section of the array should read:

```ts
  // Auth
  { name: 'ACCESS_TOKEN_SECRET', required: true },
  { name: 'CSRF_HMAC_SECRET', required: true },
  { name: 'UNSUBSCRIBE_HMAC_SECRET', required: true, productionOnly: true },
```

- [ ] **Step 2: Confirm no other references remain in code**

Run: `rg "CART_TOKEN_SECRET" src/`
Expected: no matches (Task 1 already removed the only usage in `proxy.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/core/infrastructure/env-validation.ts
git commit -m "fix(security): stop requiring unused CART_TOKEN_SECRET at startup"
```

---

### Task 3: Update documentation

**Files:**
- Modify: `docs/context/security.md`
- Modify: `docs/context/cart_flow.md`
- Modify: `README.md:345`

- [ ] **Step 1: `docs/context/security.md` — remove the env var rows**

Find and delete this row (in the env vars table near line 402):

```
| `CART_TOKEN_SECRET` | ✓ | |
```

Find and delete this row (in the second env vars table near line 893):

```
| `CART_TOKEN_SECRET` | JWT de acceso al carrito | ✓ Siempre |
```

- [ ] **Step 2: `docs/context/security.md` — remove the "Cart Access Token" section**

Delete this entire section (near line 793):

```
## Cart Access Token

El proxy valida cart tokens (`?access=` query param) con `CART_TOKEN_SECRET` y requiere `aud: 'cart-access'` para prevenir token confusion con admin JWTs.

Si `CART_TOKEN_SECRET` no está en producción, el proxy retorna **500** en lugar de ignorar el token y conceder acceso.

Cuando se implemente la generación de cart tokens:

```typescript
new SignJWT({ /* claims */ })
  .setProtectedHeader({ alg: 'HS256' })
  .setAudience('cart-access')
  .setExpirationTime('15m')
  .sign(new TextEncoder().encode(process.env.CART_TOKEN_SECRET));
```

---
```

(Keep the `---` separator that follows it, since it separates from the next section "Multi-tenant — dominio parsing".)

- [ ] **Step 3: `docs/context/security.md` — remove the pending item**

Delete this row from the "Pendientes conocidos" table (near line 1172):

```
| Cart token generación con `jti` | Low | El proxy valida `aud: 'cart-access'` y llama `isTokenRevoked(jti)` si el claim está presente. Cuando se implemente la generación, incluir `jti` para habilitar revocación completa. |
```

- [ ] **Step 4: `docs/context/cart_flow.md` — update the legacy section**

Replace this section (near line 264):

```
## Legacy: Token JWT de Acceso

El proxy (`src/proxy.ts`) aún soporta un flujo legacy con tokens JWT:
- URL: `https://tudominio.com/?access=TOKEN_JWT`
- Establece cookie `access_token` (HttpOnly, 15 min)
- Script: `scripts/generate-token.ts`

Este flujo **ya no controla la visibilidad del carrito** — el subdominio es el mecanismo activo.
```

With:

```
## Legacy: Token JWT de Acceso (eliminado)

El proxy (`src/proxy.ts`) soportaba un flujo legacy con tokens JWT
(`?access=TOKEN_JWT` → cookie `access_token`), usado originalmente por un
script de desarrollo local (`scripts/generate-token.ts`, eliminado en
`625883d`) para desbloquear el carrito antes de que existiera la detección
de subdominio. Sin generador ni consumidores reales, se eliminó el 2026-08-01.
Ver `docs/superpowers/specs/2026-08-01-cart-access-token-removal-design.md`
para el historial completo.
```

- [ ] **Step 5: `README.md` — remove the env var line**

Delete this line (near line 345):

```
CART_TOKEN_SECRET=
```

- [ ] **Step 6: Confirm no stray references remain**

Run: `rg -i "CART_TOKEN_SECRET|cart-access" docs/ README.md`
Expected: no matches.

- [ ] **Step 7: Commit**

```bash
git add docs/context/security.md docs/context/cart_flow.md README.md
git commit -m "docs(security): remove references to eliminated cart-access token flow"
```

---

### Task 4: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: build succeeds (ignore the standard "Skipping validation of types" notice per project convention).

- [ ] **Step 3: Confirm zero remaining references repo-wide**

Run: `rg -i "CART_TOKEN_SECRET|cart-access|handleCartAccessToken" --glob '!node_modules' --glob '!graphify-out'`
Expected: no matches anywhere in `src/`, `docs/`, `README.md`, `e2e/`. (`graphify-out/` is excluded — it's an auto-generated cache that refreshes on its own via `graphify update .` and is out of scope for this change.)

- [ ] **Step 4: Remind the user about Vercel**

Tell the user: "Código y docs limpios. Falta un paso manual: borrar la variable `CART_TOKEN_SECRET` del dashboard de Vercel (Project Settings → Environment Variables) — el código ya no la exige, pero seguirá configurada ahí hasta que la borres a mano."
