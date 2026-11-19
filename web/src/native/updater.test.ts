import { expect, test, vi } from 'vitest'
import { checkForUpdate, isNewer, parseRelease, RELEASES_API, useUpdate } from './updater'

const release = {
  tag_name: 'v1.3.0',
  body: '## What\'s new\n\n- Fixes playback',
  html_url: 'https://github.com/byjoelsamuel/x22/releases/tag/v1.3.0',
  draft: false,
  prerelease: false,
  assets: [
    { name: 'something-else.zip', browser_download_url: 'https://x/zip', size: 1 },
    {
      name: 'x22-android.apk',
      browser_download_url: 'https://github.com/byjoelsamuel/x22/releases/download/v1.3.0/x22-android.apk',
      size: 3_600_000,
      digest: 'sha256:A1E0E329E945D14ED013DF9EE8F4917FD9FA246AE5810F4E3DB3F0BFE8FC9453',
    },
  ],
}

test('versions compare numerically', () => {
  expect(isNewer('1.3.0', '1.2.0')).toBe(true)
  expect(isNewer('v1.10.0', '1.9.9')).toBe(true)
  expect(isNewer('1.2.0', '1.2.0')).toBe(false)
  expect(isNewer('1.2.0', '1.3.0')).toBe(false)
  expect(isNewer('2.0', '1.9.9')).toBe(true)
  expect(isNewer('1.3.0-beta.1', '1.3.0')).toBe(false)
})

test('picks the APK asset and its checksum', () => {
  expect(parseRelease(release)).toEqual({
    version: '1.3.0',
    notes: "## What's new\n\n- Fixes playback",
    url: 'https://github.com/byjoelsamuel/x22/releases/download/v1.3.0/x22-android.apk',
    sha256: 'a1e0e329e945d14ed013df9ee8f4917fd9fa246ae5810f4e3db3f0bfe8fc9453',
    size: 3_600_000,
    page: 'https://github.com/byjoelsamuel/x22/releases/tag/v1.3.0',
  })
})

test('ignores drafts, pre-releases and releases without the APK', () => {
  expect(parseRelease({ ...release, draft: true })).toBeNull()
  expect(parseRelease({ ...release, prerelease: true })).toBeNull()
  expect(parseRelease({ ...release, assets: [] })).toBeNull()
  expect(parseRelease(null)).toBeNull()
})

test('check offers only newer releases', async () => {
  const fetchImpl = vi.fn(async () => Response.json({ ...release, tag_name: 'v99.0.0' })) as unknown as typeof fetch
  expect((await checkForUpdate(fetchImpl))?.version).toBe('99.0.0')
  expect(vi.mocked(fetchImpl).mock.calls[0][0]).toBe(RELEASES_API)

  const old = vi.fn(async () => Response.json({ ...release, tag_name: 'v0.9.0' })) as unknown as typeof fetch
  expect(await checkForUpdate(old)).toBeNull()
  expect(useUpdate.getState().latest).toBeNull()
})

test('rate limits become a friendly message', async () => {
  const limited = vi.fn(async () => new Response('{}', { status: 403 })) as unknown as typeof fetch
  await checkForUpdate(limited)
  expect(useUpdate.getState().phase).toBe('error')
  expect(useUpdate.getState().message).toMatch(/rate-limiting/)
})
