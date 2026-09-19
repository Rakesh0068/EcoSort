import { useCallback, useEffect, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api, type RunMetrics } from '../api'
import {
  Badge,
  Card,
  ErrorState,
  Kicker,
  Loading,
  MetricRow,
  SectionTitle,
  Stat,
  StatusDot,
  cx,
  pct,
} from '../components/ui'

interface RunEntry {
  run_id: string
  metrics: RunMetrics | null
  checkpoints: string[]
}

const DEFAULTS = {
  epochs_head: 5,
  epochs_finetune: 15,
  batch_size: 32,
  lr_head: 0.001,
  lr_finetune: 0.0001,
}

export default function Training() {
  const [runs, setRuns] = useState<RunEntry[]>([])
  const [active, setActive] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [cfg, setCfg] = useState(DEFAULTS)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const t = await api.trainingStatus()
      setRuns(t.runs)
      setActive(t.active)
      setSelected((prev) => prev ?? t.latest?.run_id ?? t.runs[0]?.run_id ?? null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'training status unavailable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [load])

  const current = runs.find((r) => r.run_id === selected)?.metrics ?? null

  const start = async () => {
    setStarting(true)
    setError(null)
    setNotice(null)
    try {
      const r = await api.startTraining({ ...cfg, resume: null })
      setNotice(`Training started as ${r.run_id} (pid ${r.pid}). Metrics stream in live below.`)
      setSelected(r.run_id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not start training')
    } finally {
      setStarting(false)
    }
  }

  if (loading) return <Loading label="Loading training center" />

  const history = current?.history ?? []
  const running = current?.status === 'running'
  const last = history[history.length - 1]

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Training Center"
        sub="Real PyTorch transfer-learning runs on your GPU. Metrics below are streamed from the training process, never simulated."
        right={
          <Badge tone={active ? 'info' : 'neutral'}>
            <StatusDot tone={active ? 'lime' : 'muted'} pulse={active} />
            {active ? 'training active' : 'idle'}
          </Badge>
        }
      />

      {error && <ErrorState message={error} />}
      {notice && (
        <Card className="border-emerald/30 bg-emerald/[0.06]">
          <p className="text-xs text-ink">{notice}</p>
        </Card>
      )}

      {!current ? (
        <Card>
          <Empty2 />
        </Card>
      ) : (
        <>
          {/* Live run */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-bold uppercase tracking-wider text-ink">
                  Training {current.run_id}
                </span>
                <Badge tone={running ? 'info' : current.status === 'completed' ? 'good' : 'warn'}>
                  <StatusDot tone={running ? 'lime' : 'emerald'} pulse={running} />
                  {current.status}
                </Badge>
                <span className="chip">{current.phase}</span>
              </div>
              <span className="font-mono text-xs text-muted">
                epoch {current.epoch} / {current.total_epochs}
              </span>
            </div>

            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface2">
              <div
                className={cx(
                  'h-full rounded-full transition-[width] duration-700 ease-spring',
                  running ? 'bg-gradient-to-r from-emerald to-lime' : 'bg-emerald',
                )}
                style={{ width: `${Math.round(current.progress * 100)}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 font-mono text-[11px] text-muted">
              <span>
                {Math.round(current.progress * 100)}% complete
                {current.step != null && current.steps_per_epoch != null
                  ? ` · step ${current.step}/${current.steps_per_epoch}`
                  : ''}
              </span>
              <span>
                {current.eta_seconds != null && running
                  ? `ETA ${Math.floor(current.eta_seconds / 60)}m ${current.eta_seconds % 60}s`
                  : current.updated_at
                    ? `updated ${current.updated_at.replace('T', ' ')}`
                    : ''}
              </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Loss" value={last ? last.train_loss.toFixed(4) : '—'} sub="train, weighted sampler" />
              <Stat
                label="Accuracy"
                value={pct(last?.train_acc ?? null, 2)}
                sub={last ? `phase ${last.phase} · lr ${last.lr.toExponential(1)}` : '—'}
              />
              <Stat
                label="Validation"
                value={pct(last?.val_acc ?? null, 2)}
                sub={`best ${pct(current.best_val_acc, 2)}`}
              />
              <Stat
                label="Epoch time"
                value={last ? `${last.seconds.toFixed(0)}s` : '—'}
                sub={current.device ?? '—'}
              />
            </div>
          </Card>

          {/* Curves */}
          <Card>
            <div className="flex items-center justify-between">
              <Kicker>Training curves</Kicker>
              <span className="font-mono text-[11px] text-muted">{history.length} epochs recorded</span>
            </div>
            <div className="mt-4 h-72">
              {history.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" />
                    <XAxis
                      dataKey="epoch"
                      tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 1]}
                      tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'rgb(var(--surface))',
                        border: '1px solid rgb(var(--line))',
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                      formatter={(v: number, n: string) => [
                        n.includes('loss') ? Number(v).toFixed(4) : pct(Number(v), 2),
                        n,
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey="train_acc"
                      name="train accuracy"
                      stroke="rgb(var(--lime))"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="val_acc"
                      name="val accuracy"
                      stroke="rgb(var(--emerald))"
                      strokeWidth={2.5}
                      dot={{ r: 2.5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="train_loss"
                      name="train loss"
                      stroke="rgb(var(--amber))"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="val_loss"
                      name="val loss"
                      stroke="rgb(var(--rose))"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="grid h-full place-items-center text-sm text-muted">
                  No epochs recorded yet — curves appear as training progresses.
                </div>
              )}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Config / start */}
            <Card>
              <Kicker>New training run</Kicker>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['epochs_head', 'Head epochs', 'frozen backbone', 1, 50, 1],
                    ['epochs_finetune', 'Fine-tune epochs', 'full network', 1, 100, 1],
                    ['batch_size', 'Batch size', 'GPU memory bound', 8, 128, 8],
                  ] as [keyof typeof DEFAULTS, string, string, number, number, number][]
                ).map(([key, label, hint, minV, maxV, stepV]) => (
                  <label key={key} className="block">
                    <span className="kicker">{label}</span>
                    <input
                      type="number"
                      min={minV}
                      max={maxV}
                      step={stepV}
                      value={cfg[key]}
                      onChange={(e) => setCfg({ ...cfg, [key]: Number(e.target.value) })}
                      className="input mt-1.5 font-mono"
                    />
                    <span className="mt-1 block text-[10px] text-muted/80">{hint}</span>
                  </label>
                ))}
                <label className="block">
                  <span className="kicker">Learning rate (head)</span>
                  <input
                    type="number"
                    step={0.0001}
                    min={0.00001}
                    value={cfg.lr_head}
                    onChange={(e) => setCfg({ ...cfg, lr_head: Number(e.target.value) })}
                    className="input mt-1.5 font-mono"
                  />
                </label>
                <label className="block">
                  <span className="kicker">Learning rate (fine-tune)</span>
                  <input
                    type="number"
                    step={0.00001}
                    min={0.000001}
                    value={cfg.lr_finetune}
                    onChange={(e) => setCfg({ ...cfg, lr_finetune: Number(e.target.value) })}
                    className="input mt-1.5 font-mono"
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-2 rounded-xl bg-surface2/50 p-3 sm:grid-cols-2">
                {[
                  ['Augmentation', 'ON — crop, flip, rotate, jitter, erasing'],
                  ['Transfer learning', 'ON — ImageNet EfficientNetB0'],
                  ['Class weighting', 'ON — weighted random sampler'],
                  ['Checkpointing', 'ON — best + last, resumable'],
                  ['Label smoothing', 'ON — 0.05'],
                  ['Mixed precision', 'ON — CUDA AMP'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-start gap-2">
                    <span className="mt-0.5 text-emerald">✓</span>
                    <span className="text-[11px] leading-snug text-muted">
                      <span className="font-semibold text-ink">{k}:</span> {v.replace(/^[A-Z]+ — /, '')}
                    </span>
                  </div>
                ))}
              </div>

              <button className="btn-primary mt-4 w-full" onClick={() => void start()} disabled={starting || active}>
                {starting ? 'Starting…' : active ? 'A run is already active' : 'Start training'}
              </button>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                Launches a real <span className="font-mono">python -m ml.train</span> subprocess on the GPU. Requires
                CUDA — the API refuses to start a CPU-only run.
              </p>
            </Card>

            {/* Params + runs */}
            <div className="space-y-4">
              <Card>
                <Kicker>Run parameters</Kicker>
                <div className="mt-3">
                  <MetricRow label="Architecture" value={current.run?.architecture ?? '—'} />
                  <MetricRow label="Pretrained" value={current.run?.pretrained ?? '—'} />
                  <MetricRow
                    label="Input"
                    value={current.run?.image_size ? `${current.run.image_size} × ${current.run.image_size}` : '—'}
                  />
                  <MetricRow label="Dataset" value={current.run?.dataset_variant ?? '—'} />
                  <MetricRow label="Device" value={current.device ?? '—'} />
                  <MetricRow
                    label="Parameters"
                    value={current.params ? `${(current.params.total / 1e6).toFixed(2)}M` : '—'}
                  />
                  <MetricRow
                    label="Trainable now"
                    value={
                      current.params
                        ? `${(current.params.trainable / 1e6).toFixed(2)}M (${current.params.frozen ? 'head only' : 'full'})`
                        : '—'
                    }
                  />
                  <MetricRow label="Best val accuracy" value={pct(current.best_val_acc, 2)} />
                  <MetricRow label="Checkpoints" value={runs.find((r) => r.run_id === selected)?.checkpoints.join(', ') ?? '—'} />
                </div>
              </Card>

              <Card>
                <Kicker>Training history</Kicker>
                <div className="mt-3 space-y-2">
                  {runs.length === 0 && <p className="text-xs text-muted">No runs recorded yet.</p>}
                  {[...runs].reverse().map((r) => {
                    const m = r.metrics
                    return (
                      <button
                        key={r.run_id}
                        onClick={() => setSelected(r.run_id)}
                        className={cx(
                          'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                          selected === r.run_id
                            ? 'border-emerald/40 bg-emerald/[0.07]'
                            : 'border-line bg-surface2/40 hover:border-emerald/30',
                        )}
                      >
                        <StatusDot
                          tone={m?.status === 'completed' ? 'emerald' : m?.status === 'running' ? 'lime' : 'muted'}
                          pulse={m?.status === 'running'}
                        />
                        <span className="font-mono text-xs font-semibold text-ink">{r.run_id}</span>
                        <span className="text-[11px] capitalize text-muted">{m?.phase ?? '—'}</span>
                        <span className="ml-auto text-right">
                          <span className="block font-mono text-xs tabular-nums text-ink">
                            {pct(m?.best_val_acc ?? null, 2)}
                          </span>
                          <span className="block font-mono text-[10px] text-muted">
                            {m ? `${m.epoch}/${m.total_epochs} ep` : 'no metrics'}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Empty2() {
  return (
    <div className="py-8 text-center">
      <div className="text-2xl text-muted/50">◍</div>
      <div className="mt-3 text-sm font-semibold text-ink">No training runs yet</div>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted">
        Configure the hyperparameters below and start a run. Training executes on the GPU and streams epoch metrics here
        in real time.
      </p>
    </div>
  )
}
