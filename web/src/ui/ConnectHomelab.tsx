import { useState, type FormEvent } from 'react'
import { ApiError, login } from '../api/subsonic'
import { isNative } from '../native/platform'
import { useAuth } from '../state/auth'
import './connect.css'

interface Props {
  /** Called after a successful connection. */
  onDone?: () => void
  /** Shows a "Not now" button when given. */
  onSkip?: () => void
  skipLabel?: string
}

/** Optional: connect your homelab Navidrome for lossless streaming and the Library. */
export default function ConnectHomelab({ onDone, onSkip, skipLabel = 'Not now' }: Props) {
  const setCreds = useAuth((s) => s.setCreds)
  // Inside the APK there is no same-origin proxy, so the server URL must be given.
  const native = isNative()
  const [server, setServer] = useState(native ? 'https://' : '')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setCreds(await login(server, user, password))
      onDone?.()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not reach your homelab. Check the address and that you are on your home network.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <img src="/icons/icon-192.png" alt="" width={96} height={96} className="login-icon" />
      <h1 className="dot">x22</h1>
      <p className="mono login-sub">connect your homelab</p>
      <p className="muted small login-lead">
        Stream your own library in lossless from Navidrome. Optional — x22 works with your other music apps without it.
      </p>
      <form onSubmit={submit} className="login-form">
        <label>
          <span>Server</span>
          <input
            value={server}
            onChange={(e) => setServer(e.target.value)}
            placeholder={native ? 'https://192.168.0.100' : 'leave empty when opened from your homelab'}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            required={native}
          />
        </label>
        <label>
          <span>Username</span>
          <input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" autoCapitalize="off" required />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button type="submit" disabled={busy} className="pill pill-solid">
          {busy ? 'Connecting…' : 'Connect'}
        </button>
        {onSkip && (
          <button type="button" className="pill" onClick={onSkip}>
            {skipLabel}
          </button>
        )}
      </form>
      <p className="mono login-note">Your password stays on this device only as a salted token.</p>
    </main>
  )
}
