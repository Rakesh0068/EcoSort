import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api, assetUrl, type Evaluation, type MisclassifiedExample } from '../api'
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

/** Cell the user clicked in the confusion matrix. */
type Cell = { t: number; p: number }

export default function EvaluationPage() {
  const [data, setData] = useState<Evaluation | null>(null)
  const [error, setError] = useState('')
  const [cell, setCell] = useState<Cell | null>(null)
  const [examples, setExamples] = useState<MisclassifiedExample[] | null>(null)
  const [exError, setExError] = useState('')

  useEffect(() => {
    let live = true
    api
      .metrics()
      .then((r) => {
        if (!live) return
        if (r.available && r.evaluation) setData(r.evaluation)
        else setError(r.note ?? 'No evaluation available.')
      })
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [])

  const ev = data

  // Load real misclassified photos whenever the selected matrix cell changes.
  useEffect(() => {
    if (!ev || !cell) {
      setExamples(null)
      return
    }
    let live = true
    setExamples(null)
    setExError('')
    api
      .misclassified(ev.classes[cell.t], ev.classes[cell.p])
      .then((r) => live && setExamples(r.examples))
      .catch((e: Error) => {
        if (live) setExError(e.message)
      })
    return () => {
      live = false
    }
  }, [ev, cell])

  const perClass = useMemo(
    () => (ev ? ev.classes.map((c) => ({ cls: c, ...(ev.metrics.per_class[c] ?? {}) })) : []),
    [ev],
  )

  if (error) return <ErrorState message={error} />
  if (!ev) return <Loading label="Loading evaluation" />

  const m = ev.metrics
  const maxCell = Math.max(1, ...ev.confusion_matrix.flat())
  const gate = ev.selective_accuracy.find((s) => Math.abs(s.threshold - ev.confidence_distribution.threshold) < 1e-9)

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Evaluation"
        sub={`Measured on the held-out ${ev.split} split — never used for training or validation.`}
        right={
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="info">{ev.run_id}</Badge>
            <Badge>{ev.architecture}</Badge>
            <Badge tone="good">{ev.num_samples} samples</Badge>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Accuracy" value={pct(m.accuracy, 2)} sub={`${ev.num_samples} test images`} />
        <Stat label="Precision (macro)" value={pct(m.precision_macro, 2)} sub="Unweighted mean over 10 classes" />
        <Stat label="Recall (macro)" value={pct(m.recall_macro, 2)} sub="Unweighted mean over 10 classes" />
        <Stat label="F1 (macro)" value={pct(m.f1_macro, 2)} sub={`Weighted F1 ${pct(m.f1_weighted, 2)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Class performance */}
        <Card className="lg:col-span-2">
          <Kicker>Class performance</Kicker>
          <p className="mt-1 mb-4 text-xs text-muted">
            Sorted by F1. Support is the true number of test images in that class, so the weaker rows show where the
            dataset is thin rather than where the model is merely noisy.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Class</th>
                  <th className="py-2 pr-3 font-medium">F1</th>
                  <th className="py-2 pr-3 font-medium">Precision</th>
                  <th className="py-2 pr-3 font-medium">Recall</th>
                  <th className="py-2 pr-3 text-right font-medium">Support</th>
                </tr>
              </thead>
              <tbody>
                {[...perClass]
                  .sort((a, b) => (b.f1 ?? 0) - (a.f1 ?? 0))
                  .map((r) => (
                    <tr key={r.cls} className="border-b border-line/50 last:border-0">
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="capitalize text-ink">{r.cls}</span>
                          {(r.f1 ?? 0) < 0.9 && <Badge tone="warn">weak</Badge>}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface2">
                            <div
                              className="h-full rounded-full bg-emerald transition-[width] duration-700"
                              style={{ width: `${(r.f1 ?? 0) * 100}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs tabular-nums">{pct(r.f1, 1)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-muted">{pct(r.precision, 1)}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-muted">{pct(r.recall, 1)}</td>
                      <td className="py-2.5 pr-3 text-right font-mono text-xs tabular-nums text-muted">{r.support}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          {/* Confidence gate evidence */}
          <Card>
            <Kicker>Confidence gate</Kicker>
            <p className="mt-1 mb-3 text-xs text-muted">
              Accuracy on the subset of predictions the model is confident about, versus how much of the test set that
              subset covers. This curve is why the robot refuses to actuate below the threshold.
            </p>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ev.selective_accuracy} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
                  <CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="coverage"
                    type="number"
                    domain={[0, 1]}
                    tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                    stroke="rgb(var(--muted))"
                    fontSize={11}
                  />
                  <YAxis
                    domain={[0.85, 1]}
                    tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                    stroke="rgb(var(--muted))"
                    fontSize={11}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgb(var(--surface))',
                      border: '1px solid rgb(var(--line))',
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(v: number, n: string) => [pct(v, 2), n]}
                    labelFormatter={(v: number) => `Coverage ${pct(v, 1)}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    name="Accuracy"
                    stroke="rgb(var(--emerald))"
                    strokeWidth={2}
                    dot={{ r: 2.5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3">
              <MetricRow label="Threshold" value={pct(ev.confidence_distribution.threshold, 0)} />
              <MetricRow
                label="Accuracy above it"
                value={gate ? pct(gate.accuracy, 2) : '—'}
              />
              <MetricRow label="Coverage above it" value={gate ? pct(gate.coverage, 1) : '—'} />
              <MetricRow
                label="Test images held"
                value={`${ev.confidence_distribution.below_threshold} of ${ev.num_samples}`}
              />
            </div>
          </Card>

          <Card>
            <Kicker>Run</Kicker>
            <div className="mt-3">
              <MetricRow label="Checkpoint" value={ev.weights} />
              <MetricRow label="Split" value={ev.split} />
              <MetricRow label="Best val acc" value={pct(ev.training_best_val_acc, 2)} />
              <MetricRow label="Test accuracy" value={pct(m.accuracy, 2)} />
              <MetricRow label="Generated" value={ev.generated_at.replace('T', ' ')} />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              Validation and test accuracy differ by{' '}
              {ev.training_best_val_acc != null
                ? `${((m.accuracy - ev.training_best_val_acc) * 100).toFixed(2)} pts`
                : '—'}
              . Both are reported so the gap between them is visible rather than hidden.
            </p>
          </Card>
        </div>
      </div>

      {/* Confusion matrix */}
      <Card>
        <Kicker>Confusion matrix</Kicker>
        <p className="mt-1 mb-4 text-xs text-muted">
          Rows are the true class, columns are what the model predicted. Click any off-diagonal cell to see the actual
          images that were confused.
        </p>
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            <div className="flex">
              <div className="w-20 shrink-0" />
              {ev.classes.map((c) => (
                <div
                  key={`h-${c}`}
                  className="flex h-16 w-12 shrink-0 items-end justify-center pb-1 sm:w-14"
                  title={`Predicted: ${c}`}
                >
                  <span className="rotate-[-60deg] whitespace-nowrap text-[10px] capitalize text-muted">{c}</span>
                </div>
              ))}
            </div>
            {ev.classes.map((tc, ti) => (
              <div key={`r-${tc}`} className="flex items-center">
                <div className="w-20 shrink-0 truncate pr-2 text-right text-[11px] capitalize text-muted" title={tc}>
                  {tc}
                </div>
                {ev.confusion_matrix[ti].map((n, pi) => {
                  const diag = ti === pi
                  const selected = cell?.t === ti && cell?.p === pi
                  const intensity = diag ? 0.12 + 0.88 * (n / maxCell) : n > 0 ? 0.15 + 0.6 * (n / maxCell) : 0
                  return (
                    <button
                      key={`c-${tc}-${pi}`}
                      disabled={diag || n === 0}
                      onClick={() => setCell(selected ? null : { t: ti, p: pi })}
                      className={cx(
                        'flex h-9 w-12 shrink-0 items-center justify-center border border-line/40 font-mono text-[11px] tabular-nums transition sm:w-14',
                        diag
                          ? 'cursor-default text-ink'
                          : n > 0
                            ? 'cursor-pointer text-ink hover:z-10 hover:ring-2 hover:ring-emerald'
                            : 'cursor-default text-muted/40',
                        selected && 'ring-2 ring-emerald',
                      )}
                      style={{
                        background: diag
                          ? `rgb(var(--emerald) / ${intensity})`
                          : n > 0
                            ? `rgb(var(--rose) / ${intensity})`
                            : 'transparent',
                      }}
                      title={diag ? `${tc}: ${n} correct` : `${tc} predicted as ${ev.classes[pi]}: ${n}`}
                    >
                      {n || ''}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Top confusion pairs */}
        <div className="mt-5">
          <Kicker>Most frequent confusions</Kicker>
          <div className="mt-3 flex flex-wrap gap-2">
            {ev.confusion_pairs_top.slice(0, 10).map((p) => (
              <button
                key={`${p.true_class}-${p.predicted_class}`}
                onClick={() => {
                  const t = ev.classes.indexOf(p.true_class)
                  const q = ev.classes.indexOf(p.predicted_class)
                  if (t >= 0 && q >= 0) setCell({ t, p: q })
                }}
                className="rounded-full border border-line bg-surface2 px-3 py-1.5 text-xs capitalize text-muted transition hover:border-emerald/40 hover:text-ink"
              >
                {p.true_class} → {p.predicted_class}
                <span className="ml-2 font-mono text-[11px] text-ink">{p.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Misclassified examples for the selected cell */}
        {cell && (
          <div className="mt-5 border-t border-line pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Kicker className="mr-auto">
                Misclassified · {ev.classes[cell.t]} predicted as {ev.classes[cell.p]}
              </Kicker>
              <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setCell(null)}>
                Close
              </button>
            </div>
            {exError && <ErrorState message={exError} />}
            {!exError && examples === null && <Loading label="Loading images" />}
            {!exError && examples?.length === 0 && (
              <Empty title="No stored examples for this pair" icon="—" />
            )}
            {examples && examples.length > 0 && (
              <>
                <p className="mt-1 mb-3 text-xs text-muted">
                  Real test-split images, with the confidence the model assigned to the wrong class.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {examples.map((ex) => (
                    <figure key={ex.path} className="overflow-hidden rounded-xl border border-line bg-surface2">
                      <img
                        src={assetUrl(ex.url)}
                        alt={`${ex.true_class} predicted as ${ex.predicted_class}`}
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                      />
                      <figcaption className="space-y-0.5 p-2">
                        <div className="text-[11px] capitalize text-ink">
                          true: <span className="text-emerald">{ex.true_class}</span>
                        </div>
                        <div className="text-[11px] capitalize text-muted">
                          pred: <span className="text-rose">{ex.predicted_class}</span>
                        </div>
                        <div className="font-mono text-[10px] tabular-nums text-muted">
                          {pct(ex.confidence, 1)}
                        </div>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      <Card>
        <Kicker>Confidence distribution</Kicker>
        <div className="mt-3 grid gap-4 sm:grid-cols-4">
          <MetricRow label="Mean" value={pct(ev.confidence_distribution.mean, 2)} />
          <MetricRow label="Median" value={pct(ev.confidence_distribution.median, 2)} />
          <MetricRow label="Below threshold" value={String(ev.confidence_distribution.below_threshold)} />
          <MetricRow label="Total" value={String(ev.num_samples)} />
        </div>
      </Card>

      <Card>
        <Kicker>Evaluation metadata</Kicker>
        <div className="mt-3">
          <MetricRow label="Evaluation" value={`${ev.run_id}_${ev.weights.replace('.pt', '')}`} />
          <MetricRow label="Run" value={ev.run_id} />
          <MetricRow label="Checkpoint" value={<span className="break-all">{ev.checkpoint}</span>} />
          <MetricRow label="Test samples" value={String(ev.num_samples)} />
          <MetricRow label="Split" value={ev.split} />
          <MetricRow label="Generated" value={new Date(ev.generated_at).toLocaleString()} />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Measured on the held-out EcoSort test set — images the model never trained on. For the dataset version
          behind this run, see Research → Models.
        </p>
      </Card>
    </div>
  )
}
