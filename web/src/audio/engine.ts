import ditherUrl from './dither.worklet.ts?worker&url'
import type { Filter } from './eq'
import { explainStall, StallWatchdog } from './watchdog'

/**
 * Audio graph:
 *
 *   <audio A> ┐
 *             ├─ input → preamp → biquad × N → crossfeed → [mono] → balance → dither → out
 *   <audio B> ┘
 *
 * Two media elements let the next track preload while the current one plays, so the
 * hand-off on `ended` is near-gapless (no network wait, only a few ms of scheduling).
 */

export interface DspSettings {
  filters: Filter[]
  preampDb: number
  crossfeed: number // 0 = off, 1 = strong
  balance: number // -1 … 1
  mono: boolean
  ditherBits: 0 | 16 | 24
  volume: number // 0 … 1
}

export interface EngineEvents {
  onTime?: (time: number, duration: number) => void
  onPlaying?: (playing: boolean) => void
  onEnded?: (advancedToNext: boolean) => void
  onError?: (message: string) => void
  onBuffering?: (buffering: boolean) => void
  /** Non-fatal note for the UI (e.g. "EQ off for this track"), or null to clear. */
  onNotice?: (message: string | null) => void
}

const dbToGain = (db: number) => Math.pow(10, db / 20)

export class AudioEngine {
  events: EngineEvents = {}
  readonly els: [HTMLAudioElement, HTMLAudioElement]
  private active = 0
  private nextUrl: string | null = null
  /** Plain <audio> outside Web Audio, used when a stream won't play through the EQ graph. */
  private readonly safe: HTMLAudioElement
  private safeActive = false
  private readonly watchdog = new StallWatchdog()

  ctx: AudioContext | null = null
  private input!: GainNode
  private preamp!: GainNode
  private filters: BiquadFilterNode[] = []
  private xfIn!: GainNode
  private xfOut!: ChannelMergerNode
  private xfCross: GainNode[] = []
  private xfDirect: GainNode[] = []
  private monoNode!: GainNode
  private balance!: StereoPannerNode
  private dither: AudioWorkletNode | null = null
  private volume!: GainNode
  private dsp: DspSettings = {
    filters: [],
    preampDb: 0,
    crossfeed: 0,
    balance: 0,
    mono: false,
    ditherBits: 0,
    volume: 1,
  }

  constructor() {
    this.els = [this.makeElement(true), this.makeElement(true)]
    this.safe = this.makeElement(false)
  }

  private makeElement(viaWebAudio: boolean): HTMLAudioElement {
    const el = new Audio()
    // Web Audio needs CORS-clean media when Navidrome is another origin (APK). The safe
    // element skips both, so it plays even when the server sends no CORS headers.
    if (viaWebAudio) el.crossOrigin = 'anonymous'
    el.preload = 'auto'
    const progressed = () => {
      if (el === this.current && el.currentTime > 0) this.watchdog.started()
    }
    el.addEventListener('timeupdate', () => {
      progressed()
      if (el === this.current) this.events.onTime?.(el.currentTime, el.duration || 0)
    })
    el.addEventListener('durationchange', () => {
      if (el === this.current) this.events.onTime?.(el.currentTime, el.duration || 0)
    })
    el.addEventListener('playing', () => {
      if (el === this.current) {
        this.watchdog.started()
        this.events.onBuffering?.(false)
        this.events.onPlaying?.(true)
      }
    })
    el.addEventListener('pause', () => {
      if (el === this.current) this.events.onPlaying?.(false)
    })
    el.addEventListener('waiting', () => {
      if (el === this.current) this.events.onBuffering?.(true)
    })
    el.addEventListener('ended', () => {
      if (el === this.current) this.handleEnded()
    })
    el.addEventListener('error', () => {
      if (el !== this.current || !el.src) return
      // Through the EQ graph first; if that element can't load the stream, try the safe one.
      if (viaWebAudio && !this.safeActive) return this.fallBackToSafe(el.src)
      this.watchdog.cancel()
      this.events.onError?.(mediaError(el.error, el.src))
    })
    return el
  }

  get current(): HTMLAudioElement {
    return this.safeActive ? this.safe : this.els[this.active]
  }
  private get standby(): HTMLAudioElement {
    return this.els[1 - this.active]
  }

