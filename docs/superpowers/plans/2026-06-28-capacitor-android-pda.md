# Capacitor Android PDA — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the existing `/waiter` and `/kitchen` panels in a native Android APK via Capacitor, with multi-tenant device setup, push notifications (FCM), screen wake lock, and self-hosted APK auto-update.

**Architecture:** One APK for all tenants. On first launch, a local HTML setup screen (bundled in the APK) validates admin credentials against the tenant's domain and persists the config in `@capacitor/preferences`. On subsequent launches, the WebView navigates directly to the tenant's production URL. Push notifications are sent via a Supabase Edge Function (`notify-push`) invoked from DB triggers using `pg_net`.

**Tech Stack:** Capacitor 6, `@capacitor/push-notifications`, `@capacitor/preferences`, `@capacitor/app`, Kotlin (MainActivity), Supabase Edge Functions (Deno + `npm:google-auth-library`), Firebase Cloud Messaging HTTP v1 API, Next.js API routes.

**Spec:** `docs/superpowers/specs/2026-06-28-capacitor-android-pda-design.md`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/20260628_device_tokens.sql` | Create | FCM token table |
| `supabase/migrations/20260628_push_triggers.sql` | Create | pg_net triggers → notify-push |
| `supabase/functions/notify-push/index.ts` | Create | Edge Function — FCM sender |
| `src/app/api/app/setup/validate/route.ts` | Create | Validate admin creds → empresa_id |
| `src/app/api/app/version/route.ts` | Create | APK version + signed URL |
| `src/app/api/waiter/device-token/route.ts` | Create | Register FCM token |
| `capacitor.config.ts` | Create | Capacitor config |
| `www/index.html` | Create | Setup screen + domain router (local HTML) |
| `android/app/src/main/AndroidManifest.xml` | Modify | Permissions + FileProvider |
| `android/app/src/main/res/xml/file_paths.xml` | Create | FileProvider paths |
| `android/app/build.gradle` | Modify | Signing config + versionCode |
| `android/app/src/main/java/.../MainActivity.kt` | Modify | Wake lock + APK auto-update |
| `src/components/push-registrar.tsx` | Create | FCM token registration (client component) |
| `src/app/waiter/layout.tsx` | Create | WebView viewport meta |
| `.gitignore` | Modify | Ignore android/ except config files |
| `.env.local` | Modify | Add APP_VERSION, APP_VERSION_CODE |

---

## Task 1: DB Migration — device_tokens

**Files:**
- Create: `supabase/migrations/20260628_device_tokens.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260628_device_tokens.sql
CREATE TABLE public.device_tokens (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('waiter', 'kitchen')),
  fcm_token   text NOT NULL UNIQUE,
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_device_tokens_empresa_role ON public.device_tokens (empresa_id, role);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Deny all anon access
CREATE POLICY "No direct anon access to device_tokens"
  ON public.device_tokens FOR ALL TO anon
  USING (false) WITH CHECK (false);

-- Authenticated admins can manage their own empresa's tokens
CREATE POLICY "Admin manages device_tokens"
  ON public.device_tokens FOR ALL TO authenticated
  USING (empresa_id = get_mi_empresa_id())
  WITH CHECK (empresa_id = get_mi_empresa_id());

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.device_tokens TO authenticated;
```

- [ ] **Step 2: Apply the migration**

```bash
supabase db push
```

Expected: migration applied without errors.

- [ ] **Step 3: Verify the table exists**

```bash
supabase db diff
```

Expected: no diff (migration already applied).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260628_device_tokens.sql
git commit -m "feat: add device_tokens table for FCM push notifications"
```

---

## Task 2: API Route — /api/app/setup/validate

Validates admin credentials and returns `empresa_id`. Used by the native setup screen. No session cookies, no CSRF — this is a one-time device configuration call.

**Files:**
- Create: `src/app/api/app/setup/validate/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/app/setup/validate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { rateLimitLogin } from '@/core/infrastructure/api/rate-limit';

const setupSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export async function POST(request: NextRequest) {
  const rateLimited = await rateLimitLogin(request);
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const result = await authAdminUseCase.login(parsed.data);

  if (!result.success) {
    return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
  }

  const { admin } = result.data;

  if (!admin.empresaId) {
    return NextResponse.json({ error: 'Esta cuenta no tiene empresa asociada' }, { status: 403 });
  }

  return NextResponse.json({
    empresaId: admin.empresaId,
    empresaNombre: admin.empresa?.nombre ?? '',
  });
}
```

- [ ] **Step 2: Test the endpoint (after starting dev server)**

```bash
curl -X POST http://localhost:3000/api/app/setup/validate \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"wrongpassword"}'
```

