package com.multishop.waiter;

import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
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

    private void handleIntent(Intent intent) {
        if (intent == null) return;

        // Try common places where push/tap data may be stored
        String route = null;
        if (intent.getExtras() != null) {
            // explicit 'route' key used by our payloads
            route = intent.getExtras().getString("route");
            if (route == null) route = intent.getExtras().getString("click_action");
            if (route == null) route = intent.getExtras().getString("gcm.notification.click_action");
            if (route == null) {
                // some providers pack a JSON string under "data"
                String data = intent.getExtras().getString("data");
                if (data != null) {
                    try {
                        JSONObject j = new JSONObject(data);
                        route = j.optString("route", null);
                    } catch (Exception ignored) { }
                }
            }
        }

        // Fallback: intent data URI
        if (route == null && intent.getData() != null) {
            route = intent.getData().toString();
        }

        if (route == null) return;

        // Save route to Capacitor Preferences storage so web side can pick it up on cold start
        try {
            SharedPreferences prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            prefs.edit().putString("push_route", route).apply();
        } catch (Exception ignored) { }

        // If the WebView is available, evaluate JS to navigate immediately (background -> foreground)
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                final String quoted = JSONObject.quote(route);
                final String js = "window.dispatchEvent(new CustomEvent('push-navigate',{ detail: " + quoted + " }));";
                runOnUiThread(() -> {
                    try {
                        getBridge().getWebView().evaluateJavascript(js, null);
                    } catch (Exception e) {
                        // ignore — webview might not accept evaluateJavascript yet
                    }
                });
            }
        } catch (Exception ignored) { }
    }

    private String getSavedDomain() {
        // @capacitor/preferences stores in SharedPreferences named "CapacitorStorage"
        SharedPreferences prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        return prefs.getString("domain", null);
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

                    JSONObject json = new JSONObject(sb.toString());
                    int remoteVersionCode = json.optInt("versionCode", 0);
                    String apkUrl = json.isNull("apkUrl") ? "" : json.optString("apkUrl", "");

                    if (remoteVersionCode == 0 || apkUrl.isEmpty()) return;

                    @SuppressWarnings("deprecation")
                    int currentVersionCode = getPackageManager()
                            .getPackageInfo(getPackageName(), 0)
                            .versionCode;

                    if (remoteVersionCode > currentVersionCode) {
                        final String finalApkUrl = apkUrl;
                        runOnUiThread(() -> showUpdateDialog(finalApkUrl));
                    }
                } finally {
                    conn.disconnect();
                }
            } catch (Exception e) {
                // Network error or version check failure — silently ignore
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
