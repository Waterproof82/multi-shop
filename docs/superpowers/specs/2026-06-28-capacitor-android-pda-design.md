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

Una sola APK sirve a TODOS los restaurantes (multi-tenant). El dominio del tenant se
captura en un setup nativo de un solo uso al primer arranque — no está hardcodeado en
el APK. Cada dispositivo queda vinculado a su restaurante tras ese setup.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Capacitor Android App                   │
│                                                         │
│  Primera apertura                                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Setup Screen (local HTML bundleado en el APK)    │  │
│  │  • Input dominio (ej: pizzeria.tusaas.com)         │  │
│  │  • Input email + password admin                   │  │
│  │  → Valida contra /api/auth/admin del tenant        │  │
│  │  → Guarda dominio + empresa_id en Preferences     │  │
│  └───────────────────────────────────────────────────┘  │
│                         ↓                               │
│  Arranques siguientes                                   │
│  ┌───────────────────────────────────────────────────┐  │
│  │         Android WebView                           │  │
│  │   https://{dominio-tenant}/waiter  o  /kitchen    │  │
│  │   Service Worker (sw.js)                          │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  Plugins Phase A:                                       │
│  - @capacitor/push-notifications (FCM)                  │
│  - @capacitor/preferences (dominio + rol persistentes)  │
│  - @capacitor/app (getInfo - versión)                   │
└─────────────────────────────────────────────────────────┘
          ↓ version check on launch
┌─────────────────────────────────────────────┐
│   GET /api/app/version                      │
│   { version: "1.0.0", apkUrl: "..." }       │
│   APK en Supabase Storage (URL firmada 1h)  │
└─────────────────────────────────────────────┘
```

Lo que NO cambia: Next.js, rutas API, auth PIN + JWT cookie, Service Worker.
Capacitor es un wrapper puro — el WebView navega al dominio del tenant configurado.

`allowNavigation` con wildcard en `capacitor.config.ts` asegura que el puente nativo
de Capacitor (FCM, Preferences) sobrevive la navegación a cualquier dominio de tenant.

---

## Device Setup Flow

### Primera apertura (setup nativo)

```
App abre → ¿dominio en @capacitor/preferences?
    NO → Setup Screen (local HTML bundleado, offline-capable)
         • Input: dominio del restaurante  (ej: pizzeria.tusaas.com)
         • Input: email + password del admin
         → POST https://{dominio}/api/auth/admin  (valida credenciales)
         → Éxito: guarda { dominio, empresaId } en @capacitor/preferences
         → Muestra selector de rol (Camarero | Cocina) en la misma pantalla
         → Guarda rol en @capacitor/preferences
         → WebView navega a https://{dominio}/waiter  o  /kitchen
    SÍ  → WebView navega directamente al panel del rol guardado
              ↓
         PIN auth (ya existe, sin cambios)
              ↓
         Panel correspondiente
