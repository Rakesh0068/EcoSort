import { useEffect, useState } from 'react'
import { api, type Analytics } from '../api'
import { Card, ErrorState, Kicker, Loading, MetricRow, SectionTitle, Stat, ms, pct } from '../components/ui'

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api
      .analytics()
      .then((r) => alive && (setData(r), setError(null)))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'analytics unavailable'))
    return () => {
      alive = false
    }
  }, [])

  if (error) return <ErrorState message={error} />
  if (!data) return <Loading label="Loading analytics" />

  const top = Object.entries(data.by_class).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...top.map(([, n]) => n))

  return (
    <div className="space-y-5">
      <SectionTitle title="Analytics" sub="Computed from stored prediction and correction records — nothing sampled, nothing estimated." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total predictions" value={data.total_predictions.toLocaleString()} sub={`${Object.keys(data.by_model).length} model version(s) observed`} />
        <Stat label="Average confidence" value={pct(data.average_confidence, 1)} sub={`${data.low_confidence} low · ${data.moderate_confidence} moderate`} />
        <Stat label="Feedback rate" value={pct(data.feedback_rate, 1)} sub={`${data.corrected_predictions} marked wrong`} />
        <Stat label="Avg inference" value={ms(data.avg_inference_ms)} sub={`${data.latency_samples} measured requests`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <Kicker>Predictions by class</Kicker>
          <div className="mt-4 space-y-2">
            {top.length === 0 && <p className="text-xs text-muted">No predictions recorded yet.</p>}
            {top.map(([c, n]) => (
              <div key={c} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-[11px] capitalize text-muted">{c}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface2">
                  <div className="h-full rounded-full bg-emerald" style={{ width: `${Math.max(3, (n / max) * 100)}%` }} />
                </div>
                <span className="w-10 text-right font-mono text-[11px] tabular-nums text-ink">{n}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <Kicker>System detail</Kicker>
          <div className="mt-3">
            <MetricRow label="Predictions by model" value={`${Object.keys(data.by_model).length} versions`} />
            {Object.entries(data.by_model).map(([m, n]) => (
              <MetricRow key={m} label={m} value={String(n)} />
            ))}
            <MetricRow label="Corrected predictions" value={String(data.corrected_predictions)} />
            <MetricRow label="Low-confidence predictions" value={String(data.low_confidence)} />
          </div>
        </Card>
      </div>
    </div>
  )
}
