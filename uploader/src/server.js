// x22 uploader — receives audio files from the app, files them into the Navidrome
// music folder by tag, and leaves the rescan to the app (Subsonic startScan).
//
// Auth: the app sends its existing Subsonic credentials (user + salted token). We check
// them by pinging Navidrome, so there is no extra secret to manage.

import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import Busboy from 'busboy'
import { parseFile } from 'music-metadata'
import { extensionOf, safeJoin, targetPath } from './paths.js'
import { createYoutube, YoutubeError } from './youtube.js'

const env = process.env
const config = {
  port: Number(env.PORT ?? 4600),
  host: env.HOST ?? '0.0.0.0',
  musicDir: env.MUSIC_DIR ?? '/music',
  uploadSubdir: env.UPLOAD_SUBDIR ?? 'Uploads',
  navidrome: (env.NAVIDROME_URL ?? 'http://navidrome:4533').replace(/\/+$/, ''),
  maxFileBytes: Number(env.MAX_FILE_MB ?? 2000) * 1024 * 1024,
  allowedUsers: (env.ALLOWED_USERS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  youtubeApiKey: env.YOUTUBE_API_KEY ?? '',
  youtubeApiBase: env.YOUTUBE_API_BASE || undefined,
  corsOrigins: (env.CORS_ORIGINS ?? 'https://localhost,capacitor://localhost,http://localhost')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
}

const uploadRoot = path.join(config.musicDir, config.uploadSubdir)
const tmpRoot = path.join(config.musicDir, '.x22-tmp') // same file system → atomic rename

// ── Auth ────────────────────────────────────────────────────────────────
const verified = new Map() // key → expiry
async function checkAuth(req) {
  const u = req.headers['x-subsonic-user']
  const t = req.headers['x-subsonic-token']
  const s = req.headers['x-subsonic-salt']
  if (!u || !t || !s) return { ok: false, status: 401, message: 'Missing credentials' }
  if (config.allowedUsers.length && !config.allowedUsers.includes(u)) {
    return { ok: false, status: 403, message: 'This user may not upload' }
  }
  const key = `${u}:${t}:${s}`
  if ((verified.get(key) ?? 0) > Date.now()) return { ok: true, user: u }
  const q = new URLSearchParams({ u, t, s, v: '1.16.1', c: 'x22-uploader', f: 'json' })
  try {
    const res = await fetch(`${config.navidrome}/rest/ping?${q}`, { signal: AbortSignal.timeout(5000) })
    const body = await res.json()
    if (body?.['subsonic-response']?.status !== 'ok') return { ok: false, status: 401, message: 'Navidrome rejected the login' }
  } catch {
    return { ok: false, status: 502, message: 'Cannot reach Navidrome' }
  }
  verified.set(key, Date.now() + 10 * 60_000)
  return { ok: true, user: u }
}

// ── HTTP helpers ────────────────────────────────────────────────────────
function cors(req, res) {
  const origin = req.headers.origin
  if (origin && config.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Subsonic-User, X-Subsonic-Token, X-Subsonic-Salt')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Max-Age', '600')
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

// ── Upload ──────────────────────────────────────────────────────────────
async function fileAway(tmpFile, originalName, ext) {
  let tags = null
  try {
    tags = (await parseFile(tmpFile, { duration: false, skipCovers: true })).common
  } catch {
    /* untagged or unreadable — goes to Unsorted */
  }
  const rel = targetPath(tags, originalName, ext)
  const dest = safeJoin(uploadRoot, rel)
  await fsp.mkdir(path.dirname(dest), { recursive: true })
  try {
    await fsp.link(tmpFile, dest) // fails if it exists → no overwrite race
  } catch (e) {
    if (e.code === 'EEXIST') return { status: 'skipped', reason: 'Already in library', path: rel }
    if (e.code !== 'EPERM' && e.code !== 'EXDEV' && e.code !== 'ENOTSUP') throw e
    await fsp.copyFile(tmpFile, dest, fs.constants.COPYFILE_EXCL)
  }
  await fsp.chmod(dest, 0o644).catch(() => {})
  return { status: 'saved', path: path.join(config.uploadSubdir, rel), title: tags?.title, artist: tags?.albumartist || tags?.artist }
}

function handleUpload(req, res) {
  let busboy
  try {
    busboy = Busboy({ headers: req.headers, limits: { fileSize: config.maxFileBytes, files: 50, fields: 10 } })
  } catch {
    return json(res, 400, { error: 'Expected multipart/form-data' })
  }
  const jobs = []

  busboy.on('file', (_field, stream, info) => {
    const name = info.filename ?? 'upload'
    const ext = extensionOf(name)
    if (!ext) {
      stream.resume()
      jobs.push(Promise.resolve({ name, status: 'rejected', reason: 'Not an audio file' }))
      return
    }
    const tmp = path.join(tmpRoot, crypto.randomUUID())
    let tooBig = false
    stream.on('limit', () => {
      tooBig = true
    })
    jobs.push(
      (async () => {
        try {
          await pipeline(stream, fs.createWriteStream(tmp, { mode: 0o644 }))
          if (tooBig) return { name, status: 'rejected', reason: `Larger than ${config.maxFileBytes / 1048576} MB` }
          return { name, ...(await fileAway(tmp, name, ext)) }
        } catch (e) {
          console.error('upload failed', name, e)
          return { name, status: 'rejected', reason: 'Could not save file' }
        } finally {
          await fsp.rm(tmp, { force: true })
        }
      })(),
    )
  })

  busboy.on('close', async () => {
    const files = await Promise.all(jobs)
    for (const f of files) console.log(`[upload] ${f.status.padEnd(8)} ${f.name}${f.path ? ` → ${f.path}` : ''}`)
    json(res, 200, { files })
  })
  busboy.on('error', () => json(res, 400, { error: 'Malformed upload' }))
  req.pipe(busboy)
}

// ── YouTube playlist metadata (no downloads) ────────────────────────────
const youtube = createYoutube({ apiKey: config.youtubeApiKey, baseUrl: config.youtubeApiBase })

async function readJson(req, limit = 64 * 1024) {
  let size = 0
  const chunks = []
  for await (const c of req) {
    size += c.length
    if (size > limit) throw new YoutubeError(413, 'Request too large')
    chunks.push(c)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    throw new YoutubeError(400, 'Invalid JSON')
  }
}

async function handleYoutube(req, res, url) {
  try {
    if (req.method === 'GET' && url.pathname === '/api/youtube/playlist') {
      return json(res, 200, await youtube.playlist(url.searchParams.get('id') ?? ''))
    }
    if (req.method === 'POST' && url.pathname === '/api/youtube/videos') {
      const body = await readJson(req)
      if (!Array.isArray(body.ids)) throw new YoutubeError(400, 'Expected { ids: [...] }')
      return json(res, 200, { tracks: await youtube.videos(body.ids.map(String)) })
    }
    return json(res, 404, { error: 'Not found' })
  } catch (e) {
    if (e instanceof YoutubeError) return json(res, e.status, { error: e.message })
    console.error('youtube', e)
    return json(res, 502, { error: 'Could not reach YouTube' })
  }
}

// ── Server ──────────────────────────────────────────────────────────────
export function createServer() {
  return http.createServer(async (req, res) => {
    cors(req, res)
    const url = new URL(req.url, 'http://x')
    if (req.method === 'OPTIONS') return res.writeHead(204).end()
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return json(res, 200, {
        ok: true,
        uploadDir: config.uploadSubdir,
        maxFileMB: config.maxFileBytes / 1048576,
        youtube: youtube.configured,
      })
    }
    if (req.method === 'POST' && url.pathname === '/api/upload') {
      const auth = await checkAuth(req)
      if (!auth.ok) {
        req.resume()
        return json(res, auth.status, { error: auth.message })
      }
      return handleUpload(req, res)
    }
    if (url.pathname.startsWith('/api/youtube/')) {
      const auth = await checkAuth(req)
      if (!auth.ok) {
        req.resume()
        return json(res, auth.status, { error: auth.message })
      }
      return handleYoutube(req, res, url)
    }
    json(res, 404, { error: 'Not found' })
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await fsp.mkdir(tmpRoot, { recursive: true })
  await fsp.mkdir(uploadRoot, { recursive: true })
  createServer().listen(config.port, config.host, () => {
    console.log(`x22 uploader on ${config.host}:${config.port} → ${uploadRoot} (navidrome ${config.navidrome})`)
  })
}
