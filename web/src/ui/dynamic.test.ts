import { expect, test } from 'vitest'
import { accentFromPixels, FALLBACK_ACCENT } from './accent'
import { swipeDirection } from './gestures'

const fill = (r: number, g: number, b: number, n = 64) => {
  const d = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < d.length; i += 4) d.set([r, g, b, 255], i)
  return d
}
const hue = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return r > g && r > b ? 'red' : g > r && g > b ? 'green' : 'blue'
}

test('artwork colour becomes a light pastel of the same hue', () => {
  const red = accentFromPixels(fill(200, 30, 40))
  const blue = accentFromPixels(fill(30, 60, 210))
  expect(hue(red)).toBe('red')
  expect(hue(blue)).toBe('blue')
  // pastel: every channel is fairly bright
  for (const c of [red, blue]) for (const i of [1, 3, 5]) expect(parseInt(c.slice(i, i + 2), 16)).toBeGreaterThan(110)
})

test('black-and-white art falls back to lavender', () => {
  expect(accentFromPixels(fill(128, 128, 128))).toBe(FALLBACK_ACCENT)
  expect(accentFromPixels(fill(5, 5, 5))).toBe(FALLBACK_ACCENT)
})

test('swipes need distance and a clear direction', () => {
  expect(swipeDirection(10, 4)).toBeNull() // tap
  expect(swipeDirection(-90, 10)).toBe('left')
  expect(swipeDirection(90, -8)).toBe('right')
  expect(swipeDirection(5, 120)).toBe('down')
  expect(swipeDirection(-4, -80)).toBe('up')
  expect(swipeDirection(70, 70)).toBeNull() // diagonal: ambiguous
})
