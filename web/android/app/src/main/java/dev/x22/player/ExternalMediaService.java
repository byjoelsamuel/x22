package dev.x22.player;

import android.service.notification.NotificationListenerService;

/**
 * Exists so the user can grant x22 "Notification access", which is what Android requires
 * before an app may see and control other apps' media sessions. x22 never reads or stores
 * notification content — it only uses the media sessions (see {@link ExternalMedia}).
 */
public class ExternalMediaService extends NotificationListenerService {

    @Override
    public void onListenerConnected() {
        ExternalMedia.get(this).start();
        ExternalEq.get(this).startListening();
    }

    @Override
    public void onListenerDisconnected() {
        ExternalMedia.get(this).stop();
        ExternalEq.get(this).stopListening();
    }
}
