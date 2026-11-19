package dev.x22.player;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Downloads cover art and renders it like the app: pastel Bayer dither, rounded corners. */
final class CoverArt {

    static final int SIZE = 288; // px; small enough for RemoteViews' bitmap budget
    private static final int GRID = 96; // dither resolution, same as the app's hero art

    // Pastel ramp from the app icon, dark → light (see web/src/ui/dither.ts).
    private static final int[] RAMP = {
        0xFF1A1626, // ink
        0xFF8E7AC4, // deep lavender
        0xFFC9B8F0, // lavender
        0xFFFFCBB2, // peach
        0xFFFFF1BA, // butter
    };
    private static final int[] BAYER = {0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5};

    private CoverArt() {}

    static Bitmap load(String url, boolean dither) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            if (conn.getResponseCode() != 200) return null;
            Bitmap src;
            try (InputStream in = conn.getInputStream()) {
                src = BitmapFactory.decodeStream(in);
            }
            return src == null ? null : render(src, dither);
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** Square-crop, optionally dither, round the corners — widget-ready. */
    static Bitmap render(Bitmap src, boolean dither) {
        Bitmap square = centerCrop(src, dither ? GRID : SIZE);
        Bitmap art = dither ? Bitmap.createScaledBitmap(ditherToRamp(square), SIZE, SIZE, false) : square;
        return rounded(art, SIZE * 0.11f);
    }

    private static Bitmap centerCrop(Bitmap src, int size) {
        int s = Math.min(src.getWidth(), src.getHeight());
        Bitmap cropped = Bitmap.createBitmap(src, (src.getWidth() - s) / 2, (src.getHeight() - s) / 2, s, s);
        return Bitmap.createScaledBitmap(cropped, size, size, true);
    }

    static Bitmap ditherToRamp(Bitmap in) {
        int w = in.getWidth(), h = in.getHeight();
        int[] px = new int[w * h];
        in.getPixels(px, 0, w, 0, 0, w, h);
        int steps = RAMP.length - 1;
        for (int i = 0; i < px.length; i++) {
            int c = px[i];
            int x = i % w, y = i / w;
            double l = (0.2126 * ((c >> 16) & 0xFF) + 0.7152 * ((c >> 8) & 0xFF) + 0.0722 * (c & 0xFF)) / 255.0;
            l = Math.min(1, Math.max(0, (l - 0.5) * 1.15 + 0.5));
            double v = l * steps;
            int lo = (int) Math.floor(v);
            double t = (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16.0;
            px[i] = RAMP[Math.min(steps, v - lo > t ? lo + 1 : lo)];
        }
        Bitmap out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        out.setPixels(px, 0, w, 0, 0, w, h);
        return out;
    }

    private static Bitmap rounded(Bitmap src, float radius) {
        Bitmap out = Bitmap.createBitmap(src.getWidth(), src.getHeight(), Bitmap.Config.ARGB_8888);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setShader(new BitmapShader(src, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
        new Canvas(out).drawRoundRect(new RectF(0, 0, src.getWidth(), src.getHeight()), radius, radius, paint);
        return out;
    }
}
