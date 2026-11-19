import { create } from 'zustand'
import type { Song } from '../api/types'
import { getEngine } from '../audio/engine'
import { api } from './auth'
import { bindExternal, externalControl, useExternal } from '../native/external'
import { bindNativeNowPlaying } from '../native/nowPlaying'
import { bindUpdater } from '../native/updater'
import { bindMediaSession } from './mediaSession'
import { bindSource } from './source'
import { activeFilters, effectivePreamp, useSettings } from './settings'

export type Repeat = 'off' | 'all' | 'one'

interface PlayerState {
  queue: Song[]
  index: number
  playing: boolean
  buffering: boolean
  time: number
  duration: number
  repeat: Repeat
  shuffle: boolean
  error: string | null
  /** Non-fatal note, e.g. "EQ off for this track". */
  notice: string | null
  sleepAt: number | null // epoch ms, or -1 = end of track

  current: () => Song | undefined
  playQueue: (songs: Song[], start?: number) => void
  playAt: (index: number) => void
  toggle: () => void
  next: () => void
  prev: () => void
  seek: (t: number) => void
  enqueue: (songs: Song[]) => void
  playNext: (song: Song) => void
  removeAt: (index: number) => void
  setRepeat: (r: Repeat) => void
  toggleShuffle: () => void
  setSleep: (minutes: number | 'track' | null) => void
  toggleLike: () => Promise<void>
}

function streamUrl(song: Song) {
  return api().streamUrl(song.id, useSettings.getState().maxBitRate)
}

function nextIndex(s: Pick<PlayerState, 'index' | 'queue' | 'repeat'>): number | null {
  if (s.repeat === 'one') return s.index
  if (s.index + 1 < s.queue.length) return s.index + 1
  return s.repeat === 'all' && s.queue.length ? 0 : null
}

function shuffled<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

let sleepTimer: ReturnType<typeof setTimeout> | null = null

export const usePlayer = create<PlayerState>()((set, get) => ({
  queue: [],
  index: -1,
  playing: false,
  buffering: false,
  time: 0,
  duration: 0,
  repeat: 'off',
  shuffle: false,
  error: null,
  notice: null,
  sleepAt: null,

  current: () => get().queue[get().index],

  playQueue: (songs, start = 0) => {
    if (!songs.length) return
    let queue = songs
    let index = start
    if (get().shuffle) {
      const first = songs[start]
      queue = [first, ...shuffled(songs.filter((_, i) => i !== start))]
      index = 0
    }
    set({ queue, index })
    get().playAt(index)
  },

  playAt: (index) => {
    const song = get().queue[index]
    if (!song) return
    set({ index, time: 0, duration: song.duration ?? 0, error: null })
    const engine = getEngine()
    void engine.play(streamUrl(song), {
      sampleRate: useSettings.getState().matchSampleRate ? song.samplingRate : undefined,
    })
    preloadNext()
    void api().scrobble(song.id, false).catch(() => {})
  },

  toggle: () => {
    const engine = getEngine()
    if (get().playing) engine.pause()
    else if (get().index >= 0 && engine.current.src) void engine.resume()
    else if (get().queue.length) get().playAt(Math.max(0, get().index))
  },

  next: () => {
    const s = get()
    const i = s.index + 1 < s.queue.length ? s.index + 1 : s.repeat === 'all' ? 0 : null
    if (i !== null) s.playAt(i)
  },

  prev: () => {
    const s = get()
    if (s.time > 3 || s.index === 0) getEngine().seek(0)
    else s.playAt(s.index - 1)
  },

  seek: (t) => getEngine().seek(t),

  enqueue: (songs) => {
    set({ queue: [...get().queue, ...songs] })
    if (get().index < 0) get().playAt(0)
    else preloadNext()
  },

  playNext: (song) => {
    const q = [...get().queue]
    q.splice(get().index + 1, 0, song)
    set({ queue: q })
    if (get().index < 0) get().playAt(0)
    else preloadNext()
  },

  removeAt: (i) => {
    const s = get()
    if (i === s.index) return
    const q = s.queue.filter((_, j) => j !== i)
    set({ queue: q, index: i < s.index ? s.index - 1 : s.index })
    preloadNext()
  },

  setRepeat: (repeat) => {
    set({ repeat })
    preloadNext()
  },

  toggleShuffle: () => {
    const s = get()
    const shuffle = !s.shuffle
    if (shuffle && s.queue.length > 1) {
      const cur = s.queue[s.index]
      const rest = shuffled(s.queue.filter((_, i) => i !== s.index))
      set({ shuffle, queue: cur ? [cur, ...rest] : rest, index: cur ? 0 : -1 })
    } else set({ shuffle })
    preloadNext()
  },

  setSleep: (minutes) => {
    if (sleepTimer) clearTimeout(sleepTimer)
    sleepTimer = null
    if (minutes === null) return set({ sleepAt: null })
    if (minutes === 'track') return set({ sleepAt: -1 })
    const at = Date.now() + minutes * 60_000
    sleepTimer = setTimeout(() => {
      getEngine().pause()
      // Also pause YouTube Music & co. when x22 is controlling them.
      if (useExternal.getState().state?.playing) externalControl('pause')
      set({ sleepAt: null })
    }, minutes * 60_000)
    set({ sleepAt: at })
  },

  toggleLike: async () => {
    const song = get().current()
    if (!song) return
    const on = !song.starred
    const mark = (q: Song[]) => q.map((x) => (x.id === song.id ? { ...x, starred: on ? new Date().toISOString() : undefined } : x))
    set({ queue: mark(get().queue) })
    try {
      await api().star(song.id, on)
    } catch {
      set({ queue: mark(get().queue).map((x) => (x.id === song.id ? { ...x, starred: song.starred } : x)) })
    }
  },
}))

