import { useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { BANDS, bandLabel, GAIN_LIMIT, logFreqs, responseDb, type Filter } from '../audio/eq'
import { haptic } from '../native/haptics'

const W = 340
const H = 180
const PAD_X = 14
const LO = 20
const HI = 20000

const xOf = (f: number) => PAD_X + ((Math.log(f) - Math.log(LO)) / (Math.log(HI) - Math.log(LO))) * (W - PAD_X * 2)
const yOf = (db: number) => H / 2 - (db / GAIN_LIMIT) * (H / 2 - 14)
const dbOf = (y: number) => ((H / 2 - y) / (H / 2 - 14)) * GAIN_LIMIT

interface Props {
  filters: Filter[]
  gains: number[]
  editable: boolean
  onChange: (band: number, db: number) => void
}

/** Draggable 10-band EQ with the real filter response drawn behind it. */
export default function EqCurve({ filters, gains, editable, onChange }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const dragging = useRef<number | null>(null)

  const path = useMemo(() => {
    const pts = logFreqs(120).map((f) => {
      const db = Math.max(-GAIN_LIMIT - 2, Math.min(GAIN_LIMIT + 2, responseDb(filters, f)))
      return `${xOf(f).toFixed(1)},${yOf(db).toFixed(1)}`
    })
    return `M${pts.join(' L')}`
  }, [filters])

  const area = `${path} L${xOf(HI)},${H / 2} L${xOf(LO)},${H / 2} Z`

  function toDb(e: PointerEvent) {
    const rect = svg.current!.getBoundingClientRect()
    const y = ((e.clientY - rect.top) / rect.height) * H
    return Math.round(Math.max(-GAIN_LIMIT, Math.min(GAIN_LIMIT, dbOf(y))) * 2) / 2
  }

  function set(band: number, db: number) {
    if (db === (gains[band] ?? 0)) return
    if (db === 0 || Math.abs(db) % 3 === 0) haptic() // tick on 0 / ±3 / ±6… dB
    onChange(band, db)
  }
  function down(band: number, e: PointerEvent<SVGElement>) {
    if (!editable) return
    dragging.current = band
    ;(e.target as Element).setPointerCapture(e.pointerId)
    set(band, toDb(e))
  }
  function move(e: PointerEvent<SVGElement>) {
    if (dragging.current !== null) set(dragging.current, toDb(e))
  }
  function up() {
    dragging.current = null
  }
  function key(band: number, e: KeyboardEvent) {
    if (!editable) return
    const step = e.shiftKey ? 3 : 0.5
    const g = gains[band] ?? 0
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(band, Math.min(GAIN_LIMIT, g + step))
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(band, Math.max(-GAIN_LIMIT, g - step))
    else if (e.key === '0' || e.key === 'Home') onChange(band, 0)
    else return
    e.preventDefault()
  }

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${W} ${H + 18}`}
      className={`eq ${editable ? '' : 'eq-locked'}`}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <defs>
        <pattern id="eq-dots" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="1.2" height="1.2" fill="var(--eq-fill)" />
          <rect x="2" y="2" width="1.2" height="1.2" fill="var(--eq-fill)" />
        </pattern>
      </defs>
      {[-12, -6, 0, 6, 12].map((db) => (
        <g key={db}>
          <line x1={PAD_X} x2={W - PAD_X} y1={yOf(db)} y2={yOf(db)} className={db === 0 ? 'eq-zero' : 'eq-grid'} />
        </g>
      ))}
      <path d={area} fill="url(#eq-dots)" />
      <path d={path} className="eq-line" />
      {BANDS.map((f, i) => {
        const g = gains[i] ?? 0
        return (
          <g key={f}>
            <line x1={xOf(f)} x2={xOf(f)} y1={8} y2={H - 8} className="eq-band" />
            <text x={xOf(f)} y={H + 14} className="eq-label">
              {bandLabel(f)}
            </text>
            {editable && (
              <circle
                cx={xOf(f)}
                cy={yOf(g)}
                r={9}
                className="eq-handle"
                tabIndex={0}
                role="slider"
                aria-label={`${bandLabel(f)} Hz`}
                aria-valuemin={-GAIN_LIMIT}
                aria-valuemax={GAIN_LIMIT}
                aria-valuenow={g}
                aria-valuetext={`${g} dB`}
                onPointerDown={(e) => down(i, e)}
                onKeyDown={(e) => key(i, e)}
                onDoubleClick={() => onChange(i, 0)}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
