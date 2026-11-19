import { useState } from 'react'
import { sourceActions, useNowPlaying } from '../state/source'
import DitherImage from './DitherImage'
import { useSwipe } from './gestures'
import { IconNext, IconPause, IconPlay } from './icons'

/** Swipe left/right to skip, up to open — like flicking an earbud case. */
export default function MiniPlayer({ onOpen }: { onOpen: () => void }) {
  const np = useNowPlaying(120)
  const [dx, setDx] = useState(0)
  const swipe = useSwipe(
    (dir) => {
      if (dir === 'left') sourceActions.next()
      else if (dir === 'right') sourceActions.prev()
      else if (dir === 'up') onOpen()
      else return false
    },
    (x) => setDx(Math.max(-80, Math.min(80, x))),
  )
  if (!np) return null
  const pct = np.duration ? (np.time / np.duration) * 100 : 0

  return (
    <div
      className="mini"
      role="region"
      aria-label="Player"
      style={dx ? { transform: `translateX(calc(-50% + ${dx}px))`, transition: 'none' } : undefined}
      onPointerDown={swipe.onPointerDown}
      onPointerMove={swipe.onPointerMove}
      onPointerUp={swipe.onPointerUp}
      onPointerCancel={swipe.onPointerCancel}
    >
      <div className="mini-progress" style={{ width: `${pct}%` }} />
      <button
        className="mini-main"
        onClick={() => {
          if (!swipe.consumedClick()) onOpen()
        }}
        aria-label="Open player"
      >
        <DitherImage src={np.cover} grid={40} className="mini-art" />
        <span className="mini-text">
          <strong>{np.title}</strong>
          <span className={np.error ? 'error small' : 'muted small'}>
            {np.error ??
              (np.isX22
                ? [np.artist, np.notice].filter(Boolean).join(' · ')
                : [np.artist, np.badge?.label.toLowerCase()].filter(Boolean).join(' · '))}
          </span>
        </span>
      </button>
      <button
        className={`icon-btn ${np.buffering && np.playing ? 'pulse' : ''}`}
        aria-label={np.playing ? 'Pause' : 'Play'}
        onClick={sourceActions.toggle}
      >
        {np.playing ? <IconPause /> : <IconPlay />}
      </button>
      <button className="icon-btn" aria-label="Next" onClick={sourceActions.next}>
        <IconNext />
      </button>
    </div>
  )
}
