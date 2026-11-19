package dev.x22.player;

import android.annotation.SuppressLint;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.media.audiofx.AudioEffect;
import android.media.audiofx.DynamicsProcessing;
import android.os.Build;
import android.util.Log;

import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;

/**
 * Experimental: applies x22's EQ to other apps (YouTube Music first) with Android's
 * DynamicsProcessing effect (API 28+).
 *
 * Players that announce their audio session (ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION) get the
 * EQ on exactly their audio. Otherwise we fall back to session 0, the global output mix, which
 * some phones honour and others ignore. Crossfeed / dither / mono only exist in x22's own
 * Web Audio graph and are not applied here.
 */
final class ExternalEq {

    private static final String TAG = "x22.eq";
    private static final String PREFS = "x22.eq";
    private static final int GLOBAL_SESSION = 0;

    // Holds only the application context, which lives as long as the process.
    @SuppressLint("StaticFieldLeak")
    private static ExternalEq instance;

    static synchronized ExternalEq get(Context ctx) {
        if (instance == null) instance = new ExternalEq(ctx.getApplicationContext());
        return instance;
    }

    private final Context ctx;
    /** Audio sessions announced by players: package → session id. */
    private final Map<String, Integer> sessions = new HashMap<>();
    private DynamicsProcessing effect;
    private int attachedSession = -1;
    private int attachedBands = -1;
    private String attachedPackage;
    private String status = "off";
    private boolean receiverRegistered;

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            String pkg = i.getStringExtra(AudioEffect.EXTRA_PACKAGE_NAME);
            int session = i.getIntExtra(AudioEffect.EXTRA_AUDIO_SESSION, AudioEffect.ERROR);
            if (pkg == null || session == AudioEffect.ERROR) return;
            synchronized (ExternalEq.this) {
                if (AudioEffect.ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION.equals(i.getAction())) sessions.put(pkg, session);
                else if (Integer.valueOf(session).equals(sessions.get(pkg))) sessions.remove(pkg);
            }
            apply();
        }
    };

    private ExternalEq(Context ctx) {
        this.ctx = ctx;
    }

    /** Start listening for players' audio sessions (from the always-bound listener service). */
    synchronized void startListening() {
        if (receiverRegistered) return;
        IntentFilter f = new IntentFilter();
        f.addAction(AudioEffect.ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION);
        f.addAction(AudioEffect.ACTION_CLOSE_AUDIO_EFFECT_CONTROL_SESSION);
        ContextCompat.registerReceiver(ctx, receiver, f, ContextCompat.RECEIVER_EXPORTED);
        receiverRegistered = true;
        apply();
    }

    synchronized void stopListening() {
        if (!receiverRegistered) return;
        ctx.unregisterReceiver(receiver);
        receiverRegistered = false;
    }

    // ── Config from the app (persisted so it survives the app being closed) ──

    private SharedPreferences prefs() {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Store the EQ sent by the web app and (re)apply it. Returns the new status. */
    String configure(boolean enabled, String bandsJson, double preampDb, double leftDb, double rightDb) {
        prefs().edit()
            .putBoolean("enabled", enabled)
            .putString("bands", bandsJson)
            .putFloat("preamp", (float) preampDb)
            .putFloat("left", (float) leftDb)
            .putFloat("right", (float) rightDb)
            .apply();
        return apply();
    }

    synchronized String status() {
        return status;
    }

    /** Attach to the best session (followed app › YT Music › global) and load the bands. */
    synchronized String apply() {
        SharedPreferences p = prefs();
        if (!p.getBoolean("enabled", false)) {
            release();
            return status = "off";
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            release();
            return status = "unsupported";
        }
        JSONArray bands;
        try {
            bands = new JSONArray(p.getString("bands", "[]"));
        } catch (Exception e) {
            return status = "unsupported";
        }

        String followed = ExternalMedia.get(ctx).followedPackage();
        String pkg = followed != null && sessions.containsKey(followed) ? followed
            : sessions.containsKey(ExternalMedia.YT_MUSIC) ? ExternalMedia.YT_MUSIC : null;
        int session = pkg != null ? sessions.get(pkg) : GLOBAL_SESSION;

        try {
            if (effect == null || attachedSession != session || attachedBands != bands.length()) {
                release();
                DynamicsProcessing.Config cfg = new DynamicsProcessing.Config.Builder(
                    DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION, 2,
                    true, bands.length(), false, 0, false, 0, true).build();
                effect = new DynamicsProcessing(0, session, cfg);
                attachedSession = session;
                attachedBands = bands.length();
                attachedPackage = pkg;
            }
            for (int i = 0; i < bands.length(); i++) {
                JSONObject b = bands.getJSONObject(i);
                effect.setPreEqBandAllChannelsTo(i,
                    new DynamicsProcessing.EqBand(true, (float) b.getDouble("cutoff"), (float) b.getDouble("gain")));
            }
            float preamp = p.getFloat("preamp", 0f);
            effect.setInputGainbyChannel(0, preamp + p.getFloat("left", 0f));
            effect.setInputGainbyChannel(1, preamp + p.getFloat("right", 0f));
            // Limiter catches any boost the preamp didn't cover.
            effect.setLimiterAllChannelsTo(new DynamicsProcessing.Limiter(true, true, 0, 1f, 60f, 10f, -1f, 0f));
            effect.setEnabled(true);
            status = pkg != null ? "attached:" + pkg : "global";
        } catch (Exception e) {
            Log.w(TAG, "Could not attach EQ", e);
            release();
            status = "unsupported";
        }
        return status;
    }

    private void release() {
        if (effect != null) {
            try {
                effect.setEnabled(false);
                effect.release();
            } catch (Exception ignored) {
                // already gone
            }
        }
        effect = null;
        attachedSession = -1;
        attachedBands = -1;
        attachedPackage = null;
    }

    synchronized String attachedPackage() {
        return attachedPackage;
    }
}
