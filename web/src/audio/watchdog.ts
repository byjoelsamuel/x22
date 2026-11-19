/**
 * Notices when a track never starts (e.g. the stream is blocked or the server never answers)
 * so the player can fall back or explain instead of spinning at 0:00 forever.
 */
export class StallWatchdog {
  private timer: ReturnType<typeof setTimeout> | null = null
  private token = 0

  private readonly ms: number

  constructor(ms = 12_000) {
    this.ms = ms
  }

  /** Arm for a new attempt. `onStall` runs only if `started()` isn't called in time. */
  arm(onStall: () => void): void {
    this.cancel()
    const t = ++this.token
    this.timer = setTimeout(() => {
      if (t === this.token) onStall()
    }, this.ms)
  }

  /** Playback really started (time moved or `playing` fired). */
  started(): void {
    this.cancel()
  }

  cancel(): void {
    this.token++
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}

/** A human message for a stream that won't play, with the likely cause. */
export function explainStall(pageProtocol: string, streamUrl: string): string {
  if (pageProtocol === 'https:' && streamUrl.startsWith('http:')) {
    return 'Your server is plain HTTP but x22 is running over HTTPS, so the stream is blocked. Use the HTTPS address (Caddy) or update x22.'
  }
  return "Couldn't start the stream. Open Settings → Playback check."
}
