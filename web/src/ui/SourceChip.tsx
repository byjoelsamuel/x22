import { useExternal } from '../native/external'
import { usePlayer } from '../state/player'
import { activeSource, useSource, type Source } from '../state/source'

/**
 * Small chip in the Home header: shows which player x22 is following and lets you pin one.
 * Tap cycles Auto → x22 → <app> → Auto. Only shown when another app is available.
 */
export default function SourceChip() {
  const ext = useExternal((e) => (e.granted && e.state?.active ? e.state : null))
  const pinned = useSource((s) => s.pinned)
  usePlayer((p) => p.playing) // re-render when the auto choice may change
  if (!ext) return null

  const app = shortName(ext.app)
  const order: (Source | null)[] = [null, 'x22', 'external']
  const next = order[(order.indexOf(pinned) + 1) % order.length]
  const current = pinned ?? activeSource()
  const label = current === 'external' ? app : 'x22'

  return (
    <button
      className={`chip source-chip ${pinned ? 'on' : ''}`}
      onClick={() => useSource.getState().pin(next)}
      aria-label={`Following ${label}${pinned ? ' (pinned)' : ' (auto)'}. Tap to change.`}
      title={pinned ? 'Pinned — tap to change' : 'Auto-following what plays — tap to pin'}
    >
      <span className={`source-dot ${current === 'external' ? 'ext' : ''}`} aria-hidden />
      {pinned ? label : `auto · ${label}`}
    </button>
  )
}

const shortName = (app?: string) => (app ? app.replace(/^YouTube Music$/i, 'YT Music') : 'App')
