// EQ model shared by the audio graph and the on-screen curve.
// Every EQ — the 10-band graphic EQ or an imported AutoEq profile — is a list of biquads.

export type FilterType = 'peaking' | 'lowshelf' | 'highshelf'

export interface Filter {
  type: FilterType
  freq: number // Hz
  gain: number // dB
  q: number
}

export const BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const
export const GAIN_LIMIT = 12
export const BAND_Q = 1.41

export const bandLabel = (f: number) => (f >= 1000 ? `${f / 1000}k` : `${f}`)

export interface Preset {
  id: string
  name: string
  gains: number[]
}

export const PRESETS: Preset[] = [
  { id: 'flat', name: 'Balanced', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'bass', name: 'More bass', gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { id: 'voice', name: 'Voice', gains: [-3, -2, -1, 0, 2, 3, 3, 2, 0, -1] },
  { id: 'treble', name: 'More treble', gains: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6] },
  { id: 'iem', name: 'IEM warm', gains: [3, 3, 2, 0, -1, 0, 1, 1, -1, -2] },
  { id: 'night', name: 'Late night', gains: [-5, -3, -1, 0, 1, 1, 0, -1, -3, -5] },
]

/** Graphic EQ → filters. Outer bands are shelves, the rest peaking. */
export function graphicFilters(gains: number[]): Filter[] {
  return BANDS.map((freq, i) => ({
    type: i === 0 ? 'lowshelf' : i === BANDS.length - 1 ? 'highshelf' : 'peaking',
    freq,
    gain: clampGain(gains[i] ?? 0),
    q: BAND_Q,
  }))
}

export const clampGain = (g: number) => Math.max(-GAIN_LIMIT, Math.min(GAIN_LIMIT, Math.round(g * 10) / 10))

/**
 * Magnitude in dB of one biquad at `f`, using the RBJ cookbook formulas that the
 * Web Audio BiquadFilterNode implements (shelves use slope S = 1).
 */
export function filterDb(filter: Filter, f: number, fs = 48000): number {
  if (filter.gain === 0) return 0
  const A = Math.pow(10, filter.gain / 40)
  const w0 = (2 * Math.PI * Math.min(filter.freq, fs / 2 - 1)) / fs
  const cos = Math.cos(w0)
  const sin = Math.sin(w0)
  let b0, b1, b2, a0, a1, a2
  if (filter.type === 'peaking') {
    const alpha = sin / (2 * filter.q)
    b0 = 1 + alpha * A
    b1 = -2 * cos
    b2 = 1 - alpha * A
    a0 = 1 + alpha / A
    a1 = -2 * cos
    a2 = 1 - alpha / A
  } else {
    const alpha = (sin / 2) * Math.sqrt(2) // S = 1
    const sq = 2 * Math.sqrt(A) * alpha
    if (filter.type === 'lowshelf') {
      b0 = A * (A + 1 - (A - 1) * cos + sq)
      b1 = 2 * A * (A - 1 - (A + 1) * cos)
      b2 = A * (A + 1 - (A - 1) * cos - sq)
      a0 = A + 1 + (A - 1) * cos + sq
      a1 = -2 * (A - 1 + (A + 1) * cos)
      a2 = A + 1 + (A - 1) * cos - sq
    } else {
      b0 = A * (A + 1 + (A - 1) * cos + sq)
      b1 = -2 * A * (A - 1 + (A + 1) * cos)
      b2 = A * (A + 1 + (A - 1) * cos - sq)
      a0 = A + 1 - (A - 1) * cos + sq
      a1 = 2 * (A - 1 - (A + 1) * cos)
      a2 = A + 1 - (A - 1) * cos - sq
    }
  }
  const w = (2 * Math.PI * f) / fs
  const c1 = Math.cos(w), s1 = Math.sin(w)
  const c2 = Math.cos(2 * w), s2 = Math.sin(2 * w)
  const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2)
  const dr = a0 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2)
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di))
}

export function responseDb(filters: Filter[], f: number, fs = 48000): number {
  return filters.reduce((sum, flt) => sum + filterDb(flt, f, fs), 0)
}

/** Log-spaced frequencies 20 Hz – 20 kHz for drawing / analysis. */
export function logFreqs(n = 128, lo = 20, hi = 20000): number[] {
  return Array.from({ length: n }, (_, i) => lo * Math.pow(hi / lo, i / (n - 1)))
}

/** Preamp that keeps the loudest boost at 0 dBFS so the EQ never clips. */
export function autoPreamp(filters: Filter[]): number {
  const peak = Math.max(0, ...logFreqs(256).map((f) => responseDb(filters, f)))
  return peak > 0 ? -Math.round(peak * 10) / 10 : 0
}

export interface ParametricProfile {
  preamp: number
  filters: Filter[]
}

/** Parse AutoEq "ParametricEQ.txt" (also Equalizer APO / Wavelet format). */
export function parseAutoEq(text: string): ParametricProfile {
  let preamp = 0
  const filters: Filter[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    const pre = /^Preamp:\s*(-?[\d.]+)\s*dB/i.exec(line)
    if (pre) {
      preamp = parseFloat(pre[1])
      continue
    }
    const m = /^Filter\s*\d*:\s*ON\s+(PK|PEQ|LSC|LS|HSC|HS)\s+Fc\s+([\d.]+)\s*Hz\s+Gain\s+(-?[\d.]+)\s*dB(?:\s+Q\s+([\d.]+))?/i.exec(line)
    if (!m) continue
    const kind = m[1].toUpperCase()
    filters.push({
      type: kind.startsWith('L') ? 'lowshelf' : kind.startsWith('H') ? 'highshelf' : 'peaking',
      freq: parseFloat(m[2]),
      gain: parseFloat(m[3]),
      q: m[4] ? parseFloat(m[4]) : 0.71,
    })
  }
  if (filters.length === 0) throw new Error('No filters found. Use an AutoEq ParametricEQ.txt file.')
  return { preamp, filters }
}
