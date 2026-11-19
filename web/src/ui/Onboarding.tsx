import { useState } from 'react'
import { openAccessSettings, useExternal } from '../native/external'
import { isNative } from '../native/platform'
import { useSettings } from '../state/settings'
import ConnectHomelab from './ConnectHomelab'
import './connect.css'

/**
 * First run. Every step is optional; finishing (or skipping) lands on Home.
 * APK: 1) control your music apps  2) connect your homelab.  Browser: homelab only.
 */
export default function Onboarding() {
  const [step, setStep] = useState<'apps' | 'homelab'>(isNative() ? 'apps' : 'homelab')
  const done = () => useSettings.getState().set({ onboarded: true })
  if (step === 'apps') return <ControlApps onNext={() => setStep('homelab')} />
  return <ConnectHomelab onDone={done} onSkip={done} skipLabel="Skip — use x22 without a homelab" />
}

function ControlApps({ onNext }: { onNext: () => void }) {
  const granted = useExternal((e) => e.granted)
  return (
    <main className="login">
      <img src="/icons/icon-192.png" alt="" width={96} height={96} className="login-icon" />
      <h1 className="dot">x22</h1>
      <p className="mono login-sub">control your music apps</p>
      <p className="muted small login-lead">
        Keep listening in YouTube Music (or any player) and see, skip and seek it from x22 and its widget. Android asks for
        <strong> Notification access</strong> for this — x22 only uses it to follow what's playing.
      </p>
      <div className="login-form">
        {granted ? (
          <p className="success center">Access granted ✓</p>
        ) : (
          <button className="pill pill-solid" onClick={() => void openAccessSettings()}>
            Grant access
          </button>
        )}
        <button className={granted ? 'pill pill-solid' : 'pill'} onClick={onNext}>
          {granted ? 'Continue' : 'Skip for now'}
        </button>
      </div>
    </main>
  )
}
