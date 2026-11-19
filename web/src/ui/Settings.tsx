import { useState, type ChangeEvent } from 'react'
import { parseAutoEq } from '../audio/eq'
import { useAuth } from '../state/auth'
import { openAccessSettings, openExternalApp, useExternal } from '../native/external'
import { disconnectHomelab, useUi } from '../state/ui'
import { GESTURE_ACTIONS, useSettings, type GestureAction, type SettingsState } from '../state/settings'
import { Switch } from './Home'

const QUALITY = [
  { value: 0, name: 'Original', hint: 'Lossless / hi-res, no transcoding' },
  { value: 320, name: '320k', hint: 'Opus — near-transparent' },
  { value: 192, name: '192k', hint: 'Opus — saves data' },
  { value: 128, name: '128k', hint: 'Opus — mobile data' },
]

export default function Settings() {
  const s = useSettings()
  const creds = useAuth((a) => a.creds)
  const openConnect = useUi((u) => u.openConnect)
  const ext = useExternal()
  const [profileError, setProfileError] = useState<string | null>(null)
  const secure = typeof window !== 'undefined' && window.isSecureContext

  async function importProfile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const p = parseAutoEq(await file.text())
      s.set({ profile: { ...p, name: file.name.replace(/\.txt$/i, '').replace(/ ParametricEQ$/i, '') }, eqEnabled: true })
      setProfileError(null)
    } catch (err) {
      setProfileError((err as Error).message)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="dot page-title">Settings</h1>
      </header>

      {ext.available && (
        <section className="card">
          <h2 className="label">Other apps</h2>
          <p className="muted small">
            Follow and control YouTube Music (or whatever is playing) from x22 and its widget.
          </p>
          <Row
            label={ext.granted ? 'Access granted' : 'Notification access'}
            hint={ext.granted ? (ext.state?.active ? `Following ${ext.state.app}` : 'Nothing playing in other apps') : 'Needed to see other players'}
          >
            {ext.granted ? (
              <button className="pill" onClick={() => void openExternalApp()}>
                Open YT Music
              </button>
            ) : (
              <button className="pill pill-solid" onClick={() => void openAccessSettings()}>
                Grant
              </button>
            )}
          </Row>
        </section>
      )}

      <section className="card">
        <h2 className="label">Streaming quality</h2>
        <div className="segmented">
          {QUALITY.map((q) => (
            <button key={q.value} className={s.maxBitRate === q.value ? 'on' : ''} onClick={() => s.set({ maxBitRate: q.value })}>
              {q.name}
            </button>
          ))}
        </div>
        <p className="muted small">{QUALITY.find((q) => q.value === s.maxBitRate)?.hint}. Applies from the next track.</p>
        <Row label="Match sample rate" hint="Open audio output at the track's rate (e.g. 96 kHz) when the device allows">
          <Switch on={s.matchSampleRate} onChange={(v) => s.set({ matchSampleRate: v })} label="Match sample rate" />
        </Row>
      </section>

      <section className="card">
        <h2 className="label">IEM profile</h2>
        <p className="muted small">
          Import an AutoEq <span className="mono">ParametricEQ.txt</span> for your IEMs (from autoeq.app) to tune them to a target curve.
        </p>
        {s.profile ? (
          <div className="row">
            <span>
              <span className="badge badge-lossless">ACTIVE</span> {s.profile.name} · {s.profile.filters.length} filters
            </span>
            <button className="link" onClick={() => s.setProfile(null)}>
              Remove
            </button>
          </div>
        ) : null}
        <label className="pill file-pill">
          Import profile
          <input type="file" accept=".txt,text/plain" onChange={importProfile} hidden />
        </label>
        {profileError && <p className="error small">{profileError}</p>}
      </section>

      <section className="card">
        <h2 className="label">Dither</h2>
        <div className="segmented">
          {([0, 16, 24] as const).map((b) => (
            <button key={b} className={s.ditherBits === b ? 'on' : ''} onClick={() => s.set({ ditherBits: b })} disabled={!secure && b > 0}>
              {b ? `${b}-bit TPDF` : 'Off'}
            </button>
          ))}
        </div>
        <p className="muted small">
          {secure
            ? 'Adds triangular noise before rounding to the chosen bit depth — useful for 16-bit DACs and dongles.'
            : 'Needs HTTPS (see the deploy guide).'}
        </p>
        <Row label="Dithered artwork" hint="Pastel pixel-dither on cover art">
          <Switch on={s.ditherArt} onChange={(v) => s.set({ ditherArt: v })} label="Dithered artwork" />
        </Row>
      </section>

      <section className="card">
        <h2 className="label">Gestures</h2>
        <p className="muted small">Tap the artwork on the player like you'd pinch an earbud.</p>
        {(
          [
            ['tap', 'Tap'],
            ['doubleTap', 'Double tap'],
            ['tripleTap', 'Triple tap'],
            ['hold', 'Tap & hold'],
          ] as [keyof SettingsState['gestures'], string][]
        ).map(([key, name]) => (
          <Row key={key} label={name}>
            <select
              value={s.gestures[key]}
              onChange={(e) => s.set({ gestures: { ...s.gestures, [key]: e.target.value as GestureAction } })}
              className="select"
            >
              {GESTURE_ACTIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Row>
        ))}
        <p className="muted small mono">keys: space play · ←/→ seek · shift+←/→ track · L like</p>
      </section>

      <section className="card">
        <h2 className="label">Appearance</h2>
        <div className="segmented">
          {(['system', 'dark', 'light'] as const).map((t) => (
            <button key={t} className={s.theme === t ? 'on' : ''} onClick={() => s.set({ theme: t })}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="label">Homelab</h2>
        {creds ? (
          <Row label={creds.user} hint={creds.server || window.location.origin}>
            <button className="pill" onClick={disconnectHomelab}>
              Disconnect
            </button>
          </Row>
        ) : (
          <Row label="Not connected" hint="Optional — stream your Navidrome library in lossless">
            <button className="pill pill-solid" onClick={openConnect}>
              Connect
            </button>
          </Row>
        )}
      </section>

      <p className="muted small mono center">x22 v{__APP_VERSION__}</p>
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="toggle">
      <div>
        <div>{label}</div>
        {hint && <div className="muted small">{hint}</div>}
      </div>
      {children}
    </div>
  )
}
