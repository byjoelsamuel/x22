import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { formatReport, mixedContentCheck } from './diagnostics'
import { explainStall, StallWatchdog } from './watchdog'

vi.mock('./engine', () => ({ getEngine: () => ({ ctx: null }) }))
vi.mock('../state/auth', () => ({ api: () => ({}) }))

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('watchdog fires only if playback never starts', () => {
  const w = new StallWatchdog(12_000)
  const stall = vi.fn()
  w.arm(stall)
  vi.advanceTimersByTime(11_000)
  expect(stall).not.toHaveBeenCalled()
  vi.advanceTimersByTime(2_000)
  expect(stall).toHaveBeenCalledOnce()

  const ok = vi.fn()
  w.arm(ok)
  vi.advanceTimersByTime(3_000)
  w.started()
  vi.advanceTimersByTime(20_000)
  expect(ok).not.toHaveBeenCalled()
})

test('re-arming for the next track cancels the old timer', () => {
  const w = new StallWatchdog(1_000)
  const first = vi.fn()
  const second = vi.fn()
  w.arm(first)
  w.arm(second)
  vi.advanceTimersByTime(1_500)
  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledOnce()
})

test('the HTTPS-page / HTTP-server stall gets a specific explanation', () => {
  expect(explainStall('https:', 'http://192.168.0.100:4533/rest/stream')).toMatch(/plain HTTP/)
  expect(explainStall('http:', 'http://192.168.0.100:4533/rest/stream')).toMatch(/Playback check/)
  expect(mixedContentCheck('https:', 'http://192.168.0.100:4533').status).toBe('fail')
  expect(mixedContentCheck('http:', 'http://192.168.0.100:4533').status).toBe('pass')
  expect(mixedContentCheck('http:', 'https://music.lan').status).toBe('pass')
})

test('report is plain text you can paste', () => {
  const text = formatReport(
    [
      { name: 'Navidrome', status: 'pass', detail: 'reachable' },
      { name: 'Test play', status: 'fail', detail: 'no audio after 10 s', hint: 'The stream loads but will not play here.' },
    ],
    { x22: '1.3.0' },
  )
  expect(text).toBe('x22: 1.3.0\n✓ Navidrome: reachable\n✗ Test play: no audio after 10 s — The stream loads but will not play here.')
})
