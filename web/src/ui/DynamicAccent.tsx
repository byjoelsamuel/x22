import { useEffect } from 'react'
import { useSettings } from '../state/settings'
import { useNowPlaying } from '../state/source'
import { accentFromImage } from './accent'

/** Sets --dyn on <html> from the current cover art (renders nothing). */
export default function DynamicAccent() {
  const cover = useNowPlaying(120)?.cover
  const on = useSettings((s) => s.dynamicColor)
  useEffect(() => {
    const root = document.documentElement
    if (!on || !cover) {
      root.style.removeProperty('--dyn')
      return
    }
    let live = true
    void accentFromImage(cover).then((c) => live && root.style.setProperty('--dyn', c))
    return () => {
      live = false
    }
  }, [cover, on])
  return null
}
