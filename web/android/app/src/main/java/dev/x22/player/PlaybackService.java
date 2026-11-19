package dev.x22.player;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.IBinder;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

/**
 * Media-playback foreground service. Playback itself happens in the WebView; this keeps the
 * process alive in the background, shows the media notification / lock-screen controls, and
 * receives Bluetooth headset buttons (earbuds, IEM inline remotes) through a MediaSession.
 */
public class PlaybackService extends Service {

    private static final String TAG = "x22";
    private static final String CHANNEL = "playback";
    private static final int NOTIFICATION_ID = 22;

    private static volatile PlaybackService running;

    private MediaSessionCompat session;
    private boolean foreground;

    /** Reflect the stored state: start when playback begins, refresh when already running. */
    static void sync(Context ctx) {
        PlaybackService s = running;
        if (s != null) {
            s.refresh(false);
            return;
        }
        if (!NowPlayingStore.isPlaying(ctx)) return;
        try {
            ContextCompat.startForegroundService(ctx, new Intent(ctx, PlaybackService.class));
        } catch (Exception e) {
            // Android 12+ refuses to start a foreground service from the background.
            Log.w(TAG, "Could not start playback service", e);
        }
    }

    static void stop() {
        PlaybackService s = running;
        if (s != null) s.shutdown();
    }

    @Override
    public void onCreate() {
        super.onCreate();
        running = this;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, getString(R.string.channel_playback), NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        session = new MediaSessionCompat(this, "x22");
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { NowPlayingPlugin.dispatch("play"); }
            @Override public void onPause() { NowPlayingPlugin.dispatch("pause"); }
            @Override public void onStop() { NowPlayingPlugin.dispatch("pause"); }
            @Override public void onSkipToNext() { NowPlayingPlugin.dispatch("next"); }
            @Override public void onSkipToPrevious() { NowPlayingPlugin.dispatch("prev"); }
        });
        session.setSessionActivity(MediaActionReceiver.openApp(this));
        session.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        refresh(true);
        return START_NOT_STICKY;
    }

    void refresh(boolean fromStart) {
        boolean playing = NowPlayingStore.isPlaying(this);
        Bitmap cover = NowPlayingStore.loadCover(this);

        MediaMetadataCompat.Builder meta = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, NowPlayingStore.title(this))
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, NowPlayingStore.artist(this))
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, NowPlayingStore.album(this));
        if (cover != null) meta.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, cover);
        session.setMetadata(meta.build());
        session.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE
                | PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS | PlaybackStateCompat.ACTION_STOP)
            .setState(playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, playing ? 1f : 0f)
            .build());

        Notification n = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_x22)
            .setContentTitle(NowPlayingStore.title(this))
            .setContentText(NowPlayingStore.artist(this))
            .setLargeIcon(cover)
            .setContentIntent(MediaActionReceiver.openApp(this))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setOngoing(playing)
            .addAction(R.drawable.ic_widget_prev, getString(R.string.action_prev),
                MediaActionReceiver.intent(this, MediaActionReceiver.PREV, 11))
            .addAction(playing ? R.drawable.ic_widget_pause : R.drawable.ic_widget_play,
                getString(playing ? R.string.action_pause : R.string.action_play),
                MediaActionReceiver.intent(this, MediaActionReceiver.TOGGLE, 12))
            .addAction(R.drawable.ic_widget_next, getString(R.string.action_next),
                MediaActionReceiver.intent(this, MediaActionReceiver.NEXT, 13))
            .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                .setMediaSession(session.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2))
            .build();

        // startForeground is required right after startForegroundService, and wanted while playing.
        if (playing || fromStart) {
            int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0;
            try {
                ServiceCompat.startForeground(this, NOTIFICATION_ID, n, type);
                foreground = true;
            } catch (Exception e) {
                Log.w(TAG, "startForeground failed", e);
            }
        }
        if (!playing) {
            // Paused: keep the notification but let the system reclaim the process if needed.
            if (foreground) {
                ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH);
                foreground = false;
            }
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.notify(NOTIFICATION_ID, n);
        }
    }

    void shutdown() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        foreground = false;
        stopSelf();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // App swiped away — the WebView (and the music) is gone too.
        NowPlayingStore.setPlaying(this, false);
        PlayerWidget.updateAll(this);
        shutdown();
    }

    @Override
    public void onDestroy() {
        running = null;
        if (session != null) session.release();
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(NOTIFICATION_ID);
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
