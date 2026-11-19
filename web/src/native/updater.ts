import { App as CapApp } from '@capacitor/app'
import { registerPlugin } from '@capacitor/core'
import { create } from 'zustand'
import { useSettings } from '../state/settings'
import { isNative } from './platform'

export const RELEASES_API = 'https://api.github.com/repos/byjoelsamuel/x22/releases/latest'
export const APK_NAME = 'x22-android.apk'

export interface Release {
  version: string // "1.3.0"
  notes: string
  url: string // APK download
  sha256: string | null
  size: number
  page: string
}

/** Pick out what x22 needs from GitHub's "latest release" JSON. */
export function parseRelease(json: unknown): Release | null {
  const r = json as {
    tag_name?: string
    body?: string
    html_url?: string
    draft?: boolean
    prerelease?: boolean
    assets?: { name: string; browser_download_url: string; size: number; digest?: string | null }[]
  }
  if (!r?.tag_name || r.draft || r.prerelease) return null
  const asset = r.assets?.find((a) => a.name === APK_NAME)
  if (!asset) return null
  const sha = asset.digest?.startsWith('sha256:') ? asset.digest.slice(7).toLowerCase() : null
  return {
    version: r.tag_name.replace(/^v/, ''),
    notes: (r.body ?? '').trim(),
    url: asset.browser_download_url,
    sha256: sha && /^[0-9a-f]{64}$/.test(sha) ? sha : null,
    size: asset.size,
    page: r.html_url ?? '',
  }
}

/** True when `latest` is a higher x.y.z than `current` (pre-release suffixes ignored). */
export function isNewer(latest: string, current: string): boolean {
  const parts = (v: string) => v.replace(/^v/, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0)
  const a = parts(latest)
  const b = parts(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return false
}

/** The version of the installed APK (from the signed build), or the web build's version. */
export async function installedVersion(): Promise<string> {
  if (isNative()) {
    try {
      return (await CapApp.getInfo()).version
    } catch {
      /* fall through */
    }
  }
  return __APP_VERSION__
}

/** Native side: web/android/app/src/main/java/dev/x22/player/UpdaterPlugin.java */
interface UpdaterPlugin {
  download(o: { url: string; sha256: string | null; size: number }): Promise<{ path: string }>
  install(): Promise<{ status: 'started' | 'needs-permission' }>
  addListener(event: 'progress', cb: (e: { fraction: number }) => void): Promise<{ remove: () => Promise<void> }>
}
const plugin = registerPlugin<UpdaterPlugin>('Updater')

type Phase = 'idle' | 'checking' | 'downloading' | 'installing' | 'permission' | 'error'

interface UpdateStore {
  current: string
  latest: Release | null
  phase: Phase
  progress: number
  message: string | null
  checkedAt: number | null
}

export const useUpdate = create<UpdateStore>()(() => ({
  current: __APP_VERSION__,
  latest: null,
  phase: 'idle',
  progress: 0,
  message: null,
  checkedAt: null,
}))

/** Ask GitHub for the newest release. Sets `latest` only when it's newer than this install. */
export async function checkForUpdate(fetchImpl: typeof fetch = fetch): Promise<Release | null> {
  useUpdate.setState({ phase: 'checking', message: null })
  try {
    const current = await installedVersion()
    const res = await fetchImpl(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })
    if (!res.ok) throw new Error(res.status === 403 ? 'GitHub is rate-limiting update checks — try later' : `GitHub said ${res.status}`)
    const release = parseRelease(await res.json())
    const latest = release && isNewer(release.version, current) ? release : null
    useUpdate.setState({ current, latest, phase: 'idle', checkedAt: Date.now() })
    useSettings.getState().set({ lastUpdateCheck: Date.now() })
    return latest
  } catch (e) {
    useUpdate.setState({ phase: 'error', message: (e as Error).message || 'Could not check for updates' })
    return null
  }
}

/** Download the APK (checksum-verified natively) and hand it to Android's installer. */
export async function installUpdate(): Promise<void> {
  const latest = useUpdate.getState().latest
  if (!latest || !isNative()) return
  const sub = await plugin.addListener('progress', ({ fraction }) => useUpdate.setState({ progress: fraction }))
  try {
    if (useUpdate.getState().phase !== 'permission') {
      useUpdate.setState({ phase: 'downloading', progress: 0, message: null })
      await plugin.download({ url: latest.url, sha256: latest.sha256, size: latest.size })
    }
    useUpdate.setState({ phase: 'installing' })
    const { status } = await plugin.install()
    if (status === 'needs-permission') {
      useUpdate.setState({
        phase: 'permission',
        message: 'Allow x22 to install apps in the screen that just opened, then tap Update again.',
      })
    } else {
      useUpdate.setState({ phase: 'idle', message: 'Follow Android’s prompt to finish updating.' })
    }
  } catch (e) {
    useUpdate.setState({ phase: 'error', message: (e as Error).message || 'Update failed' })
  } finally {
    void sub.remove()
  }
}

const DAY = 24 * 60 * 60 * 1000

/** Check once a day in the APK, if auto-check is on. */
export function bindUpdater() {
  if (!isNative()) return
  void installedVersion().then((current) => useUpdate.setState({ current }))
  const s = useSettings.getState()
  if (s.autoUpdateCheck && Date.now() - (s.lastUpdateCheck ?? 0) > DAY) void checkForUpdate()
}