  get sampleRate(): number | null {
    return this.ctx?.sampleRate ?? null
  }

  /** Create the AudioContext (must happen during a user gesture). */
  private async ensureContext(preferredRate?: number) {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume()
      return
    }
    let ctx: AudioContext
    try {
      ctx =
        preferredRate && preferredRate >= 8000 && preferredRate <= 384000
          ? new AudioContext({ sampleRate: preferredRate, latencyHint: 'playback' })
          : new AudioContext({ latencyHint: 'playback' })
    } catch {
      ctx = new AudioContext({ latencyHint: 'playback' }) // device refused that rate
    }
    this.ctx = ctx
    this.input = ctx.createGain()
    this.preamp = ctx.createGain()
    this.volume = ctx.createGain()
    for (const el of this.els) ctx.createMediaElementSource(el).connect(this.input)

    // Crossfeed: each ear also hears a delayed, low-passed copy of the other channel,
    // which softens the hard stereo separation of IEMs.
    this.xfIn = ctx.createGain()
    const split = ctx.createChannelSplitter(2)
    this.xfOut = ctx.createChannelMerger(2)
    this.xfIn.connect(split)
    for (let ch = 0; ch < 2; ch++) {
      const direct = ctx.createGain()
      split.connect(direct, ch)
      direct.connect(this.xfOut, 0, ch)
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 700
      lp.Q.value = 0.5
      const delay = ctx.createDelay(0.01)
      delay.delayTime.value = 0.0003
      const cross = ctx.createGain()
      split.connect(lp, ch)
      lp.connect(delay).connect(cross)
      cross.connect(this.xfOut, 0, 1 - ch)
      this.xfDirect.push(direct)
      this.xfCross.push(cross)
    }

    this.monoNode = ctx.createGain()
    this.monoNode.channelCount = 1
    this.monoNode.channelCountMode = 'explicit'
    this.monoNode.channelInterpretation = 'speakers'
    this.balance = ctx.createStereoPanner()

    // AudioWorklet needs a secure context (HTTPS / localhost). Fall back silently.
    try {
      await ctx.audioWorklet.addModule(ditherUrl)
      this.dither = new AudioWorkletNode(ctx, 'x22-dither', { outputChannelCount: [2] })
    } catch {
      this.dither = null
    }

