import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { externalControl, positionNow, useExternal } from '../native/external'
import { haptic } from '../native/haptics'
import { qualityBadge, type Badge } from '../ui/format'
import { api } from './auth'
import { usePlayer } from './player'
import { useSettings } from './settings'

/** x22's own player (homelab) or another app (YouTube Music, …). */
export type Source = 'x22' | 'external'

interface SourceStore {
  /** User-pinned source; null = auto-follow whatever is playing. */
  pinned: Source | null
  /** Last source that was playing, used when nothing plays. */
  last: Source
  pin: (s: Source | null) => void
}

export const useSource = create<SourceStore>()((set) => ({
  pinned: null,
  last: 'x22',
  pin: (pinned) => set({ pinned }),
}))

export interface PickInput {
  x22Playing: boolean
  x22HasTrack: boolean
  extPlaying: boolean
  extActive: boolean
  pinned: Source | null
  last: Source
}

/**
 * Auto-follow: a pin wins; otherwise whichever is playing (x22 first if both);
 * otherwise the last one that played, if it still has something to show.
 */
export function pickSource(i: PickInput): Source {
  if (i.pinned) return i.pinned
  if (i.x22Playing) return 'x22'
  if (i.extPlaying) return 'external'
  if (i.last === 'external' && i.extActive) return 'external'
  if (i.x22HasTrack) return 'x22'
  return i.extActive ? 'external' : 'x22'
}

function currentInput(): PickInput {
  const p = usePlayer.getState()
  const e = useExternal.getState().state
  const s = useSource.getState()
  return {
    x22Playing: p.playing,
    x22HasTrack: p.index >= 0 && !!p.queue[p.index],
    extPlaying: !!e?.active && !!e.playing,
    extActive: !!e?.active,
    pinned: s.pinned,
    last: s.last,
  }
}

export const activeSource = (): Source => pickSource(currentInput())

/** Remember the last source that played (call once at startup). */
export function bindSource() {
  const track = () => {
    const i = currentInput()
    const playing: Source | null = i.x22Playing ? 'x22' : i.extPlaying ? 'external' : null
    if (playing && useSource.getState().last !== playing) useSource.setState({ last: playing })
  }
  usePlayer.subscribe(track)
  useExternal.subscribe(track)
}

/** Transport controls for the active source. */
export const sourceActions = {
  toggle: () => {
    haptic()
    return activeSource() === 'external' ? externalControl('toggle') : usePlayer.getState().toggle()
  },
  next: () => {
    haptic()
    return activeSource() === 'external' ? externalControl('next') : usePlayer.getState().next()
  },
  prev: () => {
    haptic()
    return activeSource() === 'external' ? externalControl('prev') : usePlayer.getState().prev()
  },
  pause: () => (activeSource() === 'external' ? externalControl('pause') : usePlayer.getState().playing && usePlayer.getState().toggle()),
  seek: (sec: number) => (activeSource() === 'external' ? externalControl('seek', sec) : usePlayer.getState().seek(sec)),
}

export interface NowPlayingView {
  source: Source
  title: string
  artist: string
  album: string
  cover?: string
  playing: boolean
  buffering: boolean
  time: number // s
  duration: number // s
  badge: Badge | null
  canSeek: boolean
  /** Homelab-only features: like, queue, shuffle, repeat. */
  isX22: boolean
  error: string | null
}

/** Ticks once a second while `on`, so extrapolated positions move. */
function useTick(on: boolean) {
  const [, set] = useState(0)
  useEffect(() => {
    if (!on) return
    const t = setInterval(() => set((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [on])
}

/** One view of "what's playing", whichever source it comes from. */
export function useNowPlaying(coverSize = 600): NowPlayingView | null {
  const p = usePlayer()
  const ext = useExternal()
  const pinned = useSource((s) => s.pinned)
  const last = useSource((s) => s.last)
  const maxBitRate = useSettings((s) => s.maxBitRate)
  const song = p.queue[p.index]
  const e = ext.state
  const source = pickSource({
    x22Playing: p.playing,
    x22HasTrack: !!song,
    extPlaying: !!e?.active && !!e.playing,
    extActive: !!e?.active,
    pinned,
    last,
  })
  useTick(source === 'external' && !!e?.playing)

  if (source === 'external') {
    if (!e?.active) return null
    return {
      source,
      title: e.title || 'Unknown',
      artist: e.artist ?? '',
      album: e.album ?? '',
      cover: ext.art ?? undefined,
      playing: !!e.playing,
      buffering: false,
      time: positionNow(e),
      duration: (e.duration ?? 0) / 1000,
      badge: e.app ? { label: e.app.toUpperCase(), tier: 'lossy' } : null,
      canSeek: !!e.canSeek,
      isX22: false,
      error: null,
    }
  }
  if (!song) return null
  return {
    source,
    title: song.title,
    artist: song.artist ?? '',
    album: song.album ?? '',
    cover: api().coverUrl(song.coverArt, coverSize),
    playing: p.playing,
    buffering: p.buffering,
    time: p.time,
    duration: p.duration,
    badge: qualityBadge(song, maxBitRate),
    canSeek: true,
    isX22: true,
    error: p.error,
  }
}
