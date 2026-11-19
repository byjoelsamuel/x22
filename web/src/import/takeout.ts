import type { SourceTrack } from './match'

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF, BOM). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const s = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f.trim()))
}

export type TakeoutFile =
  | { kind: 'tracks'; tracks: SourceTrack[] }
  | { kind: 'videoIds'; ids: string[] }

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/**
 * Google Takeout → YouTube and YouTube Music:
 *  - "music library songs.csv": Video ID, Song Title, Album Title, Artist Name 1, …
 *  - "<playlist>-videos.csv" / "<playlist>.csv": Video ID, Playlist Video Creation Timestamp
 *    (older exports put playlist metadata rows above the "Video Id" header).
 */
export function parseTakeout(text: string): TakeoutFile {
  const rows = parseCsv(text)
  const headerAt = rows.findIndex((r) => r.some((c) => /^(song title|video id)$/i.test(c.trim())))
  if (headerAt < 0) throw new Error('This does not look like a YouTube Music Takeout CSV')
  const header = rows[headerAt].map((c) => c.trim().toLowerCase())
  const body = rows.slice(headerAt + 1)
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h))

  const titleCol = col('song title', 'title')
  const artistCol = col('artist name 1', 'artist names', 'artist name', 'artist')
  if (titleCol >= 0) {
    const tracks = body
      .map((r) => ({ title: (r[titleCol] ?? '').trim(), artist: artistCol >= 0 ? (r[artistCol] ?? '').trim() : '' }))
      .filter((t) => t.title)
    return { kind: 'tracks', tracks }
  }
  const idCol = col('video id')
  const ids = body.map((r) => (r[idCol] ?? '').trim()).filter((id) => VIDEO_ID.test(id))
  if (!ids.length) throw new Error('No songs found in this file')
  return { kind: 'videoIds', ids }
}

/** "Artist - Title" per line (numbering and bullets are ignored); lines without a dash are titles. */
export function parsePastedList(text: string): SourceTrack[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(line)
      return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: line }
    })
}

/** Accepts music.youtube.com / youtube.com links (or a bare id) and returns the playlist id. */
export function playlistIdFromLink(input: string): string | null {
  const s = input.trim()
  if (/^(PL|OLAK5uy_|RD|LM|VL)[A-Za-z0-9_-]{8,}$/.test(s)) return s.replace(/^VL/, '')
  try {
    const u = new URL(s)
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(u.hostname)) return null
    const list = u.searchParams.get('list')
    return list && /^[A-Za-z0-9_-]{10,64}$/.test(list) ? list : null
  } catch {
    return null
  }
}
