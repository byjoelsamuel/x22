import type { Song } from '../api/types'

const LOSSLESS = new Set(['flac', 'alac', 'wav', 'aiff', 'aif', 'ape', 'wv', 'dsf', 'dff'])

export interface Badge {
  label: string // "FLAC 24/96"
  tier: 'hires' | 'lossless' | 'lossy'
}

/** Quality badge for a song, accounting for an active transcode cap. */
export function qualityBadge(song: Song, maxBitRate = 0): Badge {
  if (maxBitRate > 0) return { label: `OPUS ${maxBitRate}k`, tier: 'lossy' }
  const suffix = (song.suffix ?? '').toLowerCase()
  const isLossless = LOSSLESS.has(suffix) || (suffix === 'm4a' && (song.bitDepth ?? 0) > 0)
  const name = suffix === 'm4a' && isLossless ? 'ALAC' : suffix.toUpperCase() || 'AUDIO'
  if (!isLossless) return { label: song.bitRate ? `${name} ${song.bitRate}k` : name, tier: 'lossy' }
  const depth = song.bitDepth || 16
  const rate = song.samplingRate ? trimRate(song.samplingRate / 1000) : '44.1'
  const hires = depth > 16 || (song.samplingRate ?? 44100) > 48000
  return { label: `${name} ${depth}/${rate}`, tier: hires ? 'hires' : 'lossless' }
}

const trimRate = (khz: number) => String(Math.round(khz * 10) / 10)

export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export const fmtDb = (db: number) => `${db > 0 ? '+' : db < 0 ? '−' : ''}${Math.abs(db).toFixed(1)} dB`
