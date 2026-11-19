package dev.x22.player;

import android.content.Context;
import android.graphics.Bitmap;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Bridge between the web player and Android: the web app pushes "now playing" state here,
 * which drives the home-screen widget and the media notification. Button presses come back
 * to JavaScript as "action" events.
 */
@CapacitorPlugin(name = "NowPlaying")
public class NowPlayingPlugin extends Plugin {

    private static volatile NowPlayingPlugin instance;

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private String lastCoverKey;

    @Override
    public void load() {
        instance = this;
        Context ctx = getContext().getApplicationContext();
        io.execute(() -> PlayerWidget.updateAll(ctx));
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        Context ctx = getContext().getApplicationContext();
        NowPlayingStore.setPlaying(ctx, false);
        PlaybackService.stop();
        PlayerWidget.updateAll(ctx);
        io.shutdown();
    }

    static boolean isAlive() {
        return instance != null;
    }

    /** Forward a lock-screen seek (milliseconds) to the web player. */
    static boolean dispatchSeek(long positionMs) {
        NowPlayingPlugin p = instance;
        if (p == null) return false;
        JSObject data = new JSObject();
        data.put("action", "seek");
        data.put("position", positionMs);
        p.notifyListeners("action", data);
        return true;
    }

    /** Forward a control ("toggle", "play", "pause", "next", "prev") to the web player. */
    static boolean dispatch(String action) {
        NowPlayingPlugin p = instance;
        if (p == null) return false;
        JSObject data = new JSObject();
        data.put("action", action);
        p.notifyListeners("action", data);
        return true;
    }

    @PluginMethod
    public void update(PluginCall call) {
        final String title = call.getString("title", "");
        final String artist = call.getString("artist", "");
        final String album = call.getString("album", "");
        final String cover = call.getString("cover");
        final boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        final boolean dither = Boolean.TRUE.equals(call.getBoolean("dither", true));
        final long position = call.getLong("position", 0L);
        final long duration = call.getLong("duration", 0L);
        final Context ctx = getContext().getApplicationContext();

        NowPlayingStore.setDitherPref(ctx, dither);
        NowPlayingStore.savePosition(ctx, position, duration);
        io.execute(() -> {
            String coverKey = cover == null ? null : cover + "|" + dither;
            // Re-render when the track changed or another app's cover is in the widget.
            if (coverKey == null || !coverKey.equals(lastCoverKey) || NowPlayingStore.isExternal(ctx)) {
                Bitmap art = cover == null ? null : CoverArt.load(cover, dither);
                NowPlayingStore.saveCover(ctx, art);
                lastCoverKey = coverKey;
            }
            NowPlayingStore.save(ctx, title, artist, album, playing);
            PlayerWidget.updateAll(ctx);
            PlaybackService.sync(ctx);
        });
        call.resolve();
    }

    /**
     * Visualizer levels (0-1, one per bar) pushed by the web player a few times a second
     * while music plays. Held in memory only, never written to disk.
     */
    @PluginMethod
    public void levels(PluginCall call) {
        JSArray arr = call.getArray("levels", new JSArray());
        float[] out = new float[arr.length()];
        try {
            for (int i = 0; i < arr.length(); i++) out[i] = (float) arr.getDouble(i);
        } catch (JSONException e) {
            call.resolve();
            return;
        }
        PlayerWidget.setLevels(getContext().getApplicationContext(), out);
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        final Context ctx = getContext().getApplicationContext();
        io.execute(() -> {
            NowPlayingStore.clear(ctx);
            lastCoverKey = null;
            PlaybackService.stop();
            PlayerWidget.updateAll(ctx);
        });
        call.resolve();
    }
}
