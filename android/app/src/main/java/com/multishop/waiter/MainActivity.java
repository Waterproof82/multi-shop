package com.multishop.waiter;

import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
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
    }

    private String getSavedDomain() {
        // @capacitor/preferences stores in SharedPreferences named "CapacitorStorage"
        SharedPreferences prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        return prefs.getString("domain", null);
    }

    private void checkForUpdate() {
        final String domain = getSavedDomain();
        if (domain == null) return; // not configured yet — skip update check

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
