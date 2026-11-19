import { getEngine } from './engine'
import { api } from '../state/auth'

export type CheckStatus = 'pass' | 'warn' | 'fail'

export interface Check {
  name: string
  status: CheckStatus
  detail: string
  hint?: string
}

/** HTTPS page + HTTP server = audio streams get blocked. */
export function mixedContentCheck(pageProtocol: string, server: string): Check {
  const serverProto = server.startsWith('https:') ? 'https:' : server.startsWith('http:') ? 'http:' : pageProtocol
  if (pageProtocol === 'https:' && serverProto === 'http:') {
    return {
      name: 'Connection',
      status: 'fail',
      detail: `x22 runs on HTTPS, server is HTTP (${server})`,
      hint: 'Audio is blocked in this combination. Update x22, or use the HTTPS address from deploy/.',
    }
  }
  return { name: 'Connection', status: 'pass', detail: `${pageProtocol.replace(':', '')} → ${serverProto.replace(':', '')}` }
}

export function formatReport(checks: Check[], meta: Record<string, string>): string {
  const icon = { pass: '✓', warn: '!', fail: '✗' }
  const lines = Object.entries(meta).map(([k, v]) => `${k}: ${v}`)
  for (const c of checks) lines.push(`${icon[c.status]} ${c.name}: ${c.detail}${c.hint ? ` — ${c.hint}` : ''}`)
  return lines.join('\n')
}

function timeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms))])
}

/** Run every check in order, reporting each as it finishes. */
export async function runPlaybackCheck(onCheck: (c: Check) => void): Promise<void> {
  const server = api().creds.server || location.origin
  onCheck(mixedContentCheck(location.protocol, server))
  onCheck({
    name: 'Secure context',
    status: window.isSecureContext ? 'pass' : 'warn',
    detail: window.isSecureContext ? 'yes (EQ dither available)' : 'no',
    hint: window.isSecureContext ? undefined : 'Dither needs HTTPS or the app.',
  })

  try {
    await timeout(api().ping(), 6000, 'Ping')
    onCheck({ name: 'Navidrome', status: 'pass', detail: 'reachable, login OK' })
  } catch (e) {
    onCheck({ name: 'Navidrome', status: 'fail', detail: (e as Error).message, hint: 'Check the server address and Wi-Fi.' })
    return
  }

  const probe = new Audio()
  const formats = (
    [
      ['FLAC', 'audio/flac'],
      ['ALAC/AAC', 'audio/mp4'],
      ['MP3', 'audio/mpeg'],
      ['Opus', 'audio/ogg; codecs=opus'],
    ] as const
  ).map(([n, t]) => `${n} ${probe.canPlayType(t) ? '✓' : '✗'}`)
  onCheck({ name: 'Formats', status: probe.canPlayType('audio/flac') ? 'pass' : 'warn', detail: formats.join(' · ') })

  const ctx = getEngine().ctx
  onCheck({
    name: 'Audio engine',
    status: typeof AudioContext === 'undefined' ? 'warn' : 'pass',
    detail: ctx ? `${ctx.state}, ${ctx.sampleRate / 1000} kHz` : typeof AudioContext === 'undefined' ? 'no Web Audio (EQ off)' : 'ready',
  })

  let url = ''
  try {
    const [song] = await timeout(api().randomSongs(1), 6000, 'Song lookup')
    if (!song) throw new Error('Library is empty')
    url = api().streamUrl(song.id)
    const res = await timeout(fetch(url, { headers: { Range: 'bytes=0-1023' } }), 8000, 'Stream request')
    void res.body?.cancel()
    onCheck({
      name: 'Stream',
      status: res.ok ? 'pass' : 'fail',
      detail: `HTTP ${res.status} · ${res.headers.get('content-type') ?? 'no type'} · “${song.title}”`,
      hint: res.ok ? undefined : 'Navidrome refused the stream.',
    })
  } catch (e) {
    onCheck({
      name: 'Stream',
      status: 'fail',
      detail: (e as Error).message,
      hint: 'Blocked before any data arrived (CORS or mixed content).',
    })
    return
  }

  const started = await new Promise<string | null>((resolve) => {
    const a = new Audio()
    a.muted = true
    a.src = url
    const done = (r: string | null) => {
      clearTimeout(t)
      a.pause()
      a.removeAttribute('src')
      a.load()
      resolve(r)
    }
    const t = setTimeout(() => done('no audio after 10 s'), 10_000)
    a.ontimeupdate = () => a.currentTime > 0.2 && done(null)
    a.onerror = () => done(`media error ${a.error?.code ?? '?'}`)
    a.play().catch((e: Error) => done(e.message))
  })
  onCheck({
    name: 'Test play',
    status: started ? 'fail' : 'pass',
    detail: started ?? 'audio started (muted test)',
    hint: started ? 'The stream loads but will not play here.' : undefined,
  })
}
