import { useEffect, useState } from 'react'
import type { Album, AlbumListType, Artist, Playlist, Song } from '../api/types'
import { useApi, useAuth } from '../state/auth'
import { usePlayer } from '../state/player'
import ConnectCard from './ConnectCard'
import DitherImage from './DitherImage'
import { IconBack, IconSearch, IconShuffle } from './icons'
import TrackList from './TrackList'

type Tab = 'albums' | 'artists' | 'playlists' | 'liked'
type View =
  | { kind: 'root' }
  | { kind: 'album'; id: string }
  | { kind: 'artist'; id: string }
  | { kind: 'playlist'; id: string }

const SORTS: { id: AlbumListType; name: string }[] = [
  { id: 'newest', name: 'Recently added' },
  { id: 'recent', name: 'Recently played' },
  { id: 'frequent', name: 'Most played' },
  { id: 'random', name: 'Random' },
  { id: 'alphabeticalByName', name: 'A–Z' },
]

/** Tiny async loader hook. */
function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; loading: boolean } {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  })
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fn().then(
      (data) => live && setState({ data, error: null, loading: false }),
      (e: Error) => live && setState({ data: null, error: e.message, loading: false }),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}

export default function Library({ refreshKey = 0 }: { refreshKey?: number }) {
  const connected = useAuth((s) => !!s.creds)
  if (!connected) {
    return (
      <div className="page">
        <header className="page-head">
          <h1 className="dot page-title">Library</h1>
        </header>
        <ConnectCard
          title="Your library lives on your homelab"
          body="Connect Navidrome to browse albums, artists and playlists and stream them in lossless."
        />
      </div>
    )
  }
  return <LibraryBrowser refreshKey={refreshKey} />
}

