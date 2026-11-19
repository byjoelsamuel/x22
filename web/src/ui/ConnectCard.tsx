import { useUi } from '../state/ui'

/** Shown where a feature needs the homelab (Library, Import) and none is connected. */
export default function ConnectCard({ title, body }: { title: string; body: string }) {
  const openConnect = useUi((s) => s.openConnect)
  return (
    <section className="card connect-card dither">
      <div className="connect-card-inner">
        <strong>{title}</strong>
        <span className="muted small">{body}</span>
        <button className="pill pill-solid" onClick={openConnect}>
          Connect homelab
        </button>
      </div>
    </section>
  )
}
