import { afterEach, describe, expect, test, vi } from 'vitest'
import { ApiError, login, makeToken, normalizeServer, Subsonic } from './subsonic'

const creds = { server: 'https://music.lan', user: 'joel', token: 'tok', salt: 'salt' }

afterEach(() => vi.unstubAllGlobals())

describe('auth', () => {
  test('token is md5(password + salt) — Subsonic spec example', () => {
    // From the Subsonic API docs: password "sesame", salt "c19b2d"
    expect(makeToken('sesame', 'c19b2d')).toBe('26719a1196d2a940705a59634eb18eab')
  })

  test('normalizeServer strips Navidrome web-UI paths and trailing slashes', () => {
    expect(normalizeServer('http://192.168.0.100:4533/app/#/user')).toBe('http://192.168.0.100:4533')
    expect(normalizeServer('https://music.lan/')).toBe('https://music.lan')
    expect(normalizeServer('')).toBe('')
  })
})

describe('urls', () => {
  const api = new Subsonic(creds)

  test('stream defaults to the raw original file (lossless)', () => {
    const u = new URL(api.streamUrl('s1'))
    expect(u.pathname).toBe('/rest/stream')
    expect(u.searchParams.get('format')).toBe('raw')
    expect(u.searchParams.get('t')).toBe('tok')
    expect(u.searchParams.get('f')).toBe('json')
  })

  test('stream transcodes only when a bitrate cap is set', () => {
    const u = new URL(api.streamUrl('s1', 192))
    expect(u.searchParams.get('maxBitRate')).toBe('192')
    expect(u.searchParams.get('format')).toBe('opus')
  })

  test('same-origin server yields a relative url', () => {
    expect(new Subsonic({ ...creds, server: '' }).url('ping')).toMatch(/^\/rest\/ping\?/)
  })
})

describe('calls', () => {
  test('login pings and returns a salted token, never the password', async () => {
    const fetchMock = vi.fn<(u: string) => Promise<Response>>(async () => Response.json({ 'subsonic-response': { status: 'ok' } }))
    vi.stubGlobal('fetch', fetchMock)
    const c = await login('http://nd:4533/app/', 'joel', 'pw')
    expect(c.server).toBe('http://nd:4533')
    expect(c.token).toBe(makeToken('pw', c.salt))
    expect(JSON.stringify(c)).not.toContain('"pw"')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/rest/ping')
  })

  test('subsonic errors surface as ApiError', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({ 'subsonic-response': { status: 'failed', error: { code: 40, message: 'Wrong username or password' } } }),
    )
    await expect(new Subsonic(creds).ping()).rejects.toBeInstanceOf(ApiError)
  })

  test('albumList unwraps the response', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({ 'subsonic-response': { status: 'ok', albumList2: { album: [{ id: 'a', name: 'A' }] } } }),
    )
    expect(await new Subsonic(creds).albumList('newest')).toEqual([{ id: 'a', name: 'A' }])
  })
})

describe('playlists', () => {
  test('createPlaylist sends repeated songId params and adds the rest in batches', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', async (u: string) => {
      urls.push(u)
      return Response.json({ 'subsonic-response': { status: 'ok', playlist: { id: 'p9', name: 'Gym' } } })
    })
    const ids = Array.from({ length: 230 }, (_, i) => `s${i}`)
    const p = await new Subsonic(creds).createPlaylist('Gym', ids)
    expect(p.id).toBe('p9')
    const first = new URL(urls[0])
    expect(first.pathname).toBe('/rest/createPlaylist')
    expect(first.searchParams.getAll('songId')).toHaveLength(100)
    expect(first.searchParams.get('name')).toBe('Gym')
    const adds = urls.slice(1).map((u) => new URL(u))
    expect(adds.map((u) => u.pathname)).toEqual(['/rest/updatePlaylist', '/rest/updatePlaylist'])
    expect(adds[1].searchParams.getAll('songIdToAdd')).toEqual(ids.slice(200))
  })
})