function preloadNext() {
  const s = usePlayer.getState()
  const i = nextIndex(s)
  getEngine().setNext(i !== null && s.sleepAt !== -1 ? streamUrl(s.queue[i]) : null)
}

let bound = false
/** Wire the engine and settings into the store. Call once at startup. */
export function bindPlayer() {
  if (bound) return
  bound = true
  const engine = getEngine()
  engine.events = {
    // Transcoded streams have no Content-Length, so the browser reports Infinity —
    // fall back to the track length from Navidrome's metadata.
    onTime: (time, duration) =>
      usePlayer.setState({
        time,
        duration: Number.isFinite(duration) && duration > 0 ? duration : usePlayer.getState().duration,
      }),
    onPlaying: (playing) => usePlayer.setState({ playing }),
    onBuffering: (buffering) => usePlayer.setState({ buffering }),
    onError: (error) => usePlayer.setState({ error, playing: false, buffering: false }),
    onNotice: (notice) => usePlayer.setState({ notice }),
    onEnded: (advanced) => {
      const s = usePlayer.getState()
      const finished = s.current()
      if (finished) void api().scrobble(finished.id, true).catch(() => {})
      if (s.sleepAt === -1) {
        usePlayer.setState({ sleepAt: null, playing: false })
        return
      }
      const i = nextIndex(s)
      if (i === null) return usePlayer.setState({ playing: false })
      if (advanced) {
        const song = s.queue[i]
        usePlayer.setState({ index: i, time: 0, duration: song.duration ?? 0 })
        preloadNext()
      } else s.playAt(i)
    },
  }

  const applyDsp = () => {
    const st = useSettings.getState()
    engine.setDsp({
      filters: activeFilters(st),
      preampDb: st.eqEnabled ? effectivePreamp(st) : 0,
      crossfeed: st.crossfeed,
      balance: st.balance,
      mono: st.mono,
      ditherBits: st.ditherBits,
      volume: st.volume,
    })
  }
  applyDsp()
  useSettings.subscribe(applyDsp)
  bindMediaSession()
  bindExternal()
  bindSource()
  bindNativeNowPlaying()
  bindUpdater()
}
