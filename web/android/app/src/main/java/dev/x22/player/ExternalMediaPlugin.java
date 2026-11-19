package dev.x22.player;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** JavaScript side of {@link ExternalMedia}: see and control YouTube Music / other players. */
@CapacitorPlugin(name = "ExternalMedia")
public class ExternalMediaPlugin extends Plugin implements ExternalMedia.Listener {

    private ExternalMedia media;

    @Override
    public void load() {
        media = ExternalMedia.get(getContext());
        media.setListener(this);
        media.start();
    }

    @Override
    protected void handleOnResume() {
        // The user may have just granted (or revoked) access in system settings.
        media.start();
        notifyListeners("status", status());
    }

    @Override
    protected void handleOnDestroy() {
        media.setListener(null);
    }

    @Override
    public void onExternalChanged(JSObject state) {
        notifyListeners("state", state);
    }

    private JSObject status() {
        JSObject o = new JSObject();
        o.put("granted", ExternalMedia.hasAccess(getContext()));
        return o;
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void openAccessSettings(PluginCall call) {
        try {
            getActivity().startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("Notification access settings are not available on this device");
        }
    }

    @PluginMethod
    public void getState(PluginCall call) {
        call.resolve(media.current());
    }

    @PluginMethod
    public void control(PluginCall call) {
        String action = call.getString("action", "");
        Double position = call.getDouble("position", 0d);
        JSObject o = new JSObject();
        o.put("ok", media.control(action, position == null ? 0 : position.longValue()));
        call.resolve(o);
    }

    @PluginMethod
    public void openApp(PluginCall call) {
        try {
            getActivity().startActivity(media.launchIntent());
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No app to open");
        }
    }

    /**
     * Experimental EQ for other apps: { enabled, bands: [{cutoff, gain}], preamp, left, right }.
     * Resolves { status: "off" | "global" | "attached:<package>" | "unsupported" }.
     */
    @PluginMethod
    public void setEq(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        com.getcapacitor.JSArray bands = call.getArray("bands", new com.getcapacitor.JSArray());
        double preamp = call.getDouble("preamp", 0d);
        double left = call.getDouble("left", 0d);
        double right = call.getDouble("right", 0d);
        ExternalEq eq = ExternalEq.get(getContext());
        new Thread(() -> {
            JSObject o = new JSObject();
            o.put("status", eq.configure(enabled, bands.toString(), preamp, left, right));
            call.resolve(o);
        }).start();
    }

    /** Preferences the native widget needs when the web app is not running. */
    @PluginMethod
    public void setPrefs(PluginCall call) {
        NowPlayingStore.setDitherPref(getContext(), Boolean.TRUE.equals(call.getBoolean("dither", true)));
        call.resolve();
    }
}
