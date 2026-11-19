import { useEffect, useRef, useState, type DragEvent } from 'react'
import { uploaderHealth, uploadFile, type UploadResult } from '../api/uploader'
import { api, useAuth } from '../state/auth'
import ConnectCard from './ConnectCard'
import { IconUpload } from './icons'

const AUDIO = /\.(flac|mp3|m4a|aac|alac|ogg|oga|opus|wav|aiff?|wv|ape|dsf|dff)$/i

interface Item {
  id: string
  file: File
  progress: number
  result?: UploadResult
  error?: string
}

type Phase = 'idle' | 'uploading' | 'scanning' | 'done'

export default function Import({ onLibraryChanged }: { onLibraryChanged: () => void }) {
  const connected = useAuth((s) => !!s.creds)
  if (!connected) {
    return (
      <div className="page">
        <header className="page-head">
          <h1 className="dot page-title">Import</h1>
        </header>
        <ConnectCard
          title="Add songs to your homelab"
          body="Connect Navidrome to upload FLAC, ALAC, MP3 and more straight into your library."
        />
      </div>
    )
  }
  return <Uploader onLibraryChanged={onLibraryChanged} />
}

function Uploader({ onLibraryChanged }: { onLibraryChanged: () => void }) {
  const creds = useAuth((s) => s.creds)!
  const [items, setItems] = useState<Item[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [online, setOnline] = useState<boolean | null>(null)
  const [drag, setDrag] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void uploaderHealth(creds).then((h) => setOnline(h.ok))
  }, [creds])

  function add(files: FileList | File[]) {
    const audio = Array.from(files).filter((f) => AUDIO.test(f.name))
    setItems((cur) => [
      ...cur.filter((i) => !i.result),
      ...audio.map((file) => ({ id: `${file.name}-${file.size}-${Math.random()}`, file, progress: 0 })),
    ])
    setSummary(audio.length < files.length ? `${files.length - audio.length} non-audio file(s) ignored` : null)
    setPhase('idle')
  }

  const patch = (id: string, p: Partial<Item>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i)))

  async function start() {
    setPhase('uploading')
    setSummary(null)
    let saved = 0
    for (const item of items.filter((i) => !i.result)) {
      try {
        const result = await uploadFile(creds, item.file, (progress) => patch(item.id, { progress }))
        if (result.status === 'saved') saved++
        patch(item.id, { result, progress: 1 })
      } catch (e) {
        patch(item.id, { error: (e as Error).message, result: { name: item.file.name, status: 'rejected' } })
      }
    }
    if (!saved) {
      setPhase('done')
      setSummary('Nothing new to add')
      return
    }
    setPhase('scanning')
    try {
      await api().startScan()
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 1500))
        if (!(await api().scanStatus()).scanning) break
      }
      setSummary(`${saved} song${saved > 1 ? 's' : ''} added to Navidrome`)
      onLibraryChanged()
    } catch {
      setSummary(`${saved} uploaded — rescan needs an admin account; Navidrome will pick them up on its next scheduled scan`)
    }
    setPhase('done')
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDrag(false)
    if (e.dataTransfer.files.length) add(e.dataTransfer.files)
  }

  const pending = items.filter((i) => !i.result).length
  const busy = phase === 'uploading' || phase === 'scanning'

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="dot page-title">Import</h1>
      </header>

      {online === false && (
        <div className="card warn">
          <strong>Uploader not reachable</strong>
          <span className="muted small">
            Start the <span className="mono">uploader</span> service from <span className="mono">deploy/</span> on your homelab, then reopen this
            tab.
          </span>
        </div>
      )}

      <button
        className={`drop dither ${drag ? 'drag' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        disabled={busy}
      >
        <span className="drop-inner">
          <IconUpload width={32} height={32} />
          <strong>Add songs</strong>
          <span className="muted small">FLAC, ALAC, WAV, AIFF, MP3, AAC, Opus… · tap or drop files</span>
        </span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept="audio/*,.flac,.m4a,.opus,.wv,.ape,.dsf,.dff,.aiff,.aif"
        hidden
        onChange={(e) => {
          if (e.target.files) add(e.target.files)
          e.target.value = ''
        }}
      />

      {items.length > 0 && (
        <section className="card">
          <ul className="uploads">
            {items.map((i) => (
              <li key={i.id}>
                <div className="row">
                  <span className="upload-name">{i.result?.title ?? i.file.name}</span>
                  <span className={`mono small status-${i.result?.status ?? 'pending'}`}>
                    {i.result ? i.result.status : i.progress > 0 ? `${Math.round(i.progress * 100)}%` : `${(i.file.size / 1048576).toFixed(1)} MB`}
                  </span>
                </div>
                <div className="bar">
                  <span style={{ width: `${i.progress * 100}%` }} />
                </div>
                {(i.error || i.result?.reason || i.result?.path) && (
                  <span className="muted small mono">{i.error ?? i.result?.reason ?? i.result?.path}</span>
                )}
              </li>
            ))}
          </ul>
          <div className="row">
            <span className="muted small">{phase === 'scanning' ? 'Navidrome is scanning…' : `${pending} ready`}</span>
            <button className="pill pill-solid" disabled={!pending || busy || online === false} onClick={() => void start()}>
              {phase === 'uploading' ? 'Uploading…' : phase === 'scanning' ? 'Scanning…' : `Upload ${pending || ''}`}
            </button>
          </div>
        </section>
      )}

      {summary && <p className={`center ${phase === 'done' ? 'success' : 'muted'}`}>{summary}</p>}

      <p className="muted small">
        Files are sorted into <span className="mono">Uploads/Artist/Album/</span> using their tags, untouched — no re-encoding — so lossless stays
        lossless.
      </p>
    </div>
  )
}
