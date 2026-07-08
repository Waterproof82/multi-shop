package com.multishop.waiter;

import android.app.AlertDialog;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.File;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        createNotificationChannels();
        checkForUpdate();

        // Handle intent that launched the activity (cold start)
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Handle intents when app is already running (background -> foreground)
        handleIntent(intent);
    }

    @Override
    public void onPause() {
        super.onPause();
        // Flush WebView cookies to disk so they survive process kill.
        // Without this, waiter_token cookie is lost → PIN prompt on every cold open.
        CookieManager.getInstance().flush();
    }

    private String extractRouteFromData(String data) {
        if (data == null) return null;
        try {
            return new JSONObject(data).optString("route", null);
        } catch (Exception ignored) {
            // malformed JSON — route not extractable from data field
            return null;
        }
    }

    private String extractRouteFromIntent(Intent intent) {
        if (intent.getExtras() != null) {
            String route = intent.getExtras().getString("route");
            if (route == null) route = intent.getExtras().getString("click_action");
            if (route == null) route = intent.getExtras().getString("gcm.notification.click_action");
            if (route == null) route = extractRouteFromData(intent.getExtras().getString("data"));
            if (route != null) return route;
        }
        return intent.getData() != null ? intent.getData().toString() : null;
    }

    private void saveRouteToPreferences(String route) {
        try {
            SharedPreferences prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            prefs.edit().putString("push_route", route).apply();
        } catch (Exception ignored) {
            // SharedPreferences unavailable — non-critical, route dispatch continues
        }
    }

    private void dispatchRouteToWebView(String route) {
        try {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            final String quoted = JSONObject.quote(route);
            final String js = "window.dispatchEvent(new CustomEvent('push-navigate',{ detail: " + quoted + " }));";
            runOnUiThread(() -> {
                try {
                    getBridge().getWebView().evaluateJavascript(js, null);
                } catch (Exception ignored) {
                    // WebView not ready to execute JS yet — route already saved to prefs as fallback
                }
            });
        } catch (Exception ignored) {
            // Bridge unavailable — route saved to prefs as fallback
        }
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String route = extractRouteFromIntent(intent);
        if (route == null) return;
        saveRouteToPreferences(route);
        dispatchRouteToWebView(route);
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        // High-priority channel for kitchen order alerts — shows heads-up popup + sound
        NotificationChannel kitchen = new NotificationChannel(
                "kitchen_alerts",
                "Alertas de cocina",
                NotificationManager.IMPORTANCE_HIGH
        );
        kitchen.setDescription("Notificaciones de pedidos entrantes en cocina");
        kitchen.enableVibration(true);
        kitchen.enableLights(true);
        nm.createNotificationChannel(kitchen);
    }

    private String getSavedDomain() {
        // @capacitor/preferences stores in SharedPreferences named "CapacitorStorage"
        SharedPreferences prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        return prefs.getString("domain", null);
    }

    private static class VersionInfo {
        final int versionCode;
        final String apkUrl;

        VersionInfo(int versionCode, String apkUrl) {
            this.versionCode = versionCode;
            this.apkUrl = apkUrl;
        }
    }

    private VersionInfo parseVersionResponse(String body) {
        try {
            JSONObject json = new JSONObject(body);
            int code = json.optInt("versionCode", 0);
            String url = json.isNull("apkUrl") ? "" : json.optString("apkUrl", "");
            return new VersionInfo(code, url);
        } catch (Exception e) {
            return new VersionInfo(0, "");
        }
    }

    private void checkForUpdate() {
        String saved = getSavedDomain();
        // Fall back to build-time default (useful after data wipe before first setup)
        final String domain = (saved != null) ? saved : BuildConfig.DEFAULT_DOMAIN;
        if (domain == null || domain.isEmpty()) return;

        new Thread(() -> {
            try {
                URL url = new URL("https://" + domain + "/api/app/version");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                try {
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(5000);
                    conn.setRequestMethod("GET");

                    if (conn.getResponseCode() != 200) return;

                    StringBuilder sb = new StringBuilder();
                    try (java.io.BufferedReader reader = new java.io.BufferedReader(
                            new java.io.InputStreamReader(conn.getInputStream()))) {
                        String line;
                        while ((line = reader.readLine()) != null) {
                            sb.append(line);
                        }
                    }

                    VersionInfo remote = parseVersionResponse(sb.toString());
                    if (remote.versionCode == 0 || remote.apkUrl.isEmpty()) return;

                    @SuppressWarnings("deprecation")
                    int currentVersionCode = getPackageManager()
                            .getPackageInfo(getPackageName(), 0)
                            .versionCode;

                    if (remote.versionCode > currentVersionCode) {
                        runOnUiThread(() -> showUpdateDialog(remote.apkUrl));
                    }
                } finally {
                    conn.disconnect();
                }
            } catch (Exception e) {
                // Network error or version check failure — silently ignored
            }
        }).start();
    }

    private void showUpdateDialog(String apkUrl) {
        new AlertDialog.Builder(this)
                .setTitle("Actualización disponible")
                .setMessage("Hay una nueva versión de la app. ¿Descargar e instalar ahora?")
                .setPositiveButton("Instalar", (dialog, which) -> downloadAndInstall(apkUrl))
                .setNegativeButton("Ahora no", null)
                .show();
    }

    private void downloadAndInstall(String apkUrl) {
        new Thread(() -> {
            try {
                URL url = new URL(apkUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                try {
                    conn.setRequestMethod("GET");

                    File cacheDir = getExternalCacheDir();
                    if (cacheDir == null) cacheDir = getCacheDir();
                    File file = new File(cacheDir, "waiter-update.apk");
                    try (java.io.InputStream input = conn.getInputStream();
                         java.io.FileOutputStream output = new java.io.FileOutputStream(file)) {
                        byte[] buffer = new byte[8192];
                        int bytesRead;
                        while ((bytesRead = input.read(buffer)) != -1) {
                            output.write(buffer, 0, bytesRead);
                        }
                    }

                    Uri uri = FileProvider.getUriForFile(
                            this,
                            getPackageName() + ".fileprovider",
                            file
                    );

                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    intent.setDataAndType(uri, "application/vnd.android.package-archive");
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } finally {
                    conn.disconnect();
                }
            } catch (Exception e) {
                runOnUiThread(() ->
                        Toast.makeText(this, "Error al descargar la actualización", Toast.LENGTH_LONG).show()
                );
            }
        }).start();
    }
}
