import { beforeEach, expect, test, vi } from 'vitest'
import { usePlayer } from '../state/player'
import { handleNativeAction } from './nowPlaying'

beforeEach(() => {
  usePlayer.setState({ playing: false })
})

function spyOn(name: 'toggle' | 'next' | 'prev') {
  const fn = vi.fn()
  usePlayer.setState({ [name]: fn })
  return fn
}

test('widget buttons map to player actions', () => {
  const next = spyOn('next')
  const prev = spyOn('prev')
  const toggle = spyOn('toggle')
  handleNativeAction('next')
  handleNativeAction('prev')
  handleNativeAction('toggle')
  expect(next).toHaveBeenCalledOnce()
  expect(prev).toHaveBeenCalledOnce()
  expect(toggle).toHaveBeenCalledOnce()
})

test('headset play/pause only toggles when the state differs', () => {
  const toggle = spyOn('toggle')
  handleNativeAction('pause') // already paused
  expect(toggle).not.toHaveBeenCalled()
  handleNativeAction('play')
  expect(toggle).toHaveBeenCalledOnce()
  usePlayer.setState({ playing: true })
  handleNativeAction('play') // already playing
  expect(toggle).toHaveBeenCalledOnce()
})
