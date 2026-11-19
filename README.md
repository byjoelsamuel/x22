<p align="center">
  <img src="web/public/icons/icon-192.png" width="96" alt="x22 icon" />
</p>

<h1 align="center">x22</h1>

<p align="center">
  A minimal music app with a big EQ, IEM tuning and a dithered pastel look.
</p>

<p align="center">
  <a href="https://github.com/byjoelsamuel/x22/releases/latest/download/x22-android.apk">
    <img alt="Download for Android" src="https://img.shields.io/badge/Download-Android%20APK-c9b8f0?style=for-the-badge&logo=android&logoColor=1a1626&labelColor=fff1ba" />
  </a>
  <br/>
  <sub><a href="https://github.com/byjoelsamuel/x22/releases">All releases</a></sub>
</p>

---

## Features

- Works with YouTube Music and your other music apps
- 10-band EQ, presets and IEM profiles
- Home-screen widget
- Lossless streaming from your homelab (optional)
- Upload songs to your homelab from your phone

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

1. Download **x22-android.apk** from the [latest release](https://github.com/byjoelsamuel/x22/releases/latest) and open it. Android will ask you to allow installs from your browser.
2. *(Homelab only)* Install the mkcert CA on the phone (step 1 above), then connect to `https://192.168.0.100`.

**Widget:** long-press your home screen → *Widgets* → **x22 player**.

**Publishing a release:** add `.github/releases/vX.Y.Z.md`, then push the tag `vX.Y.Z`. CI builds the signed APK and publishes it. Signing needs four repository secrets, created once:

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
