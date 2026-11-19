// Pastel ramp from the app icon, dark → light. Luminance is ordered-dithered across it.
const RAMP: [number, number, number][] = [
  [26, 22, 38], // ink
  [142, 122, 196], // deep lavender
  [201, 184, 240], // lavender
  [255, 203, 178], // peach
  [255, 241, 186], // butter
]

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

export function ditherToRamp(img: ImageData) {
  const { data, width } = img
  const steps = RAMP.length - 1
  for (let i = 0; i < data.length; i += 4) {
    const p = i / 4
    const x = p % width
    const y = (p / width) | 0
    // perceptual luminance with a little contrast boost
    let l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
    l = Math.min(1, Math.max(0, (l - 0.5) * 1.15 + 0.5))
    const v = l * steps
    const lo = Math.floor(v)
    const t = (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16
    const c = RAMP[Math.min(steps, v - lo > t ? lo + 1 : lo)]
    data[i] = c[0]
    data[i + 1] = c[1]
    data[i + 2] = c[2]
    data[i + 3] = 255
  }
}
