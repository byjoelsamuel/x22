package dev.x22.player;

import android.annotation.SuppressLint;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.service.notification.NotificationListenerService;
import android.util.Base64;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;

import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Follows another app's media session (YouTube Music first, otherwise whatever plays) so x22
 * can show and control it. Needs Notification access, granted by the user in system settings.
 */
final class ExternalMedia implements MediaSessionManager.OnActiveSessionsChangedListener {

    static final String YT_MUSIC = "com.google.android.apps.youtube.music";

    interface Listener {
        void onExternalChanged(JSObject state);
    }

    // Holds only the application context, which lives as long as the process.
    @SuppressLint("StaticFieldLeak")
    private static ExternalMedia instance;

    static synchronized ExternalMedia get(Context ctx) {
        if (instance == null) instance = new ExternalMedia(ctx.getApplicationContext());
        return instance;
    }

    private final Context ctx;
    private final ComponentName component;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private MediaSessionManager sessions;
    private boolean started;
    private MediaController controller;
    private volatile Listener listener;
    private String artKey;
    private volatile String artDataUrl;

    private final MediaController.Callback callback = new MediaController.Callback() {
        @Override public void onMetadataChanged(MediaMetadata metadata) { changed(); }
        @Override public void onPlaybackStateChanged(PlaybackState state) { changed(); }
        @Override public void onSessionDestroyed() { setController(null); refreshSessions(); }
    };

    private ExternalMedia(Context ctx) {
        this.ctx = ctx;
        this.component = new ComponentName(ctx, ExternalMediaService.class);
    }

    static boolean hasAccess(Context ctx) {
        return NotificationManagerCompat.getEnabledListenerPackages(ctx).contains(ctx.getPackageName());
    }

    void setListener(Listener l) {
        listener = l;
    }

    /** Begin following sessions. Safe to call repeatedly. */
    void start() {
        main.post(() -> {
            if (started || !hasAccess(ctx)) return;
            sessions = ctx.getSystemService(MediaSessionManager.class);
            try {
                sessions.addOnActiveSessionsChangedListener(this, component, main);
                started = true;
                refreshSessions();
            } catch (SecurityException e) {
                // Access was just granted; ask the system to (re)bind our listener service.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) NotificationListenerService.requestRebind(component);
            }
        });
    }

    void stop() {
        main.post(() -> {
            if (!started) return;
            sessions.removeOnActiveSessionsChangedListener(this);
            started = false;
            setController(null);
        });
    }

    private void refreshSessions() {
        if (!started) return;
        try {
            onActiveSessionsChanged(sessions.getActiveSessions(component));
        } catch (SecurityException ignored) {
            stop();
        }
    }

    @Override
    public void onActiveSessionsChanged(List<MediaController> controllers) {
        setController(pick(controllers, ctx.getPackageName()));
    }

    /** Playing YT Music › playing other app › paused YT Music › most recent other app. */
    static MediaController pick(List<MediaController> list, String ownPackage) {
        if (list == null) return null;
        MediaController playingOther = null, pausedYt = null, other = null;
        for (MediaController c : list) {
            String pkg = c.getPackageName();
            if (pkg.equals(ownPackage)) continue;
            boolean playing = isPlaying(c.getPlaybackState());
            boolean yt = YT_MUSIC.equals(pkg);
            if (yt && playing) return c;
            if (playing && playingOther == null) playingOther = c;
            if (yt && pausedYt == null) pausedYt = c;
            if (other == null) other = c;
        }
        if (playingOther != null) return playingOther;
        return pausedYt != null ? pausedYt : other;
    }

    private static boolean isPlaying(PlaybackState s) {
        return s != null && (s.getState() == PlaybackState.STATE_PLAYING || s.getState() == PlaybackState.STATE_BUFFERING);
    }

    private void setController(MediaController next) {
        if (controller != null && next != null && controller.getSessionToken().equals(next.getSessionToken())) return;
        if (controller != null) controller.unregisterCallback(callback);
        controller = next;
        artKey = null;
        artDataUrl = null;
        if (controller != null) controller.registerCallback(callback, main);
        changed();
        // The experimental EQ follows the followed app's audio session when it has one.
        io.execute(() -> ExternalEq.get(ctx).apply());
    }

    boolean hasController() {
        return controller != null;
    }

    String followedPackage() {
        MediaController c = controller;
        return c == null ? null : c.getPackageName();
    }

    // ── State ─────────────────────────────────────────────────────────

    private void changed() {
        final MediaController c = controller;
        final JSObject state = snapshot(c, false);
        final MediaMetadata meta = c == null ? null : c.getMetadata();
        final String key = meta == null ? null : c.getPackageName() + "|" + meta.getString(MediaMetadata.METADATA_KEY_TITLE)
            + "|" + meta.getString(MediaMetadata.METADATA_KEY_ARTIST);

        io.execute(() -> {
            boolean newArt = key != null && !key.equals(artKey);
            // Also needed when taking the widget back from x22's own player.
            Bitmap art = newArt || !NowPlayingStore.isExternal(ctx) ? artwork(meta) : null;
            if (newArt) {
                artKey = key;
                artDataUrl = art == null ? null : dataUrl(art);
            }
            updateWidget(state, art, newArt);
            Listener l = listener;
            if (l != null) {
                // Artwork (~30 KB) travels only when it changes; artKey tells JS when to swap it.
                state.put("artKey", artKey);
                if (newArt) state.put("art", artDataUrl);
                main.post(() -> l.onExternalChanged(state));
            }
        });
    }

