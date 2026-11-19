import { create } from 'zustand'
import { getEngine } from '../audio/engine'
import { useAuth } from './auth'
import { usePlayer } from './player'

interface UiState {
  /** "Connect your homelab" sheet. */
  connectOpen: boolean
  openConnect: () => void
  closeConnect: () => void
}

export const useUi = create<UiState>()((set) => ({
  connectOpen: false,
  openConnect: () => set({ connectOpen: true }),
  closeConnect: () => set({ connectOpen: false }),
}))

/** Forget the homelab: stop homelab playback and clear its queue. */
export function disconnectHomelab() {
  getEngine().stop()
  usePlayer.getState().setSleep(null)
  usePlayer.setState({ queue: [], index: -1, playing: false, time: 0, duration: 0, error: null })
  useAuth.getState().setCreds(null)
}
