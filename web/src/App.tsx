import { useAuth } from './state/auth'
import Login from './ui/Login'

export default function App() {
  const creds = useAuth((s) => s.creds)
  const setCreds = useAuth((s) => s.setCreds)
  if (!creds) return <Login />

  return (
    <main style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 16 }}>
      <div style={{ textAlign: 'center' }}>
        <h1 className="dot" style={{ fontSize: 72, margin: 0 }}>x22</h1>
        <p className="mono" style={{ color: 'var(--muted)' }}>connected as {creds.user}</p>
        <button className="pill" onClick={() => setCreds(null)}>Log out</button>
      </div>
    </main>
  )
}
