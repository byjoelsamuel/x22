#!/usr/bin/env python3
"""Generate the x22 app icons: pastel ordered-dither field + dot-matrix "x22".

Usage: python3 scripts/make-icon.py [out_dir]   (default: web/public/icons)
       python3 scripts/make-icon.py --android web/android/app/src/main/res
Everything is drawn on a 128x128 pixel grid, then upscaled with nearest-neighbour
so the dither stays crisp.
"""
import math
import sys
from pathlib import Path

from PIL import Image

GRID = 128

# Pastel palette (light → deep). The ink is a deep plum so "x22" stays readable.
PALETTE = [
    (255, 241, 186),  # butter
    (255, 203, 178),  # peach
    (255, 173, 190),  # rose
    (201, 184, 240),  # lavender
    (176, 214, 248),  # sky
    (178, 232, 208),  # mint
]
INK = (43, 33, 64)
SHADOW = (142, 122, 196)
LED = (255, 110, 140)

BAYER4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
]

GLYPHS = {
    "x": [".....", ".....", "X...X", ".X.X.", "..X..", ".X.X.", "X...X"],
    "2": [".XXX.", "X...X", "....X", "...X.", "..X..", ".X...", "XXXXX"],
}


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def field(x, y):
    """Smooth target colour: diagonal lavender→sky→mint plus a peach/butter glow."""
    u = (x + y) / (2 * GRID)
    if u < 0.5:
        base = lerp(PALETTE[3], PALETTE[4], u / 0.5)
    else:
        base = lerp(PALETTE[4], PALETTE[5], (u - 0.5) / 0.5)
    # warm glow, upper-left, like light on an earbud case
    d = math.hypot(x - GRID * 0.22, y - GRID * 0.18) / (GRID * 0.55)
    g = max(0.0, 1 - d) ** 1.4
    warm = lerp(PALETTE[1], PALETTE[0], max(0.0, 1 - d * 1.6))
    return lerp(base, warm, g)


def dither(rgb, x, y):
    """Ordered dither between the two nearest palette colours."""
    dist = sorted(PALETTE, key=lambda c: sum((c[i] - rgb[i]) ** 2 for i in range(3)))
    a, b = dist[0], dist[1]
    ab = [b[i] - a[i] for i in range(3)]
    denom = sum(v * v for v in ab) or 1
    t = sum((rgb[i] - a[i]) * ab[i] for i in range(3)) / denom
    t = min(max(t, 0.0), 1.0)
    threshold = (BAYER4[y % 4][x % 4] + 0.5) / 16
    return b if t > threshold else a


def draw_text(img, text, pitch=5, dot=4):
    cols = len(text) * 5 + (len(text) - 1)
    w, h = cols * pitch - (pitch - dot), 7 * pitch - (pitch - dot)
    ox, oy = (GRID - w) // 2, (GRID - h) // 2 + 3
    px = img.load()

    def dot_at(cx, cy, colour, checker=False):
        for dy in range(dot):
            for dx in range(dot):
                corner = dot >= 4 and dx in (0, dot - 1) and dy in (0, dot - 1)
                if corner:
                    continue  # round the dot off
                x, y = cx + dx, cy + dy
                if checker and (x + y) % 2:
                    continue
                if 0 <= x < GRID and 0 <= y < GRID:
                    px[x, y] = colour

    positions = []
    col = 0
    for ch in text:
        for r, row in enumerate(GLYPHS[ch]):
            for c, v in enumerate(row):
                if v == "X":
                    positions.append((ox + (col + c) * pitch, oy + r * pitch))
        col += 6
    for x, y in positions:  # dithered drop shadow first
        dot_at(x + 2, y + 2, SHADOW, checker=True)
    for x, y in positions:
        dot_at(x, y, INK)

    # small "recording LED" dot, a nod to Nothing's red accent (pastel here)
    dot_at(ox + w - dot, oy - 10, LED)


def render(pitch=6, dot=5):
    img = Image.new("RGB", (GRID, GRID))
    px = img.load()
    for y in range(GRID):
        for x in range(GRID):
            px[x, y] = dither(field(x, y), x, y)
    draw_text(img, "x22", pitch, dot)
    return img


def rounded(img, radius):
    """Pixel-stepped rounded corners (transparent) for the non-maskable icon."""
    out = img.convert("RGBA")
    px = out.load()
    for y in range(GRID):
        for x in range(GRID):
            cx = min(max(x, radius), GRID - 1 - radius)
            cy = min(max(y, radius), GRID - 1 - radius)
            if math.hypot(x - cx, y - cy) > radius:
                px[x, y] = (0, 0, 0, 0)
    return out


