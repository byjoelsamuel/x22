import { describe, expect, test } from 'vitest'
import { autoPreamp, balanceDb, BANDS, externalEqBands, filterDb, graphicFilters, parseAutoEq, PRESETS, responseDb } from './eq'

describe('eq math', () => {
  test('flat EQ has a flat response and no preamp', () => {
    const flat = graphicFilters(PRESETS[0].gains)
    for (const f of [20, 100, 1000, 10000]) expect(responseDb(flat, f)).toBeCloseTo(0, 6)
    expect(autoPreamp(flat)).toBe(0)
  })

  test('a peaking filter hits its gain at the centre frequency', () => {
    expect(filterDb({ type: 'peaking', freq: 1000, gain: 6, q: 1.41 }, 1000)).toBeCloseTo(6, 2)
    expect(filterDb({ type: 'peaking', freq: 1000, gain: -4, q: 1.41 }, 1000)).toBeCloseTo(-4, 2)
  })

  test('shelves reach full gain far from the corner', () => {
    expect(filterDb({ type: 'lowshelf', freq: 100, gain: 6, q: 1 }, 20)).toBeGreaterThan(5)
    expect(filterDb({ type: 'highshelf', freq: 8000, gain: 6, q: 1 }, 20000)).toBeGreaterThan(5)
  })

  test('auto preamp cancels the loudest boost', () => {
    const bass = graphicFilters(PRESETS.find((p) => p.id === 'bass')!.gains)
    const pre = autoPreamp(bass)
    expect(pre).toBeLessThan(-5)
    const peak = Math.max(...[20, 31, 40, 62].map((f) => responseDb(bass, f)))
    expect(peak + pre).toBeLessThanOrEqual(0.1)
  })

  test('cuts only never need preamp', () => {
    expect(autoPreamp(graphicFilters(BANDS.map(() => -3)))).toBe(0)
  })

  test('graphic gains are clamped to ±12 dB', () => {
    expect(graphicFilters([40, -40]).slice(0, 2).map((f) => f.gain)).toEqual([12, -12])
  })
})

describe('AutoEq import', () => {
  test('parses ParametricEQ.txt', () => {
    const p = parseAutoEq(`Preamp: -6.4 dB
Filter 1: ON LSC Fc 105 Hz Gain 6.2 dB Q 0.70
Filter 2: ON PK Fc 3300 Hz Gain -3.1 dB Q 1.95
Filter 3: ON HSC Fc 10000 Hz Gain 2.0 dB Q 0.70
Filter 4: OFF PK Fc 50 Hz Gain 9 dB Q 1`)
    expect(p.preamp).toBe(-6.4)
    expect(p.filters).toEqual([
      { type: 'lowshelf', freq: 105, gain: 6.2, q: 0.7 },
      { type: 'peaking', freq: 3300, gain: -3.1, q: 1.95 },
      { type: 'highshelf', freq: 10000, gain: 2, q: 0.7 },
    ])
  })

  test('rejects files without filters', () => {
    expect(() => parseAutoEq('hello')).toThrow()
  })
})

describe('EQ for other apps', () => {
  test('flat EQ maps to 32 flat bands covering 20 Hz – 20 kHz', () => {
    const bands = externalEqBands([])
    expect(bands).toHaveLength(32)
    expect(bands.every((b) => b.gain === 0)).toBe(true)
    expect(bands.at(-1)!.cutoff).toBe(20000)
    for (let i = 1; i < bands.length; i++) expect(bands[i].cutoff).toBeGreaterThan(bands[i - 1].cutoff)
  })

  test('band gains follow the real x22 curve', () => {
    const bass = graphicFilters(PRESETS.find((p) => p.id === 'bass')!.gains)
    const bands = externalEqBands(bass)
    expect(bands[0].gain).toBeCloseTo(responseDb(bass, 20), 1)
    expect(bands[0].gain).toBeGreaterThan(5)
    expect(Math.abs(bands.at(-1)!.gain)).toBeLessThan(0.5)
  })

  test('balance attenuates the opposite side only', () => {
    expect(balanceDb(0)).toEqual([0, 0])
    expect(balanceDb(0.5)).toEqual([-6, 0])
    expect(balanceDb(-1)).toEqual([0, -60])
  })
})
