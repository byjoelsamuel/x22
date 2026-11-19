# x22

A minimal, earbud-app-style music player for [Navidrome](https://www.navidrome.org/).
It supports lossless and hi-res audio, has a 10-band EQ on the home screen, and uses a
dithered Nothing/CMF-inspired look.

> Work in progress. Features land in small PRs.

## Develop

```bash
cd web
npm install
npm run dev
```

The dev server proxies `/rest` to Navidrome and `/api` to the uploader. Override the targets
with `NAVIDROME_URL` / `UPLOADER_URL` in `web/.env.local`:

```
NAVIDROME_URL=http://192.168.0.100:4533
```

## Scripts

| Command          | What it does            |
| ---------------- | ----------------------- |
| `npm run dev`    | Dev server on your LAN  |
| `npm test`       | Unit tests (Vitest)     |
| `npm run lint`   | ESLint                  |
| `npm run build`  | Production build        |
