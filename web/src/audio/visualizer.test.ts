import { expect, test } from 'vitest'
import { bars, BAR_COUNT, bucketEdges, smooth } from './visualizer'

const flat = (v: number, n = 128) => new Uint8Array(n).fill(v)

test('silence is flat, loud is full', () => {
  expect(bars(flat(0))).toEqual(new Array(BAR_COUNT).fill(0))
  expect(bars(flat(10)).every((v) => v === 0)).toBe(true) // noise floor ignored
  expect(bars(flat(255)).every((v) => v === 1)).toBe(true)
})

test('buckets are log-spaced, rising and never empty', () => {
  const edges = bucketEdges(128, 48000)
  expect(edges).toHaveLength(BAR_COUNT + 1)
  for (let i = 1; i < edges.length; i++) expect(edges[i]).toBeGreaterThan(edges[i - 1])
  // low bars cover fewer bins than high ones (log spacing)
  expect(edges[1] - edges[0]).toBeLessThan(edges[edges.length - 1] - edges[edges.length - 2])
})

test('tiny FFTs and odd sample rates still give one bar each', () => {
  for (const [bins, rate] of [
    [8, 8000],
    [16, 44100],
    [128, 96000],
  ] as const) {
    const out = bars(flat(200, bins), rate)
    expect(out).toHaveLength(BAR_COUNT)
    expect(out.every((v) => v >= 0 && v <= 1)).toBe(true)
  }
  expect(bars([])).toEqual(new Array(BAR_COUNT).fill(0))
})

test('bass in, bass bar up', () => {
  const data = new Uint8Array(128)
  data.fill(220, 0, 6) // low bins only
  const out = bars(data)
  expect(out[0]).toBeGreaterThan(0.5)
  expect(out[BAR_COUNT - 1]).toBe(0)
})

test('bars jump up instantly and fall gradually', () => {
  const up = smooth([0, 0], [1, 1])
  expect(up).toEqual([1, 1])
  const down = smooth([1, 1], [0, 0])
  expect(down[0]).toBeGreaterThan(0)
  expect(down[0]).toBeLessThan(1)
  // and keeps falling toward zero
  let v = [1]
  for (let i = 0; i < 40; i++) v = smooth(v, [0])
  expect(v[0]).toBeLessThan(0.05)
})
