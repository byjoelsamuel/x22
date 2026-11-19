import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createYoutube, isoDurationToSec, toTrack } from '../src/youtube.js'

test('ISO 8601 durations', () => {
  assert.equal(isoDurationToSec('PT3M20S'), 200)
  assert.equal(isoDurationToSec('PT1H2M3S'), 3723)
  assert.equal(isoDurationToSec('P0D'), 0)
  assert.equal(isoDurationToSec('nope'), 0)
})

test('track parsing: Topic channels, "Artist - Title", plain channels', () => {
  assert.deepEqual(toTrack('Blinding Lights', 'The Weeknd - Topic', 200), { title: 'Blinding Lights', artist: 'The Weeknd', durationSec: 200 })
  assert.deepEqual(toTrack('Daft Punk - One More Time (Official Video)', 'Daft Punk', 0), {
    title: 'One More Time (Official Video)',
    artist: 'Daft Punk',
    durationSec: 0,
  })
  assert.equal(toTrack('Nightcall', 'KavinskyVEVO').artist, 'Kavinsky')
})

// Fake YouTube Data API: playlist PL1 has 60 items (2 pages); video v0000000059 is private.
let api, base, calls
before(async () => {
  calls = []
  api = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x')
    calls.push(u.pathname)
    const send = (o, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(o))
    }
    if (u.searchParams.get('key') !== 'k') return send({ error: { errors: [{ reason: 'keyInvalid' }] } }, 403)
    const id = (n) => `v${String(n).padStart(10, '0')}`
    if (u.pathname === '/playlists') {
      return u.searchParams.get('id') === 'PL1xxxxxxxxx' ? send({ items: [{ snippet: { title: 'Gym' } }] }) : send({ items: [] })
    }
    if (u.pathname === '/playlistItems') {
      const page2 = u.searchParams.get('pageToken') === 'p2'
      const range = page2 ? [50, 60] : [0, 50]
      const items = []
      for (let i = range[0]; i < range[1]; i++) items.push({ contentDetails: { videoId: id(i) } })
      return send({ items, ...(page2 ? {} : { nextPageToken: 'p2' }) })
    }
    if (u.pathname === '/videos') {
      const items = u.searchParams
        .get('id')
        .split(',')
        .filter((v) => v !== id(59))
        .map((v) => ({ id: v, snippet: { title: `Song ${v}`, channelTitle: 'Artist - Topic' }, contentDetails: { duration: 'PT3M' } }))
      return send({ items })
    }
    send({}, 404)
  })
  await new Promise((r) => api.listen(0, r))
  base = `http://127.0.0.1:${api.address().port}`
})
after(() => api.close())

test('playlist: name, paging, order, private videos dropped', async () => {
  const yt = createYoutube({ apiKey: 'k', baseUrl: base })
  const p = await yt.playlist('PL1xxxxxxxxx')
  assert.equal(p.name, 'Gym')
  assert.equal(p.tracks.length, 59)
  assert.deepEqual(p.tracks[0], { id: 'v0000000000', title: 'Song v0000000000', artist: 'Artist', durationSec: 180 })
  assert.equal(calls.filter((c) => c === '/playlistItems').length, 2)
})

test('clear errors: no key, bad id, unknown playlist, rejected key', async () => {
  await assert.rejects(createYoutube({ apiKey: '', baseUrl: base }).playlist('PL1xxxxxxxxx'), { status: 501 })
  await assert.rejects(createYoutube({ apiKey: 'k', baseUrl: base }).playlist('../etc'), { status: 400 })
  await assert.rejects(createYoutube({ apiKey: 'k', baseUrl: base }).playlist('PLmissing123'), { status: 404 })
  await assert.rejects(createYoutube({ apiKey: 'bad', baseUrl: base }).playlist('PL1xxxxxxxxx'), { status: 502 })
})

test('videos: invalid ids are ignored', async () => {
  const yt = createYoutube({ apiKey: 'k', baseUrl: base })
  const tracks = await yt.videos(['v0000000001', 'not-an-id', 'v0000000001'])
  assert.deepEqual(tracks.map((t) => t.id), ['v0000000001'])
})
