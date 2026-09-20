import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Scan } from '../api'
import { Badge, Card, Empty, ErrorState, Loading, SectionTitle, cx, pct, relTime } from '../components/ui'

export default function Predictions() {
  const [rows, setRows] = useState<Scan[]>([])
  const [models, setModels] = useState<string[]>([])
  const [model, setModel] = useState('')
  const [cls, setCls] = useState('')
  const [feedback, setFeedback] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const f: Record<string, string | number> = { limit: 200 }
    if (model) f.model = model
    if (cls) f.cls = cls
    if (feedback) f.feedback = feedback
    api
      .predictions(f)
      .then((r) => {
        if (!alive) return
        setRows(r.predictions)
        setModels((prev) => [...new Set([...prev, ...r.predictions.map((s) => s.model_version ?? 'unknown')])])
        setError(null)
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'predictions unavailable'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [model, cls, feedback])

  const classOptions = [...new Set(rows.map((s) => s.predicted_class))].sort()

  return (
    <div className="space-y-5">
      <SectionTitle title="Prediction log" sub="Every stored prediction, filterable by model, class, confidence and feedback." />

      <div className="flex flex-wrap items-center gap-2">
        <select value={model} onChange={(e) => setModel(e.target.value)} className="input !w-auto !py-1.5 text-xs" aria-label="Model">
          <option value="">All models</option>
          {models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select value={cls} onChange={(e) => setCls(e.target.value)} className="input !w-auto !py-1.5 text-xs" aria-label="Class">
          <option value="">All classes</option>
          {classOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={feedback} onChange={(e) => setFeedback(e.target.value)} className="input !w-auto !py-1.5 text-xs" aria-label="Feedback">
          <option value="">Any feedback</option>
          <option value="correct">Confirmed correct</option>
          <option value="incorrect">Marked wrong</option>
          <option value="none">No feedback</option>
        </select>
        {(model || cls || feedback) && (
          <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => { setModel(''); setCls(''); setFeedback('') }}>
            Clear
          </button>
        )}
      </div>

      {error && <ErrorState message={error} />}
      {loading && <Loading label="Loading predictions" />}
      {!loading && !error && rows.length === 0 && (
        <Empty title="No predictions match" hint="Run a scan, or clear the filters." icon="⌕" />
      )}

      <Card className="!p-0 overflow-hidden">
        <div className="divide-y divide-line/60">
          {rows.map((s) => (
            <Link key={s.id} to={`/scan?id=${s.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-surface2/60">
              <span className="min-w-0 flex-1 basis-48">
                <span className="text-sm font-semibold capitalize text-ink">{s.predicted_class}</span>
                <span className="ml-2 font-mono text-[11px] text-muted">{relTime(s.created_at)} · {s.model_version ?? 'unknown model'}</span>
              </span>
              <Badge tone={s.state === 'high' ? 'good' : s.state === 'moderate' ? 'warn' : 'bad'}>{pct(s.confidence, 1)}</Badge>
              {s.was_correct === 1 && <Badge tone="good">correct</Badge>}
              {s.was_correct === 0 && <Badge tone="bad">wrong → {s.corrected_class}</Badge>}
              <span className={cx('font-mono text-[11px]', s.action === 'SORT' ? 'text-emerald' : 'text-amber')}>{s.action}</span>
              <span className="text-muted/50">→</span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  )
}
