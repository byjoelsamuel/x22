import { checkForUpdate, installUpdate, useUpdate } from '../native/updater'
import { isNative } from '../native/platform'
import { useSettings } from '../state/settings'
import { Switch } from './Home'

function UpdateButton() {
  const u = useUpdate()
  const busy = u.phase === 'downloading' || u.phase === 'installing'
  return (
    <button className="pill pill-solid" disabled={busy} onClick={() => void installUpdate()}>
      {u.phase === 'downloading' ? `Downloading ${Math.round(u.progress * 100)}%` : u.phase === 'installing' ? 'Opening installer…' : 'Update'}
    </button>
  )
}

/** Small card on Home when a newer x22 is out (APK only). */
export function UpdateBanner() {
  const latest = useUpdate((u) => u.latest)
  const message = useUpdate((u) => u.message)
  if (!isNative() || !latest) return null
  return (
    <section className="card update-banner">
      <div className="row">
        <span>
          <strong>x22 {latest.version}</strong> <span className="muted small">is available</span>
        </span>
        <UpdateButton />
      </div>
      {message && <span className="muted small">{message}</span>}
    </section>
  )
}

/** Settings → Updates (APK only). */
export default function Updates() {
  const u = useUpdate()
  const auto = useSettings((s) => s.autoUpdateCheck)
  const set = useSettings((s) => s.set)
  if (!isNative()) return null
  const notes = u.latest?.notes.replace(/^#+\s*/gm, '').trim()

  return (
    <section className="card">
      <h2 className="label">Updates</h2>
      <div className="row">
        <span>
          x22 {u.current}
          <span className="muted small">
            {' · '}
            {u.phase === 'checking' ? 'checking…' : u.latest ? `${u.latest.version} available` : u.checkedAt ? 'up to date' : ''}
          </span>
        </span>
        {u.latest ? (
          <UpdateButton />
        ) : (
          <button className="pill" disabled={u.phase === 'checking'} onClick={() => void checkForUpdate()}>
            Check now
          </button>
        )}
      </div>
      {u.phase === 'downloading' && (
        <div className="bar">
          <span style={{ width: `${u.progress * 100}%` }} />
        </div>
      )}
      {u.latest && notes && <p className="muted small update-notes">{notes}</p>}
      {u.message && <p className={`small ${u.phase === 'error' ? 'error' : 'muted'}`}>{u.message}</p>}
      <div className="toggle">
        <div>
          <div>Check automatically</div>
          <div className="muted small">Once a day, from the Releases page on GitHub</div>
        </div>
        <Switch on={auto} onChange={(v) => set({ autoUpdateCheck: v })} label="Check for updates automatically" />
      </div>
    </section>
  )
}
