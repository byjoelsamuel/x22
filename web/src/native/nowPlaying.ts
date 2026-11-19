import { Capacitor, registerPlugin } from '@capacitor/core'
import { api } from '../state/auth'
import { usePlayer } from '../state/player'
import { useSettings } from '../state/settings'
import { activeSource } from '../state/source'
import { setExternalPrefs, useExternal } from './external'

/** Native side: web/android/app/src/main/java/dev/x22/player/NowPlayingPlugin.java */
interface NowPlayingPlugin {
  update(state: { title: string; artist: string; album: string; cover?: string; playing: boolean; dither: boolean }): Promise<void>
  clear(): Promise<void>
  addListener(event: 'action', cb: (e: { action: NativeAction }) => void): Promise<{ remove: () => Promise<void> }>
}

export type NativeAction = 'toggle' | 'play' | 'pause' | 'next' | 'prev'

const NowPlaying = registerPlugin<NowPlayingPlugin>('NowPlaying')

/** Apply a widget / notification / headset button press to the player. */
export function handleNativeAction(action: NativeAction) {
  const p = usePlayer.getState()
  if (action === 'next') p.next()
  else if (action === 'prev') p.prev()
  else if (action === 'toggle') p.toggle()
  else if ((action === 'play') !== p.playing) p.toggle()
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
  void NowPlaying.addListener('action', ({ action }) => handleNativeAction(action))

  let last = ''
  let lastDither: boolean | null = null
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
    const key = song ? `${song.id}|${s.playing}|${dither}` : ''
    if (key === last) return
    last = key
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
    })
  }
  usePlayer.subscribe(push)
  useSettings.subscribe(push)
  useExternal.subscribe(push)
  push()
}
