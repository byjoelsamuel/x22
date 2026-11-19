import { useEffect, useRef } from 'react'
import { getEngine } from '../audio/engine'
import { BAR_COUNT } from '../audio/visualizer'
import { useSettings } from '../state/settings'

/**
 * Dot-matrix level meter in x22's style: each bar is a column of squares that light up,
 * tinted with the artwork's accent colour.
 */
export default function Visualizer({ playing, rows = 5, className = '' }: { playing: boolean; rows?: number; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const on = useSettings((s) => s.visualizer)

  useEffect(() => {
    const c = canvas.current
    if (!c || !on) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const style = getComputedStyle(document.documentElement)
    const accent = style.getPropertyValue('--dyn').trim() || '#c9b8f0'
    const dim = style.getPropertyValue('--line').trim() || '#2a2a2a'
    let raf = 0

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const levels = playing ? getEngine().spectrum.read() : new Array(BAR_COUNT).fill(0)
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = c.clientWidth
      const h = c.clientHeight
      if (c.width !== w * dpr || c.height !== h * dpr) {
        c.width = w * dpr
        c.height = h * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const gap = 3
      const barW = (w - gap * (BAR_COUNT - 1)) / BAR_COUNT
      const cellH = (h - gap * (rows - 1)) / rows
      for (let b = 0; b < BAR_COUNT; b++) {
        const lit = Math.round((levels[b] ?? 0) * rows)
        for (let r = 0; r < rows; r++) {
          ctx.fillStyle = r < lit ? accent : dim
          ctx.fillRect(b * (barW + gap), h - (r + 1) * cellH - r * gap, barW, cellH)
        }
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [playing, rows, on])

  if (!on) return null
  return <canvas ref={canvas} className={`viz ${className}`} aria-hidden />
}
