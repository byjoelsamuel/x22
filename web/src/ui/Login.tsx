import { useState, type FormEvent } from 'react'
import { ApiError, login } from '../api/subsonic'
import { useAuth } from '../state/auth'
import './login.css'

/** Inside the APK there is no same-origin proxy, so the server URL must be given. */
const isNative = typeof window !== 'undefined' && 'Capacitor' in window

export default function Login() {
  const setCreds = useAuth((s) => s.setCreds)
  const [server, setServer] = useState(isNative ? 'https://' : '')
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
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not reach Navidrome. Check the server address and that you are on your home network.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <img src="/icons/icon-192.png" alt="" width={96} height={96} className="login-icon" />
      <h1 className="dot">x22</h1>
      <p className="mono login-sub">connect to navidrome</p>
      <form onSubmit={submit} className="login-form">
        <label>
          <span>Server</span>
          <input
            value={server}
            onChange={(e) => setServer(e.target.value)}
            placeholder="leave empty when opened from your homelab"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            required={isNative}
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
      </form>
      <p className="mono login-note">Your password stays on this device only as a salted token.</p>
    </main>
  )
}
