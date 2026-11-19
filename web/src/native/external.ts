import { registerPlugin } from '@capacitor/core'
import { create } from 'zustand'
import { balanceDb, externalEqBands, type DpBand } from '../audio/eq'
import { activeFilters, effectivePreamp, useSettings } from '../state/settings'
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
  eqStatus?: string
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
  setEq(o: { enabled: boolean; bands: DpBand[]; preamp: number; left: number; right: number }): Promise<{ status: string }>
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
  /** Experimental EQ on other apps: "off" | "global" | "attached:<pkg>" | "unsupported". */
  eqStatus: string
}

export const useExternal = create<ExternalStore>()(() => ({
  available: false,
  granted: false,
  state: null,
  art: null,
  eqStatus: 'off',
}))

/** Merge a native update, keeping the artwork unless it changed. */
export function applyExternalState(next: ExternalState) {
  const cur = useExternal.getState()
  const artChanged = next.artKey !== cur.state?.artKey
  useExternal.setState({
    state: next,
    art: !next.active ? null : 'art' in next ? (next.art ?? null) : artChanged ? null : cur.art,
    ...(next.eqStatus ? { eqStatus: next.eqStatus } : {}),
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
  bindExternalEq()
}

/** Send x22's EQ to other apps whenever it changes (debounced). */
function bindExternalEq() {
  let last = ''
  let timer: ReturnType<typeof setTimeout> | null = null
  const push = () => {
    const s = useSettings.getState()
    const enabled = s.eqOtherApps
    const filters = enabled && s.eqEnabled ? activeFilters(s) : []
    const [left, right] = balanceDb(s.balance)
    const config = {
      enabled,
      bands: externalEqBands(filters),
      preamp: enabled && s.eqEnabled ? effectivePreamp(s) : 0,
      left,
      right,
    }
    const key = JSON.stringify(config)
    if (key === last) return
    last = key
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      void plugin.setEq(config).then(({ status }) => useExternal.setState({ eqStatus: status }))
    }, 150)
  }
  useSettings.subscribe(push)
  push()
}

/** Human-readable EQ status for Settings. */
export function eqStatusText(status: string, app?: string): string {
  if (status === 'off') return 'Off'
  if (status === 'global') return 'On — whole-phone mode (works on some phones only)'
  if (status === 'unsupported') return 'Not supported on this phone (needs Android 9+)'
  if (status.startsWith('attached:')) return `On — tuned into ${app ?? status.slice(9)}`
  return status
}