Expected: `{"error":"Credenciales inválidas"}` with status 401.

```bash
curl -X POST http://localhost:3000/api/app/setup/validate \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tu-restaurante.com","password":"tupassword"}'
```

Expected: `{"empresaId":"uuid-aqui","empresaNombre":"Mi Restaurante"}` with status 200.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/app/setup/validate/route.ts
git commit -m "feat: add /api/app/setup/validate endpoint for native device setup"
```

---

## Task 3: API Route — /api/app/version

Returns the current APK version and a signed download URL from Supabase Storage.

**Files:**
- Create: `src/app/api/app/version/route.ts`
- Modify: `.env.local` (add `APP_VERSION`, `APP_VERSION_CODE`)

- [ ] **Step 1: Add env vars to .env.local**

```bash
# .env.local — add these lines
APP_VERSION=1.0.0
APP_VERSION_CODE=1
```

- [ ] **Step 2: Create the Supabase Storage bucket**

In Supabase dashboard: Storage → New bucket → name: `app-releases`, toggle Public OFF (private).

OR via SQL:
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('app-releases', 'app-releases', false)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 3: Create the route**

```typescript
// src/app/api/app/version/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

const VERSION = process.env.APP_VERSION ?? '1.0.0';
const VERSION_CODE = parseInt(process.env.APP_VERSION_CODE ?? '1', 10);
const APK_PATH = `waiter-${VERSION_CODE}.apk`;

export async function GET() {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.storage
    .from('app-releases')
    .createSignedUrl(APK_PATH, 3600); // 1h expiry

  if (error || !data) {
    // APK not yet uploaded — return version info without URL
    return NextResponse.json({
      version: VERSION,
      versionCode: VERSION_CODE,
      apkUrl: null,
    });
  }

  return NextResponse.json({
    version: VERSION,
    versionCode: VERSION_CODE,
    apkUrl: data.signedUrl,
  });
}
```

- [ ] **Step 4: Test the endpoint**

```bash
curl http://localhost:3000/api/app/version
```

Expected: `{"version":"1.0.0","versionCode":1,"apkUrl":null}` (null until first APK is uploaded).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/app/version/route.ts
git commit -m "feat: add /api/app/version endpoint for APK self-update"
```

---

## Task 4: API Route — /api/waiter/device-token

Registers or updates an FCM token for push notifications. Called from the web layer after PIN auth.

**Files:**
- Create: `src/app/api/waiter/device-token/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/waiter/device-token/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { requireWaiterAuth } from '@/lib/waiter-auth';

const tokenSchema = z.object({
  fcm_token: z.string().min(1).max(500),
  role: z.enum(['waiter', 'kitchen']),
  empresa_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const authResult = await requireWaiterAuth(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = tokenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('device_tokens')
    .upsert(
      {
        empresa_id: parsed.data.empresa_id,
        role: parsed.data.role,
        fcm_token: parsed.data.fcm_token,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'fcm_token' }
    );

  if (error) {
    return NextResponse.json({ error: 'Failed to register token' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

> **Note:** Check how `requireWaiterAuth` is exported in `@/lib/waiter-auth`. If it's not exported, use the same pattern as `/api/waiter/auth/route.ts` — validate the `waiter_token` cookie directly with `verifyWaiterToken`.

- [ ] **Step 2: Verify `requireWaiterAuth` export**

```bash
grep -n "export" src/lib/waiter-auth.ts
```

If `requireWaiterAuth` is not exported, replace the auth check in the route with:

```typescript
import { verifyWaiterToken } from '@/lib/waiter-auth';
import { cookies } from 'next/headers';

// Inside POST:
const cookieStore = await cookies();
const token = cookieStore.get('waiter_token')?.value;
if (!token || !(await verifyWaiterToken(token))) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/waiter/device-token/route.ts
git commit -m "feat: add /api/waiter/device-token endpoint for FCM token registration"
```

---

## Task 5: Supabase Edge Function — notify-push

Sends FCM push notifications to devices of a given empresa + role.

**Files:**
- Create: `supabase/functions/notify-push/index.ts`

- [ ] **Step 1: Create the Edge Function**

```typescript
// supabase/functions/notify-push/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { GoogleAuth } from 'npm:google-auth-library@9';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const fcmServiceAccountJson = Deno.env.get('FCM_SERVICE_ACCOUNT')!;

interface PushPayload {
  empresa_id: string;
  event_type: 'new_order' | 'item_ready' | 'order_validated' | 'item_released';
}

