import { useEffect, useState } from 'react'
import { useAuth } from './state/auth'
import { bindBackButton, useBack } from './state/back'
import { bindPlayer, usePlayer } from './state/player'
import { useSettings } from './state/settings'
import { useUi } from './state/ui'
import './ui/app.css'
import ConnectHomelab from './ui/ConnectHomelab'
import DynamicAccent from './ui/DynamicAccent'
import Home from './ui/Home'
import Import from './ui/Import'
import Library from './ui/Library'
import MiniPlayer from './ui/MiniPlayer'
import Nav, { type TabId } from './ui/Nav'
import NowPlaying from './ui/NowPlaying'
import Onboarding from './ui/Onboarding'
import Settings from './ui/Settings'

export default function App() {
  const connected = useAuth((s) => !!s.creds)
  const theme = useSettings((s) => s.theme)
  const onboarded = useSettings((s) => s.onboarded)
  const connectOpen = useUi((s) => s.connectOpen)
  const closeConnect = useUi((s) => s.closeConnect)
  const [tab, setTab] = useState<TabId>('home')
  const [playerOpen, setPlayerOpen] = useState(false)
  const [libraryVersion, setLibraryVersion] = useState(0)

  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    bindPlayer()
    bindBackButton()
  }, [])

  // Android back: sheet → Now Playing → inner screens → Home tab → background (never exit).
  useBack(tab !== 'home', () => setTab('home'))
  useBack(playerOpen, () => setPlayerOpen(false))
  useBack(connectOpen, closeConnect)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return
      const p = usePlayer.getState()
      if (e.code === 'Space' && !t.closest('button, [role=slider]')) p.toggle()
      else if (e.key === 'ArrowRight' && e.shiftKey) p.next()
      else if (e.key === 'ArrowLeft' && e.shiftKey) p.prev()
      else if (e.key === 'ArrowRight' && !t.closest('[role=slider]')) p.seek(p.time + 10)
      else if (e.key === 'ArrowLeft' && !t.closest('[role=slider]')) p.seek(p.time - 10)
      else if (e.key.toLowerCase() === 'l') void p.toggleLike()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // First run (people who connected before this version count as onboarded).
  if (!onboarded && !connected) return <Onboarding />

  return (
    <div className="shell">
      <DynamicAccent />
      <div className="tab-view" key={tab}>
        {tab === 'home' && <Home onOpenPlayer={() => setPlayerOpen(true)} />}
        {tab === 'library' && <Library refreshKey={libraryVersion} />}
        {tab === 'import' && <Import onLibraryChanged={() => setLibraryVersion((v) => v + 1)} />}
        {tab === 'settings' && <Settings />}
      </div>
      {!playerOpen && <MiniPlayer onOpen={() => setPlayerOpen(true)} />}
      <Nav tab={tab} onTab={setTab} />
      {playerOpen && <NowPlaying onClose={() => setPlayerOpen(false)} />}
      {connectOpen && (
        <div className="sheet" role="dialog" aria-label="Connect homelab">
          <ConnectHomelab onDone={closeConnect} onSkip={closeConnect} skipLabel="Cancel" />
        </div>
      )}
    </div>
  )
}
