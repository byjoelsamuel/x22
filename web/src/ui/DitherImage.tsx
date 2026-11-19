import { useEffect, useRef, useState } from 'react'
import { ditherToRamp } from './dither'

interface Props {
  src?: string
  alt?: string
  /** Pixel grid resolution. Lower = chunkier dither. */
  grid?: number
  className?: string
}

/** Cover art rendered as a pastel, Bayer-dithered pixel image. */
export default function DitherImage({ src, alt = '', grid = 96, className }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
    const c = canvas.current
    if (!src || !c) return
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelled) return
      try {
        c.width = grid
        c.height = grid
        const ctx = c.getContext('2d', { willReadFrequently: true })!
        // cover-fit crop
        const s = Math.min(img.naturalWidth, img.naturalHeight)
        ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, grid, grid)
        const data = ctx.getImageData(0, 0, grid, grid)
        ditherToRamp(data)
        ctx.putImageData(data, 0, 0)
      } catch {
        setFailed(true) // tainted canvas (no CORS) — fall back to the plain image
      }
    }
    img.onerror = () => !cancelled && setFailed(true)
    img.src = src
    return () => {
      cancelled = true
    }
  }, [src, grid])

  if (!src) return <div className={`dither-empty dither ${className ?? ''}`} aria-hidden />
  if (failed) return <img src={src} alt={alt} className={className} />
  return <canvas ref={canvas} role="img" aria-label={alt} className={`dither-canvas ${className ?? ''}`} />
}