function getNotificationContent(eventType: string): { title: string; body: string } {
  const content: Record<string, { title: string; body: string }> = {
    new_order: { title: 'Nuevo pedido', body: 'Hay un pedido pendiente de validación' },
    item_ready: { title: 'Ítem listo', body: 'Un ítem está listo para servir' },
    order_validated: { title: 'Pedido en cocina', body: 'Un pedido ha entrado a cocina' },
    item_released: { title: 'Ítem disponible', body: 'Un ítem retenido está listo para preparar' },
  };
  return content[eventType] ?? { title: 'Actualización', body: 'Hay novedades en el sistema' };
}

function getTargetRole(eventType: string): 'waiter' | 'kitchen' {
  return eventType === 'new_order' || eventType === 'item_ready' ? 'waiter' : 'kitchen';
}

async function getFcmAccessToken(): Promise<string> {
  const serviceAccount = JSON.parse(fcmServiceAccountJson);
  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse.token) throw new Error('Failed to get FCM access token');
  return tokenResponse.token;
}

async function sendFcmMessage(
  accessToken: string,
  projectId: string,
  token: string,
  title: string,
  body: string
): Promise<{ success: boolean; invalidToken: boolean }> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          android: { priority: 'HIGH' },
        },
      }),
    }
  );

  if (res.ok) return { success: true, invalidToken: false };

  const errBody = await res.json().catch(() => ({}));
  const isInvalid =
    errBody?.error?.details?.some(
      (d: { errorCode: string }) =>
        d.errorCode === 'INVALID_ARGUMENT' || d.errorCode === 'NOT_FOUND'
    ) ?? false;

  return { success: false, invalidToken: isInvalid };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let payload: PushPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (!payload.empresa_id || !payload.event_type) {
    return new Response('Missing empresa_id or event_type', { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const targetRole = getTargetRole(payload.event_type);

  const { data: tokens, error } = await supabase
    .from('device_tokens')
    .select('id, fcm_token')
    .eq('empresa_id', payload.empresa_id)
    .eq('role', targetRole);

  if (error || !tokens?.length) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const serviceAccount = JSON.parse(fcmServiceAccountJson);
  const projectId: string = serviceAccount.project_id;
  const accessToken = await getFcmAccessToken();
  const { title, body } = getNotificationContent(payload.event_type);

  const invalidIds: string[] = [];
  let sent = 0;

  for (const { id, fcm_token } of tokens) {
    const result = await sendFcmMessage(accessToken, projectId, fcm_token, title, body);
    if (result.success) {
      sent++;
    } else if (result.invalidToken) {
      invalidIds.push(id);
    }
  }

  if (invalidIds.length > 0) {
    await supabase.from('device_tokens').delete().in('id', invalidIds);
  }

  return new Response(JSON.stringify({ sent }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Set the FCM_SERVICE_ACCOUNT secret in Supabase**

In Supabase dashboard: Settings → Edge Functions → Secrets → Add secret.
- Name: `FCM_SERVICE_ACCOUNT`
- Value: paste the full content of the Firebase service account JSON (get it from Firebase Console → Project Settings → Service Accounts → Generate new private key)

- [ ] **Step 3: Deploy the Edge Function**

```bash
supabase functions deploy notify-push
```

Expected: function deployed successfully.

- [ ] **Step 4: Test the Edge Function manually**

```bash
curl -X POST https://[project-ref].supabase.co/functions/v1/notify-push \
  -H "Authorization: Bearer [anon-key]" \
  -H "Content-Type: application/json" \
  -d '{"empresa_id":"[valid-uuid]","event_type":"new_order"}'
```

Expected: `{"sent":0}` (0 because no device tokens yet). No 500 error.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/notify-push/index.ts
git commit -m "feat: add notify-push Edge Function for FCM push notifications"
```

---

## Task 6: DB Migration — Push Notification Triggers

New triggers (separate from existing Realtime broadcast ones) that invoke `notify-push` via `pg_net` when relevant events occur.

**Files:**
- Create: `supabase/migrations/20260628_push_triggers.sql`

- [ ] **Step 1: Set DB parameters (run once — not in migration)**

In Supabase SQL editor (NOT in a migration — these are environment settings):

```sql
ALTER DATABASE postgres SET app.supabase_url = 'https://[your-project-ref].supabase.co';
ALTER DATABASE postgres SET app.anon_key = '[your-anon-key]';
```

Replace `[your-project-ref]` and `[your-anon-key]` with values from Supabase dashboard → Settings → API.

- [ ] **Step 2: Create the migration**

```sql
-- supabase/migrations/20260628_push_triggers.sql

-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Helper to call notify-push Edge Function
CREATE OR REPLACE FUNCTION public.call_notify_push(empresa_id uuid, event_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM extensions.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/notify-push',
    body := jsonb_build_object(
      'empresa_id', empresa_id::text,
      'event_type', event_type
    )::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.anon_key')
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- Never fail the main transaction due to push failure
  NULL;
END;
$$;

-- Trigger: new order → notify waiters
CREATE OR REPLACE FUNCTION public.push_on_new_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'pendiente_validacion' THEN
    PERFORM public.call_notify_push(NEW.empresa_id, 'new_order');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER push_pedidos_new_order
  AFTER INSERT ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.push_on_new_order();

-- Trigger: item estado change → notify waiter (item_ready) or kitchen (order_validated, item_released)
CREATE OR REPLACE FUNCTION public.push_on_item_estado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Item listo para servir → waiter
  IF NEW.estado = 'preparado' AND (OLD.estado IS NULL OR OLD.estado != 'preparado') THEN
    PERFORM public.call_notify_push(NEW.empresa_id, 'item_ready');

  -- Item liberado de retención (from_validation false→true) → kitchen
  ELSIF NEW.from_validation = true AND (OLD.from_validation IS NULL OR OLD.from_validation = false) THEN
    PERFORM public.call_notify_push(NEW.empresa_id, 'item_released');

  -- Item entra a cocina desde validación → kitchen
  ELSIF NEW.estado = 'en_preparacion' AND (OLD.estado IS NULL OR OLD.estado = 'pendiente') THEN
    PERFORM public.call_notify_push(NEW.empresa_id, 'order_validated');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER push_pedido_item_estados
  AFTER INSERT OR UPDATE ON public.pedido_item_estados
  FOR EACH ROW
  EXECUTE FUNCTION public.push_on_item_estado();
```

- [ ] **Step 3: Apply the migration**

```bash
supabase db push
```

Expected: migration applied without errors.

- [ ] **Step 4: Verify triggers exist**

```sql
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name LIKE 'push_%';
```

Expected: `push_pedidos_new_order` on `pedidos`, `push_pedido_item_estados` on `pedido_item_estados`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260628_push_triggers.sql
git commit -m "feat: add push notification triggers via pg_net → notify-push Edge Function"
```

---

## Task 7: Capacitor Installation + Config

**Files:**
- Modify: `package.json`
- Create: `capacitor.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Install Capacitor packages**

```bash
pnpm add @capacitor/core @capacitor/android
pnpm add @capacitor/push-notifications @capacitor/preferences @capacitor/app
pnpm add -D @capacitor/cli
```

- [ ] **Step 2: Create capacitor.config.ts**

```typescript
// capacitor.config.ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.multishop.waiter',
  appName: 'Waiter',
  webDir: 'www',
  // No server.url — WebView starts from www/index.html (local).
  // After setup, www/index.html navigates to the tenant's remote URL.
  server: {
    allowNavigation: [
      '*.tusaas.com',          // Your SaaS subdomains — REPLACE with actual domain
      '*.dominiocliente.com',  // Custom tenant domains — add as needed
    ],
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    useLegacyBridge: false, // Routes fetch() through native HTTP — bypasses WebView CORS
  },
};

export default config;
```

> **Replace** `*.tusaas.com` and `*.dominiocliente.com` with your actual production domain patterns.

- [ ] **Step 3: Update .gitignore**

Add to the bottom of `.gitignore`:

```
# Capacitor Android — commit only config files
android/
!android/app/build.gradle
!android/app/google-services.json
!android/app/src/main/AndroidManifest.xml
!android/app/src/main/java/
!android/app/src/main/res/
```

- [ ] **Step 4: Commit**

```bash
git add capacitor.config.ts .gitignore package.json pnpm-lock.yaml
git commit -m "feat: install Capacitor and configure for multi-tenant Android PDA"
```

---

## Task 8: www/index.html — Setup Screen + Domain Router

The local HTML file loaded by Capacitor on first launch. Checks preferences for a saved domain; if found, navigates to the tenant. If not, shows the setup form.

**Files:**
- Create: `www/index.html`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p www
```

```html
<!-- www/index.html -->
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
  <title>Waiter Setup</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #1e293b;
      border-radius: 16px;
      padding: 32px 24px;
      width: 100%;
      max-width: 380px;
    }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
    p.subtitle { color: #94a3b8; font-size: 14px; margin-bottom: 28px; }
    label { display: block; font-size: 13px; color: #94a3b8; margin-bottom: 6px; }
    input {
      display: block;
      width: 100%;
      padding: 12px 14px;
      border-radius: 10px;
      border: 1px solid #334155;
      background: #0f172a;
      color: #f8fafc;
      font-size: 16px;
      margin-bottom: 16px;
      outline: none;
    }
    input:focus { border-color: #6366f1; }
    .role-row { display: flex; gap: 12px; margin-bottom: 24px; }
    .role-btn {
      flex: 1;
      padding: 14px;
      border-radius: 10px;
      border: 2px solid #334155;
      background: transparent;
      color: #94a3b8;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .role-btn.selected {
      border-color: #6366f1;
      background: #312e81;
      color: #e0e7ff;
    }
    .btn-primary {
      display: block;
      width: 100%;
      padding: 14px;
      border-radius: 10px;
      border: none;
      background: #6366f1;
      color: white;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
    }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .error { color: #f87171; font-size: 13px; margin-top: 12px; display: none; }
    .loading { display: none; color: #94a3b8; font-size: 14px; text-align: center; margin-top: 12px; }
  </style>
</head>
<body>
<div class="card">
  <h1>Configurar dispositivo</h1>
  <p class="subtitle">Este setup solo se hace una vez. Los camareros usarán el PIN habitual.</p>

  <div id="setup-form">
    <label>Dominio del restaurante</label>
    <input id="domain" type="text" placeholder="mi-restaurante.com" autocomplete="off" autocapitalize="none" />

    <label>Email del administrador</label>
    <input id="email" type="email" placeholder="admin@mi-restaurante.com" />

    <label>Contraseña</label>
    <input id="password" type="password" placeholder="••••••••" />

    <label>Rol de este dispositivo</label>
    <div class="role-row">
      <button class="role-btn selected" id="btn-waiter" onclick="selectRole('waiter')">Camarero</button>
      <button class="role-btn" id="btn-kitchen" onclick="selectRole('kitchen')">Cocina</button>
    </div>

    <button class="btn-primary" id="submit-btn" onclick="submitSetup()">Configurar y entrar</button>
    <div class="error" id="error-msg"></div>
    <div class="loading" id="loading-msg">Verificando credenciales...</div>
  </div>
</div>

<script>
  let selectedRole = 'waiter';

  function selectRole(role) {
    selectedRole = role;
    document.getElementById('btn-waiter').classList.toggle('selected', role === 'waiter');
    document.getElementById('btn-kitchen').classList.toggle('selected', role === 'kitchen');
  }

  function showError(msg) {
    const el = document.getElementById('error-msg');
    el.textContent = msg;
    el.style.display = 'block';
  }

  function hideError() {
    document.getElementById('error-msg').style.display = 'none';
  }

  async function navigateToPanel(domain, role) {
    const path = role === 'kitchen' ? '/kitchen' : '/waiter';
    window.location.href = 'https://' + domain + path;
  }

  async function checkSavedConfig() {
    try {
      const { Preferences } = window.Capacitor.Plugins;
      const { value: domain } = await Preferences.get({ key: 'domain' });
      const { value: role } = await Preferences.get({ key: 'role' });
      if (domain && role) {
        await navigateToPanel(domain, role);
      }
    } catch (e) {
      // Capacitor not available (e.g. browser dev) — show setup form
    }
  }

  async function submitSetup() {
    hideError();
    const domain = document.getElementById('domain').value.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!domain || !email || !password) {
      showError('Completá todos los campos');
      return;
    }

    document.getElementById('submit-btn').disabled = true;
    document.getElementById('loading-msg').style.display = 'block';

    try {
      const res = await fetch('https://' + domain + '/api/app/setup/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        showError(data.error ?? 'Error al verificar credenciales');
        return;
      }

      const { Preferences } = window.Capacitor.Plugins;
      await Preferences.set({ key: 'domain', value: domain });
      await Preferences.set({ key: 'role', value: selectedRole });
      await Preferences.set({ key: 'empresa_id', value: data.empresaId });

      await navigateToPanel(domain, selectedRole);
    } catch (e) {
      showError('No se pudo conectar con el servidor. Verificá el dominio e intentá de nuevo.');
    } finally {
      document.getElementById('submit-btn').disabled = false;
      document.getElementById('loading-msg').style.display = 'none';
    }
  }

  // On load: check if already configured
  document.addEventListener('DOMContentLoaded', checkSavedConfig);
</script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add www/index.html
git commit -m "feat: add native setup screen and domain router (www/index.html)"
```

---

## Task 9: Android Project Initialization

**Files:**
- Generated by Capacitor CLI: `android/`

- [ ] **Step 1: Initialize the Android project**

```bash
npx cap add android
```

Expected: `android/` directory created with the full Android Gradle project.

- [ ] **Step 2: Sync web assets**

```bash
npx cap sync android
```

Expected: `www/` assets copied to `android/app/src/main/assets/public/`.

- [ ] **Step 3: Verify the setup screen loads**

```bash
npx cap open android
```

Opens Android Studio. Run on emulator or device. Expected: see the Waiter Setup screen with the form.

- [ ] **Step 4: Commit committed files only**

```bash
git add android/app/build.gradle android/app/src/main/AndroidManifest.xml android/app/src/main/java/ android/app/src/main/res/
git commit -m "feat: init Android project via Capacitor"
```

---

## Task 10: AndroidManifest.xml — Permissions + FileProvider

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/main/res/xml/file_paths.xml`

- [ ] **Step 1: Read the current AndroidManifest.xml**

Open `android/app/src/main/AndroidManifest.xml` in Android Studio or a text editor. It will have Capacitor's default content.

- [ ] **Step 2: Add permissions and FileProvider**

In `AndroidManifest.xml`, ensure the `<manifest>` block has these permissions (some may already exist):

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

Inside the `<application>` tag, add the FileProvider (before the closing `</application>`):

```xml
<provider
    android:name="androidx.core.content.FileProvider"
    android:authorities="${applicationId}.fileprovider"
    android:exported="false"
    android:grantUriPermissions="true">
    <meta-data
        android:name="android.support.FILE_PROVIDER_PATHS"
        android:resource="@xml/file_paths" />
</provider>
```

- [ ] **Step 3: Create file_paths.xml**

```bash
mkdir -p android/app/src/main/res/xml
```

```xml
<!-- android/app/src/main/res/xml/file_paths.xml -->
<?xml version="1.0" encoding="utf-8"?>
<paths>
    <external-cache-path name="apk_download" path="." />
</paths>
```

- [ ] **Step 4: Verify build**

```bash
cd android && ./gradlew assembleDebug 2>&1 | tail -5
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/AndroidManifest.xml android/app/src/main/res/xml/file_paths.xml
git commit -m "feat: add Android permissions and FileProvider for APK auto-update"
```

---

## Task 11: build.gradle — Signing Config + VersionCode

**Files:**
- Modify: `android/app/build.gradle`

- [ ] **Step 1: Generate the keystore (run once, store securely)**

```bash
keytool -genkey -v \
  -keystore waiter-release.jks \
  -alias waiter \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -storepass "CHANGE_THIS_PASSWORD" \
  -keypass "CHANGE_THIS_PASSWORD" \
  -dname "CN=Waiter App, OU=Multi Shop, O=Multi Shop, L=Madrid, S=Madrid, C=ES"
```

**CRITICAL**: Store `waiter-release.jks` outside the repo (e.g., password manager, encrypted folder). This file must never be committed. If lost, the APK can never be updated on existing devices.

- [ ] **Step 2: Add signing config to build.gradle**

Open `android/app/build.gradle` and add the `signingConfigs` block and update the `release` buildType. Find the `android { ... }` block and modify:

```gradle
android {
    // ... existing config ...

    defaultConfig {
        // ... existing config ...
        versionCode 1
        versionName "1.0.0"
    }

    signingConfigs {
        release {
            storeFile file(System.getenv("KEYSTORE_PATH") ?: "../waiter-release.jks")
            storePassword System.getenv("KEYSTORE_PASSWORD") ?: ""
            keyAlias System.getenv("KEY_ALIAS") ?: "waiter"
            keyPassword System.getenv("KEY_PASSWORD") ?: ""
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

- [ ] **Step 3: Verify the release build**

```bash
export KEYSTORE_PATH="/path/to/waiter-release.jks"
export KEYSTORE_PASSWORD="your-store-pass"
export KEY_ALIAS="waiter"
export KEY_PASSWORD="your-key-pass"

cd android && ./gradlew assembleRelease 2>&1 | tail -5
```

Expected: `BUILD SUCCESSFUL`. Output APK at `android/app/build/outputs/apk/release/app-release.apk`.

- [ ] **Step 4: Commit**

```bash
git add android/app/build.gradle
git commit -m "feat: add APK signing config with env-var keystore for release builds"
```

---

## Task 12: MainActivity.kt — Wake Lock + APK Auto-Update

**Files:**
- Modify: `android/app/src/main/java/com/multishop/waiter/MainActivity.kt`

> The exact path will be `android/app/src/main/java/[package-path]/MainActivity.kt`. The package path matches `appId` from `capacitor.config.ts` (`com/multishop/waiter`).

- [ ] **Step 1: Open MainActivity.kt — read its current content first**

The file will contain a minimal Capacitor bridge class. Add the wake lock and update logic:

```kotlin
package com.multishop.waiter

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.WindowManager
import android.widget.Toast
import androidx.core.content.FileProvider
import com.getcapacitor.BridgeActivity
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        checkForUpdate()
    }

    private fun getSavedDomain(): String? {
        // @capacitor/preferences stores in SharedPreferences named "CapacitorStorage"
        val prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        return prefs.getString("domain", null)
    }

    private fun checkForUpdate() {
        val domain = getSavedDomain() ?: return // not configured yet — skip update check

        Thread {
            try {
                val url = URL("https://$domain/api/app/version")
                val conn = url.openConnection() as HttpURLConnection
                conn.connectTimeout = 5000
                conn.readTimeout = 5000
                conn.requestMethod = "GET"

                if (conn.responseCode != 200) return@Thread

                val response = conn.inputStream.bufferedReader().readText()
                val json = JSONObject(response)

                val remoteVersionCode = json.optInt("versionCode", 0)
                val apkUrl = json.optString("apkUrl", "")

                if (remoteVersionCode == 0 || apkUrl.isEmpty()) return@Thread

                val currentVersionCode = packageManager
                    .getPackageInfo(packageName, 0)
                    .longVersionCode
                    .toInt()

                if (remoteVersionCode > currentVersionCode) {
                    runOnUiThread { showUpdateDialog(apkUrl) }
                }
            } catch (_: Exception) {
                // Network error or version check failure — silently ignore
            }
        }.start()
    }

    private fun showUpdateDialog(apkUrl: String) {
        AlertDialog.Builder(this)
            .setTitle("Actualización disponible")
            .setMessage("Hay una nueva versión de la app. ¿Descargar e instalar ahora?")
            .setPositiveButton("Instalar") { _, _ -> downloadAndInstall(apkUrl) }
            .setNegativeButton("Ahora no", null)
            .show()
    }

    private fun downloadAndInstall(apkUrl: String) {
        Thread {
            try {
                val url = URL(apkUrl)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "GET"

                val file = File(externalCacheDir, "waiter-update.apk")
                conn.inputStream.use { input ->
                    file.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }

                val uri: Uri = FileProvider.getUriForFile(
                    this,
                    "$packageName.fileprovider",
                    file
                )

                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(intent)
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(this, "Error al descargar la actualización", Toast.LENGTH_LONG).show()
                }
            }
        }.start()
    }
}
```

- [ ] **Step 2: Verify build**

```bash
cd android && ./gradlew assembleDebug 2>&1 | tail -5
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 3: Test wake lock on device**

Install debug APK on Android device. Open app → lock screen → confirm screen stays on while app is visible, turns off when you switch to another app.

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/java/
git commit -m "feat: add wake lock and APK auto-update to MainActivity"
```

---

## Task 13: Push Notification Registration — Web Layer

After the waiter authenticates with PIN, register the FCM token and send it to the backend.

**Files:**
- Create: `src/components/push-registrar.tsx`
- Modify: `src/app/waiter/layout.tsx` (create if it doesn't exist)

- [ ] **Step 1: Create the PushRegistrar component**

```tsx
// src/components/push-registrar.tsx
'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform: () => boolean;
      Plugins: {
        PushNotifications?: {
          requestPermissions: () => Promise<{ receive: string }>;
          register: () => Promise<void>;
          addListener: (event: string, callback: (token: { value: string }) => void) => void;
        };
        Preferences?: {
          get: (opts: { key: string }) => Promise<{ value: string | null }>;
        };
      };
    };
  }
}

interface PushRegistrarProps {
  empresaId: string;
  role: 'waiter' | 'kitchen';
}

export function PushRegistrar({ empresaId, role }: Readonly<PushRegistrarProps>) {
  useEffect(() => {
    if (!window.Capacitor?.isNativePlatform()) return;

    const push = window.Capacitor.Plugins.PushNotifications;
    if (!push) return;

    async function register() {
      const permission = await push!.requestPermissions();
      if (permission.receive !== 'granted') return;

      push!.addListener('registration', async (token) => {
        try {
          await fetch('/api/waiter/device-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fcm_token: token.value, role, empresa_id: empresaId }),
          });
        } catch {
          // Non-critical — push registration failure doesn't break the app
        }
      });

      await push!.register();
    }

    register().catch(() => {
      // Silently ignore — native push setup failure is non-critical
    });
  }, [empresaId, role]);

  return null;
}
```

- [ ] **Step 2: Create waiter/layout.tsx**

The waiter panel doesn't have a layout yet. Create one with the PushRegistrar and viewport tweaks:

```tsx
// src/app/waiter/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
};

export default function WaiterLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
```

> **Note:** The `PushRegistrar` needs `empresaId` and `role` from the authentication state. Add it to the waiter page component (e.g., `src/app/waiter/page.tsx`) after the waiter authenticates, passing `empresaId` from the waiter JWT and reading `role` from `@capacitor/preferences` via a client component. The exact integration depends on how the waiter page currently reads auth state — find where `empresaId` is available after PIN auth and mount `<PushRegistrar empresaId={...} role={...} />` there.

- [ ] **Step 3: Lint and typecheck**

```bash
pnpm lint && pnpm build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/push-registrar.tsx src/app/waiter/layout.tsx
git commit -m "feat: add PushRegistrar component for FCM token registration after PIN auth"
```

---

## Task 14: google-services.json — FCM Android Config

**Files:**
- Create: `android/app/google-services.json`

- [ ] **Step 1: Get google-services.json from Firebase**

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (or use existing)
3. Add Android app → package name: `com.multishop.waiter`
4. Download `google-services.json`
5. Place it at `android/app/google-services.json`

> This file contains the FCM configuration. It does NOT contain private keys — it's safe to commit.

- [ ] **Step 2: Verify google-services.json is in .gitignore allowlist**

Check `.gitignore` — it should have `!android/app/google-services.json` (added in Task 7). If not, add it now.

- [ ] **Step 3: Sync and build**

```bash
npx cap sync android
cd android && ./gradlew assembleDebug 2>&1 | tail -5
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Commit**

```bash
git add android/app/google-services.json
git commit -m "feat: add google-services.json for FCM push notifications"
```

---

## Task 15: First APK Build + Upload to Supabase Storage

**Files:**
- Upload: `app-release.apk` → Supabase Storage `app-releases/waiter-1.apk`

- [ ] **Step 1: Build release APK**

```bash
export KEYSTORE_PATH="/path/to/waiter-release.jks"
export KEYSTORE_PASSWORD="your-store-pass"
export KEY_ALIAS="waiter"
export KEY_PASSWORD="your-key-pass"

cd android && ./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

- [ ] **Step 2: Upload to Supabase Storage**

In Supabase dashboard: Storage → `app-releases` → Upload file.
- Select `app-release.apk`
- Rename to `waiter-1.apk` (matching `APP_VERSION_CODE=1`)

OR via CLI:
```bash
supabase storage cp android/app/build/outputs/apk/release/app-release.apk ss://app-releases/waiter-1.apk
```

- [ ] **Step 3: Verify /api/app/version returns a URL**

```bash
curl https://[your-domain]/api/app/version
```

Expected: `{"version":"1.0.0","versionCode":1,"apkUrl":"https://...signed-url..."}` — `apkUrl` is now populated.

- [ ] **Step 4: Install and test on device**

1. Transfer `app-release.apk` to Android device (USB or ADB)
2. Install: `adb install android/app/build/outputs/apk/release/app-release.apk`
3. Open app → setup screen appears
4. Enter domain, admin email, password, select role → tap "Configurar y entrar"
5. App should navigate to `https://your-domain/waiter` or `/kitchen`
6. Enter PIN → access granted
7. Screen should stay on while app is open
8. In Supabase → `device_tokens` table → should have a new row with the FCM token

- [ ] **Step 5: Commit final state**

```bash
git add .
git commit -m "feat: complete Capacitor Android PDA Phase A"
```

---

## Release Process (For Future APK Updates)

When the native layer changes (new plugin, permission, config):

1. Increment `versionCode` in `android/app/build.gradle` (e.g., `2`)
2. Update `APP_VERSION_CODE=2` in production env vars
3. Build release APK: `./gradlew assembleRelease`
4. Upload to Supabase Storage as `waiter-2.apk`
5. Devices will detect the new `versionCode` on next launch and prompt for update

Web-only changes (Next.js code) do NOT require a new APK — they update automatically via the WebView loading the production URL.

---

## Self-Review Checklist

- [x] **device_tokens migration**: RLS + grants included (Task 1)
- [x] **/api/app/setup/validate**: validates admin creds, returns empresa_id, no session (Task 2)
- [x] **/api/app/version**: signed URL 1h expiry, null when APK not uploaded (Task 3)
- [x] **/api/waiter/device-token**: UPSERT by fcm_token, handles token refresh (Task 4)
- [x] **notify-push Edge Function**: removes invalid tokens, catches errors gracefully (Task 5)
- [x] **Push triggers**: EXCEPTION handler prevents transaction failure on push error (Task 6)
- [x] **allowNavigation**: wildcard domains in capacitor.config.ts (Task 7)
- [x] **useLegacyBridge: false**: bypasses CORS for fetch() from www/index.html (Task 7)
- [x] **www/index.html**: checks preferences on load, navigates to tenant if configured (Task 8)
- [x] **FileProvider**: declared in AndroidManifest.xml + file_paths.xml (Task 10)
- [x] **content:// URI**: used in downloadAndInstall() — no file:// (Task 12)
- [x] **Wake lock**: FLAG_KEEP_SCREEN_ON in onCreate (Task 12)
- [x] **@capacitor/preferences**: used instead of localStorage for domain/role/empresa_id (Task 8)
- [x] **Keystore**: env-var referenced in build.gradle, never hardcoded (Task 11)