```

El admin toca el dispositivo **una sola vez** para configurarlo. Los camareros
solo ven la pantalla de PIN en arranques normales.

### Setup Screen

- HTML estático bundleado en el APK (`www/setup.html`) — no depende del servidor remoto
- Sin framework: HTML + CSS + JS vanilla, tres inputs, un botón
- Llama al admin API del tenant para validar — si falla, muestra error inline
- Usa `Capacitor.Plugins.Preferences.set()` para persistir el dominio y el rol
- No necesita página en Next.js — vive completamente en la capa nativa

### Cambio de configuración

Si el restaurante cambia de dominio o el device necesita re-asignarse: botón
"Reconfigurar dispositivo" oculto (long-press en el logo del splash, o accesible
desde dentro del panel admin de la app). Limpia Preferences y vuelve al setup.

---

## Project Structure

```
multi_shop/
├── capacitor.config.ts              # Config principal (appId, allowNavigation)
├── www/
│   └── setup.html                   # Setup screen nativa (HTML vanilla bundleado)
├── android/                         # Proyecto Android generado
│   ├── app/
│   │   ├── build.gradle             # commiteado (versionCode, permisos, signing vars)
│   │   ├── google-services.json     # commiteado (FCM, sin secrets)
│   │   └── src/main/
│   │       ├── AndroidManifest.xml  # commiteado (permisos + FileProvider)
│   │       ├── MainActivity.kt      # commiteado (wake lock flag)
│   │       └── res/
│   │           ├── xml/
│   │           │   └── file_paths.xml  # commiteado (FileProvider paths)
│   │           └── ...              # splash, icon, strings
│   └── ...                          # resto en .gitignore
├── src/app/
│   └── waiter/
│       └── layout.tsx               # viewport tweaks para WebView
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
  // Sin server.url hardcodeado — el dominio se configura en runtime via setup screen.
  // El WebView arranca en www/setup.html (local) y navega al tenant tras el setup.
  server: {
    allowNavigation: [
      '*.tusaas.com',       // subdominio propio del SaaS
      '*.dominiocliente.com' // dominios personalizados de tenants (wildcard)
    ],
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
```

`allowNavigation` es obligatorio: sin él, Android destruye el puente nativo de
Capacitor cuando el WebView navega a un dominio externo, dejando FCM y Preferences
inoperativos de forma silenciosa.

---

## Android Configuration

### Permisos — `AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<!-- FileProvider: obligatorio para instalar APKs en Android 7+ sin FileUriExposedException -->
<application ...>
  <provider
      android:name="androidx.core.content.FileProvider"
      android:authorities="${applicationId}.fileprovider"
      android:exported="false"
      android:grantUriPermissions="true">
      <meta-data
          android:name="android.support.FILE_PROVIDER_PATHS"
          android:resource="@xml/file_paths" />
  </provider>
</application>
```

### FileProvider paths — `res/xml/file_paths.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<paths>
    <external-cache-path name="apk_download" path="." />
</paths>
```

El APK se descarga al external cache dir (`context.externalCacheDir`) y se expone
via `content://` URI al instalador del sistema. Nunca se pasa una ruta `file://`
directa entre apps (provoca `FileUriExposedException` en Android 7+, crash silencioso
en Android 11+).

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
1. App abre + tiene dominio y rol en Preferences + está autenticada con PIN
2. PushNotifications.requestPermissions()
3. PushNotifications.register() → FCM token
4. POST https://{dominio}/api/waiter/device-token  { token, role, empresaId }
   (empresaId se obtiene de @capacitor/preferences, guardado en el setup)
5. UPSERT en tabla device_tokens
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
1. App abre → fetch /api/app/version  (al dominio del tenant guardado)
2. App.getInfo() → versionCode instalado
3. Si versionCode remoto > local:
     → Dialog nativo: "Actualización disponible (v1.0.1). Descargar e instalar?"
     → Usuario acepta
     → Descarga APK a context.externalCacheDir/waiter-update.apk
     → FileProvider.getUriForFile() → content:// URI
     → Intent ACTION_VIEW con type APK + FLAG_GRANT_READ_URI_PERMISSION
     → Android solicita confirmación al usuario → instala y relanza
4. Si está actualizado → continúa normalmente
```

El usuario siempre confirma con un tap (limitación de Android fuera de Play Store).
La URI `content://` via FileProvider es obligatoria desde Android 7 — una ruta
`file://` directa crashea la app en Android 11+.

---

## Tech Debt Documentada

### device_tokens housekeeping

Los tokens FCM pueden quedar huérfanos cuando un camarero desinstala la app. La Edge
Function `notify-push` ya los elimina cuando FCM responde `NOT_FOUND` o
`INVALID_ARGUMENT`. Para tablas con alta rotación de dispositivos, añadir un job
periódico (pg_cron o Supabase scheduled function) que limpie registros con
`updated_at < now() - interval '90 days'`.

No es un blocker de Phase A — la limpieza reactiva de la Edge Function cubre el
caso más común.

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
| Multi-tenancy | Setup screen nativa + `allowNavigation` wildcard | Una APK para todos los tenants; el puente nativo sobrevive navegación cross-domain |
| Setup auth | Admin email + password (una sola vez) | Vincula el device a un tenant con credenciales existentes; los camareros usan PIN |
| Persistencia config | `@capacitor/preferences` (nativo) | Sobrevive limpiezas de caché de WebView; crítico para dominio y rol |
| Distribución | Self-hosted (Supabase Storage + version endpoint) | Sin Play Store, sin MDM |
| APK URL | Firmada 1h (no pública) | El APK no debe ser accesible sin auth |
| APK install URI | `content://` via FileProvider | Obligatorio Android 7+; `file://` directo crashea en Android 11+ |
| Screen wake lock | FLAG_KEEP_SCREEN_ON en MainActivity | Sin plugin externo, nativo Android |
| FCM sending | Supabase Edge Function | Reutiliza triggers DB existentes |
| Auth waiter | PIN + JWT cookie sin cambios | El WebView hereda las cookies del dominio del tenant |