    /** Current state for JavaScript. Positions are in ms; `updatedAt` is wall-clock ms. */
    JSObject snapshot(MediaController c, boolean includeArt) {
        JSObject o = new JSObject();
        o.put("active", c != null);
        o.put("eqStatus", ExternalEq.get(ctx).status());
        if (c == null) return o;
        MediaMetadata m = c.getMetadata();
        PlaybackState s = c.getPlaybackState();
        o.put("package", c.getPackageName());
        o.put("app", appLabel(c.getPackageName()));
        o.put("title", m == null ? "" : nz(m.getString(MediaMetadata.METADATA_KEY_TITLE)));
        o.put("artist", m == null ? "" : nz(firstNonEmpty(m.getString(MediaMetadata.METADATA_KEY_ARTIST), m.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST))));
        o.put("album", m == null ? "" : nz(m.getString(MediaMetadata.METADATA_KEY_ALBUM)));
        o.put("duration", m == null ? 0 : Math.max(0, m.getLong(MediaMetadata.METADATA_KEY_DURATION)));
        boolean playing = isPlaying(s);
        o.put("playing", playing);
        if (s != null) {
            long age = SystemClock.elapsedRealtime() - s.getLastPositionUpdateTime();
            o.put("position", Math.max(0, s.getPosition()));
            o.put("updatedAt", System.currentTimeMillis() - age);
            o.put("speed", s.getPlaybackSpeed());
            o.put("canSeek", (s.getActions() & PlaybackState.ACTION_SEEK_TO) != 0);
        }
        if (includeArt) {
            o.put("artKey", artKey);
            o.put("art", artDataUrl);
        }
        return o;
    }

    JSObject current() {
        return snapshot(controller, true);
    }

    // ── Controls ──────────────────────────────────────────────────────

    /** "play" | "pause" | "toggle" | "next" | "prev" | "seek". Returns false without a session. */
    boolean control(String action, long positionMs) {
        MediaController c = controller;
        if (c == null) return false;
        MediaController.TransportControls t = c.getTransportControls();
        switch (action) {
            case "play": t.play(); break;
            case "pause": t.pause(); break;
            case "toggle": if (isPlaying(c.getPlaybackState())) t.pause(); else t.play(); break;
            case "next": t.skipToNext(); break;
            case "prev": t.skipToPrevious(); break;
            case "seek": t.seekTo(Math.max(0, positionMs)); break;
            default: return false;
        }
        return true;
    }

    /** Open the followed app, else YouTube Music, else its Play Store page. */
    Intent launchIntent() {
        PackageManager pm = ctx.getPackageManager();
        String pkg = controller != null ? controller.getPackageName() : YT_MUSIC;
        Intent i = pm.getLaunchIntentForPackage(pkg);
        if (i == null) i = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + YT_MUSIC));
        return i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    // ── Widget ────────────────────────────────────────────────────────

    /** Drive the home-screen widget, unless x22's own player is playing. */
    private void updateWidget(JSObject state, Bitmap art, boolean newArt) {
        if (NowPlayingPlugin.isAlive() && NowPlayingStore.isX22Playing(ctx)) return;
        if (!state.optBoolean("active")) {
            if (NowPlayingStore.isExternal(ctx)) {
                NowPlayingStore.clear(ctx);
                PlayerWidget.updateAll(ctx);
            }
            return;
        }
        if (art != null || newArt) {
            Bitmap cover = art == null ? null : CoverArt.render(art, NowPlayingStore.ditherPref(ctx));
            NowPlayingStore.saveCover(ctx, cover);
        }
        NowPlayingStore.saveExternal(ctx, state.getString("title", ""), state.getString("artist", ""),
            state.getString("album", ""), state.getString("app", ""), state.optBoolean("playing"));
        PlayerWidget.updateAll(ctx);
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private static Bitmap artwork(MediaMetadata m) {
        if (m == null) return null;
        Bitmap b = m.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
        if (b == null) b = m.getBitmap(MediaMetadata.METADATA_KEY_ART);
        if (b == null) b = m.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON);
        return b;
    }

    private static String dataUrl(Bitmap b) {
        int size = 300;
        int s = Math.min(b.getWidth(), b.getHeight());
        Bitmap sq = Bitmap.createBitmap(b, (b.getWidth() - s) / 2, (b.getHeight() - s) / 2, s, s);
        Bitmap small = Bitmap.createScaledBitmap(sq, size, size, true);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        small.compress(Bitmap.CompressFormat.JPEG, 85, out);
        return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }

    private String appLabel(String pkg) {
        try {
            PackageManager pm = ctx.getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
            return pm.getApplicationLabel(info).toString();
        } catch (PackageManager.NameNotFoundException e) {
            return pkg;
        }
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static String firstNonEmpty(String a, String b) {
        return a != null && !a.isEmpty() ? a : b;
    }
}
