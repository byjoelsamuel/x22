/**
 * Dynamic colour: pull the most characterful colour out of the album art and turn it into a
 * soft pastel that matches x22's palette (the same idea as Material You / Nothing's
 * artwork-tinted players).
 */

export const FALLBACK_ACCENT = '#c9b8f0' // lavender from the icon

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
}

/**
 * Average the hue of the most saturated pixels, then present it as a pastel
 * (fixed lightness, capped saturation) so it always reads well on black and on white.
 * Greyscale art falls back to lavender.
 */
export function accentFromPixels(data: Uint8ClampedArray): string {
  let x = 0
  let y = 0
  let weight = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2])
    if (l < 0.12 || l > 0.95) continue // near-black / near-white carry no colour
    const w = s * s * (1 - Math.abs(l - 0.5))
    x += Math.cos((h * Math.PI) / 180) * w
    y += Math.sin((h * Math.PI) / 180) * w
    weight += w
  }
  const strength = weight / (data.length / 4)
  if (weight === 0 || strength < 0.02) return FALLBACK_ACCENT
  const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
  return hslToHex(hue, 0.72, 0.8)
}

const cache = new Map<string, string>()

/** Accent colour for an image URL (same-origin or CORS-enabled). Never throws. */
export function accentFromImage(src: string): Promise<string> {
  const hit = cache.get(src)
  if (hit) return Promise.resolve(hit)
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = c.height = 24
        const ctx = c.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(img, 0, 0, 24, 24)
        const colour = accentFromPixels(ctx.getImageData(0, 0, 24, 24).data)
        cache.set(src, colour)
        resolve(colour)
      } catch {
        resolve(FALLBACK_ACCENT)
      }
    }
    img.onerror = () => resolve(FALLBACK_ACCENT)
    img.src = src
  })
}
