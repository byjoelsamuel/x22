import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

// Stand-in for the Android plugin so we can see what x22 asks the other app to do.
const { control } = vi.hoisted(() => ({ control: vi.fn(async () => ({ ok: true })) }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
  registerPlugin: () => ({ control }),
}))
import { applyExternalState, positionNow, useExternal, type ExternalState } from '../native/external'
import { usePlayer } from './player'
import { pickSource, sourceActions, useNowPlaying, useSource, type PickInput } from './source'

const base: PickInput = { x22Playing: false, x22HasTrack: false, extPlaying: false, extActive: false, pinned: null, last: 'x22' }

describe('pickSource (auto-follow)', () => {
  test('follows whatever is playing', () => {
    expect(pickSource({ ...base, extActive: true, extPlaying: true })).toBe('external')
    expect(pickSource({ ...base, x22HasTrack: true, x22Playing: true })).toBe('x22')
  })
  test('x22 wins if both report playing (audio focus is about to pause the other)', () => {
    expect(pickSource({ ...base, x22Playing: true, x22HasTrack: true, extActive: true, extPlaying: true })).toBe('x22')
  })
  test('when nothing plays, stays on the last source that played', () => {
    const paused = { ...base, x22HasTrack: true, extActive: true }
    expect(pickSource({ ...paused, last: 'external' })).toBe('external')
    expect(pickSource({ ...paused, last: 'x22' })).toBe('x22')
  })
  test('falls back to whichever has something to show', () => {
    expect(pickSource({ ...base, last: 'x22', extActive: true })).toBe('external')
    expect(pickSource({ ...base, last: 'external', x22HasTrack: true })).toBe('x22')
    expect(pickSource(base)).toBe('x22')
  })
  test('a pin always wins', () => {
    expect(pickSource({ ...base, extPlaying: true, extActive: true, pinned: 'x22' })).toBe('x22')
    expect(pickSource({ ...base, x22Playing: true, x22HasTrack: true, pinned: 'external' })).toBe('external')
  })
})

describe('external state', () => {
  beforeEach(() => useExternal.setState({ available: true, granted: true, state: null, art: null }))

  test('positionNow extrapolates while playing and clamps to duration', () => {
    const s: ExternalState = { active: true, playing: true, position: 10_000, updatedAt: 1_000, speed: 1, duration: 12_000 }
    expect(positionNow(s, 2_000)).toBe(11)
    expect(positionNow(s, 99_000)).toBe(12)
    expect(positionNow({ ...s, playing: false }, 99_000)).toBe(10)
    expect(positionNow(null)).toBe(0)
  })

  test('artwork is kept between updates and dropped when the track changes', () => {
    applyExternalState({ active: true, title: 'A', artKey: 'a', art: 'data:a' })
    applyExternalState({ active: true, title: 'A', artKey: 'a', playing: true }) // no art field
    expect(useExternal.getState().art).toBe('data:a')
    applyExternalState({ active: true, title: 'B', artKey: 'b' }) // new track, art not sent yet
    expect(useExternal.getState().art).toBeNull()
    applyExternalState({ active: false })
    expect(useExternal.getState().art).toBeNull()
  })
})

describe('routing', () => {
  beforeEach(() => {
    useSource.setState({ pinned: null, last: 'x22' })
    usePlayer.setState({ queue: [], index: -1, playing: false })
  })

  test('controls go to the other app when it is the active source', () => {
    const next = vi.fn()
    usePlayer.setState({ next })
    useExternal.setState({ available: true, granted: true, state: { active: true, playing: true }, art: null })
    control.mockClear()
    sourceActions.next()
    sourceActions.seek(42.5)
    expect(next).not.toHaveBeenCalled()
    expect(control).toHaveBeenCalledWith({ action: 'next', position: undefined })
    expect(control).toHaveBeenCalledWith({ action: 'seek', position: 42500 })
  })

  test('controls go to x22 when it is playing', () => {
    const next = vi.fn()
    usePlayer.setState({ queue: [{ id: '1', title: 'Song' }], index: 0, playing: true, next })
    useExternal.setState({ state: { active: true, playing: false }, art: null })
    sourceActions.next()
    expect(next).toHaveBeenCalledOnce()
  })

  test('the view model shows the other app with its name as the badge', () => {
    useExternal.setState({
      state: { active: true, playing: true, title: 'Nightcall', artist: 'Kavinsky', app: 'YouTube Music', duration: 258_000, position: 0, updatedAt: Date.now() },
      art: 'data:x',
    })
    const { result } = renderHook(() => useNowPlaying())
    expect(result.current).toMatchObject({
      source: 'external',
      title: 'Nightcall',
      artist: 'Kavinsky',
      cover: 'data:x',
      isX22: false,
      duration: 258,
      badge: { label: 'YOUTUBE MUSIC', tier: 'lossy' },
    })
  })
})
