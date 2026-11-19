package dev.x22.player;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * In-app updates: download the release APK from GitHub, verify its SHA-256 against the
 * digest GitHub publishes, then open Android's installer. Android itself only accepts it
 * as an update when it is signed with the same key as the installed x22.
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {

    private static final String APK = "x22-update.apk";
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private File apkFile() {
        File dir = new File(getContext().getCacheDir(), "updates");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return new File(dir, APK);
    }

    @PluginMethod
    public void download(PluginCall call) {
        final String url = call.getString("url");
        final String sha256 = call.getString("sha256");
        final long expected = call.getLong("size", 0L);
        if (url == null || !url.startsWith("https://github.com/byjoelsamuel/x22/releases/download/")) {
            call.reject("Refusing to download from an unexpected address");
            return;
        }
        io.execute(() -> {
            File out = apkFile();
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setInstanceFollowRedirects(true); // github.com → objects.githubusercontent.com
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                if (conn.getResponseCode() != 200) throw new Exception("Download failed (HTTP " + conn.getResponseCode() + ")");
                long total = conn.getContentLength() > 0 ? conn.getContentLength() : expected;
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long done = 0;
                int lastPct = -1;
                try (InputStream in = conn.getInputStream(); FileOutputStream fos = new FileOutputStream(out)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        fos.write(buf, 0, n);
                        digest.update(buf, 0, n);
                        done += n;
                        int pct = total > 0 ? (int) (done * 100 / total) : 0;
                        if (pct != lastPct) {
                            lastPct = pct;
                            JSObject p = new JSObject();
                            p.put("fraction", pct / 100.0);
                            notifyListeners("progress", p);
                        }
                    }
                }
                String actual = hex(digest.digest());
                if (sha256 != null && !sha256.isEmpty() && !sha256.toLowerCase(Locale.ROOT).equals(actual)) {
                    //noinspection ResultOfMethodCallIgnored
                    out.delete();
                    throw new Exception("Download was corrupted (checksum mismatch) — try again");
                }
                JSObject r = new JSObject();
                r.put("path", out.getAbsolutePath());
                r.put("sha256", actual);
                call.resolve(r);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Download failed");
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    @PluginMethod
    public void install(PluginCall call) {
        Context ctx = getContext();
        File apk = apkFile();
        if (!apk.exists()) {
            call.reject("Nothing downloaded yet");
            return;
        }
        // Android 8+: the user must allow x22 to install apps (asked once).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ctx.getPackageManager().canRequestPackageInstalls()) {
            Intent allow = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
            getActivity().startActivity(allow);
            JSObject r = new JSObject();
            r.put("status", "needs-permission");
            call.resolve(r);
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", apk);
            Intent i = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(i);
            JSObject r = new JSObject();
            r.put("status", "started");
            call.resolve(r);
        } catch (ActivityNotFoundException | IllegalArgumentException e) {
            call.reject("Could not open the installer");
        }
    }

    private static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format(Locale.ROOT, "%02x", b));
        return sb.toString();
    }
}
