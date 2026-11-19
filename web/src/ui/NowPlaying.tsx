import { useEffect, useRef, useState } from 'react'
import { getEngine } from '../audio/engine'
import { usePlayer } from '../state/player'
import { useSettings, type GestureAction } from '../state/settings'
import { sourceActions, useNowPlaying } from '../state/source'
import DitherImage from './DitherImage'
import { fmtTime } from './format'
import { IconDown, IconHeart, IconMoon, IconNext, IconPause, IconPlay, IconPrev, IconQueue, IconRepeat, IconShuffle } from './icons'
import TrackList from './TrackList'

function runGesture(action: GestureAction) {
  // Transport gestures follow whatever is playing (x22 or another app); like is homelab-only.
  if (action === 'toggle') sourceActions.toggle()
  else if (action === 'next') sourceActions.next()
  else if (action === 'prev') sourceActions.prev()
  else if (action === 'like') void usePlayer.getState().toggleLike()
  else if (action === 'art') useSettings.getState().set({ ditherArt: !useSettings.getState().ditherArt })
}

/** Tap / double / triple tap and hold on the artwork — like pinching an earbud stem. */
function useGestures() {
  const gestures = useSettings((s) => s.gestures)
  const taps = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null)
  const held = useRef(false)
  const [flash, setFlash] = useState<string | null>(null)

  const fire = (a: GestureAction, label: string) => {
    if (a === 'none') return
    runGesture(a)
    setFlash(label)
    setTimeout(() => setFlash(null), 600)
  }

  return {
    flash,
    onPointerDown: () => {
      held.current = false
      hold.current = setTimeout(() => {
        held.current = true
        fire(gestures.hold, 'hold')
      }, 550)
    },
    onPointerUp: () => {
      if (hold.current) clearTimeout(hold.current)
      if (held.current) return
      taps.current += 1
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        const n = taps.current
        taps.current = 0
        if (n === 1) fire(gestures.tap, '•')
        else if (n === 2) fire(gestures.doubleTap, '••')
        else fire(gestures.tripleTap, '•••')
      }, 260)
    },
    onPointerLeave: () => hold.current && clearTimeout(hold.current),
  }
}

const SLEEP_OPTIONS: { label: string; value: number | 'track' | null }[] = [
  { label: 'Off', value: null },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '60 min', value: 60 },
  { label: 'End of track', value: 'track' },
]

