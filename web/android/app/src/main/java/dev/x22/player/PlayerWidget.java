package dev.x22.player;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.widget.RemoteViews;

import java.util.HashMap;
import java.util.Map;

/**
 * Home-screen widget with three layouts that follow the widget's size:
 *   compact (2–3×1) cover · title · ⏯
 *   small  (2×2)   full-bleed cover + play/pause
 *   wide   (4×1)   cover · title · ⏮ ⏯ ⏭ in one row
 *   large  (4×2+)  cover filling the height · title / artist · controls
 * Android 12+ switches live while resizing; older versions pick on resize.
 */
public class PlayerWidget extends AppWidgetProvider {

    enum Size { COMPACT, SMALL, WIDE, LARGE }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, views(ctx, mgr, id));
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle options) {
        mgr.updateAppWidget(id, views(ctx, mgr, id));
    }

    static void updateAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, PlayerWidget.class));
        for (int id : ids) mgr.updateAppWidget(id, views(ctx, mgr, id));
    }

    private static RemoteViews views(Context ctx, AppWidgetManager mgr, int id) {
        State st = State.load(ctx);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // The launcher shows the largest layout that fits the current size.
            Map<SizeF, RemoteViews> map = new HashMap<>();
            map.put(new SizeF(110f, 50f), build(ctx, st, Size.COMPACT));
            map.put(new SizeF(110f, 110f), build(ctx, st, Size.SMALL));
            map.put(new SizeF(250f, 50f), build(ctx, st, Size.WIDE));
            map.put(new SizeF(250f, 110f), build(ctx, st, Size.LARGE));
            return new RemoteViews(map);
        }
        Bundle o = mgr.getAppWidgetOptions(id);
        int w = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
        int h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 110);
        return build(ctx, st, pick(w, h));
    }

    /** Which layout fits a widget of w × h dp (pre-Android 12). */
    static Size pick(int widthDp, int heightDp) {
        if (heightDp < 100) return widthDp < 250 ? Size.COMPACT : Size.WIDE;
        return widthDp < 250 ? Size.SMALL : Size.LARGE;
    }

    /** Everything the widget shows, read once per update. */
    static final class State {
        boolean hasTrack, playing, live;
        String title, subtitle;
        Bitmap cover;

        static State load(Context ctx) {
            State s = new State();
            s.hasTrack = NowPlayingStore.hasTrack(ctx);
            s.playing = s.hasTrack && NowPlayingStore.isPlaying(ctx);
            boolean external = NowPlayingStore.isExternal(ctx);
            s.live = external ? ExternalMedia.get(ctx).hasController() : NowPlayingPlugin.isAlive();
            s.title = s.hasTrack ? NowPlayingStore.title(ctx) : ctx.getString(R.string.widget_idle_title);
            String artist = s.hasTrack ? NowPlayingStore.artist(ctx) : ctx.getString(R.string.widget_idle_subtitle);
            String app = NowPlayingStore.app(ctx);
            s.subtitle = external && !app.isEmpty() && s.hasTrack ? artist + " · " + app : artist;
            s.cover = s.hasTrack ? NowPlayingStore.loadCover(ctx) : null;
            return s;
        }
    }

    static RemoteViews build(Context ctx, State st, Size size) {
        int layout = size == Size.COMPACT ? R.layout.widget_player_compact
            : size == Size.SMALL ? R.layout.widget_player_small
            : size == Size.WIDE ? R.layout.widget_player_wide : R.layout.widget_player;
        RemoteViews v = new RemoteViews(ctx.getPackageName(), layout);

        v.setTextViewText(R.id.widget_title, st.title);
        v.setTextViewText(R.id.widget_artist, st.subtitle);

        if (st.cover != null) {
            // Full-bleed (small) is clipped by the widget's own corners; the others get their own.
            Bitmap art = size == Size.SMALL ? st.cover
                : CoverArt.rounded(st.cover, st.cover.getWidth() * (size == Size.LARGE ? 0.11f : 0.16f));
            v.setImageViewBitmap(R.id.widget_cover, art);
        } else {
            v.setImageViewResource(R.id.widget_cover, R.drawable.widget_cover_placeholder);
        }

        v.setImageViewResource(R.id.widget_play, st.playing ? R.drawable.ic_widget_pause_dark : R.drawable.ic_widget_play_dark);
        v.setContentDescription(R.id.widget_play, ctx.getString(st.playing ? R.string.action_pause : R.string.action_play));

        PendingIntent open = MediaActionReceiver.openApp(ctx);
        v.setOnClickPendingIntent(R.id.widget_cover, open);
        v.setOnClickPendingIntent(R.id.widget_text, open);
        boolean controls = st.live && st.hasTrack;
        v.setOnClickPendingIntent(R.id.widget_play, controls ? MediaActionReceiver.intent(ctx, MediaActionReceiver.TOGGLE, 2) : open);
        if (size == Size.WIDE || size == Size.LARGE) {
            // Nothing to control yet → every button opens x22.
            v.setOnClickPendingIntent(R.id.widget_prev, controls ? MediaActionReceiver.intent(ctx, MediaActionReceiver.PREV, 1) : open);
            v.setOnClickPendingIntent(R.id.widget_next, controls ? MediaActionReceiver.intent(ctx, MediaActionReceiver.NEXT, 3) : open);
        }
        return v;
    }
}
