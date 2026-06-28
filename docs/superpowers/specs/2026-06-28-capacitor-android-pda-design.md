# Capacitor Android PDA — Phase A Design

**Date**: 2026-06-28
**Scope**: APK nativo para PDAs de camarero y cocina (Android handheld)
**Out of scope**: Panel TPV, cámara/QR, kiosk mode, haptic feedback

---

## Overview

El panel `/waiter` ya tiene Service Worker PWA. Phase A envuelve los paneles existentes
(`/waiter` y `/kitchen`) en un APK nativo Android mediante Capacitor, sin modificar la
lógica de negocio, las rutas API ni la auth. La webapp Next.js en producción sigue siendo
la fuente de verdad — el WebView simplemente la consume.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│          Capacitor Android App              │
│   ┌─────────────────────────────────────┐   │
│   │         Android WebView             │   │
│   │   ┌─────────────────────────────┐   │   │
│   │   │  /waiter o /kitchen panel   │   │   │
│   │   │  Service Worker (sw.js)     │   │   │
│   │   └─────────────────────────────┘   │   │
│   │         HTTPS                        │   │
│   │   https://[dominio-produccion]       │   │
│   └─────────────────────────────────────┘   │
│                                             │
│   Plugins Phase A:                          │
│   - @capacitor/push-notifications (FCM)     │
│   - @capacitor/app (getInfo - versión)      │
└─────────────────────────────────────────────┘
          ↓ version check on launch
┌─────────────────────────────────────────────┐
│   GET /api/app/version                      │
│   { version: "1.0.0", apkUrl: "..." }       │
│   APK en Supabase Storage (URL firmada 1h)  │
└─────────────────────────────────────────────┘
```

Lo que NO cambia: Next.js, rutas API, auth PIN + JWT cookie, Service Worker.
Capacitor es un wrapper puro — el WebView apunta al dominio de producción.

---

## Role Selector

Una sola APK con selector de rol al primer arranque. Sin auth propia — solo persiste
la elección en `localStorage`.

```
App abre → ¿rol en localStorage?
    NO → /waiter/role  (página estática: Camarero | Cocina)
    SÍ → /waiter  o  /kitchen
              ↓
         PIN auth (ya existe)
              ↓
         Panel correspondiente
```

`/waiter/role` es una página nueva en Next.js, `force-static`, sin layout de waiter.
Dos botones grandes. Al elegir: guarda `role` en `localStorage` y redirige.

---

## Project Structure

```
multi_shop/
├── capacitor.config.ts              # Config principal (appId, server URL)
├── android/                         # Proyecto Android generado
│   ├── app/
│   │   ├── build.gradle             # commiteado (versionCode, permisos)
│   │   ├── google-services.json     # commiteado (FCM, sin secrets)
│   │   └── src/main/
│   │       ├── AndroidManifest.xml  # commiteado
│   │       ├── MainActivity.kt      # commiteado (wake lock flag)
│   │       └── res/                 # commiteado (splash, icon, strings)
│   └── ...                          # resto en .gitignore
├── src/app/
│   ├── waiter/
│   │   ├── role/
│   │   │   └── page.tsx             # selector de rol (nuevo)
│   │   └── layout.tsx               # viewport tweaks para WebView
└── supabase/
    └── migrations/
        └── 20260628_device_tokens.sql
