import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { extensionOf, safeJoin, sanitizeSegment, targetPath } from '../src/paths.js'

test('only audio extensions are accepted', () => {
  assert.equal(extensionOf('Song.FLAC'), 'flac')
  assert.equal(extensionOf('a.m4a'), 'm4a')
  assert.equal(extensionOf('evil.sh'), null)
  assert.equal(extensionOf('noext'), null)
})

test('sanitizeSegment strips separators, control chars and traversal', () => {
  assert.equal(sanitizeSegment('AC/DC'), 'AC_DC')
  assert.equal(sanitizeSegment('..'), 'Unknown')
  assert.equal(sanitizeSegment('  ...hidden.  '), 'hidden')
  assert.equal(sanitizeSegment('a\u0000b:c?'), 'ab_c_')
  assert.equal(sanitizeSegment('CON'), '_CON')
  assert.equal(sanitizeSegment(''), 'Unknown')
  assert.equal(sanitizeSegment('x'.repeat(300)).length, 120)
})

test('tagged files go to Artist/Album/NN - Title', () => {
  const p = targetPath({ albumartist: 'Daft Punk', album: 'Discovery', title: 'One More Time', track: { no: 1 } }, 'x.flac', 'flac')
  assert.equal(p, path.join('Daft Punk', 'Discovery', '01 - One More Time.flac'))
})

test('multi-disc albums get a disc prefix, singles get a Singles folder', () => {
  const p = targetPath({ artist: 'A', title: 'T', track: { no: 3 }, disk: { no: 2, of: 2 } }, 'x.mp3', 'mp3')
  assert.equal(p, path.join('A', 'Singles', '2-03 - T.mp3'))
})

test('untagged files go to Unsorted using the original name', () => {
  assert.equal(targetPath(null, '../../etc/passwd.flac', 'flac'), path.join('Unsorted', 'passwd.flac'))
  assert.equal(targetPath({}, 'my track.wav', 'wav'), path.join('Unsorted', 'my track.wav'))
})

test('safeJoin refuses escapes', () => {
  assert.equal(safeJoin('/music/Uploads', 'a/b.flac'), '/music/Uploads/a/b.flac')
  assert.throws(() => safeJoin('/music/Uploads', '../x.flac'))
  assert.throws(() => safeJoin('/music/Uploads', '/etc/passwd'))
})
