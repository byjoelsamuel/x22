import { useRef, type PointerEvent } from 'react'
import { haptic } from '../native/haptics'

export type Swipe = 'left' | 'right' | 'up' | 'down'

/** Classify a drag. Needs a clear direction and distance, so taps and scrolls stay taps and scrolls. */
export function swipeDirection(dx: number, dy: number, min = 56): Swipe | null {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (Math.max(ax, ay) < min) return null
  if (ax > ay * 1.5) return dx > 0 ? 'right' : 'left'
  if (ay > ax * 1.5) return dy > 0 ? 'down' : 'up'
  return null
}

/**
 * Pointer handlers that report a swipe. `onMove` gets the live offset so the UI can follow
 * the finger. A tap (no swipe) is passed through untouched.
 */
export function useSwipe(onSwipe: (s: Swipe) => boolean | void, onMove?: (dx: number, dy: number) => void) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null)
  const swiped = useRef(false)
  return {
    onPointerDown: (e: PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
      swiped.current = false
    },
    onPointerMove: (e: PointerEvent) => {
      const s = start.current
      if (s && s.id === e.pointerId) onMove?.(e.clientX - s.x, e.clientY - s.y)
    },
    onPointerUp: (e: PointerEvent) => {
      const s = start.current
      start.current = null
      onMove?.(0, 0)
      if (!s || s.id !== e.pointerId) return
      const dir = swipeDirection(e.clientX - s.x, e.clientY - s.y)
      if (dir && onSwipe(dir) !== false) {
        swiped.current = true
        haptic()
      }
    },
    onPointerCancel: () => {
      start.current = null
      onMove?.(0, 0)
    },
    /** True right after a swipe, so a click handler can ignore the trailing click. */
    consumedClick: () => {
      const v = swiped.current
      swiped.current = false
      return v
    },
  }
}