```

**`.gitignore` additions:**
```
android/
!android/app/build.gradle
!android/app/google-services.json
!android/app/src/main/AndroidManifest.xml
!android/app/src/main/java/
!android/app/src/main/res/
```

**`capacitor.config.ts`:**
```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.multishop.waiter',
  appName: 'Waiter',
  server: {
    url: process.env.CAPACITOR_SERVER_URL ?? 'https://[dominio-produccion]/waiter',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
```

`CAPACITOR_SERVER_URL` solo se usa en builds de desarrollo local. El APK de producción
usa el dominio hardcodeado via fallback.

---

## Android Configuration

### Permisos — `AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

### Screen always-on — `MainActivity.kt`

```kotlin
override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
}
```

Solo activo mientras la app está en primer plano. Sin impacto en batería cuando
el camarero sale de la app.

### APK Signing

- Keystore `.jks` generado una sola vez, guardado fuera del repo (recomendado: gestor de contraseñas o carpeta cifrada en local — nunca en cloud sin cifrar)
- `build.gradle` referencia el keystore via variables de entorno (`KEYSTORE_PATH`,
  `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`)
- El keystore es permanente: si se pierde, Android rechaza futuras actualizaciones
- `versionCode` se incrementa manualmente en cada release nativo

---

## Push Notifications (FCM)

### Flujo de registro

```
1. App abre + tiene rol + está autenticada con PIN
2. PushNotifications.requestPermissions()
3. PushNotifications.register() → FCM token
4. POST /api/waiter/device-token  { token, role, empresaId }
5. Guardado en tabla device_tokens
```

### Tabla nueva — `device_tokens`

```sql
CREATE TABLE public.device_tokens (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('waiter', 'kitchen')),
  fcm_token   text NOT NULL UNIQUE,
  updated_at  timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only"
  ON public.device_tokens FOR ALL TO anon USING (false) WITH CHECK (false);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.device_tokens TO authenticated;
```

### Triggers de push

| Evento | Notifica a |
|---|---|
| Nuevo pedido en pendientes | `role='waiter'` |
| Ítem listo para servir | `role='waiter'` |
| Pedido validado (entra a cocina) | `role='kitchen'` |
| Ítem retenido liberado (entra a cocina) | `role='kitchen'` |

### Edge Function — `notify-push`

Supabase Edge Function invocada desde los DB triggers existentes
(`notify_waiter_new_order`, `notify_waiter_items_update`).

```
1. Recibe { empresa_id, event_type }
2. Lee device_tokens WHERE empresa_id = $1 AND role = $target_role
3. Llama FCM API (HTTP v1) con los tokens
4. Elimina tokens inválidos (FCM retorna INVALID_ARGUMENT o NOT_FOUND)
```

La Edge Function usa el service account de Firebase (secret en Supabase Vault, no
en el repo).

### Endpoint de registro — `/api/waiter/device-token`

```
POST /api/waiter/device-token
Auth: JWT cookie (requireAuth)
Body: { fcm_token: string, role: 'waiter' | 'kitchen' }

→ UPSERT en device_tokens por fcm_token (actualiza empresa_id y role si el
  token ya existe — maneja refresh de token FCM)
```

---

## APK Distribution (self-hosted)

### Supabase Storage

- Bucket `app-releases` (privado)
- Ruta: `waiter-{versionCode}.apk`
- URL firmada con expiración de 1h, generada on-demand en el endpoint

### Endpoint de versión — `/api/app/version`

```
GET /api/app/version
→ No requiere auth

Response:
{
  "version": "1.0.0",
  "versionCode": 1,
  "apkUrl": "https://[supabase]/storage/v1/object/sign/app-releases/waiter-1.apk?token=..."
}
```

La versión y versionCode se leen desde variables de entorno (`APP_VERSION`,
`APP_VERSION_CODE`) seteadas en el deploy. Deben coincidir con el `versionCode`
en `build.gradle` — son la fuente de verdad para el comparador de versiones.

### Flujo de auto-update en la app

```
1. App abre → fetch /api/app/version
2. App.getInfo() → versionCode instalado
3. Si versionCode remoto > local:
     → Dialog nativo: "Actualización disponible (v1.0.1). Descargar e instalar?"
     → Usuario acepta → descarga APK desde apkUrl
     → FileOpener / intent ACTION_VIEW con type APK
     → Android solicita confirmación → instala y relanza
4. Si está actualizado → continúa normalmente
```

El usuario siempre ve el dialog de instalación (limitación de Android para APKs
fuera de Play Store con `REQUEST_INSTALL_PACKAGES`). No es silencioso, pero requiere
un solo tap.

---

## Out of Scope (Phase B)

- Cámara / QR scanning (`@capacitor/camera` o `@capacitor/barcode-scanner`)
- Kiosk mode (TPV)
- Haptic feedback / vibración
- Panel TPV (spec separado)

---

## Key Decisions

| Decision | Elección | Motivo |
|---|---|---|
| Arquitectura | Monorepo (android/ en repo existente) | Coherencia, pipeline unificado |
| Distribución | Self-hosted (Supabase Storage + version endpoint) | Sin Play Store, sin MDM |
| APK URL | Firmada 1h (no pública) | El APK no debe ser accesible sin auth |
| Screen wake lock | FLAG_KEEP_SCREEN_ON en MainActivity | Sin plugin externo, nativo Android |
| FCM sending | Supabase Edge Function | Reutiliza triggers DB existentes |
| Auth | PIN + JWT cookie sin cambios | El WebView hereda las cookies del dominio |
