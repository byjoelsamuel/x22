import type { ReactNode } from 'react'
import { IconHome, IconLibrary, IconSettings, IconUpload } from './icons'

export type TabId = 'home' | 'library' | 'import' | 'settings'

const TABS: { id: TabId; name: string; icon: ReactNode }[] = [
  { id: 'home', name: 'Home', icon: <IconHome /> },
  { id: 'library', name: 'Library', icon: <IconLibrary /> },
  { id: 'import', name: 'Import', icon: <IconUpload /> },
  { id: 'settings', name: 'Settings', icon: <IconSettings /> },
]

export default function Nav({ tab, onTab }: { tab: TabId; onTab: (t: TabId) => void }) {
  return (
    <nav className="nav" aria-label="Main">
      {TABS.map((t) => (
        <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => onTab(t.id)}>
          {t.icon}
          <span>{t.name}</span>
        </button>
      ))}
    </nav>
  )
}
