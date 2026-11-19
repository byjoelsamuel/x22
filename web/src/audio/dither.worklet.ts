// TPDF dither + requantisation to a chosen bit depth, run on the audio thread.
// Bits = 0 passes audio through untouched.

declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor()
}
declare function registerProcessor(name: string, ctor: typeof AudioWorkletProcessor): void

class DitherProcessor extends AudioWorkletProcessor {
  private bits = 0

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<{ bits: number }>) => {
      this.bits = e.data.bits
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]
    const output = outputs[0]
    const q = this.bits > 0 ? Math.pow(2, this.bits - 1) : 0
    for (let ch = 0; ch < output.length; ch++) {
      const src = input[ch]
      const dst = output[ch]
      if (!src) {
        dst.fill(0)
        continue
      }
      if (!q) {
        dst.set(src)
        continue
      }
      for (let i = 0; i < src.length; i++) {
        // Triangular PDF noise of ±1 LSB, then round to the target grid.
        const tpdf = (Math.random() - Math.random()) / q
        dst[i] = Math.round((src[i] + tpdf) * q) / q
      }
    }
    return true
  }
}

registerProcessor('x22-dither', DitherProcessor)
