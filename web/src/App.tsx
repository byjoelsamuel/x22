import { useEffect } from 'react'
import { useAuth } from './state/auth'
import { bindPlayer } from './state/player'
import { useSettings } from './state/settings'
import './ui/app.css'
import Home from './ui/Home'
import Login from './ui/Login'
import MiniPlayer from './ui/MiniPlayer'

export default function App() {
  const creds = useAuth((s) => s.creds)
  const theme = useSettings((s) => s.theme)

  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    if (creds) bindPlayer()
  }, [creds])

  if (!creds) return <Login />

  return (
    <div className="shell">
      <Home />
      <MiniPlayer onOpen={() => {}} />
    </div>
  )
}