    this.rewire()
    this.setDsp({}) // builds filter nodes for settings applied before the context existed
  }

  private rewire() {
    if (!this.ctx) return
    const chain: AudioNode[] = [this.input, this.preamp, ...this.filters, this.xfIn]
    for (const n of [this.input, this.preamp, ...this.filters]) n.disconnect()
    for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1])

    const tail: AudioNode[] = [this.xfOut]
    if (this.dsp.mono) tail.push(this.monoNode)
    tail.push(this.balance)
    if (this.dither) tail.push(this.dither)
    tail.push(this.volume, this.ctx.destination)
    for (const n of [this.xfOut, this.monoNode, this.balance, this.dither, this.volume]) n?.disconnect()
    for (let i = 0; i < tail.length - 1; i++) tail[i].connect(tail[i + 1])
  }

  /** Apply EQ / DSP settings. Cheap to call often; rebuilds filters only when the count changes. */
  setDsp(next: Partial<DspSettings>) {
    const prevMono = this.dsp.mono
    this.dsp = { ...this.dsp, ...next }
    if (!this.ctx) return
    let needsRewire = prevMono !== this.dsp.mono
    if (this.filters.length !== this.dsp.filters.length) {
      for (const f of this.filters) f.disconnect()
      this.filters = this.dsp.filters.map(() => this.ctx!.createBiquadFilter())
      needsRewire = true
    }
    if (needsRewire) this.rewire()
    this.applyDsp()
  }

  private applyDsp() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const ramp = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, 0.015)
    this.dsp.filters.forEach((f, i) => {
      const node = this.filters[i]
      node.type = f.type
      ramp(node.frequency, Math.min(f.freq, this.ctx!.sampleRate / 2 - 1))
      ramp(node.gain, f.gain)
      ramp(node.Q, f.q)
    })
    ramp(this.preamp.gain, dbToGain(this.dsp.preampDb))
    const x = Math.max(0, Math.min(1, this.dsp.crossfeed))
    const cross = x * 0.45 // up to about −7 dB of bleed
    for (const g of this.xfCross) ramp(g.gain, cross)
    for (const g of this.xfDirect) ramp(g.gain, 1 / (1 + cross)) // keep loudness steady
    ramp(this.balance.pan, Math.max(-1, Math.min(1, this.dsp.balance)))
    ramp(this.volume.gain, this.dsp.volume)
    this.dither?.port.postMessage({ bits: this.dsp.ditherBits })
  }

  /** Load and play a track. `sampleRate` is used once, to open the context at the source rate. */
  async play(url: string, opts: { sampleRate?: number; startAt?: number } = {}) {
    this.leaveSafe()
    this.events.onNotice?.(null)
    try {
      await this.ensureContext(opts.sampleRate)
    } catch {
      // No usable Web Audio on this device: play without the EQ.
      return this.fallBackToSafe(url, opts.startAt)
    }
    const el = this.current
    this.standby.pause()
    if (this.standby.src === url) {
      // Already preloaded — just swap.
      this.active = 1 - this.active
    } else if (el.src !== url) {
      el.src = url
    }
    const target = this.current
    if (opts.startAt) target.currentTime = opts.startAt
    this.events.onBuffering?.(true)
    this.watchdog.arm(() => this.fallBackToSafe(url, opts.startAt))
    try {
      await target.play()
    } catch (e) {
      const name = (e as DOMException).name
      if (name === 'AbortError') return
      if (name === 'NotSupportedError') return this.fallBackToSafe(url, opts.startAt)
      this.watchdog.cancel()
      this.events.onError?.(String((e as Error).message))
    }
  }

  /** Retry the track on the plain element (no EQ). If that stalls too, explain why. */
  private fallBackToSafe(url: string, startAt?: number) {
    if (this.safeActive) return
    for (const el of this.els) el.pause()
    this.safeActive = true
    const el = this.safe
    el.src = url
    if (startAt) el.currentTime = startAt
    this.events.onNotice?.('EQ off for this track')
    this.events.onBuffering?.(true)
    this.watchdog.arm(() => {
      this.events.onBuffering?.(false)
      this.events.onError?.(explainStall(location.protocol, url))
    })
    void el.play().catch((e: Error) => {
      if ((e as DOMException).name === 'AbortError') return
      this.watchdog.cancel()
      this.events.onError?.(mediaError(el.error, url))
    })
  }

  private leaveSafe() {
    if (!this.safeActive) return
    this.safeActive = false
    this.safe.pause()
    this.safe.removeAttribute('src')
    this.safe.load()
    this.watchdog.cancel()
  }

  async resume() {
    await this.ensureContext()
    await this.current.play().catch(() => {})
  }

  pause() {
    this.current.pause()
  }

  seek(t: number) {
    const el = this.current
    if (Number.isFinite(t)) el.currentTime = Math.max(0, Math.min(t, el.duration || t))
  }

  stop() {
    this.leaveSafe()
    this.watchdog.cancel()
    for (const el of this.els) {
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
  }

  /** Tell the engine what plays next so it can preload it. */
  setNext(url: string | null) {
    this.nextUrl = url
    const sb = this.standby
    if (url && sb.src !== url) {
      sb.src = url
      sb.load()
    }
  }

  private handleEnded() {
    this.leaveSafe()
    this.events.onNotice?.(null)
    const sb = this.standby
    if (this.nextUrl && sb.src === this.nextUrl) {
      this.active = 1 - this.active
      this.nextUrl = null
      void sb.play()
      this.events.onEnded?.(true)
    } else {
      this.events.onEnded?.(false)
    }
  }
}

function mediaError(err: MediaError | null, url = ''): string {
  if (typeof location !== 'undefined' && location.protocol === 'https:' && url.startsWith('http:')) {
    return explainStall(location.protocol, url)
  }
  switch (err?.code) {
    case MediaError.MEDIA_ERR_NETWORK:
      return 'Network error while streaming'
    case MediaError.MEDIA_ERR_DECODE:
      return 'This device could not decode the file'
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'Format not supported here — try a bitrate cap in Settings'
    default:
      return 'Playback failed'
  }
}

let engine: AudioEngine | null = null
export function getEngine(): AudioEngine {
  engine ??= new AudioEngine()
  return engine
}
