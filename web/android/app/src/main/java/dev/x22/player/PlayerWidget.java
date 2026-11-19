package dev.x22.player;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Bitmap;
import android.widget.RemoteViews;

/** Home-screen widget: cover art, title, and previous / play-pause / next. */
public class PlayerWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        RemoteViews views = build(ctx);
        for (int id : ids) mgr.updateAppWidget(id, views);
    }

    static void updateAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, PlayerWidget.class));
        if (ids.length == 0) return;
        RemoteViews views = build(ctx);
        for (int id : ids) mgr.updateAppWidget(id, views);
    }

    static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_player);
        boolean hasTrack = NowPlayingStore.hasTrack(ctx);
        boolean playing = hasTrack && NowPlayingStore.isPlaying(ctx);
        boolean live = NowPlayingPlugin.isAlive();

        v.setTextViewText(R.id.widget_label, playing ? ctx.getString(R.string.widget_playing) : ctx.getString(R.string.widget_paused));
        v.setTextViewText(R.id.widget_title, hasTrack ? NowPlayingStore.title(ctx) : ctx.getString(R.string.widget_idle_title));
        v.setTextViewText(R.id.widget_artist, hasTrack ? NowPlayingStore.artist(ctx) : ctx.getString(R.string.widget_idle_subtitle));

        Bitmap cover = hasTrack ? NowPlayingStore.loadCover(ctx) : null;
        if (cover != null) v.setImageViewBitmap(R.id.widget_cover, cover);
        else v.setImageViewResource(R.id.widget_cover, R.drawable.widget_cover_placeholder);

        v.setImageViewResource(R.id.widget_play, playing ? R.drawable.ic_widget_pause_dark : R.drawable.ic_widget_play_dark);
        v.setContentDescription(R.id.widget_play, ctx.getString(playing ? R.string.action_pause : R.string.action_play));

        PendingIntent open = MediaActionReceiver.openApp(ctx);
        v.setOnClickPendingIntent(R.id.widget_cover, open);
        v.setOnClickPendingIntent(R.id.widget_text, open);
        if (live && hasTrack) {
            v.setOnClickPendingIntent(R.id.widget_prev, MediaActionReceiver.intent(ctx, MediaActionReceiver.PREV, 1));
            v.setOnClickPendingIntent(R.id.widget_play, MediaActionReceiver.intent(ctx, MediaActionReceiver.TOGGLE, 2));
            v.setOnClickPendingIntent(R.id.widget_next, MediaActionReceiver.intent(ctx, MediaActionReceiver.NEXT, 3));
        } else {
            // Nothing to control yet — every button opens x22.
            v.setOnClickPendingIntent(R.id.widget_prev, open);
            v.setOnClickPendingIntent(R.id.widget_play, open);
            v.setOnClickPendingIntent(R.id.widget_next, open);
        }
        return v;
    }
}
