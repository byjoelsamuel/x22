# HTTPS certificates with mkcert

Browsers only offer **Install app** for a PWA served over HTTPS. Audio dither (an AudioWorklet)
also needs HTTPS. On a home network the easy way to get HTTPS is a **local certificate
authority**. [mkcert](https://github.com/FiloSottile/mkcert) creates one, and you trust it once
on each device.

The private keys stay on your laptop. `*.pem` and `*.key` in this folder are git-ignored.

## 1. Create the certificate (on the homelab laptop)

```bash
# Debian/Ubuntu
sudo apt install mkcert libnss3-tools
```

```bash
mkcert -install
```

```bash
cd deploy/certs
mkcert -cert-file cert.pem -key-file key.pem 192.168.0.100 music.lan localhost 127.0.0.1
```

Add any other names you use for the laptop to that list. The cert lasts about two years. Re-run
the command to renew it.

## 2. Trust the CA on your devices

Find the CA file to copy to your devices:

```bash
mkcert -CAROOT
```

Copy `rootCA.pem` from that folder. Never share `rootCA-key.pem`.

| Device | Steps |
| --- | --- |
| **Android** | Copy `rootCA.pem` to the phone. Go to *Settings → Security → More security settings → Encryption & credentials → Install a certificate → CA certificate* and pick the file. Chrome and the x22 APK both trust it. |
| **iPhone / iPad** | AirDrop or email `rootCA.pem` to yourself, then install the profile. Next, go to *Settings → General → About → Certificate Trust Settings* and turn on full trust for it. |
| **Windows** | Double-click `rootCA.crt` (rename it from `.pem`), choose *Install Certificate → Local Machine → Trusted Root Certification Authorities*. |
| **macOS** | Open it in Keychain Access, add it to *System*, and set *Always Trust*. |
| **Linux** | `mkcert -install` handles the laptop itself. On other machines, copy the file to `/usr/local/share/ca-certificates/mkcert.crt` and run `sudo update-ca-certificates`. |

## 3. Start the stack

```bash
cd deploy && docker compose up -d --build
```

Open `https://192.168.0.100`. You should see a padlock, and Chrome will show **Install app**.
