import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import type { Song } from '../api/types'
import { uploaderHealth, youtubePlaylist, youtubeVideos } from '../api/uploader'
import { buyLinks, matchTracks, type MatchResult, type SourceTrack } from '../import/match'
import { parsePastedList, parseTakeout, playlistIdFromLink } from '../import/takeout'
import { api, useAuth } from '../state/auth'
import { useBack } from '../state/back'
import { fmtTime } from './format'

type Source = 'link' | 'takeout' | 'paste'
type Phase = { step: 'input' } | { step: 'loading'; label: string; done?: number; total?: number } | { step: 'review' } | { step: 'created'; name: string; count: number }

/**
 * Rebuild a YouTube Music playlist in Navidrome from songs already in your library.
 * Reads titles only (YouTube Data API / Takeout / a pasted list) — nothing is downloaded.
 */
export default function PlaylistImport() {
  const creds = useAuth((s) => s.creds)!
  const [source, setSource] = useState<Source>('link')
  const [link, setLink] = useState('')
  const [paste, setPaste] = useState('')
  const [name, setName] = useState('')
  const [phase, setPhase] = useState<Phase>({ step: 'input' })
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<MatchResult[]>([])
  const [youtubeReady, setYoutubeReady] = useState<boolean | null>(null)

  useBack(phase.step === 'review', () => setPhase({ step: 'input' }))

  useEffect(() => {
    void uploaderHealth(creds).then((h) => setYoutubeReady(!!h.youtube))
  }, [creds])

  async function run(load: () => Promise<{ name: string; tracks: SourceTrack[] }>) {
    setError(null)
    try {
      setPhase({ step: 'loading', label: 'Reading playlist…' })
      const { name: found, tracks } = await load()
      if (!tracks.length) throw new Error('No songs found')
      setName((n) => n || found)
      setPhase({ step: 'loading', label: 'Matching with your library…', done: 0, total: tracks.length })
      const matched = await matchTracks(
        tracks,
        async (q) => (await api().search(q)).songs,
        (done, total) => setPhase({ step: 'loading', label: 'Matching with your library…', done, total }),
      )
      setResults(matched)
      setPhase({ step: 'review' })
    } catch (e) {
      setError((e as Error).message)
      setPhase({ step: 'input' })
    }
  }

  function fromLink() {
    const id = playlistIdFromLink(link)
    if (!id) return setError('Paste a YouTube Music playlist link (music.youtube.com/playlist?list=…)')
    void run(async () => youtubePlaylist(creds, id))
  }

  async function fromFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const base = file.name.replace(/\.csv$/i, '').replace(/-videos$/i, '')
    void run(async () => {
      const parsed = parseTakeout(await file.text())
      if (parsed.kind === 'tracks') return { name: base, tracks: parsed.tracks }
      const { tracks } = await youtubeVideos(creds, parsed.ids)
      return { name: base, tracks }
    })
  }

  function fromPaste() {
    void run(async () => ({ name: '', tracks: parsePastedList(paste) }))
  }

  async function create() {
    const ids = results.flatMap((r) => (r.song ? [r.song.id] : []))
    const title = name.trim() || 'Imported playlist'
    setPhase({ step: 'loading', label: 'Creating playlist…' })
    try {
      await api().createPlaylist(title, ids)
      setPhase({ step: 'created', name: title, count: ids.length })
    } catch (e) {
      setError((e as Error).message)
      setPhase({ step: 'review' })
    }
  }

  const pick = (i: number, song: Song | null) =>
    setResults((rs) => rs.map((r, j) => (j === i ? { ...r, song, status: song ? 'matched' : 'missing' } : r)))

  const counts = useMemo(
    () => ({
      matched: results.filter((r) => r.song && r.status === 'matched').length,
      maybe: results.filter((r) => r.status === 'maybe').length,
      missing: results.filter((r) => !r.song).length,
    }),
    [results],
  )

  if (phase.step === 'loading') {
    const pct = phase.total ? ((phase.done ?? 0) / phase.total) * 100 : 30
    return (
      <section className="card">
        <span>{phase.label}</span>
        <div className="bar">
          <span style={{ width: `${pct}%` }} />
        </div>
        {phase.total ? (
          <span className="muted small mono">
            {phase.done}/{phase.total}
          </span>
        ) : null}
      </section>
    )
  }

  if (phase.step === 'created') {
    return (
      <section className="card">
        <strong className="success">“{phase.name}” is in your library</strong>
        <span className="muted small">
          {phase.count} songs · find it in Library → Playlists.
          {counts.missing ? ` ${counts.missing} songs were missing — add them in Files, then import again.` : ''}
        </span>
        <button
          className="pill"
          onClick={() => {
            setResults([])
            setName('')
            setLink('')
            setPaste('')
            setPhase({ step: 'input' })
          }}
        >
          Import another
        </button>
      </section>
    )
  }

  if (phase.step === 'review') {
    return (
      <>
        <section className="card">
          <label className="field">
            <span className="label">Playlist name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Imported playlist" />
          </label>
          <div className="row small mono">
            <span className="status-saved">{counts.matched} matched</span>
            <span className="muted">{counts.maybe} to check</span>
            <span className="status-rejected">{counts.missing} missing</span>
          </div>
          <div className="row-start">
            <button className="pill pill-solid" disabled={!results.some((r) => r.song)} onClick={() => void create()}>
              Create playlist
            </button>
            <button className="pill" onClick={() => setPhase({ step: 'input' })}>
              Back
            </button>
          </div>
          {error && <p className="error small">{error}</p>}
        </section>
        <ol className="matches">
          {results.map((r, i) => (
            <li key={i} className={`match match-${r.song ? r.status : 'missing'}`}>
              <div className="match-src">
                <span className="match-title">{r.track.title}</span>
                <span className="muted small">
                  {r.track.artist}
                  {r.track.durationSec ? ` · ${fmtTime(r.track.durationSec)}` : ''}
                </span>
              </div>
              {r.candidates.length > 0 ? (
                <select
                  className="select match-pick"
                  aria-label={`Library match for ${r.track.title}`}
                  value={r.song?.id ?? ''}
                  onChange={(e) => pick(i, r.candidates.find((c) => c.song.id === e.target.value)?.song ?? null)}
                >
                  <option value="">Skip</option>
                  {r.candidates.map((c) => (
                    <option key={c.song.id} value={c.song.id}>
                      {c.song.title} — {c.song.artist} ({Math.round(c.score * 100)}%)
                    </option>
                  ))}
                </select>
              ) : null}
              {!r.song && (
                <span className="buy small">
                  Not in library ·{' '}
                  {buyLinks(r.track).map((l, j) => (
                    <span key={l.name}>
                      {j > 0 && ' · '}
                      <a href={l.url} target="_blank" rel="noreferrer">
                        {l.name}
                      </a>
                    </span>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ol>
      </>
    )
  }

  return (
    <section className="card">
      <p className="muted small">
        Rebuild a YouTube Music playlist from songs already on your homelab. Missing songs get links to buy lossless copies.
      </p>
      <div className="chips" role="tablist" aria-label="Playlist source">
        {(
          [
            ['link', 'Link'],
            ['takeout', 'Takeout file'],
            ['paste', 'Paste list'],
          ] as [Source, string][]
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={source === id} className={`chip ${source === id ? 'on' : ''}`} onClick={() => setSource(id)}>
            {label}
          </button>
        ))}
      </div>

      {source === 'link' && (
        <>
          <input
            className="text-input"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://music.youtube.com/playlist?list=…"
            inputMode="url"
            aria-label="YouTube Music playlist link"
          />
          {youtubeReady === false && (
            <p className="muted small">
              Links need a free YouTube Data API key on your homelab (<span className="mono">YOUTUBE_API_KEY</span> — see README). Takeout CSVs with
              song titles and pasted lists work without one.
            </p>
          )}
          <button className="pill pill-solid" disabled={!link.trim()} onClick={fromLink}>
            Find songs
          </button>
        </>
      )}

      {source === 'takeout' && (
        <>
          <p className="muted small">
            From Google Takeout → YouTube and YouTube Music: <span className="mono">music library songs.csv</span> or a file from{' '}
            <span className="mono">playlists/</span>.
          </p>
          <label className="pill pill-solid file-pill">
            Choose CSV
            <input type="file" accept=".csv,text/csv" onChange={fromFile} hidden />
          </label>
        </>
      )}

      {source === 'paste' && (
        <>
          <textarea
            className="text-input"
            rows={6}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={'One per line:\nThe Weeknd - Blinding Lights\nKavinsky - Nightcall'}
            aria-label="Song list"
          />
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Playlist name" aria-label="Playlist name" />
          <button className="pill pill-solid" disabled={!paste.trim()} onClick={fromPaste}>
            Find songs
          </button>
        </>
      )}

      {error && <p className="error small">{error}</p>}
    </section>
  )
}
