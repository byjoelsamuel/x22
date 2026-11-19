import { describe, expect, test, vi } from 'vitest'
import type { Song } from '../api/types'
import { buyLinks, matchTracks, normalize, score, similarity } from './match'
import { parseCsv, parsePastedList, parseTakeout, playlistIdFromLink } from './takeout'

const song = (id: string, title: string, artist: string, duration?: number): Song => ({ id, title, artist, duration })

describe('normalize & score', () => {
  test('strips YouTube noise, features and Topic suffixes', () => {
    expect(normalize('Blinding Lights (Official Video)')).toBe('blinding lights')
    expect(normalize('Starboy [Lyrics] ft. Daft Punk')).toBe('starboy')
    expect(normalize('Get Lucky (feat. Pharrell Williams) (Radio Edit)')).toBe('get lucky radio edit')
    expect(normalize('The Weeknd - Topic')).toBe('the weeknd')
    expect(normalize('Beyoncé & JAY-Z')).toBe('beyonce and jay z')
    expect(normalize('Wonderwall (Remastered 2014)')).toBe('wonderwall')
  })

  test('a YouTube title matches the library song', () => {
    const s = score({ title: 'Blinding Lights (Official Video)', artist: 'The Weeknd', durationSec: 201 }, song('1', 'Blinding Lights', 'The Weeknd', 200))
    expect(s).toBeGreaterThan(0.95)
  })

  test('different songs by the same artist do not match', () => {
    const s = score({ title: 'Save Your Tears', artist: 'The Weeknd' }, song('1', 'Blinding Lights', 'The Weeknd'))
    expect(s).toBeLessThan(0.5)
  })

  test('prefix similarity handles extra words', () => {
    expect(similarity('One More Time', 'One More Time (Short Radio Edit)')).toBeGreaterThanOrEqual(0.9)
  })
})

describe('matchTracks', () => {
  const library = [
    song('a', 'Blinding Lights', 'The Weeknd', 200),
    song('b', 'Nightcall', 'Kavinsky', 258),
    song('c', 'Midnight City', 'M83', 243),
  ]
  const search = vi.fn(async (q: string) => library.filter((s) => q.split(' ').some((w) => normalize(s.title).includes(w))))

  test('matched, maybe and missing, in playlist order', async () => {
    const progress: number[] = []
    const results = await matchTracks(
      [
        { title: 'Blinding Lights (Official Audio)', artist: 'The Weeknd', durationSec: 200 },
        { title: 'Nightcall (Drive OST)', artist: 'Kavinsky & Lovefoxxx' },
        { title: 'Song We Do Not Have', artist: 'Nobody' },
      ],
      search,
      (done) => progress.push(done),
    )
    expect(results.map((r) => r.status)).toEqual(['matched', 'matched', 'missing'])
    expect(results[0].song?.id).toBe('a')
    expect(results[2].song).toBeNull()
    expect(progress.at(-1)).toBe(3)
  })

  test('a failed search marks only that track missing', async () => {
    const flaky = vi.fn(async () => {
      throw new Error('net')
    })
    const r = await matchTracks([{ title: 'X', artist: 'Y' }], flaky)
    expect(r[0].status).toBe('missing')
  })

  test('buy links search Bandcamp and Qobuz', () => {
    expect(buyLinks({ title: 'Nightcall (Official Video)', artist: 'Kavinsky' })[0].url).toBe('https://bandcamp.com/search?q=Kavinsky%20nightcall')
  })
})

describe('Takeout & paste', () => {
  test('CSV with quotes, commas and BOM', () => {
    expect(parseCsv('﻿a,"b, c","d ""e"""\r\n1,2,3\n')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', '2', '3'],
    ])
  })

  test('library songs CSV → tracks', () => {
    const f = parseTakeout('Video ID,Song Title,Album Title,Artist Name 1\nabcdefghijk,Nightcall,OutRun,Kavinsky\n')
    expect(f).toEqual({ kind: 'tracks', tracks: [{ title: 'Nightcall', artist: 'Kavinsky' }] })
  })

  test('playlist CSV (with old metadata rows) → video ids', () => {
    const f = parseTakeout(
      'Playlist Id,Channel Id,Time Created\nPL123,UC1,2020\n\nVideo Id,Time Added\nabcdefghijk,2020-01-01\nbad,2020\nABCDEFGHIJK,2021\n',
    )
    expect(f).toEqual({ kind: 'videoIds', ids: ['abcdefghijk', 'ABCDEFGHIJK'] })
  })

  test('rejects unrelated CSVs', () => {
    expect(() => parseTakeout('name,email\nx,y')).toThrow()
  })

  test('pasted list', () => {
    expect(parsePastedList('1. Kavinsky - Nightcall\n• M83 – Midnight City\nJust A Title\n\n')).toEqual([
      { artist: 'Kavinsky', title: 'Nightcall' },
      { artist: 'M83', title: 'Midnight City' },
      { artist: '', title: 'Just A Title' },
    ])
  })

  test('playlist links', () => {
    expect(playlistIdFromLink('https://music.youtube.com/playlist?list=PLabcdefghij123&si=x')).toBe('PLabcdefghij123')
    expect(playlistIdFromLink('https://www.youtube.com/watch?v=abc&list=OLAK5uy_abcdefgh')).toBe('OLAK5uy_abcdefgh')
    expect(playlistIdFromLink('PLabcdefghij123')).toBe('PLabcdefghij123')
    expect(playlistIdFromLink('https://evil.example/?list=PLabcdefghij123')).toBeNull()
    expect(playlistIdFromLink('hello')).toBeNull()
  })
})
