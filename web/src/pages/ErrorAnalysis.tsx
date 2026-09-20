import { useEffect, useState } from 'react'
import { api, assetUrl, type ErrorAnalysis } from '../api'
import { Badge, Card, Empty, ErrorState, Kicker, Loading, SectionTitle, cx, pct } from '../components/ui'

export default function ErrorAnalysisPage() {
  const [data, setData] = useState<ErrorAnalysis | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [runs, setRuns] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api
      .models()
      .then((r) => {
        if (!alive) return
        const evaluated = r.models.filter((m) => m.evaluation_file).map((m) => m.run_id)
        setRuns(evaluated)
        if (evaluated.length === 0) setError('No evaluated runs yet — evaluate a checkpoint first.')
        setRunId((prev) => prev ?? evaluated[evaluated.length - 1] ?? null)
      })
      .catch(() => alive && setRuns([]))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!runId) return
    let alive = true
    setData(null)
    setError(null)
    api
      .errorAnalysis(runId)
      .then((r) => alive && (r.available ? setData(r) : setError(r.note ?? 'No evaluation available')))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'error analysis unavailable'))
    return () => {
      alive = false
    }
  }, [runId])

  const confusedWith = (cls: string) =>
    (data?.confusion_pairs_top ?? []).filter((p) => p.true_class === cls || p.predicted_class === cls)

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Error analysis"
        sub="Current measured lower-performing classes — with the confusion counts that support each observation."
        right={
          <select value={runId ?? ''} onChange={(e) => setRunId(e.target.value)} className="input !w-auto !py-1.5 text-xs" aria-label="Run">
            {runs.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        }
      />

      {error && <ErrorState message={error} />}
      {!data && !error && <Loading label="Loading error analysis" />}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.lower_performing?.map((r) => (
              <Card key={r.class} className="border-amber/30">
                <div className="flex items-center gap-2">
                  <span className="text-[16px] font-bold capitalize text-ink">{r.class}</span>
                  <Badge tone="warn">F1 {pct(r.f1, 1)}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[11px]">
                  {[
                    ['precision', r.precision],
                    ['recall', r.recall],
                    ['support', r.support],
                  ].map(([k, v]) => (
                    <div key={k as string} className="rounded-lg bg-surface2/60 px-2 py-1.5 text-center">
                      <div className="text-muted/70">{k}</div>
                      <div className="mt-0.5 text-ink">{typeof v === 'number' && k !== 'support' ? pct(v, 1) : v}</div>
                    </div>
                  ))}
                </div>
                {confusedWith(r.class).length > 0 && (
                  <div className="mt-3">
                    <Kicker>Measured confusions</Kicker>
                    <div className="mt-1.5 space-y-1">
                      {confusedWith(r.class).map((p) => (
                        <div key={`${p.true_class}-${p.predicted_class}`} className="flex justify-between text-xs">
                          <span className="capitalize text-muted">
                            {p.true_class} → {p.predicted_class}
                          </span>
                          <span className="font-mono tabular-nums text-ink">{p.count} images</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
          {(!data.lower_performing || data.lower_performing.length === 0) && (
            <Empty title="No classes below the 0.96 F1 threshold" hint="Every measured class meets the bar on this run." />
          )}

          <Card>
            <Kicker>Potential error patterns (observed, not diagnosed)</Kicker>
            <div className="mt-3 space-y-1.5">
              {(data.confusion_pairs_top ?? []).slice(0, 8).map((p) => (
                <div key={`${p.true_class}-${p.predicted_class}`} className={cx('flex items-center gap-3 text-sm')}>
                  <span className="w-40 shrink-0 capitalize text-muted">
                    {p.true_class} → {p.predicted_class}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface2">
                    <div
                      className="h-full rounded-full bg-amber"
                      style={{ width: `${Math.min(100, (p.count / Math.max(1, data.confusion_pairs_top![0].count)) * 100)}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-ink">{p.count} images</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              These are factual test-set confusion counts from {data.evaluation_file} ({data.num_samples} samples).
              They describe what was mixed up — not why. Causal claims would need further evidence.
            </p>
          </Card>

          <MisclassifiedSamples classes={data.classes ?? []} runId={data.run_id} />
        </>
      )}
    </div>
  )
}

function MisclassifiedSamples({ classes, runId }: { classes: string[]; runId: string }) {
  const [actual, setActual] = useState('')
  const [predicted, setPredicted] = useState('')
  const [minConf, setMinConf] = useState('')
  const [errType, setErrType] = useState<'all' | 'high' | 'low'>('all')
  const [examples, setExamples] = useState<import('../api').MisclassifiedExample[] | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!actual || !predicted) {
      setExamples(null)
      return
    }
    let alive = true
    setExamples(null)
    setErr('')
    api
      .misclassified(actual, predicted)
      .then((r) => alive && setExamples(r.examples))
      .catch((e: Error) => alive && setErr(e.message))
    return () => {
      alive = false
    }
  }, [actual, predicted])

  const filtered = (examples ?? []).filter((ex) => {
    if (minConf !== '' && ex.confidence < Number(minConf)) return false
    if (errType === 'high' && ex.confidence < 0.6) return false
    if (errType === 'low' && ex.confidence >= 0.6) return false
    return true
  })

  return (
    <Card>
      <Kicker>Misclassified samples (frozen test set — inspection only)</Kicker>
      <p className="mt-1 mb-3 text-xs text-muted">
        Model {runId} · EcoSort Dataset v3 test split. These images can never enter training.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={actual} onChange={(e) => setActual(e.target.value)} className="input !w-auto !py-1.5 text-xs" aria-label="Actual class">
          <option value="">Actual class…</option>
          {classes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={predicted} onChange={(e) => setPredicted(e.target.value)} className="input !w-auto !py-1.5 text-xs" aria-label="Predicted class">
          <option value="">Predicted class…</option>
          {classes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={errType} onChange={(e) => setErrType(e.target.value as 'all' | 'high' | 'low')} className="input !w-auto !py-1.5 text-xs" aria-label="Error type">
          <option value="all">All errors</option>
          <option value="high">High-confidence incorrect (≥ 0.60)</option>
          <option value="low">Low-confidence incorrect (&lt; 0.60)</option>
        </select>
        <input
          value={minConf}
          onChange={(e) => setMinConf(e.target.value)}
          placeholder="Min confidence"
          inputMode="decimal"
          className="input !w-32 !py-1.5 text-xs"
          aria-label="Minimum confidence"
        />
        {(actual || predicted || minConf || errType !== 'all') && (
          <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => { setActual(''); setPredicted(''); setMinConf(''); setErrType('all') }}>
            Clear
          </button>
        )}
      </div>

      {err && <ErrorState message={err} />}
      {actual && predicted && !err && examples === null && <Loading label="Loading samples" />}
      {examples && (
        <>
          <p className="mt-3 text-xs text-muted">
            Showing {filtered.length} of {examples.length} stored samples for {actual} → {predicted}.
          </p>
          {filtered.length === 0 ? (
            <div className="mt-3"><Empty title="No samples match these filters" icon="—" /></div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {filtered.map((ex) => (
                <figure key={ex.path} className="overflow-hidden rounded-xl border border-line bg-surface2">
                  <img src={assetUrl(ex.url)} alt={`${ex.true_class} misclassified as ${ex.predicted_class}`} loading="lazy" className="aspect-square w-full object-cover" />
                  <figcaption className="space-y-0.5 p-2">
                    <div className="text-[11px] capitalize text-ink">true: <span className="text-emerald">{ex.true_class}</span></div>
                    <div className="text-[11px] capitalize text-muted">pred: <span className="text-rose">{ex.predicted_class}</span></div>
                    <div className="font-mono text-[10px] tabular-nums text-muted">{pct(ex.confidence, 1)}</div>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  )
}
