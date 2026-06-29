# Capacitor Android PDA — Sistema completo

## Estado actual (2026-06-29)

Implementado y en producción. APK distribuido via Supabase Storage con auto-update integrado.

---

## Arquitectura

```
Primera apertura
┌──────────────────────────────────────────────────┐
│  www/index.html (bundleado en el APK)            │
│  • Input dominio, email admin, password, rol     │
│  → POST /api/app/setup/validate                  │
│  → Guarda domain + role + empresa_id en          │
│    @capacitor/preferences (CapacitorStorage)     │
└──────────────────────────┬───────────────────────┘
                           ↓ navigateToPanel()
Arranques siguientes
┌──────────────────────────────────────────────────┐
│  Android WebView → https://{domain}/waiter       │
│  WaiterLoginForm spinner → /api/waiter/me        │
│  Si cookie válida → muestra mesas                │
│  Si no → muestra PIN form                        │
└──────────────────────────────────────────────────┘
```

## Flujo de auto-update

```
MainActivity.onCreate()
  └── checkForUpdate()
        └── GET https://{domain}/api/app/version
              └── { versionCode, apkUrl }
                    └── si remoteVersionCode > currentVersionCode
                          └── showUpdateDialog() → downloadAndInstall()
```

---

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `.worktrees/feat-capacitor-android-pda/www/index.html` | Setup screen — fuente de verdad. EDITAR AQUÍ, nunca en `assets/public/` |
| `.worktrees/feat-capacitor-android-pda/android/app/src/main/java/com/multishop/waiter/MainActivity.java` | Wake lock, update check, cookie flush |
| `.worktrees/feat-capacitor-android-pda/android/app/build.gradle` | versionCode, versionName, BuildConfig |
| `src/app/api/app/version/route.ts` | Devuelve versionCode + signed URL del APK |
| `src/app/api/app/setup/validate/route.ts` | Valida credenciales admin en setup |
| `src/components/waiter/push-registrar.tsx` | Registra FCM token tras login PIN |
| `src/app/waiter/layout.tsx` | Monta OfflineBanner + PushRegistrar |
| `src/components/waiter/offline-banner.tsx` | Overlay bloqueante cuando offline (z-[300]) |

---

## Proceso de build y release — OBLIGATORIO seguir este orden

```bash
# 1. Editar www/index.html (si hay cambios en el setup screen)

# 2. Copiar assets al proyecto Android (SIEMPRE, incluso sin cambios en www/)
cd .worktrees/feat-capacitor-android-pda
npx cap copy android

# 3. Bumping de versión en android/app/build.gradle
#    versionCode N+1, versionName "x.y.z"

# 4. Build del APK (desde la carpeta android/)
cd android
KEYSTORE_PASSWORD="waiter2026!" KEY_PASSWORD="waiter2026!" KEY_ALIAS="waiter" \
  ./gradlew assembleRelease

# 5. Subir a Supabase Storage
curl -X POST "$SUPABASE_URL/storage/v1/object/app-releases/waiter-{N}.apk" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/vnd.android.package-archive" \
  --data-binary @android/app/build/outputs/apk/release/app-release.apk

# 6. Actualizar defaults en src/app/api/app/version/route.ts
#    VERSION = 'x.y.z'  /  VERSION_CODE = N
```

**CRÍTICO**: El step 2 (`npx cap copy android`) copia `www/` a `android/app/src/main/assets/public/`. Sin este paso, cualquier cambio en `www/index.html` se ignora silenciosamente. La carpeta `assets/public/` es la que se bundlea en el APK.

---

## Trampas Críticas (aprendidas en producción)

### 1. `npx cap copy android` es obligatorio antes de cada build

Los cambios en `www/index.html` NO llegan al APK si no se ejecuta `cap copy android` primero. Gradle solo empaqueta lo que hay en `android/app/src/main/assets/public/`, que es una copia del directorio `www/`. Ignorar este paso costó 10+ builds fallidos.

### 2. `SameSite=strict` bloquea cookies en Capacitor

La WebView navega de `capacitor://localhost` → `https://domain.com`. Esta es una navegación cross-origin. Con `SameSite=strict`, el servidor nunca recibe la cookie `waiter_token`. **Siempre usar `SameSite=lax`** en cookies de auth del sistema waiter.

```typescript
// auth/route.ts
response.cookies.set('waiter_token', token, {
  httpOnly: true,
  sameSite: 'lax',  // NO 'strict'
  secure: true,
  path: '/',
  maxAge: 43200,
});
```

### 3. `CookieManager.flush()` en onPause — obligatorio

Android WebView persiste cookies a disco de forma lazy. Si el proceso es killed antes del flush, el cookie `waiter_token` se pierde → el usuario ve el PIN en cada apertura. Solución: llamar `CookieManager.getInstance().flush()` en `onPause()`:

```java
@Override
public void onPause() {
    super.onPause();
    CookieManager.getInstance().flush();
}
```

### 4. `style.display = ''` no muestra elementos con CSS display:none

