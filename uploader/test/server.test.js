import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

let music, fakeNavidrome, server, base

// Minimal 0.1 s silent WAV
function wav() {
  const samples = 4410
  const b = Buffer.alloc(44 + samples * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples * 2, 4); b.write('WAVE', 8)
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(44100, 24); b.writeUInt32LE(88200, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(samples * 2, 40)
  return b
}

before(async () => {
  music = await fs.mkdtemp(path.join(os.tmpdir(), 'x22-music-'))
  fakeNavidrome = http.createServer((req, res) => {
    const ok = new URL(req.url, 'http://x').searchParams.get('t') === 'good'
    res.end(JSON.stringify({ 'subsonic-response': { status: ok ? 'ok' : 'failed' } }))
  })
  await new Promise((r) => fakeNavidrome.listen(0, r))
  process.env.MUSIC_DIR = music
  process.env.NAVIDROME_URL = `http://127.0.0.1:${fakeNavidrome.address().port}`
  const { createServer } = await import('../src/server.js')
  await fs.mkdir(path.join(music, '.x22-tmp'), { recursive: true })
  server = createServer()
  await new Promise((r) => server.listen(0, r))
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  server.close()
  fakeNavidrome.close()
  await fs.rm(music, { recursive: true, force: true })
})

function upload(files, token = 'good') {
  const form = new FormData()
  for (const [name, data] of files) form.append('files', new Blob([data]), name)
  return fetch(`${base}/api/upload`, {
    method: 'POST',
    body: form,
    headers: { 'X-Subsonic-User': 'joel', 'X-Subsonic-Token': token, 'X-Subsonic-Salt': 's' },
  })
}

test('health', async () => {
  const r = await fetch(`${base}/api/health`)
  assert.equal((await r.json()).ok, true)
})

test('rejects bad Navidrome credentials', async () => {
  const r = await upload([['a.wav', wav()]], 'bad')
  assert.equal(r.status, 401)
})

test('saves audio, rejects other files, skips duplicates', async () => {
  const r = await upload([
    ['My Song.wav', wav()],
    ['notes.txt', 'hello'],
  ])
  assert.equal(r.status, 200)
  const { files } = await r.json()
  assert.deepEqual(files.map((f) => f.status), ['saved', 'rejected'])
  assert.equal(files[0].path, path.join('Uploads', 'Unsorted', 'My Song.wav'))
  await fs.access(path.join(music, 'Uploads', 'Unsorted', 'My Song.wav'))

  const again = await (await upload([['My Song.wav', wav()]])).json()
  assert.equal(again.files[0].status, 'skipped')
  assert.deepEqual(await fs.readdir(path.join(music, '.x22-tmp')), []) // temp files cleaned
})

test('youtube routes require a Navidrome login and explain a missing key', async () => {
  const noAuth = await fetch(`${base}/api/youtube/playlist?id=PL1xxxxxxxxx`)
  assert.equal(noAuth.status, 401)
  const r = await fetch(`${base}/api/youtube/playlist?id=PL1xxxxxxxxx`, {
    headers: { 'X-Subsonic-User': 'joel', 'X-Subsonic-Token': 'good', 'X-Subsonic-Salt': 's' },
  })
  assert.equal(r.status, 501)
  assert.match((await r.json()).error, /YOUTUBE_API_KEY/)
})
