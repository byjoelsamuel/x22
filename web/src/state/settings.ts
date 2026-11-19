import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { autoPreamp, graphicFilters, PRESETS, type Filter, type ParametricProfile } from '../audio/eq'

export type SoundMode = 'normal' | 'bass' | 'voice' | 'night'
export const SOUND_MODES: { id: SoundMode; name: string; preset: string }[] = [
  { id: 'normal', name: 'Normal', preset: 'flat' },
  { id: 'bass', name: 'Bass', preset: 'bass' },
  { id: 'voice', name: 'Voice', preset: 'voice' },
  { id: 'night', name: 'Night', preset: 'night' },
]

export interface CustomPreset {
  id: string
  name: string
  gains: number[]
}

export interface SettingsState {
  eqEnabled: boolean
  gains: number[]
  presetId: string | null
  customPresets: CustomPreset[]
  /** Imported AutoEq / parametric profile, used instead of the graphic EQ when set. */
  profile: (ParametricProfile & { name: string }) | null
  autoPreamp: boolean
  preampDb: number
  crossfeed: number
  balance: number
  mono: boolean
  ditherBits: 0 | 16 | 24
  volume: number
  /** 0 = original file (lossless). Otherwise transcode to Opus at this kbps. */
  maxBitRate: number
  matchSampleRate: boolean
  theme: 'system' | 'dark' | 'light'

  setGain: (band: number, db: number) => void
  setGains: (gains: number[], presetId?: string | null) => void
  applyPreset: (id: string) => void
  saveCustom: (name: string) => void
  deleteCustom: (id: string) => void
  setProfile: (p: (ParametricProfile & { name: string }) | null) => void
  set: (patch: Partial<SettingsState>) => void
}

const flat = PRESETS[0].gains

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      eqEnabled: true,
      gains: [...flat],
      presetId: 'flat',
      customPresets: [],
      profile: null,
      autoPreamp: true,
      preampDb: 0,
      crossfeed: 0,
      balance: 0,
      mono: false,
      ditherBits: 0,
      volume: 1,
      maxBitRate: 0,
      matchSampleRate: true,
      theme: 'system',

      setGain: (band, db) => {
        const gains = [...get().gains]
        gains[band] = db
        set({ gains, presetId: null })
      },
      setGains: (gains, presetId = null) => set({ gains: [...gains], presetId }),
      applyPreset: (id) => {
        const p = [...PRESETS, ...get().customPresets].find((x) => x.id === id)
        if (p) set({ gains: [...p.gains], presetId: id, eqEnabled: true })
      },
      saveCustom: (name) => {
        const id = `custom-${Date.now().toString(36)}`
        set({ customPresets: [...get().customPresets, { id, name, gains: [...get().gains] }], presetId: id })
      },
      deleteCustom: (id) =>
        set({
          customPresets: get().customPresets.filter((p) => p.id !== id),
          presetId: get().presetId === id ? null : get().presetId,
        }),
      setProfile: (profile) => set({ profile }),
      set: (patch) => set(patch),
    }),
    {
      name: 'x22.settings',
      partialize: (s) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { setGain, setGains, applyPreset, saveCustom, deleteCustom, setProfile, set, ...data } = s
        return data
      },
    },
  ),
)

/** The filters currently in effect (graphic EQ, imported profile, or none). */
export function activeFilters(s: Pick<SettingsState, 'eqEnabled' | 'gains' | 'profile'>): Filter[] {
  if (!s.eqEnabled) return []
  return s.profile ? s.profile.filters : graphicFilters(s.gains)
}

export function effectivePreamp(s: SettingsState): number {
  const filters = activeFilters(s)
  if (s.autoPreamp) return autoPreamp(filters)
  if (s.profile && s.eqEnabled) return s.profile.preamp
  return s.preampDb
}

export function currentMode(s: Pick<SettingsState, 'presetId' | 'eqEnabled'>): SoundMode | null {
  if (!s.eqEnabled) return 'normal'
  return SOUND_MODES.find((m) => m.preset === s.presetId)?.id ?? null
}
