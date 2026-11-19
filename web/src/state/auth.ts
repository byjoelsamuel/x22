import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Subsonic, type Credentials } from '../api/subsonic'

interface AuthState {
  creds: Credentials | null
  setCreds: (c: Credentials | null) => void
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      creds: null,
      setCreds: (creds) => set({ creds }),
    }),
    { name: 'x22.auth' },
  ),
)

let cached: { creds: Credentials; api: Subsonic } | null = null

/** Current API client (throws if logged out). */
export function api(): Subsonic {
  const creds = useAuth.getState().creds
  if (!creds) throw new Error('Not logged in')
  if (!cached || cached.creds !== creds) cached = { creds, api: new Subsonic(creds) }
  return cached.api
}

export function useApi(): Subsonic | null {
  const creds = useAuth((s) => s.creds)
  return creds ? api() : null
}
