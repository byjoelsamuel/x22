/**
 * Turns the EQ graph's spectrum into a handful of bar levels (0–1), in x22's style:
 * log-spaced buckets like the EQ, smoothed so the bars fall rather than flicker.
 */

export const BAR_COUNT = 7
const LO = 40
const HI = 16000

/** Bucket edges, in bin indices, for `bars` buckets between LO and HI Hz. */
export function bucketEdges(bins: number, sampleRate: number, count = BAR_COUNT): number[] {
  const nyquist = sampleRate / 2
  const edges: number[] = []
  for (let i = 0; i <= count; i++) {
    const hz = LO * Math.pow(HI / LO, i / count)
    edges.push(Math.min(bins - 1, Math.max(0, Math.round((hz / nyquist) * bins))))
  }
  // Guarantee every bucket is at least one bin wide, even at low sample rates.
  for (let i = 1; i < edges.length; i++) if (edges[i] <= edges[i - 1]) edges[i] = edges[i - 1] + 1
  return edges
}

/**
 * Byte frequency data (0–255, as getByteFrequencyData gives) → levels 0–1.
 * Quiet noise floors are ignored so silence shows flat bars, not a shimmer.
 */
export function bars(freq: Uint8Array | number[], sampleRate = 48000, count = BAR_COUNT): number[] {
  const bins = freq.length
  if (!bins) return new Array(count).fill(0)
  const edges = bucketEdges(bins, sampleRate, count)
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    const from = edges[i]
    const to = Math.min(bins, Math.max(edges[i + 1], from + 1))
    let sum = 0
    for (let b = from; b < to; b++) sum += freq[b]
    const avg = sum / (to - from) / 255
    // Treble is quieter in most music: lift the upper bars so they stay visible.
    const tilt = 1 + (i / Math.max(1, count - 1)) * 0.8
    out.push(Math.max(0, Math.min(1, (avg - 0.06) * 1.6 * tilt)))
  }
  return out
}

/** Bars fall slowly and rise instantly, like a real meter. */
export function smooth(prev: number[], next: number[], fall = 0.22): number[] {
  return next.map((v, i) => {
    const was = prev[i] ?? 0
    return v >= was ? v : was - Math.max(fall, (was - v) * fall)
  })
}

export class Spectrum {
  private analyser: AnalyserNode | null = null
  private data: Uint8Array = new Uint8Array(0)
  private levels: number[] = new Array(BAR_COUNT).fill(0)

  /** Tap the graph. Safe to call again; the old tap is dropped. */
  attach(ctx: AudioContext, source: AudioNode): void {
    this.detach()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.7
    source.connect(analyser) // a branch: the analyser has no output, so audio is untouched
    this.analyser = analyser
    this.data = new Uint8Array(analyser.frequencyBinCount)
  }

  /**
   * Re-join the graph after it was rewired. Rewiring calls disconnect() on the tail nodes,
   * which silently drops this branch too, leaving the bars flat.
   */
  reconnect(source: AudioNode): void {
    if (this.analyser) source.connect(this.analyser)
  }

  detach(): void {
    this.analyser?.disconnect()
    this.analyser = null
  }

  get active(): boolean {
    return this.analyser !== null
  }

  /** Current bar levels (0–1), smoothed. Flat when nothing is attached. */
  read(): number[] {
    if (!this.analyser) return this.levels.map(() => 0)
    this.analyser.getByteFrequencyData(this.data as Uint8Array<ArrayBuffer>)
    this.levels = smooth(this.levels, bars(this.data, this.analyser.context.sampleRate))
    return this.levels
  }
}
