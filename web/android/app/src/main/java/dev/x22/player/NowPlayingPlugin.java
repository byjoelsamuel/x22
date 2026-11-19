package dev.x22.player;

import android.content.Context;
import android.graphics.Bitmap;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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
        final Context ctx = getContext().getApplicationContext();

        io.execute(() -> {
            String coverKey = cover == null ? null : cover + "|" + dither;
            if (coverKey == null || !coverKey.equals(lastCoverKey)) {
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
