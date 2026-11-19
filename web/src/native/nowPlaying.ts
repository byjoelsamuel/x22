import { Capacitor, registerPlugin } from '@capacitor/core'
import { api } from '../state/auth'
import { getEngine } from '../audio/engine'
import { usePlayer } from '../state/player'
import { useSettings } from '../state/settings'
import { activeSource } from '../state/source'
import { setExternalPrefs, useExternal } from './external'

/** Native side: web/android/app/src/main/java/dev/x22/player/NowPlayingPlugin.java */
interface NowPlayingPlugin {
  update(state: {
    title: string
    artist: string
    album: string
    cover?: string
    playing: boolean
    dither: boolean
    /** Milliseconds, so the lock screen can draw a seek bar. */
    position: number
    duration: number
  }): Promise<void>
  clear(): Promise<void>
  levels(o: { levels: number[] }): Promise<void>
  addListener(event: 'action', cb: (e: { action: NativeAction; position?: number }) => void): Promise<{ remove: () => Promise<void> }>
}

export type NativeAction = 'toggle' | 'play' | 'pause' | 'next' | 'prev' | 'seek'

const NowPlaying = registerPlugin<NowPlayingPlugin>('NowPlaying')

/** Apply a widget / notification / headset button press to the player. */
export function handleNativeAction(action: NativeAction, positionMs?: number) {
  const p = usePlayer.getState()
  if (action === 'next') p.next()
  else if (action === 'prev') p.prev()
  else if (action === 'toggle') p.toggle()
  else if (action === 'seek') {
    if (typeof positionMs === 'number') p.seek(positionMs / 1000)
  } else if ((action === 'play') !== p.playing) p.toggle()
}

/** Absolute URL so the native side can download the cover. */
function absolute(url: string | undefined) {
  return url ? new URL(url, window.location.href).toString() : undefined
}

let bound = false
/** Mirror the player into the Android widget and media notification (APK only). */
export function bindNativeNowPlaying() {
  if (bound || !Capacitor.isNativePlatform()) return
  bound = true
  void NowPlaying.addListener('action', ({ action, position }) => handleNativeAction(action, position))

  let last = ''
  let lastDither: boolean | null = null
  let lastTime = 0
  const push = () => {
    const s = usePlayer.getState()
    const song = s.queue[s.index]
    const dither = useSettings.getState().ditherArt
    if (dither !== lastDither) {
      lastDither = dither
      setExternalPrefs(dither)
    }
    // Another app is in charge: the native side drives the widget for it.
    if (activeSource() === 'external') {
      last = 'external'
      return
    }
    // The native side extrapolates the position while playing, so we only re-anchor it on
    // a track change, a play/pause, or a jump (a seek) — not on every tick.
    const seeked = Math.abs(s.time - lastTime) > 3
    const key = song ? `${song.id}|${s.playing}|${dither}` : ''
    if (key === last && !seeked) {
      lastTime = s.time
      return
    }
    last = key
    lastTime = s.time
    if (!song) {
      void NowPlaying.clear()
      return
    }
    void NowPlaying.update({
      title: song.title,
      artist: song.artist ?? '',
      album: song.album ?? '',
      cover: absolute(api().coverUrl(song.coverArt, 300)),
      playing: s.playing,
      dither,
      position: Math.round(s.time * 1000),
      duration: Math.round((s.duration || song.duration || 0) * 1000),
    })
  }
  usePlayer.subscribe(push)
  useSettings.subscribe(push)
  useExternal.subscribe(push)
  push()
  bindWidgetVisualizer()
}

/**
 * Feed the home-screen widget's bars ~6 times a second while x22 is playing. A plain
 * interval (not requestAnimationFrame) so it keeps ticking when the app isn't on screen;
 * the native side skips the redraw whenever the screen is off.
 */
function bindWidgetVisualizer() {
  let timer: ReturnType<typeof setInterval> | null = null
  let sentZeros = false
  const tick = () => {
    const s = usePlayer.getState()
    if (!s.playing || !useSettings.getState().visualizer || activeSource() === 'external') {
      if (!sentZeros) {
        sentZeros = true
        void NowPlaying.levels({ levels: [] })
      }
      return
    }
    sentZeros = false
    void NowPlaying.levels({ levels: getEngine().spectrum.read().map((v) => Math.round(v * 100) / 100) })
  }
  const sync = () => {
    const wanted = usePlayer.getState().playing && useSettings.getState().visualizer
    if (wanted && !timer) timer = setInterval(tick, 160)
    else if (!wanted && timer) {
      clearInterval(timer)
      timer = null
      tick() // clear the bars
    }
  }
  usePlayer.subscribe(sync)
  useSettings.subscribe(sync)
  sync()
}
