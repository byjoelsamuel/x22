import path from 'node:path'

export const AUDIO_EXTENSIONS = new Set([
  'flac', 'mp3', 'm4a', 'aac', 'alac', 'ogg', 'oga', 'opus', 'wav', 'aiff', 'aif', 'wv', 'ape', 'dsf', 'dff',
])

export function extensionOf(name) {
  const ext = path.extname(String(name)).slice(1).toLowerCase()
  return AUDIO_EXTENSIONS.has(ext) ? ext : null
}

/** Make one path segment safe on Linux/Windows/macOS file systems. */
export function sanitizeSegment(value, fallback = 'Unknown') {
  let s = String(value ?? '')
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '')
  if (s.length > 120) s = s.slice(0, 120).trim()
  if (!s || s === '.' || s === '..') return fallback
  // Windows reserved names
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s = `_${s}`
  return s
}

/**
 * Where an upload should live, relative to the upload root:
 *   <Album Artist>/<Album>/<NN - Title>.<ext>   when tags exist
 *   Unsorted/<original name>                    otherwise
 */
export function targetPath(tags, originalName, ext) {
  const artist = tags?.albumartist || tags?.artist
  const title = tags?.title
  if (!artist || !title) {
    const base = path.basename(String(originalName), path.extname(String(originalName)))
    return path.join('Unsorted', `${sanitizeSegment(base, 'track')}.${ext}`)
  }
  const album = sanitizeSegment(tags.album, 'Singles')
  const no = tags.track?.no ? `${String(tags.track.no).padStart(2, '0')} - ` : ''
  const disc = tags.disk?.of > 1 && tags.disk?.no ? `${tags.disk.no}-` : ''
  return path.join(sanitizeSegment(artist), album, `${disc}${no}${sanitizeSegment(title, 'track')}.${ext}`)
}

/** Resolve `rel` under `root`, refusing anything that escapes it. */
export function safeJoin(root, rel) {
  const base = path.resolve(root)
  const full = path.resolve(base, rel)
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error('Path escapes upload folder')
  return full
}
