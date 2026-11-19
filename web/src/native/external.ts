import { registerPlugin } from '@capacitor/core'
import { create } from 'zustand'
import { isNative } from './platform'

/** Another app's playback (YouTube Music first), as reported by Android's media sessions. */
export interface ExternalState {
  active: boolean
  package?: string
  app?: string
  title?: string
  artist?: string
  album?: string
  duration?: number // ms
  position?: number // ms at `updatedAt`
  updatedAt?: number // wall-clock ms
  speed?: number
  playing?: boolean
  canSeek?: boolean
  artKey?: string | null
  art?: string | null // data URL, only sent when it changes
}

export type ExternalAction = 'play' | 'pause' | 'toggle' | 'next' | 'prev' | 'seek'

/** Native side: web/android/app/src/main/java/dev/x22/player/ExternalMediaPlugin.java */
interface ExternalMediaPlugin {
  getStatus(): Promise<{ granted: boolean }>
  openAccessSettings(): Promise<void>
  getState(): Promise<ExternalState>
  control(o: { action: ExternalAction; position?: number }): Promise<{ ok: boolean }>
  openApp(): Promise<void>
  setPrefs(o: { dither: boolean }): Promise<void>
  addListener(event: 'state', cb: (s: ExternalState) => void): Promise<{ remove: () => Promise<void> }>
  addListener(event: 'status', cb: (s: { granted: boolean }) => void): Promise<{ remove: () => Promise<void> }>
}

const plugin = registerPlugin<ExternalMediaPlugin>('ExternalMedia')

interface ExternalStore {
  /** Running inside the APK, where other apps can be controlled. */
  available: boolean
  /** Notification access granted. */
  granted: boolean
  state: ExternalState | null
  art: string | null
}

export const useExternal = create<ExternalStore>()(() => ({
  available: false,
  granted: false,
  state: null,
  art: null,
}))

/** Merge a native update, keeping the artwork unless it changed. */
export function applyExternalState(next: ExternalState) {
  const cur = useExternal.getState()
  const artChanged = next.artKey !== cur.state?.artKey
  useExternal.setState({
    state: next,
    art: !next.active ? null : 'art' in next ? (next.art ?? null) : artChanged ? null : cur.art,
  })
}

/** Where the other app's playhead is now, in seconds. */
export function positionNow(s: ExternalState | null, now = Date.now()): number {
  if (!s?.active) return 0
  let ms = s.position ?? 0
  if (s.playing && s.updatedAt) ms += (now - s.updatedAt) * (s.speed || 1)
  if (s.duration) ms = Math.min(ms, s.duration)
  return Math.max(0, ms) / 1000
}

export function externalControl(action: ExternalAction, positionSec?: number) {
  if (!useExternal.getState().available) return
  void plugin.control({ action, position: positionSec !== undefined ? Math.round(positionSec * 1000) : undefined })
}

export const openAccessSettings = () => plugin.openAccessSettings()
export const openExternalApp = () => plugin.openApp()
export const setExternalPrefs = (dither: boolean) => {
  if (useExternal.getState().available) void plugin.setPrefs({ dither })
}

let bound = false
export function bindExternal() {
  if (bound || !isNative()) return
  bound = true
  useExternal.setState({ available: true })
  void plugin.addListener('state', applyExternalState)
  void plugin.addListener('status', ({ granted }) => {
    useExternal.setState({ granted })
    if (granted) void plugin.getState().then(applyExternalState)
  })
  void plugin.getStatus().then(({ granted }) => useExternal.setState({ granted }))
  void plugin.getState().then(applyExternalState)
}
