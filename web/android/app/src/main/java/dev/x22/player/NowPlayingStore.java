package dev.x22.player;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import java.io.File;
import java.io.FileOutputStream;

/** Last known "now playing" state, persisted so the widget can redraw at any time. */
final class NowPlayingStore {

    private static final String PREFS = "x22.nowplaying";
    private static final String COVER_FILE = "widget_cover.png";

    private NowPlayingStore() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static final String SOURCE_X22 = "x22";
    static final String SOURCE_EXTERNAL = "external";

    /** Where the track is, for the lock-screen seek bar. Milliseconds. */
    static void savePosition(Context ctx, long positionMs, long durationMs) {
        prefs(ctx).edit()
            .putLong("position", positionMs)
            .putLong("duration", durationMs)
            .putLong("positionAt", System.currentTimeMillis())
            .apply();
    }

    static long duration(Context ctx) {
        return prefs(ctx).getLong("duration", 0L);
    }

    /** Position extrapolated to now, so the lock-screen bar is not stale. */
    static long position(Context ctx) {
        long pos = prefs(ctx).getLong("position", 0L);
        if (isPlaying(ctx)) pos += System.currentTimeMillis() - prefs(ctx).getLong("positionAt", System.currentTimeMillis());
        long dur = duration(ctx);
        return dur > 0 ? Math.max(0, Math.min(pos, dur)) : Math.max(0, pos);
    }

    /** State from x22's own player (homelab). */
    static void save(Context ctx, String title, String artist, String album, boolean playing) {
        prefs(ctx).edit()
            .putString("source", SOURCE_X22)
            .putString("app", "")
            .putString("title", title)
            .putString("artist", artist)
            .putString("album", album)
            .putBoolean("playing", playing)
            .apply();
    }

    /** State mirrored from another app (YouTube Music, …). */
    static void saveExternal(Context ctx, String title, String artist, String album, String app, boolean playing) {
        prefs(ctx).edit()
            .putString("source", SOURCE_EXTERNAL)
            .putString("app", app)
            .putString("title", title)
            .putString("artist", artist)
            .putString("album", album)
            .putBoolean("playing", playing)
            .apply();
    }

    static boolean isExternal(Context ctx) {
        return SOURCE_EXTERNAL.equals(prefs(ctx).getString("source", SOURCE_X22));
    }

    static boolean isX22Playing(Context ctx) {
        return !isExternal(ctx) && isPlaying(ctx) && hasTrack(ctx);
    }

    static String app(Context ctx) {
        return prefs(ctx).getString("app", "");
    }

    /** "Dithered artwork" setting, mirrored so the widget can follow it without the app. */
    static void setDitherPref(Context ctx, boolean dither) {
        ctx.getSharedPreferences(PREFS + ".prefs", Context.MODE_PRIVATE).edit().putBoolean("dither", dither).apply();
    }

    static boolean ditherPref(Context ctx) {
        return ctx.getSharedPreferences(PREFS + ".prefs", Context.MODE_PRIVATE).getBoolean("dither", true);
    }

    static void setPlaying(Context ctx, boolean playing) {
        prefs(ctx).edit().putBoolean("playing", playing).apply();
    }

    static void clear(Context ctx) {
        prefs(ctx).edit().clear().apply();
        //noinspection ResultOfMethodCallIgnored
        new File(ctx.getFilesDir(), COVER_FILE).delete();
    }

    static String title(Context ctx) {
        return prefs(ctx).getString("title", "");
    }

    static String artist(Context ctx) {
        return prefs(ctx).getString("artist", "");
    }

    static String album(Context ctx) {
        return prefs(ctx).getString("album", "");
    }

    static boolean isPlaying(Context ctx) {
        return prefs(ctx).getBoolean("playing", false);
    }

    static boolean hasTrack(Context ctx) {
        return !title(ctx).isEmpty();
    }

    static void saveCover(Context ctx, Bitmap bitmap) {
        File f = new File(ctx.getFilesDir(), COVER_FILE);
        if (bitmap == null) {
            //noinspection ResultOfMethodCallIgnored
            f.delete();
            return;
        }
        try (FileOutputStream out = new FileOutputStream(f)) {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
        } catch (Exception ignored) {
            // Widget falls back to the placeholder art.
        }
    }

    static Bitmap loadCover(Context ctx) {
        File f = new File(ctx.getFilesDir(), COVER_FILE);
        return f.exists() ? BitmapFactory.decodeFile(f.getPath()) : null;
    }
}
