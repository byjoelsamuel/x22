// Read YouTube Music playlist *metadata* (titles, artists, durations) through the official
// YouTube Data API, so x22 can rebuild the playlist from songs already in Navidrome.
// Nothing is downloaded. The API key stays on the homelab (YOUTUBE_API_KEY).

const MAX_TRACKS = 500
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,64}$/
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

export class YoutubeError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/** "PT1H2M3S" → 3723 */
export function isoDurationToSec(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso ?? ''))
  if (!m) return 0
  const [, d, h, min, s] = m.map((v) => Number(v ?? 0))
  return d * 86400 + h * 3600 + min * 60 + s
}

/**
 * YouTube Music songs live on auto-generated "Artist - Topic" channels with the plain song
 * title. Other uploads usually say "Artist - Title" in the video title.
 */
export function toTrack(videoTitle, channelTitle, durationSec = 0) {
  const title = String(videoTitle ?? '').trim()
  const channel = String(channelTitle ?? '').trim()
  const topic = /^(.*) - Topic$/.exec(channel)
  if (topic) return { title, artist: topic[1], durationSec }
  const dash = /^(.+?)\s+[-–—]\s+(.+)$/.exec(title)
  if (dash) return { title: dash[2], artist: dash[1], durationSec }
  return { title, artist: channel.replace(/VEVO$/i, '').replace(/\s*\(?official\)?$/i, '').trim(), durationSec }
}

export function createYoutube({ apiKey, baseUrl = 'https://www.googleapis.com/youtube/v3', fetchImpl = fetch } = {}) {
  async function call(path, params) {
    if (!apiKey) throw new YoutubeError(501, 'YouTube import needs YOUTUBE_API_KEY on the homelab (see README)')
    const q = new URLSearchParams({ ...params, key: apiKey })
    const res = await fetchImpl(`${baseUrl}/${path}?${q}`, { signal: AbortSignal.timeout(10_000) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const reason = body?.error?.errors?.[0]?.reason
      if (res.status === 404 || reason === 'playlistNotFound') throw new YoutubeError(404, 'Playlist not found — is it public or unlisted?')
      if (res.status === 403) throw new YoutubeError(502, `YouTube refused the request (${reason ?? 'forbidden'}) — check the API key and quota`)
      throw new YoutubeError(502, `YouTube API error ${res.status}`)
    }
    return body
  }

  /** Titles, artists and durations for up to 500 video ids. */
  async function videos(ids) {
    const clean = [...new Set(ids)].filter((id) => VIDEO_ID.test(id)).slice(0, MAX_TRACKS)
    const byId = new Map()
    for (let i = 0; i < clean.length; i += 50) {
      const body = await call('videos', { part: 'snippet,contentDetails', id: clean.slice(i, i + 50).join(','), maxResults: '50' })
      for (const v of body.items ?? []) {
        byId.set(v.id, toTrack(v.snippet?.title, v.snippet?.channelTitle, isoDurationToSec(v.contentDetails?.duration)))
      }
    }
    // Keep the caller's order; drop deleted/private videos.
    return clean.filter((id) => byId.has(id)).map((id) => ({ id, ...byId.get(id) }))
  }

  /** The playlist's name and its tracks, in order. */
  async function playlist(id) {
    if (!PLAYLIST_ID.test(String(id))) throw new YoutubeError(400, 'That does not look like a YouTube playlist id')
    const meta = await call('playlists', { part: 'snippet', id, maxResults: '1' })
    const name = meta.items?.[0]?.snippet?.title
    if (!name) throw new YoutubeError(404, 'Playlist not found — is it public or unlisted?')
    const ids = []
    let pageToken = ''
    do {
      const page = await call('playlistItems', { part: 'contentDetails', playlistId: id, maxResults: '50', ...(pageToken ? { pageToken } : {}) })
      for (const item of page.items ?? []) ids.push(item.contentDetails?.videoId)
      pageToken = page.nextPageToken ?? ''
    } while (pageToken && ids.length < MAX_TRACKS)
    return { name, tracks: await videos(ids) }
  }

  return { playlist, videos, configured: Boolean(apiKey) }
}
