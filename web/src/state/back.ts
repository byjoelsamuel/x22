import { App as CapApp } from '@capacitor/app'
import { useEffect, useRef } from 'react'
import { isNative } from '../native/platform'

/**
 * One back stack for the whole app. Screens register a handler while they can "go back"
 * (Now Playing open, inside an album, a sheet open, a non-Home tab…). The newest handler
 * runs first. When nothing is left, Android back sends x22 to the background instead of
 * closing it, so the music keeps playing.
 */
type Handler = { id: number; run: () => void }
const stack: Handler[] = []
let nextId = 1

export function pushBack(run: () => void): () => void {
  const h = { id: nextId++, run }
  stack.push(h)
  return () => {
    const i = stack.findIndex((x) => x.id === h.id)
    if (i >= 0) stack.splice(i, 1)
  }
}

/** Run the top handler. Returns false when there is nothing to go back to. */
export function handleBack(): boolean {
  const top = stack.at(-1)
  if (!top) return false
  top.run()
  return true
}

export const backDepth = () => stack.length

/** Register `onBack` while `active` is true. */
export function useBack(active: boolean, onBack: () => void) {
  const ref = useRef(onBack)
  useEffect(() => {
    ref.current = onBack
  })
  useEffect(() => {
    if (!active) return
    return pushBack(() => ref.current())
  }, [active])
}

let bound = false
export function bindBackButton() {
  if (bound) return
  bound = true
  if (isNative()) {
    void CapApp.addListener('backButton', () => {
      if (!handleBack()) void CapApp.minimizeApp()
    })
    return
  }
  // Browser / PWA: keep one history entry so Back lands here first.
  if (typeof window === 'undefined') return
  history.pushState({ x22: true }, '')
  window.addEventListener('popstate', () => {
    if (handleBack()) history.pushState({ x22: true }, '')
    else history.back()
  })
}