Si un elemento tiene `#id { display: none }` en CSS, hacer `element.style.display = ''` borra el inline style y el CSS vuelve a ganar → el elemento sigue oculto. **Siempre usar `style.display = 'block'`** explícitamente.

```javascript
// MAL
document.getElementById('setup-form').style.display = '';

// BIEN
document.getElementById('setup-form').style.display = 'block';
```

### 5. `window.load` no `DOMContentLoaded` para el bridge de Capacitor

El bridge de Capacitor se inyecta en el WebView después de que `DOMContentLoaded` dispara. Usar `window.addEventListener('load', ...)` para garantizar que `window.Capacitor` esté disponible.

### 6. `window.Capacitor.isNativePlatform()` — no `isNative`

```javascript
// MAL — isNative es undefined en Capacitor 5+
if (window.Capacitor?.isNative) { ... }

// BIEN
if (window.Capacitor?.isNativePlatform?.()) { ... }
```

### 7. `visibility:hidden` no funciona en Android WebView

El elemento sigue pintado. Usar `display:none` para ocultar elementos hasta que el setup esté listo.

### 8. Update check requiere dominio — usar BuildConfig.DEFAULT_DOMAIN como fallback

`checkForUpdate()` en MainActivity necesita el dominio para hacer GET al endpoint de versión. Si el usuario borra los datos de la app, `domain` es null y el check se saltaba → imposible auto-actualizar en estado sin configurar.

**Fix**: definir `BuildConfig.DEFAULT_DOMAIN` en `build.gradle`:

```groovy
defaultConfig {
    buildConfigField "String", "DEFAULT_DOMAIN", "\"${System.getenv('DEFAULT_DOMAIN') ?: 'marbellafoodtruck.com'}\""
}

buildFeatures {
    buildConfig = true  // requerido explícitamente en AGP moderno
}
```

Y en MainActivity:
```java
String saved = getSavedDomain();
final String domain = (saved != null) ? saved : BuildConfig.DEFAULT_DOMAIN;
```

### 9. versionCode debe bumpearse en CADA release

Sin bump de versionCode, Android no detecta nueva versión → no hay prompt de actualización. El APK en Storage debe llamarse `waiter-{versionCode}.apk` (coincide con lo que devuelve el endpoint).

### 10. WaiterLoginForm — flash de PIN con sesión válida

`WaiterLoginForm` inicializa con `step="pin"` y llama `/api/waiter/me` en `useEffect`. Durante los 200-500ms que tarda la llamada, el usuario ve el PIN aunque ya tenga sesión. Fix: estado `isCheckingAuth = true` inicial que muestra un spinner hasta que el check resuelve.

### 11. No existe `/waiter/mesas`

La página de mesas vive en `/waiter` (ruta raíz del waiter). No redirigir a `/waiter/mesas` — esa ruta no existe y da 404. El `WaiterLoginForm` maneja el estado de auth client-side.

### 12. `android/` está en .gitignore

Solo los archivos de código fuente se commitean explícitamente con `git add -f`:
- `android/app/src/main/java/com/multishop/waiter/MainActivity.java`
- `android/app/build.gradle`

No commitear outputs de build, `.gradle/`, `build/`, etc.

---

## Sistema de offline en WebView

El overlay de offline (`OfflineBanner`) debe tener `z-[300]` — superior al `WaiterBanner` (`z-[200]`) — para bloquear toda interacción. Al volver la red, hace ping a `/api/waiter/me` antes de recargar (evita reload prematuro en Android donde el evento `online` puede dispararse antes de que la red sea estable):

```typescript
function reloadWhenReady() {
  fetch('/api/waiter/me', { cache: 'no-store' })
    .then(() => { globalThis.location.reload(); })
    .catch(() => { setTimeout(reloadWhenReady, 2000); });
}
```

---

## Push Notifications (FCM)

- `PushRegistrar` se monta en `waiter/layout.tsx`
- El registro se dispara SOLO tras el evento `waiter-auth-changed` (después del PIN)
- En foreground: no-op (Realtime WebSocket ya maneja sonido/UI)
- En background/screen-off: FCM muestra notificación del sistema

Los módulos `@capacitor/push-notifications` y `@capacitor/preferences` se importan dinámicamente dentro de try/catch, typados con interfaces locales. NO usar `@ts-expect-error` — Next.js no evalúa dynamic imports de módulos inexistentes en tiempo de compilación.

---

## Variables de entorno y Vercel

| Variable | Uso | Valor actual |
|----------|-----|--------------|
| `APP_VERSION` | Versión string del APK | `1.1.8` (o default en code) |
| `APP_VERSION_CODE` | versionCode del APK | `19` (o default en code) |

Si estas variables NO están seteadas en Vercel, el código usa los defaults del `route.ts`. Si ESTÁN seteadas, sobreescriben los defaults → actualizar Vercel al bumper versión.

El APK se almacena en Supabase Storage bucket `app-releases` como `waiter-{versionCode}.apk`. El bucket debe ser público para permitir la descarga directa (URL pública) o usar signed URLs (configuración actual, 1h de expiración).