def circle(img):
    """Circular mask for ic_launcher_round."""
    out = img.convert("RGBA")
    px = out.load()
    r = GRID / 2
    for y in range(GRID):
        for x in range(GRID):
            if math.hypot(x + 0.5 - r, y + 0.5 - r) > r:
                px[x, y] = (0, 0, 0, 0)
    return out


def scaled(im, size):
    big = im.resize((GRID * 4, GRID * 4), Image.NEAREST)
    return big if size == GRID * 4 else big.resize((size, size), Image.BOX)


DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def android(res):
    res = Path(res)
    square = render()
    legacy = rounded(square, 26)
    # Adaptive icons show ~72 of 108dp, so the foreground text is drawn smaller.
    foreground = render(pitch=4, dot=3)
    for name, d in DENSITIES.items():
        folder = res / f"mipmap-{name}"
        folder.mkdir(parents=True, exist_ok=True)
        scaled(legacy, round(48 * d)).save(folder / "ic_launcher.png", optimize=True)
        scaled(circle(square), round(48 * d)).save(folder / "ic_launcher_round.png", optimize=True)
        scaled(foreground, round(108 * d)).save(folder / "ic_launcher_foreground.png", optimize=True)

    # Splash: near-black with the rounded icon centred, at every size the template ships.
    for f in res.glob("drawable*/splash.png"):
        w, h = Image.open(f).size
        canvas = Image.new("RGB", (w, h), (10, 10, 10))
        icon = scaled(legacy, int(min(w, h) * 0.32))
        canvas.paste(icon, ((w - icon.width) // 2, (h - icon.height) // 2), icon)
        canvas.save(f, optimize=True)
    widget_assets(res)
    print(f"android icons written to {res}")


def widget_assets(res):
    """Placeholder cover + widget-picker preview for the home-screen player widget."""
    from PIL import ImageDraw, ImageFont

    nodpi = res / "drawable-nodpi"
    nodpi.mkdir(parents=True, exist_ok=True)
    blank = Image.new("RGB", (GRID, GRID))
    px = blank.load()
    for y in range(GRID):
        for x in range(GRID):
            px[x, y] = dither(field(x, y), x, y)
    cover = rounded(blank, 14)
    scaled(cover, 288).save(nodpi / "widget_cover_placeholder.png", optimize=True)

    # Preview: dark card, dithered cover, text, lavender play button (≈ 4×2 cells at 2×).
    w, h, pad, art = 640, 272, 24, 224
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, w - 1, h - 1], 48, fill=(14, 14, 14), outline=(42, 42, 42), width=2)
    img.paste(scaled(rounded(render(), 14), art), (pad, pad), scaled(rounded(render(), 14), art))
    font = lambda size: ImageFont.load_default(size=size)
    tx = pad + art + 28
    d.text((tx, pad + 30), "Midnight Drive", font=font(32), fill=(242, 242, 242))
    d.text((tx, pad + 70), "Kavinsky", font=font(24), fill=(138, 138, 138))
    cy = pad + art - 44
    for i, cx in enumerate([tx + 40, tx + 148, tx + 256]):
        r = 44 if i == 1 else 40
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(201, 184, 240) if i == 1 else (29, 29, 29))
        ink = (26, 22, 38) if i == 1 else (242, 242, 242)
        if i == 1:
            d.rectangle([cx - 12, cy - 16, cx - 4, cy + 16], fill=ink)
            d.rectangle([cx + 4, cy - 16, cx + 12, cy + 16], fill=ink)
        else:
            s = -1 if i == 0 else 1
            d.polygon([(cx - 10 * s, cy - 16), (cx - 10 * s, cy + 16), (cx + 8 * s, cy)], fill=ink)
            bar = sorted([cx + 10 * s, cx + 14 * s])  # the |◀ / ▶| stop bar
            d.rectangle([bar[0], cy - 16, bar[1], cy + 16], fill=ink)
    img.save(nodpi / "widget_preview.png", optimize=True)


def main():
    if len(sys.argv) > 2 and sys.argv[1] == "--android":
        return android(sys.argv[2])
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "web/public/icons")
    out.mkdir(parents=True, exist_ok=True)
    square = render()
    round_ = rounded(square, 26)
    maskable = render(pitch=5, dot=4)  # smaller: stays inside the 80% safe zone

    def save(im, size, name):
        big = im.resize((GRID * 4, GRID * 4), Image.NEAREST)
        if size != GRID * 4:
            big = big.resize((size, size), Image.BOX)
        big.save(out / name, optimize=True)

    save(round_, 512, "icon-512.png")
    save(round_, 192, "icon-192.png")
    save(maskable, 512, "icon-maskable-512.png")  # full bleed for Android masks
    save(square, 180, "apple-touch-icon.png")
    save(round_, 64, "favicon-64.png")
    print(f"icons written to {out}")


if __name__ == "__main__":
    main()
