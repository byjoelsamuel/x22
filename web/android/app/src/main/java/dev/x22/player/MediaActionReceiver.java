package dev.x22.player;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Receives widget / notification button presses and forwards them to the web player. */
public class MediaActionReceiver extends BroadcastReceiver {

    static final String PREV = "dev.x22.player.action.PREV";
    static final String TOGGLE = "dev.x22.player.action.TOGGLE";
    static final String NEXT = "dev.x22.player.action.NEXT";

    static PendingIntent intent(Context ctx, String action, int requestCode) {
        Intent i = new Intent(ctx, MediaActionReceiver.class).setAction(action);
        return PendingIntent.getBroadcast(ctx, requestCode, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static PendingIntent openApp(Context ctx) {
        Intent i = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        String js = PREV.equals(action) ? "prev" : NEXT.equals(action) ? "next" : TOGGLE.equals(action) ? "toggle" : null;
        if (js == null) return;
        if (NowPlayingStore.isExternal(ctx)) {
            // YouTube Music & co. are controlled natively — works even when x22 is closed.
            ExternalMedia.get(ctx).control(js, 0);
            return;
        }
        if (!NowPlayingPlugin.dispatch(js)) {
            // App isn't running: show the idle widget, whose buttons open the app.
            NowPlayingStore.setPlaying(ctx, false);
            PlaybackService.stop();
            PlayerWidget.updateAll(ctx);
        }
    }
}
