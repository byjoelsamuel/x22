import { api } from '../state/auth'
import { usePlayer } from '../state/player'
import DitherImage from './DitherImage'
import { IconNext, IconPause, IconPlay } from './icons'

export default function MiniPlayer({ onOpen }: { onOpen: () => void }) {
  const song = usePlayer((p) => p.queue[p.index])
  const playing = usePlayer((p) => p.playing)
  const buffering = usePlayer((p) => p.buffering)
  const time = usePlayer((p) => p.time)
  const duration = usePlayer((p) => p.duration)
  const error = usePlayer((p) => p.error)
  if (!song) return null
  const pct = duration ? (time / duration) * 100 : 0

  return (
    <div className="mini" role="region" aria-label="Player">
      <div className="mini-progress" style={{ width: `${pct}%` }} />
      <button className="mini-main" onClick={onOpen} aria-label="Open player">
        <DitherImage src={api().coverUrl(song.coverArt, 120)} grid={40} className="mini-art" />
        <span className="mini-text">
          <strong>{song.title}</strong>
          <span className={error ? 'error small' : 'muted small'}>{error ?? song.artist}</span>
        </span>
      </button>
      <button
        className={`icon-btn ${buffering && playing ? 'pulse' : ''}`}
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={() => usePlayer.getState().toggle()}
      >
        {playing ? <IconPause /> : <IconPlay />}
      </button>
      <button className="icon-btn" aria-label="Next" onClick={() => usePlayer.getState().next()}>
        <IconNext />
      </button>
    </div>
  )
}
