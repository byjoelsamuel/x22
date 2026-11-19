import { expect, test } from 'vitest'
import { fmtDb, fmtTime, qualityBadge } from './format'

test('hi-res FLAC badge', () => {
  expect(qualityBadge({ id: '1', title: 't', suffix: 'flac', bitDepth: 24, samplingRate: 96000 })).toEqual({
    label: 'FLAC 24/96',
    tier: 'hires',
  })
})

test('CD-quality FLAC defaults to 16/44.1', () => {
  expect(qualityBadge({ id: '1', title: 't', suffix: 'flac' })).toEqual({ label: 'FLAC 16/44.1', tier: 'lossless' })
})

test('ALAC in m4a is detected via bit depth', () => {
  expect(qualityBadge({ id: '1', title: 't', suffix: 'm4a', bitDepth: 16, samplingRate: 44100 }).label).toBe('ALAC 16/44.1')
  expect(qualityBadge({ id: '1', title: 't', suffix: 'm4a', bitRate: 256 }).label).toBe('M4A 256k')
})

test('a transcode cap overrides the source badge', () => {
  expect(qualityBadge({ id: '1', title: 't', suffix: 'flac' }, 192)).toEqual({ label: 'OPUS 192k', tier: 'lossy' })
})

test('time and dB formatting', () => {
  expect(fmtTime(0)).toBe('0:00')
  expect(fmtTime(605.9)).toBe('10:05')
  expect(fmtTime(NaN)).toBe('0:00')
  expect(fmtDb(-6)).toBe('−6.0 dB')
  expect(fmtDb(3.25)).toBe('+3.3 dB')
})
