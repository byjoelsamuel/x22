import { beforeEach, expect, test, vi } from 'vitest'
import { AudioEngine } from './engine'

/**
 * Only one <audio> may ever be unpaused. Two were playing at once when you pressed Next
 * on a track that had already been preloaded.
 */

// Minimal stand-in for an <audio> element that tracks paused/src like the real thing.
function stub(el: HTMLAudioElement) {
  let paused = true
  Object.defineProperty(el, 'paused', { get: () => paused, configurable: true })
  el.play = vi.fn(async () => {
    paused = false
  })
  el.pause = vi.fn(() => {
    paused = true
  })
  el.load = vi.fn()
  return el
}

function makeEngine() {
  const engine = new AudioEngine()
  // Skip Web Audio entirely: these tests are about which element is playing.
  ;(engine as unknown as { ensureContext: () => Promise<void> }).ensureContext = async () => {}
  const all = [...engine.els, (engine as unknown as { safe: HTMLAudioElement }).safe]
  all.forEach(stub)
  return { engine, all, playing: () => all.filter((e) => !e.paused) }
}

const A = 'http://nd/stream?id=a'
const B = 'http://nd/stream?id=b'
const C = 'http://nd/stream?id=c'

let env: ReturnType<typeof makeEngine>
beforeEach(() => {
  env = makeEngine()
})

test('pressing Next on a preloaded track does not leave the old one playing', async () => {
  const { engine, playing } = env
  await engine.play(A)
  engine.setNext(B) // preloads B on the standby element
  expect(playing()).toHaveLength(1)

  await engine.play(B) // "Next"
  expect(playing()).toHaveLength(1)
  expect(playing()[0].src).toBe(B)
})

test('hammering Next leaves exactly one song playing', async () => {
  const { engine, playing } = env
  await engine.play(A)
  for (const url of [B, C, A, B]) {
    engine.setNext(url)
    await engine.play(url)
  }
  expect(playing()).toHaveLength(1)
  expect(playing()[0].src).toBe(B)
})

test('a slow play() that gets superseded stops itself', async () => {
  const { engine, playing } = env
  let release: () => void = () => {}
  const slow = new Promise<void>((r) => (release = r))
  const first = engine.els[0]
  let paused = true
  first.play = vi.fn(async () => {
    await slow
    paused = false
  })
  Object.defineProperty(first, 'paused', { get: () => paused, configurable: true })
  first.pause = vi.fn(() => {
    paused = true
  })

  const slowPlay = engine.play(A)
  engine.setNext(B)
  await engine.play(B) // user moves on before A ever started
  release()
  await slowPlay
  expect(playing()).toHaveLength(1)
  expect(playing()[0].src).toBe(B)
})

test('the gapless hand-off at the end of a track swaps cleanly', async () => {
  const { engine, els, playing } = { ...env, els: env.engine.els }
  await engine.play(A)
  engine.setNext(B)
  els[0].dispatchEvent(new Event('ended'))
  expect(playing()).toHaveLength(1)
  expect(playing()[0].src).toBe(B)
})

test('falling back to plain playback stops the EQ elements', async () => {
  const { engine, playing } = env
  await engine.play(A)
  ;(engine as unknown as { fallBackToSafe: (u: string) => void }).fallBackToSafe(A)
  expect(playing()).toHaveLength(1)
  expect(playing()[0]).toBe((engine as unknown as { safe: HTMLAudioElement }).safe)
})