function LibraryBrowser({ refreshKey }: { refreshKey: number }) {
  const [tab, setTab] = useState<Tab>('albums')
  const [stack, setStack] = useState<View[]>([{ kind: 'root' }])
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const view = stack[stack.length - 1]
  const push = (v: View) => setStack((s) => [...s, v])
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  if (view.kind === 'album') return <AlbumView id={view.id} onBack={pop} />
  if (view.kind === 'artist') return <ArtistView id={view.id} onBack={pop} onAlbum={(id) => push({ kind: 'album', id })} />
  if (view.kind === 'playlist') return <PlaylistView id={view.id} onBack={pop} />

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="dot page-title">Library</h1>
      </header>
      <label className="search">
        <IconSearch />
        <input
          type="search"
          placeholder="Songs, albums, artists"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search"
        />
      </label>
      {debounced ? (
        <SearchResults query={debounced} onAlbum={(id) => push({ kind: 'album', id })} onArtist={(id) => push({ kind: 'artist', id })} />
      ) : (
        <>
          <div className="segmented" role="tablist">
            {(['albums', 'artists', 'playlists', 'liked'] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          {tab === 'albums' && <Albums refreshKey={refreshKey} onOpen={(id) => push({ kind: 'album', id })} />}
          {tab === 'artists' && <Artists onOpen={(id) => push({ kind: 'artist', id })} />}
          {tab === 'playlists' && <Playlists onOpen={(id) => push({ kind: 'playlist', id })} />}
          {tab === 'liked' && <Liked />}
        </>
      )}
    </div>
  )
}

function Albums({ onOpen, refreshKey }: { onOpen: (id: string) => void; refreshKey: number }) {
  const api = useApi()!
  const [sort, setSort] = useState<AlbumListType>('newest')
  const [albums, setAlbums] = useState<Album[]>([])
  const [more, setMore] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load(reset: boolean) {
    try {
      const page = await api.albumList(sort, 40, reset ? 0 : albums.length)
      setAlbums((a) => (reset ? page : [...a, ...page]))
      setMore(page.length === 40)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  useEffect(() => {
    void load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, refreshKey])

  return (
    <>
      <div className="chips">
        {SORTS.map((s) => (
          <button key={s.id} className={`chip ${sort === s.id ? 'on' : ''}`} onClick={() => setSort(s.id)}>
            {s.name}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <AlbumGrid albums={albums} onOpen={onOpen} />
      {more && albums.length > 0 && (
        <button className="pill" onClick={() => void load(false)}>
          Load more
        </button>
      )}
    </>
  )
}

function AlbumGrid({ albums, onOpen }: { albums: Album[]; onOpen: (id: string) => void }) {
  const api = useApi()!
  return (
    <div className="grid">
      {albums.map((a) => (
        <button key={a.id} className="tile" onClick={() => onOpen(a.id)}>
          <DitherImage src={api.coverUrl(a.coverArt, 300)} grid={72} className="tile-art" alt={a.name} />
          <span className="tile-title">{a.name}</span>
          <span className="muted small tile-sub">{a.artist}</span>
        </button>
      ))}
    </div>
  )
}

function Artists({ onOpen }: { onOpen: (id: string) => void }) {
  const api = useApi()!
  const { data, error } = useLoad<Artist[]>(() => api.artists(), [])
  if (error) return <p className="error">{error}</p>
  return (
    <ul className="list">
      {(data ?? []).map((a) => (
        <li key={a.id}>
          <button onClick={() => onOpen(a.id)}>
            <span>{a.name}</span>
            <span className="muted small mono">{a.albumCount ?? 0}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function Playlists({ onOpen }: { onOpen: (id: string) => void }) {
  const api = useApi()!
  const { data, error } = useLoad<Playlist[]>(() => api.playlists(), [])
  if (error) return <p className="error">{error}</p>
  if (data && !data.length) return <p className="muted empty">No playlists yet. Create them in Navidrome.</p>
  return (
    <ul className="list">
      {(data ?? []).map((p) => (
        <li key={p.id}>
          <button onClick={() => onOpen(p.id)}>
            <span>{p.name}</span>
            <span className="muted small mono">{p.songCount ?? 0}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function Liked() {
  const api = useApi()!
  const { data, error } = useLoad(() => api.starred(), [])
  if (error) return <p className="error">{error}</p>
  return data ? <TrackList songs={data.songs} /> : null
}

function SearchResults({ query, onAlbum, onArtist }: { query: string; onAlbum: (id: string) => void; onArtist: (id: string) => void }) {
  const api = useApi()!
  const { data, error, loading } = useLoad(() => api.search(query), [query])
  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted empty">{loading ? 'Searching…' : ''}</p>
  if (!data.songs.length && !data.albums.length && !data.artists.length) return <p className="muted empty">No results for “{query}”</p>
  return (
    <>
      {data.artists.length > 0 && (
        <div className="chips">
          {data.artists.map((a) => (
            <button key={a.id} className="chip" onClick={() => onArtist(a.id)}>
              {a.name}
            </button>
          ))}
        </div>
      )}
      {data.albums.length > 0 && <AlbumGrid albums={data.albums} onOpen={onAlbum} />}
      {data.songs.length > 0 && (
        <>
          <h2 className="label">Songs</h2>
          <TrackList songs={data.songs} />
        </>
      )}
    </>
  )
}

function DetailHeader(props: { title: string; sub?: string; cover?: string; songs: Song[]; onBack: () => void }) {
  const api = useApi()!
  const play = (shuffle: boolean) => {
    const p = usePlayer.getState()
    if (p.shuffle !== shuffle) p.toggleShuffle()
    p.playQueue(props.songs, shuffle ? Math.floor(Math.random() * props.songs.length) : 0)
  }
  return (
    <>
      <button className="icon-btn" onClick={props.onBack} aria-label="Back">
        <IconBack />
      </button>
      <div className="detail-head">
        <DitherImage src={api.coverUrl(props.cover, 500)} grid={112} className="detail-art" alt={props.title} />
        <h1 className="detail-title">{props.title}</h1>
        {props.sub && <p className="muted">{props.sub}</p>}
        <div className="row-start">
          <button className="pill pill-solid" disabled={!props.songs.length} onClick={() => play(false)}>
            Play
          </button>
          <button className="pill" disabled={!props.songs.length} onClick={() => play(true)} aria-label="Shuffle">
            <IconShuffle width={18} height={18} />
          </button>
        </div>
      </div>
    </>
  )
}

function AlbumView({ id, onBack }: { id: string; onBack: () => void }) {
  const api = useApi()!
  const { data, error } = useLoad(() => api.album(id), [id])
  if (error) return <div className="page"><p className="error">{error}</p></div>
  if (!data) return <div className="page" />
  const songs = data.song ?? []
  return (
    <div className="page">
      <DetailHeader
        title={data.name}
        sub={[data.artist, data.year].filter(Boolean).join(' · ')}
        cover={data.coverArt}
        songs={songs}
        onBack={onBack}
      />
      <TrackList songs={songs} numbered />
    </div>
  )
}

function ArtistView({ id, onBack, onAlbum }: { id: string; onBack: () => void; onAlbum: (id: string) => void }) {
  const api = useApi()!
  const { data, error } = useLoad(() => api.artist(id), [id])
  if (error) return <div className="page"><p className="error">{error}</p></div>
  if (!data) return <div className="page" />
  return (
    <div className="page">
      <button className="icon-btn" onClick={onBack} aria-label="Back">
        <IconBack />
      </button>
      <h1 className="dot page-title">{data.name}</h1>
      <AlbumGrid albums={data.album ?? []} onOpen={onAlbum} />
    </div>
  )
}

function PlaylistView({ id, onBack }: { id: string; onBack: () => void }) {
  const api = useApi()!
  const { data, error } = useLoad(() => api.playlist(id), [id])
  if (error) return <div className="page"><p className="error">{error}</p></div>
  if (!data) return <div className="page" />
  const songs = data.entry ?? []
  return (
    <div className="page">
      <DetailHeader title={data.name} sub={`${songs.length} tracks`} cover={data.coverArt} songs={songs} onBack={onBack} />
      <TrackList songs={songs} />
    </div>
  )
}
