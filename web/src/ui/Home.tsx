import { useState } from 'react'
import { PRESETS } from '../audio/eq'
import { api, useAuth } from '../state/auth'
import { openExternalApp, useExternal } from '../native/external'
import { usePlayer } from '../state/player'
import { useNowPlaying } from '../state/source'
import { useUi } from '../state/ui'
import { activeFilters, currentMode, effectivePreamp, SOUND_MODES, useSettings } from '../state/settings'
import DitherImage from './DitherImage'
import EqCurve from './EqCurve'
import { fmtDb } from './format'
import SourceChip from './SourceChip'

export default function Home({ onOpenPlayer }: { onOpenPlayer?: () => void }) {
  const s = useSettings()
  const np = useNowPlaying(300)
  const canControlApps = useExternal((e) => e.available && e.granted)
  const [busy, setBusy] = useState(false)
  const connected = useAuth((a) => !!a.creds)
  const openConnect = useUi((u) => u.openConnect)
  const filters = activeFilters(s)
  const mode = currentMode(s)
  // For other apps the source chip already names the app.
  const badge = np?.isX22 ? np.badge : null
  const presets = [...PRESETS, ...s.customPresets]

  async function shuffleAll() {
    setBusy(true)
    try {
      usePlayer.getState().playQueue(await api().randomSongs(80))
    } finally {
      setBusy(false)
    }
  }

  function setMode(id: string) {
    const m = SOUND_MODES.find((x) => x.id === id)!
    if (m.id === 'normal') s.set({ eqEnabled: true, profile: null, gains: [...PRESETS[0].gains], presetId: 'flat' })
    else {
      s.setProfile(null)
      s.applyPreset(m.preset)
    }
  }

  return (
    <div className="page home">
      <header className="home-head">
        <span className="dot brand">x22</span>
        <span className="home-head-right">
          <SourceChip />
          {badge && <span className={`badge badge-${badge.tier}`}>{badge.label}</span>}
        </span>
      </header>

      <section className="card hero" onClick={np ? onOpenPlayer : undefined}>
        <DitherImage src={np?.cover} className="hero-art" alt={np?.album} />
        <div className="hero-meta">
          {np ? (
            <>
              <span className="label">{np.playing ? 'Now playing' : 'Paused'}</span>
              <strong className="hero-title">{np.title}</strong>
              <span className="muted">{np.artist}</span>
            </>
          ) : (
            <>
              <span className="label">Nothing playing</span>
              <div className="hero-actions">
                {canControlApps && (
                  <button
                    className="pill pill-solid"
                    onClick={(e) => {
                      e.stopPropagation()
                      void openExternalApp()
                    }}
                  >
                    Open YouTube Music
                  </button>
                )}
                {connected ? (
                  <button
                    className={canControlApps ? 'pill' : 'pill pill-solid'}
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation()
                      void shuffleAll()
                    }}
                  >
                    {busy ? 'Loading…' : 'Shuffle homelab'}
                  </button>
                ) : (
                  <button
                    className="pill"
                    onClick={(e) => {
                      e.stopPropagation()
                      openConnect()
                    }}
                  >
                    Connect homelab
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="label">Sound mode</h2>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Sound mode">
          {SOUND_MODES.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={mode === m.id && !s.profile}
              className={mode === m.id && !s.profile ? 'on' : ''}
              onClick={() => setMode(m.id)}
            >
              {m.name}
            </button>
          ))}
        </div>
        <div className="toggles">
          <Toggle label="Crossfeed" hint="IEM-friendly stereo" on={s.crossfeed > 0} onChange={(v) => s.set({ crossfeed: v ? 0.6 : 0 })} />
          <Toggle label="Mono" hint="One bud? Hear both channels" on={s.mono} onChange={(v) => s.set({ mono: v })} />
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="label">Equaliser</h2>
          <Switch on={s.eqEnabled} onChange={(v) => s.set({ eqEnabled: v })} label="Equaliser" />
        </div>
        {s.profile ? (
          <p className="profile-note">
            <span className="badge badge-lossless">PROFILE</span> {s.profile.name}
            <button className="link" onClick={() => s.setProfile(null)}>
              Use graphic EQ
            </button>
          </p>
        ) : null}
        <div className={s.eqEnabled ? '' : 'disabled'}>
          <EqCurve
            filters={s.eqEnabled ? filters : []}
            gains={s.gains}
            editable={s.eqEnabled && !s.profile}
            onChange={(band, db) => s.setGain(band, db)}
          />
        </div>
        <div className="chips" role="listbox" aria-label="Presets">
          {presets.map((p) => (
            <button
              key={p.id}
              role="option"
              aria-selected={s.presetId === p.id && !s.profile}
              className={`chip ${s.presetId === p.id && !s.profile ? 'on' : ''}`}
              onClick={() => {
                s.setProfile(null)
                s.applyPreset(p.id)
              }}
            >
              {p.name}
            </button>
          ))}
          {!s.profile && s.presetId === null && (
            <button
              className="chip chip-add"
              onClick={() => {
                const name = prompt('Name this preset')
                if (name?.trim()) s.saveCustom(name.trim())
              }}
            >
              + Save
            </button>
          )}
        </div>
        {np && !np.isX22 && !s.eqOtherApps && canControlApps && (
          <p className="muted small eq-hint">
            This EQ shapes x22's own playback. To try it on {np.badge?.label.toLowerCase() ?? 'other apps'}, turn on{' '}
            <strong>EQ on other apps</strong> in Settings.
          </p>
        )}
        <div className="row muted mono small">
          <span>Preamp {fmtDb(s.eqEnabled ? effectivePreamp(s) : 0)}</span>
          <label className="inline">
            <input type="checkbox" checked={s.autoPreamp} onChange={(e) => s.set({ autoPreamp: e.target.checked })} /> auto
          </label>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="label">Fine tune</h2>
        </div>
        <Slider
          label="Balance"
          min={-1}
          max={1}
          step={0.05}
          value={s.balance}
          display={s.balance === 0 ? 'C' : `${s.balance < 0 ? 'L' : 'R'} ${Math.round(Math.abs(s.balance) * 100)}`}
          onChange={(v) => s.set({ balance: Math.abs(v) < 0.03 ? 0 : v })}
        />
        <Slider
          label="Crossfeed"
          min={0}
          max={1}
          step={0.05}
          value={s.crossfeed}
          display={s.crossfeed ? `${Math.round(s.crossfeed * 100)}%` : 'Off'}
          onChange={(v) => s.set({ crossfeed: v })}
        />
        {!s.autoPreamp && !s.profile && (
          <Slider
            label="Preamp"
            min={-15}
            max={0}
            step={0.5}
            value={s.preampDb}
            display={fmtDb(s.preampDb)}
            onChange={(v) => s.set({ preampDb: v })}
          />
        )}
      </section>
    </div>
  )
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  )
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="toggle">
      <div>
        <div>{label}</div>
        <div className="muted small">{hint}</div>
      </div>
      <Switch on={on} onChange={onChange} label={label} />
    </div>
  )
}

export function Slider(props: {
  label: string
  min: number
  max: number
  step: number
  value: number
  display: string
  onChange: (v: number) => void
}) {
  return (
    <label className="slider">
      <span className="slider-top">
        <span>{props.label}</span>
        <span className="mono muted">{props.display}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(parseFloat(e.target.value))}
      />
    </label>
  )
}
