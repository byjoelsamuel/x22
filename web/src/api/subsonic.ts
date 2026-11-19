import SparkMD5 from 'spark-md5'
import type {
  Album,
  AlbumListType,
  Artist,
  Playlist,
  ScanStatus,
  Song,
  SubsonicError,
} from './types'

export const API_VERSION = '1.16.1'
export const CLIENT = 'x22'

/** Saved login. We keep the salted token, never the plain password. */
export interface Credentials {
  /** Base URL of Navidrome, e.g. https://music.lan. Empty string = same origin (PWA behind Caddy). */
  server: string
  user: string
  token: string
  salt: string
}

export class ApiError extends Error {
  code: number
  constructor(err: SubsonicError) {
    super(err.message)
    this.code = err.code
  }
}

export function randomSalt(bytes = 12): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Subsonic token auth: t = md5(password + salt). */
export function makeToken(password: string, salt: string): string {
  return SparkMD5.hash(password + salt)
}

export function normalizeServer(server: string): string {
  return server.trim().replace(/\/+$/, '').replace(/\/app(\/.*)?$/, '').replace(/\/#.*$/, '')
}

export class Subsonic {
  readonly creds: Credentials
  constructor(creds: Credentials) {
    this.creds = creds
  }

  /** Build an absolute (or same-origin) /rest URL with auth params. */
  url(method: string, params: Record<string, string | number | boolean | undefined> = {}): string {
    const q = new URLSearchParams({
      u: this.creds.user,
      t: this.creds.token,
      s: this.creds.salt,
      v: API_VERSION,
      c: CLIENT,
      f: 'json',
    })
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') q.set(k, String(v))
    }
    return `${this.creds.server}/rest/${method}?${q.toString()}`
  }

  private async call<T>(method: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const res = await fetch(this.url(method, params))
    if (!res.ok) throw new ApiError({ code: res.status, message: `HTTP ${res.status}` })
    const body = await res.json()
    const r = body['subsonic-response']
    if (!r) throw new ApiError({ code: -1, message: 'Not a Subsonic server' })
    if (r.status !== 'ok') throw new ApiError(r.error ?? { code: -1, message: 'Unknown error' })
    return r as T
  }

  async ping(): Promise<void> {
    await this.call('ping')
  }

  async albumList(type: AlbumListType, size = 40, offset = 0): Promise<Album[]> {
    const r = await this.call<{ albumList2?: { album?: Album[] } }>('getAlbumList2', { type, size, offset })
    return r.albumList2?.album ?? []
  }

  async album(id: string): Promise<Album> {
    const r = await this.call<{ album: Album }>('getAlbum', { id })
    return r.album
  }

  async artists(): Promise<Artist[]> {
    const r = await this.call<{ artists?: { index?: { artist?: Artist[] }[] } }>('getArtists')
    return (r.artists?.index ?? []).flatMap((i) => i.artist ?? [])
  }

  async artist(id: string): Promise<Artist> {
    const r = await this.call<{ artist: Artist }>('getArtist', { id })
    return r.artist
  }

  async search(query: string): Promise<{ songs: Song[]; albums: Album[]; artists: Artist[] }> {
    const r = await this.call<{ searchResult3?: { song?: Song[]; album?: Album[]; artist?: Artist[] } }>(
      'search3',
      { query, songCount: 30, albumCount: 12, artistCount: 8 },
    )
    const s = r.searchResult3 ?? {}
    return { songs: s.song ?? [], albums: s.album ?? [], artists: s.artist ?? [] }
  }

  async randomSongs(size = 50): Promise<Song[]> {
    const r = await this.call<{ randomSongs?: { song?: Song[] } }>('getRandomSongs', { size })
    return r.randomSongs?.song ?? []
  }

  async starred(): Promise<{ songs: Song[]; albums: Album[] }> {
    const r = await this.call<{ starred2?: { song?: Song[]; album?: Album[] } }>('getStarred2')
    return { songs: r.starred2?.song ?? [], albums: r.starred2?.album ?? [] }
  }

  async playlists(): Promise<Playlist[]> {
    const r = await this.call<{ playlists?: { playlist?: Playlist[] } }>('getPlaylists')
    return r.playlists?.playlist ?? []
  }

  async playlist(id: string): Promise<Playlist> {
    const r = await this.call<{ playlist: Playlist }>('getPlaylist', { id })
    return r.playlist
  }

  async star(id: string, on: boolean): Promise<void> {
    await this.call(on ? 'star' : 'unstar', { id })
  }

  async scrobble(id: string, submission = true): Promise<void> {
    await this.call('scrobble', { id, submission })
  }

  async scanStatus(): Promise<ScanStatus> {
    const r = await this.call<{ scanStatus: ScanStatus }>('getScanStatus')
    return r.scanStatus
  }

  async startScan(): Promise<ScanStatus> {
    const r = await this.call<{ scanStatus: ScanStatus }>('startScan')
    return r.scanStatus
  }

  /**
   * Stream URL. With maxBitRate 0 and format=raw Navidrome sends the original file
   * untouched (FLAC/ALAC/WAV, any bit depth / sample rate).
   */
  streamUrl(id: string, maxBitRate = 0): string {
    return maxBitRate > 0
      ? this.url('stream', { id, maxBitRate, format: 'opus' })
      : this.url('stream', { id, format: 'raw' })
  }

  coverUrl(id: string | undefined, size = 600): string | undefined {
    return id ? this.url('getCoverArt', { id, size }) : undefined
  }
}

/** Log in: derive a salted token, verify it with ping, return credentials to store. */
export async function login(server: string, user: string, password: string): Promise<Credentials> {
  const salt = randomSalt()
  const creds: Credentials = {
    server: normalizeServer(server),
    user: user.trim(),
    salt,
    token: makeToken(password, salt),
  }
  await new Subsonic(creds).ping()
  return creds
}
