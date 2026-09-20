import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Scan } from '../api'
import { SiteSection, dayLabel, displayName, wasteVisual } from '../components/ui'

export default function MyScans() {
  const [scans, setScans] = useState<Scan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .scans(100)
      .then((r) => alive && (setScans(r.scans), setError(null)))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Could not load your scans'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, Scan[]>()
    for (const s of scans) {
      const key = dayLabel(s.created_at)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return [...map.entries()]
  }, [scans])

  return (
    <div className="container-site max-w-3xl py-12">
      <SiteSection title="My scans." sub="Everything you've identified with EcoSort — newest first." />

      {loading && <p className="mt-10 text-center text-[15px] text-muted">Loading your scans…</p>}
      {error && <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-rose/30 bg-rose/[0.06] p-4 text-[14px]">{error}</div>}

      {!loading && !error && scans.length === 0 && (
        <div className="mx-auto mt-10 max-w-md rounded-[28px] border border-dashed border-line bg-surface p-10 text-center">
          <div className="text-4xl">📸</div>
          <div className="mt-3 text-[18px] font-bold text-ink">No scans yet</div>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
            Your identified waste will show up here — with a photo, the result and the date.
          </p>
          <Link to="/scan" className="btn-primary mt-5 w-full">Scan your first item</Link>
        </div>
      )}

      <div className="mt-8 space-y-7">
        {grouped.map(([day, items]) => (
          <div key={day}>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-[15px] font-bold text-ink">{day}</h2>
              <span className="h-px flex-1 bg-line" />
            </div>
            <div className="space-y-2.5">
              {items.map((s) => (
                <Link
                  key={s.id}
                  to={`/scan?id=${s.id}`}
                  className="card flex items-center gap-4 !rounded-3xl p-4 transition hover:-translate-y-0.5"
                >
                  <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-surface2 text-3xl">
                    {wasteVisual(s.predicted_class).icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] font-bold text-ink">{displayName(s.predicted_class)}</span>
                    <span className="mt-0.5 block text-[13px] text-muted">
                      {new Date(s.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {' · '}
                      {s.state === 'high' ? 'High confidence' : s.state === 'moderate' ? 'Fairly confident' : 'Not very sure'}
                    </span>
                  </span>
                  <span className="shrink-0 text-muted">→</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
