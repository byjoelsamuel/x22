import { useState } from 'react'
import { formatReport, runPlaybackCheck, type Check } from '../audio/diagnostics'

/** Settings → Playback check: step-by-step diagnosis you can screenshot or copy. */
export default function PlaybackCheck() {
  const [checks, setChecks] = useState<Check[]>([])
  const [running, setRunning] = useState(false)
  const [copied, setCopied] = useState(false)

  async function run() {
    setChecks([])
    setCopied(false)
    setRunning(true)
    try {
      await runPlaybackCheck((c) => setChecks((cs) => [...cs, c]))
    } finally {
      setRunning(false)
    }
  }

  async function copy() {
    const text = formatReport(checks, {
      x22: __APP_VERSION__,
      page: location.origin,
      agent: navigator.userAgent,
    })
    await navigator.clipboard?.writeText(text).catch(() => {})
    setCopied(true)
  }

  return (
    <section className="card">
      <h2 className="label">Playback check</h2>
      <p className="muted small">Songs not playing? This tests each step between x22 and your homelab.</p>
      {checks.length > 0 && (
        <ul className="checks">
          {checks.map((c, i) => (
            <li key={i} className={`check check-${c.status}`}>
              <span className="check-icon" aria-hidden>
                {c.status === 'pass' ? '✓' : c.status === 'warn' ? '!' : '✗'}
              </span>
              <span>
                <strong>{c.name}</strong> <span className="muted small">{c.detail}</span>
                {c.hint && <span className="small check-hint">{c.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="row-start">
        <button className="pill pill-solid" disabled={running} onClick={() => void run()}>
          {running ? 'Checking…' : checks.length ? 'Run again' : 'Run check'}
        </button>
        {checks.length > 0 && !running && (
          <button className="pill" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy report'}
          </button>
        )}
      </div>
    </section>
  )
}
