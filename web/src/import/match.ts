import type { Song } from '../api/types'

/** A song from a YouTube Music playlist / Takeout / pasted list. */
export interface SourceTrack {
  title: string
  artist: string
  durationSec?: number
}

export type MatchStatus = 'matched' | 'maybe' | 'missing'

export interface MatchResult {
  track: SourceTrack
  status: MatchStatus
  /** Chosen library song (best guess, user can change). */
  song: Song | null
  /** Top candidates, best first, for the picker. */
  candidates: { song: Song; score: number }[]
}

export const MATCHED = 0.75
export const MAYBE = 0.5

// Noise YouTube adds to titles: (Official Video), [Lyrics], (Visualizer), (Remastered 2011)…
const NOISE =
  /\s*[([](?:[^)\]]*\b(?:official|video|audio|lyrics?|visuali[sz]er|hd|4k|mv|m\/v|remaster(?:ed)?|explicit|clean|live|color coded)\b[^)\]]*)[)\]]/gi

export function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents
    .replace(NOISE, ' ')
    .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i, '') // trailing "feat. X"
    .replace(/[([](?:feat\.?|ft\.?|featuring)\s+[^)\]]*[)\]]/gi, ' ') // "(feat. X)"
    .replace(/\s*-\s*topic$/i, '')
    .replace(/vevo$/i, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const tokens = (s: string) => new Set(normalize(s).split(' ').filter(Boolean))

/** Token overlap (Jaccard), with a bonus when one string starts with the other. */
export function similarity(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const ta = tokens(a)
  const tb = tokens(b)
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  const jaccard = inter / (ta.size + tb.size - inter)
  const prefix = na.startsWith(nb) || nb.startsWith(na) ? 0.9 : 0
  return Math.max(jaccard, prefix)
}

function artistSimilarity(a: string, b: string): number {
  if (!a.trim()) return 0.5 // unknown artist: neutral
  const na = normalize(a)
  const nb = normalize(b ?? '')
  if (na && nb && (na.includes(nb) || nb.includes(na))) return 1
  return similarity(a, b ?? '')
}

function durationScore(a?: number, b?: number): number {
  if (!a || !b) return 0.5
  const d = Math.abs(a - b)
  return d <= 3 ? 1 : d <= 10 ? 0.6 : d <= 30 ? 0.2 : 0
}

/** 0 … 1: how likely `song` is the same recording as `track`. */
export function score(track: SourceTrack, song: Song): number {
  return (
    0.6 * similarity(track.title, song.title) +
    0.3 * artistSimilarity(track.artist, song.artist ?? '') +
    0.1 * durationScore(track.durationSec, song.duration)
  )
}

export function classify(best: number): MatchStatus {
  return best >= MATCHED ? 'matched' : best >= MAYBE ? 'maybe' : 'missing'
}

export type Search = (query: string) => Promise<Song[]>

export async function matchTrack(track: SourceTrack, search: Search): Promise<MatchResult> {
  const title = normalize(track.title)
  const artist = normalize(track.artist)
  let songs = title ? await search(`${title} ${artist}`.trim()) : []
  if (!songs.length && title) songs = await search(title) // artist spelled differently
  const candidates = songs
    .map((song) => ({ song, score: score(track, song) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
  const best = candidates[0]?.score ?? 0
  const status = classify(best)
  return { track, status, song: status === 'missing' ? null : candidates[0].song, candidates }
}

/** Match a whole playlist with limited concurrency, reporting progress. */
export async function matchTracks(
  tracks: SourceTrack[],
  search: Search,
  onProgress?: (done: number, total: number) => void,
  concurrency = 4,
): Promise<MatchResult[]> {
  const out: MatchResult[] = new Array(tracks.length)
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < tracks.length) {
      const i = next++
      try {
        out[i] = await matchTrack(tracks[i], search)
      } catch {
        out[i] = { track: tracks[i], status: 'missing', song: null, candidates: [] }
      }
      onProgress?.(++done, tracks.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tracks.length) }, worker))
  return out
}

/** Where to buy a lossless copy of a missing song. */
export function buyLinks(t: SourceTrack): { name: string; url: string }[] {
  const q = encodeURIComponent(`${t.artist} ${normalize(t.title)}`.trim())
  return [
    { name: 'Bandcamp', url: `https://bandcamp.com/search?q=${q}` },
    { name: 'Qobuz', url: `https://www.qobuz.com/search?q=${q}` },
  ]
}
