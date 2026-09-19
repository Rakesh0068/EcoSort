import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Scan } from '../api'
import {
  Badge,
  Card,
  Empty,
  ErrorState,
  Kicker,
  Loading,
  SectionTitle,
  StatusDot,
  clockTime,
  cx,
  dayLabel,
  pct,
} from '../components/ui'

type StateFilter = 'all' | 'high' | 'moderate' | 'low'

export default function History() {
  const [scans, setScans] = useState<Scan[]>([])
  const [cls, setCls] = useState<string | undefined>()
  const [state, setState] = useState<StateFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .scans(300, cls, state === 'all' ? undefined : state)
      .then((r) => alive && (setScans(r.scans), setError(null)))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'failed to load history'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [cls, state])

  const grouped = useMemo(() => {
    const map = new Map<string, Scan[]>()
    for (const s of scans) {
      const key = dayLabel(s.created_at)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return [...map.entries()]
  }, [scans])

  const classOptions = useMemo(() => [...new Set(scans.map((s) => s.predicted_class))].sort(), [scans])

  const counts = useMemo(
    () => ({
      total: scans.length,
      low: scans.filter((s) => s.state === 'low').length,
      corrected: scans.filter((s) => s.was_correct === 0).length,
      avg: scans.length ? scans.reduce((a, s) => a + s.confidence, 0) / scans.length : null,
    }),
    [scans],
  )

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Scan History"
        sub="Every prediction persisted in SQLite, with its confidence, decision and any human correction."
      />

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Scans shown', String(counts.total)],
          ['Avg confidence', pct(counts.avg, 1)],
          ['Low confidence', String(counts.low)],
          ['Corrected', String(counts.corrected)],
        ].map(([k, v]) => (
          <Card key={k} className="!p-4">
            <Kicker>{k}</Kicker>
            <div className="mt-2 font-mono text-xl font-semibold tabular-nums text-ink">{v}</div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'high', 'moderate', 'low'] as StateFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setState(s)}
              className={cx(
                'rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors',
                state === s
                  ? 'bg-emerald text-white'
                  : 'border border-line bg-surface/60 text-muted hover:border-emerald/40 hover:text-ink',
              )}
            >
              {s === 'all' ? 'All states' : s}
            </button>
          ))}
        </div>

        <select
          value={cls ?? ''}
          onChange={(e) => setCls(e.target.value || undefined)}
          className="input !w-auto !py-1.5 text-xs"
        >
          <option value="">All classes</option>
          {classOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {(cls || state !== 'all') && (
          <button
            className="btn-ghost !px-3 !py-1.5 text-xs"
            onClick={() => {
              setCls(undefined)
              setState('all')
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && <ErrorState message={error} />}
      {loading && <Loading label="Loading history" />}

      {!loading && !error && scans.length === 0 && (
        <Empty
          title="No scans match these filters"
          hint="Run a scan from the Scanner page, or clear the filters to see everything recorded so far."
          icon="⌕"
        />
      )}

      {grouped.map(([day, items]) => (
        <div key={day}>
          <div className="mb-2 flex items-center gap-3">
            <h3 className="text-sm font-bold text-ink">{day}</h3>
            <span className="h-px flex-1 bg-line" />
            <span className="font-mono text-[11px] text-muted">{items.length}</span>
          </div>

          <Card className="!p-0 overflow-hidden">
            <div className="divide-y divide-line/60">
              {items.map((s) => (
                <Link
                  key={s.id}
                  to={`/scan?id=${s.id}`}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface2/60"
                >
                  <span
                    className={cx(
                      'h-9 w-1 shrink-0 rounded-full',
                      s.state === 'high' ? 'bg-emerald' : s.state === 'moderate' ? 'bg-amber' : 'bg-rose',
                    )}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold capitalize text-ink">{s.predicted_class}</span>
                      <Badge tone={s.state === 'high' ? 'good' : s.state === 'moderate' ? 'warn' : 'bad'}>
                        {pct(s.confidence, 1)}
                      </Badge>
                      {s.was_correct === 0 && s.corrected_class && (
                        <Badge tone="bad">
                          <StatusDot tone="rose" pulse={false} />→ {s.corrected_class}
                        </Badge>
                      )}
                      {s.was_correct === 1 && <Badge tone="good">verified</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-[11px] text-muted">
                      <span>{clockTime(s.created_at)}</span>
                      <span>{s.source}</span>
                      <span className={s.action === 'SORT' ? 'text-emerald' : 'text-amber'}>{s.action}</span>
                      {s.target_bin && <span>{s.target_bin}</span>}
                      {s.latency?.total_ms != null && <span>{s.latency.total_ms.toFixed(0)} ms</span>}
                    </div>
                  </div>

                  <div className="hidden w-28 shrink-0 sm:block">
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
                      <div
                        className={cx(
                          'h-full rounded-full',
                          s.state === 'low' ? 'bg-rose' : s.state === 'moderate' ? 'bg-amber' : 'bg-emerald',
                        )}
                        style={{ width: `${Math.round(s.confidence * 100)}%` }}
                      />
                    </div>
                  </div>

                  <span className="shrink-0 text-muted/50">→</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      ))}
    </div>
  )
}
