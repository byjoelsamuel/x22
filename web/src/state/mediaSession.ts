import { api } from './auth'
import { usePlayer } from './player'

/** Lock-screen / notification / Bluetooth-button controls via the Media Session API. */
export function bindMediaSession() {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  const ms = navigator.mediaSession
  const p = () => usePlayer.getState()

  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => p().toggle()],
    ['pause', () => p().toggle()],
    ['nexttrack', () => p().next()],
    ['previoustrack', () => p().prev()],
    ['seekto', (d) => d.seekTime !== undefined && p().seek(d.seekTime)],
    ['seekforward', (d) => p().seek(p().time + (d.seekOffset ?? 10))],
    ['seekbackward', (d) => p().seek(p().time - (d.seekOffset ?? 10))],
  ]
  for (const [action, fn] of handlers) {
    try {
      ms.setActionHandler(action, fn)
    } catch {
      /* action unsupported on this browser */
    }
  }

  let lastId: string | undefined
  let lastPos = 0
  usePlayer.subscribe((s) => {
    const song = s.queue[s.index]
    if (song && song.id !== lastId) {
      lastId = song.id
      const art = api().coverUrl(song.coverArt, 512)
      ms.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist ?? '',
        album: song.album ?? '',
        artwork: art ? [{ src: art, sizes: '512x512' }] : [],
      })
    }
    ms.playbackState = s.playing ? 'playing' : song ? 'paused' : 'none'
    // throttle position updates to whole seconds
    if (s.duration > 0 && Math.abs(s.time - lastPos) >= 1) {
      lastPos = s.time
      try {
        ms.setPositionState({ duration: s.duration, position: Math.min(s.time, s.duration), playbackRate: 1 })
      } catch {
        /* ignore invalid state */
      }
    }
  })
}
