import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Evaluation, type MisclassifiedExample } from '../api'
import {
  Badge,
  Card,
  Empty,
  ErrorState,
  Kicker,
  Loading,
  MetricRow,
  SectionTitle,
  Stat,
  cx,
  pct,
} from '../components/ui'

const cellTone = (frac: number) => `rgba(251, 113, 133, ${0.08 + 0.72 * frac})`
const diagTone = (frac: number) => `rgba(52, 211, 153, ${0.10 + 0.72 * frac})`

export default function Evaluation() {
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [pair, setPair] = useState<{ true: string; pred: string } | null>(null)
  const [examples, setExamples] = useState<MisclassifiedExample[]>([])
  const [examplesLoading, setExamplesLoading] = useState(false)
  const [examplesError, setExamplesError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.metrics()
      if (r.available && r.evaluation) setEvaluation(r.evaluation)
      else setNote(r.note ?? 'No evaluation available yet.')
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load evaluation')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openPair = useCallback(async (trueClass: string, predClass: string) => {
    setPair({ true: trueClass, pred: predClass })
    setExamplesLoading(true)
    setExamplesError(null)
    try {
      const r = await api.misclassified(trueClass, predClass)
      setExamples(r.examples)
    } catch (e) {
      setExamplesError(e instanceof Error ? e.message : 'failed to load examples')
      setExamples([])
    } finally {
      setExamplesLoading(false)
    }
  }, [])

  const classes = evaluation?.classes ?? []
  const cm = evaluation?.confusion_matrix ?? []

  const rowSums = useMemo(() => cm.map((row) => row.reduce((a, b) => a + b, 0)), [cm])
  const maxOffDiag = useMemo(
    () =>
      cm.reduce(
        (max, row, i) => Math.max(max, ...row.filter((_, j) => j !== i)),
        0,
      ),
    [cm],
  )

  if (loading) return <Loading label="Loading evaluation" />

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Model Evaluation"
        sub="Held-out test-set audit of the trained checkpoint — confusion, per-class quality and selective accuracy."
        right={
          evaluation ? (
            <Badge tone="info">
              {evaluation.architecture} · {evaluation.weights} · {evaluation.num_samples} samples
            </Badge>
          ) : undefined
        }
      />

      {error && <ErrorState message={error} />}

      {!evaluation && !error && (
        <Empty
          title="No evaluation has been run yet"
          hint={note ?? undefined}
          icon="◈"
        />
      )}

      {evaluation && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Test accuracy"
              value={pct(evaluation.metrics.accuracy, 2)}
              sub={`${evaluation.num_samples} held-out samples`}
            />
            <Stat
              label="F1 (macro)"
              value={pct(evaluation.metrics.f1_macro, 2)}
              sub={`weighted ${pct(evaluation.metrics.f1_weighted, 2)}`}
            />
            <Stat
              label="Precision (macro)"
              value={pct(evaluation.metrics.precision_macro, 2)}
              sub={`weighted ${pct(evaluation.metrics.precision_weighted, 2)}`}
            />
            <Stat
              label="Recall (macro)"
              value={pct(evaluation.metrics.recall_macro, 2)}
              sub={`weighted ${pct(evaluation.metrics.recall_weighted, 2)}`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Per-class quality */}
            <Card>
              <Kicker>Per-class metrics — {evaluation.split} split</Kicker>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line font-mono text-[10px] uppercase tracking-wider text-muted">
                      <th className="py-2 pr-3 font-medium">Class</th>
                      <th className="py-2 pr-3 text-right font-medium">Precision</th>
                      <th className="py-2 pr-3 text-right font-medium">Recall</th>
                      <th className="py-2 pr-3 text-right font-medium">F1</th>
                      <th className="py-2 text-right font-medium">Support</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map((c) => {
                      const m = evaluation.metrics.per_class[c]
                      if (!m) return null
                      return (
                        <tr key={c} className="border-b border-line/50 last:border-0">
                          <td className="py-2 pr-3 font-medium capitalize text-ink">{c}</td>
                          <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-muted">
                            {pct(m.precision, 1)}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-muted">
                            {pct(m.recall, 1)}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums">
                            <span className={m.f1 < 0.9 ? 'text-amber' : 'text-emerald'}>{pct(m.f1, 1)}</span>
                          </td>
                          <td className="py-2 text-right font-mono text-xs tabular-nums text-muted">{m.support}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Confidence + selective accuracy */}
            <Card>
              <Kicker>Confidence behaviour</Kicker>
              <div className="mt-3">
                <MetricRow
                  label="Mean confidence"
                  value={evaluation.confidence_distribution.mean != null
                    ? pct(evaluation.confidence_distribution.mean, 2)
                    : '—'}
                />
                <MetricRow
                  label="Median confidence"
                  value={evaluation.confidence_distribution.median != null
                    ? pct(evaluation.confidence_distribution.median, 2)
                    : '—'}
                />
                <MetricRow
                  label="Below threshold"
                  value={`${evaluation.confidence_distribution.below_threshold} samples (< ${pct(
                    evaluation.confidence_distribution.threshold,
                    0,
                  )})`}
                />
              </div>
              <div className="mt-5">
                <Kicker>Selective accuracy — accuracy when the model is allowed to abstain</Kicker>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-line font-mono text-[10px] uppercase tracking-wider text-muted">
                        <th className="py-2 pr-3 font-medium">Min confidence</th>
                        <th className="py-2 pr-3 text-right font-medium">Coverage</th>
                        <th className="py-2 pr-3 text-right font-medium">Accuracy</th>
                        <th className="py-2 text-right font-medium">Samples</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evaluation.selective_accuracy.map((s) => (
                        <tr key={s.threshold} className="border-b border-line/50 last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs text-ink">{pct(s.threshold, 0)}</td>
                          <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-muted">
                            {pct(s.coverage, 1)}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-emerald">
                            {s.accuracy != null ? pct(s.accuracy, 2) : '—'}
                          </td>
                          <td className="py-2 text-right font-mono text-xs tabular-nums text-muted">{s.samples}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          </div>

          {/* Confusion matrix */}
          <Card className="overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Kicker>Confusion matrix — rows are true class, columns are predictions</Kicker>
              <span className="font-mono text-[10px] text-muted">
                click an off-diagonal cell to inspect errors
              </span>
            </div>
            <div className="mt-4 inline-block min-w-full">
              <div
                className="grid gap-px"
                style={{ gridTemplateColumns: `3.5rem repeat(${classes.length}, minmax(2.4rem, 1fr))` }}
              >
                <div />
                {classes.map((c) => (
                  <div key={`h-${c}`} className="pb-1 text-center font-mono text-[9px] uppercase text-muted">
                    {c.slice(0, 5)}
                  </div>
                ))}
                {cm.map((row, i) => (
                  <Fragment key={`row-${classes[i]}`}>
                    <div
                      className="flex items-center justify-end pr-2 font-mono text-[9px] uppercase text-muted"
                      title={classes[i]}
                    >
                      {classes[i].slice(0, 6)}
                    </div>
                    {row.map((v, j) => {
                      const frac = rowSums[i] > 0 ? v / rowSums[i] : 0
                      const diag = i === j
                      const clickable = !diag && v > 0
                      return (
                        <button
                          key={`c-${classes[i]}-${classes[j]}`}
                          disabled={!clickable}
                          onClick={() => clickable && void openPair(classes[i], classes[j])}
                          title={`${classes[i]} → ${classes[j]}: ${v}`}
                          className={cx(
                            'aspect-square rounded-[4px] font-mono text-[9px] tabular-nums transition-transform',
                            clickable && 'cursor-pointer hover:scale-110 hover:ring-1 hover:ring-rose',
                            !clickable && 'cursor-default',
                            frac > 0.5 ? 'text-white' : diag ? 'text-emerald' : 'text-ink',
                          )}
                          style={{ background: diag ? diagTone(frac) : cellTone(frac) }}
                        >
                          {v > 0 ? v : ''}
                        </button>
                      )
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          </Card>

          {/* Confusion pairs + examples */}
          <Card>
            <Kicker>Most frequent confusions</Kicker>
            <div className="mt-4 flex flex-wrap gap-2">
              {evaluation.confusion_pairs_top.map((p) => (
                <button
                  key={`${p.true_class}-${p.predicted_class}`}
                  onClick={() => void openPair(p.true_class, p.predicted_class)}
                  className={cx(
                    'rounded-lg border px-3 py-1.5 text-xs transition-colors',
                    pair?.true === p.true_class && pair?.pred === p.predicted_class
                      ? 'border-rose/50 bg-rose/10 text-ink'
                      : 'border-line bg-surface2/50 text-muted hover:border-rose/40 hover:text-ink',
                  )}
                >
                  <span className="font-semibold capitalize">{p.true_class}</span>
                  <span className="mx-1.5 text-rose">→</span>
                  <span className="font-semibold capitalize">{p.predicted_class}</span>
                  <span className="ml-2 font-mono text-[10px] text-muted">×{p.count}</span>
                </button>
              ))}
            </div>

            {pair && (
              <div className="mt-5 border-t border-line pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-ink">
                    True <span className="capitalize">{pair.true}</span> predicted as{' '}
                    <span className="capitalize">{pair.pred}</span>
                  </div>
                  <button className="btn-ghost !px-2.5 !py-1 text-[11px]" onClick={() => setPair(null)}>
                    Close
                  </button>
                </div>

                {examplesLoading && <Loading label="Fetching examples" />}
                {examplesError && <ErrorState message={examplesError} />}

                {!examplesLoading && !examplesError && examples.length === 0 && (
                  <p className="mt-3 text-xs text-muted">No stored examples for this pair.</p>
                )}

                {examples.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {examples.map((ex, i) => (
                      <figure key={`${ex.path}-${i}`} className="group">
                        <div className="overflow-hidden rounded-xl border border-line bg-surface2">
                          <img
                            src={ex.url}
                            alt={`${ex.true_class} misread as ${ex.predicted_class}`}
                            loading="lazy"
                            className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        </div>
                        <figcaption className="mt-1.5 space-y-0.5">
                          <div className="font-mono text-[10px] text-rose">
                            conf {pct(ex.confidence, 0)}
                          </div>
                          <div className="font-mono text-[10px] text-muted">
                            true conf {pct(ex.true_confidence, 0)}
                          </div>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          <p className="text-[11px] text-muted">
            Generated {new Date(evaluation.generated_at).toLocaleString()} · checkpoint{' '}
            <span className="font-mono">{evaluation.checkpoint}</span> · best training val accuracy{' '}
            {pct(evaluation.training_best_val_acc, 2)} · max off-diagonal count {maxOffDiag}
          </p>
        </>
      )}
    </div>
  )
}
