<p align="center">
  <img src="web/public/icons/icon-192.png" width="96" alt="x22 icon" />
</p>

<h1 align="center">x22</h1>

<p align="center">
  A minimal, earbud-app-style music app for Android and the web.<br/>
  Use it with the players you already have, and optionally stream lossless from your homelab
  (<a href="https://www.navidrome.org/">Navidrome</a>).<br/>
  A 10-band EQ on the home screen, IEM tuning, a home-screen widget, and a dithered pastel look.
</p>

---

## Features

| | |
| --- | --- |
| **Works with your player** | *(Android)* Keep listening in **YouTube Music**, or any other player, and see, skip and seek it from x22, its home-screen widget and gestures. x22 follows whatever is playing, and you can pin a source from the chip on Home. Grant **Notification access** once; x22 only uses it for media sessions. |
| **Homelab is optional** | x22 works without a server. Connect Navidrome whenever you like, from onboarding, Settings, or the Library and Import tabs. |
| **Lossless & hi-res** | Streams the original file (`format=raw`), so FLAC, ALAC, WAV and AIFF at any bit depth or sample rate play untouched. The audio output opens at the track's sample rate when the device allows it. A quality badge shows what's playing (e.g. `FLAC 24/96`). |
| **EQ on the home screen** | 10 bands you can drag, presets (Balanced, More bass, Voice, More treble, IEM warm, Late night), custom presets, and an auto preamp so nothing clips. |
| **IEM support** | Import an [AutoEq](https://autoeq.app) `ParametricEQ.txt` for your IEMs. Crossfeed, balance and mono are included too. |
| **Earbud-app features** | Sound modes, tap / double / triple / hold gestures on the artwork, a sleep timer, lock-screen and Bluetooth-button controls, and near-gapless playback. |
| **Dither** | Pastel Bayer-dithered artwork and optional TPDF audio dither (16 or 24-bit). |
| **Import from the app** | Upload songs from your phone or PC. They're filed into `Uploads/Artist/Album/` by their tags, and Navidrome rescans automatically. |
| **Installable** | Installs as a PWA over HTTPS, or as an Android APK built by GitHub Actions. |

## How it fits together

```
phone / PC / APK ──HTTPS──▶ Caddy (homelab laptop, mkcert cert)
                              ├─ /         x22 app
                              ├─ /rest/*   ──▶ Navidrome :4533
                              └─ /api/*    ──▶ uploader ──▶ music folder ──▶ Navidrome rescan
```

## Set up the homelab (optional)

You need Docker and Docker Compose, an existing Navidrome, and [mkcert](https://github.com/FiloSottile/mkcert).

1. **Make the certificate.** Follow [`deploy/certs/README.md`](deploy/certs/README.md), then trust the CA on your phone.
2. **Configure:**

   ```bash
   cd deploy && cp .env.example .env
   ```

   Edit `.env`. At minimum set `MUSIC_DIR` (the folder Navidrome scans) and `PUID`/`PGID` (its owner, from `id`).
3. **Start:**

   ```bash
   docker compose up -d --build
   ```

4. Open **https://192.168.0.100**, choose **Connect** and log in with your Navidrome account. Leave *Server* empty.
5. **Install:** in Chrome, use *⋮ → Install app*; in Safari, use *Share → Add to Home Screen*.

To rescan after uploads, your Navidrome user must be an admin. Otherwise, new songs show up on Navidrome's next scheduled scan.

## Android app

Every push to `main` builds a debug APK. Download it from **Actions → Android → Artifacts**. Version tags (`v1.0.0`) attach APKs to a GitHub Release.

1. Install the APK. Android will ask you to allow installs from your browser or file manager.
2. Install the mkcert CA on the phone (step 1 above).
3. Open x22 and set *Server* to `https://192.168.0.100`.

**Home-screen widget:** long-press your home screen → *Widgets* → **x22 player** (4×2). It shows the dithered cover, title and artist with ⏮ ⏯ ⏭ buttons. Tapping the cover opens the app. While music plays, x22 also runs a media notification. That keeps playback alive in the background and lets your earbuds' or IEM remote's buttons control x22.

**Signed release builds (optional):** create a keystore once, keep it safe, and add four repository secrets.

```bash
keytool -genkey -v -keystore x22.jks -alias x22 -keyalg RSA -keysize 2048 -validity 10000
```

```bash
base64 -w0 x22.jks
```

| Secret | Value |
| --- | --- |
| `X22_KEYSTORE_BASE64` | output of the `base64` command above |
| `X22_KEYSTORE_PASSWORD` | keystore password |
| `X22_KEY_ALIAS` | `x22` |
| `X22_KEY_PASSWORD` | key password |

Build locally with the Android SDK and JDK 21:

```bash
cd web && npm run android:apk
```

## Develop

```bash
cd web && npm install && npm run dev
```

Point the dev server at your servers in `web/.env.local`:

```
NAVIDROME_URL=http://192.168.0.100:4533
UPLOADER_URL=http://192.168.0.100:4600
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on your LAN |
| `npm test` | Unit tests (web: Vitest, uploader: `node --test`) |
| `npm run lint` | ESLint |
| `npm run build` | Production build + service worker |
| `python3 scripts/make-icon.py` | Regenerate the dithered icons (`--android <res>` for Android) |

## Troubleshooting

- **"Install app" doesn't appear.** The page must be HTTPS with a trusted cert. Check the padlock, and install the mkcert CA on that device.
- **Dither options are greyed out.** The audio dither needs HTTPS (it runs in an AudioWorklet).
- **A track won't play on iPhone.** Safari can't decode some formats (e.g. Opus in older iOS, APE, WavPack). Pick a bitrate cap in *Settings → Streaming quality* so Navidrome transcodes.
- **The Import tab says the uploader isn't reachable.** Run `docker compose ps` and `docker compose logs uploader`.
