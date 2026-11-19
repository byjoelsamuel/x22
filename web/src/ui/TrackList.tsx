import type { Song } from '../api/types'
import { usePlayer } from '../state/player'
import { useSettings } from '../state/settings'
import { fmtTime, qualityBadge } from './format'

interface Props {
  songs: Song[]
  /** Show track numbers (album view) instead of artist names. */
  numbered?: boolean
}

export default function TrackList({ songs, numbered }: Props) {
  const currentId = usePlayer((p) => p.queue[p.index]?.id)
  const maxBitRate = useSettings((s) => s.maxBitRate)
  if (!songs.length) return <p className="muted empty">No tracks</p>

  return (
    <ol className="tracks">
      {songs.map((song, i) => {
        const badge = qualityBadge(song, maxBitRate)
        const active = song.id === currentId
        return (
          <li key={`${song.id}-${i}`} className={active ? 'active' : ''}>
            <button className="track-main" onClick={() => usePlayer.getState().playQueue(songs, i)}>
              <span className="track-no mono">{numbered ? (song.track ?? i + 1) : active ? '▶' : i + 1}</span>
              <span className="track-text">
                <span className="track-title">{song.title}</span>
                <span className="muted small">
                  {numbered ? '' : `${song.artist ?? ''} · `}
                  {fmtTime(song.duration ?? 0)}
                  {badge.tier !== 'lossy' && <span className={`dot-tag tag-${badge.tier}`}> {badge.label}</span>}
                </span>
              </span>
            </button>
            <button
              className="icon-btn small-btn"
              aria-label={`Play ${song.title} next`}
              title="Play next"
              onClick={() => usePlayer.getState().playNext(song)}
            >
              +
            </button>
          </li>
        )
      })}
    </ol>
  )
}
