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

    static void save(Context ctx, String title, String artist, String album, boolean playing) {
        prefs(ctx).edit()
            .putString("title", title)
            .putString("artist", artist)
            .putString("album", album)
            .putBoolean("playing", playing)
            .apply();
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
