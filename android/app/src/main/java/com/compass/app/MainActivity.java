package com.compass.app;

import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import java.io.File;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "Compass";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkUpdaterPlugin.class);
        registerPlugin(OtaUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * Validate that an OTA bundle is usable. Vite emits content-hashed asset
     * names (e.g. assets/index-XXXX.js), so we check index.html plus the
     * presence of at least one non-empty JS bundle under assets/ rather than
     * hard-coding a filename that never exists.
     */
    private boolean validateOtaBundle(File otaDir) {
        File indexHtml = new File(otaDir, "index.html");
        if (!indexHtml.exists() || indexHtml.length() == 0) {
            Log.w(TAG, "OTA bundle missing index.html: " + indexHtml.getAbsolutePath());
            return false;
        }
        File assetsDir = new File(otaDir, "assets");
        if (!assetsDir.isDirectory()) {
            Log.w(TAG, "OTA bundle missing assets dir: " + otaDir.getAbsolutePath());
            return false;
        }
        File[] jsFiles = assetsDir.listFiles((dir, name) -> name.endsWith(".js"));
        boolean hasNonEmptyJs = false;
        if (jsFiles != null) {
            for (File f : jsFiles) {
                if (f.length() > 0) { hasNonEmptyJs = true; break; }
            }
        }
        if (!hasNonEmptyJs) {
            Log.w(TAG, "OTA bundle has no non-empty JS bundles in assets: " + assetsDir.getAbsolutePath());
            return false;
        }
        return true;
    }

    @Override
    public void onStart() {
        super.onStart();
        SharedPreferences prefs = getSharedPreferences("ota_prefs", MODE_PRIVATE);
        String activeVersion = prefs.getString("active_version", null);
        if (activeVersion != null) {
            File otaDir = new File(getFilesDir(), "ota/" + activeVersion);
            if (validateOtaBundle(otaDir)) {
                Log.i(TAG, "Loading OTA version " + activeVersion + " from " + otaDir.getAbsolutePath());
                WebView wv = bridge.getWebView();
                if (wv != null) {
                    wv.loadUrl("file://" + new File(otaDir, "index.html").getAbsolutePath());
                }
            } else {
                Log.w(TAG, "OTA bundle corrupted for version " + activeVersion
                    + " — falling back to bundled assets");
                prefs.edit().remove("active_version").apply();
            }
        }
    }
}