export default function NowPlaying({ onClose }: { onClose: () => void }) {
  const p = usePlayer()
  const np = useNowPlaying(800)
  const [showQueue, setShowQueue] = useState(false)
  const [showSleep, setShowSleep] = useState(false)
  const [scrub, setScrub] = useState<number | null>(null)
  const [, tick] = useState(0)
  const g = useGestures()
  const song = p.queue[p.index]

  useEffect(() => {
    if (!p.sleepAt || p.sleepAt < 0) return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [p.sleepAt])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  if (!np) return null
  const x22 = np.isX22 && !!song
  const badge = np.badge
  const outRate = x22 ? getEngine().sampleRate : null
  const sleepLeft =
    p.sleepAt === -1 ? 'end of track' : p.sleepAt ? `${Math.max(0, Math.ceil((p.sleepAt - Date.now()) / 60000))} min` : null

  return (
    <div className="np" role="dialog" aria-label="Now playing">
      <header className="np-head">
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <IconDown />
        </button>
        <span className="label">{np.album}</span>
        {x22 ? (
          <button className={`icon-btn ${showQueue ? 'active' : ''}`} onClick={() => setShowQueue((v) => !v)} aria-label="Queue">
            <IconQueue />
          </button>
        ) : (
          <span className="icon-btn" aria-hidden />
        )}
      </header>

      {showQueue && x22 ? (
        <div className="np-queue">
          <h2 className="label">Up next</h2>
          <TrackList songs={p.queue} />
        </div>
      ) : (
        <div
          className="np-art-wrap"
          onPointerDown={g.onPointerDown}
          onPointerUp={g.onPointerUp}
          onPointerLeave={g.onPointerLeave}
          onContextMenu={(e) => e.preventDefault()}
        >
          <DitherImage src={np.cover} grid={128} className="np-art" alt={np.album} />
          {g.flash && <span className="np-flash dot">{g.flash}</span>}
        </div>
      )}

      <div className="np-meta">
        <div className="np-text">
          <h1 className="np-title">{np.title}</h1>
          <p className="muted">{np.artist}</p>
        </div>
        {x22 && (
          <button className={`icon-btn ${song.starred ? 'liked' : ''}`} onClick={() => void p.toggleLike()} aria-label={song.starred ? 'Unlike' : 'Like'}>
            <IconHeart filled={!!song.starred} />
          </button>
        )}
      </div>

      <div className="np-seek">
        <input
          type="range"
          min={0}
          max={np.duration || 1}
          step={0.1}
          value={scrub ?? np.time}
          disabled={!np.canSeek}
          onChange={(e) => setScrub(parseFloat(e.target.value))}
          onPointerUp={() => {
            if (scrub !== null) sourceActions.seek(scrub)
            setScrub(null)
          }}
          onKeyUp={() => {
            if (scrub !== null) sourceActions.seek(scrub)
            setScrub(null)
          }}
          aria-label="Seek"
        />
        <div className="row mono small muted">
          <span>{fmtTime(scrub ?? np.time)}</span>
          {badge && <span className={`badge badge-${badge.tier}`}>{badge.label}</span>}
          <span>-{fmtTime(Math.max(0, np.duration - (scrub ?? np.time)))}</span>
        </div>
      </div>

      <div className="np-controls">
        {x22 ? (
          <button className={`icon-btn ${p.shuffle ? 'active' : ''}`} onClick={p.toggleShuffle} aria-label="Shuffle" aria-pressed={p.shuffle}>
            <IconShuffle />
          </button>
        ) : (
          <span className="icon-btn" aria-hidden />
        )}
        <button className="icon-btn" onClick={sourceActions.prev} aria-label="Previous">
          <IconPrev />
        </button>
        <button className={`np-play ${np.buffering && np.playing ? 'pulse' : ''}`} onClick={sourceActions.toggle} aria-label={np.playing ? 'Pause' : 'Play'}>
          {np.playing ? <IconPause width={30} height={30} /> : <IconPlay width={30} height={30} />}
        </button>
        <button className="icon-btn" onClick={sourceActions.next} aria-label="Next">
          <IconNext />
        </button>
        {x22 ? (
          <button
            className={`icon-btn ${p.repeat !== 'off' ? 'active' : ''}`}
            onClick={() => p.setRepeat(p.repeat === 'off' ? 'all' : p.repeat === 'all' ? 'one' : 'off')}
            aria-label={`Repeat ${p.repeat}`}
          >
            <IconRepeat />
            {p.repeat === 'one' && <span className="repeat-one mono">1</span>}
          </button>
        ) : (
          <span className="icon-btn" aria-hidden />
        )}
      </div>

      <div className="np-foot">
        <button className={`pill ${sleepLeft ? 'pill-on' : ''}`} onClick={() => setShowSleep((v) => !v)}>
          <IconMoon width={16} height={16} /> {sleepLeft ? `Sleep · ${sleepLeft}` : 'Sleep timer'}
        </button>
        <span className="mono small muted">{outRate ? `out ${outRate / 1000} kHz` : ''}</span>
      </div>
      {showSleep && (
        <div className="chips sleep-chips">
          {SLEEP_OPTIONS.filter((o) => x22 || o.value !== 'track').map((o) => (
            <button
              key={o.label}
              className="chip"
              onClick={() => {
                p.setSleep(o.value)
                setShowSleep(false)
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      {np.error && <p className="error small">{np.error}</p>}
    </div>
  )
}
