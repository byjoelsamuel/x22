import { useSettings } from '../state/settings'
import ConnectHomelab from './ConnectHomelab'

/**
 * First run. Every step is optional; finishing (or skipping) lands on Home.
 * Later steps (e.g. "control your music apps" in the APK) slot in before the homelab one.
 */
export default function Onboarding() {
  const done = () => useSettings.getState().set({ onboarded: true })
  return <ConnectHomelab onDone={done} onSkip={done} skipLabel="Skip — use x22 without a homelab" />
}
