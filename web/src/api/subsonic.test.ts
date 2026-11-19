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
