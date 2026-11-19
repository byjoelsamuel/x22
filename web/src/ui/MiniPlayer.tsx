import { sourceActions, useNowPlaying } from '../state/source'
import DitherImage from './DitherImage'
import { IconNext, IconPause, IconPlay } from './icons'

export default function MiniPlayer({ onOpen }: { onOpen: () => void }) {
  const np = useNowPlaying(120)
  if (!np) return null
  const pct = np.duration ? (np.time / np.duration) * 100 : 0

  return (
    <div className="mini" role="region" aria-label="Player">
      <div className="mini-progress" style={{ width: `${pct}%` }} />
      <button className="mini-main" onClick={onOpen} aria-label="Open player">
        <DitherImage src={np.cover} grid={40} className="mini-art" />
        <span className="mini-text">
          <strong>{np.title}</strong>
          <span className={np.error ? 'error small' : 'muted small'}>
            {np.error ?? (np.isX22 ? np.artist : [np.artist, np.badge?.label.toLowerCase()].filter(Boolean).join(' · '))}
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
