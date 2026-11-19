import { renderHook } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { backDepth, handleBack, pushBack, useBack } from './back'

test('newest handler runs first, then the next', () => {
  const calls: string[] = []
  const offTab = pushBack(() => calls.push('tab → home'))
  const offPlayer = pushBack(() => calls.push('close player'))
  expect(handleBack()).toBe(true)
  offPlayer()
  expect(handleBack()).toBe(true)
  offTab()
  expect(calls).toEqual(['close player', 'tab → home'])
})

test('nothing to go back to → false (Android then backgrounds the app)', () => {
  expect(backDepth()).toBe(0)
  expect(handleBack()).toBe(false)
})

test('useBack registers only while active and always calls the latest callback', () => {
  const first = vi.fn()
  const second = vi.fn()
  const { rerender, unmount } = renderHook(({ active, fn }) => useBack(active, fn), {
    initialProps: { active: false, fn: first },
  })
  expect(backDepth()).toBe(0)
  rerender({ active: true, fn: first })
  expect(backDepth()).toBe(1)
  rerender({ active: true, fn: second })
  handleBack()
  expect(second).toHaveBeenCalledOnce()
  expect(first).not.toHaveBeenCalled()
  rerender({ active: false, fn: second })
  expect(backDepth()).toBe(0)
  unmount()
})
