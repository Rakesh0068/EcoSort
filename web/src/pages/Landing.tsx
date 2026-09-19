import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, b64url, type DatasetInfo, type Health, type PredictionResult } from '../api'
import { useTheme } from '../theme'
import { Badge, Spinner, StatusDot, cx } from '../components/ui'

const PIPELINE = [
  { n: 'Dataset', d: '12,259 audited images' },
  { n: 'Preprocessing', d: '256² standardized → 224² crops' },
  { n: 'Augmentation', d: 'crop, flip, rotate, jitter, erasing' },
  { n: 'EfficientNetB0', d: 'ImageNet transfer learning' },
  { n: 'Training', d: 'frozen head → full fine-tune' },
  { n: 'Evaluation', d: 'held-out test split' },
  { n: 'Grad-CAM', d: 'activation-based explanation' },
  { n: 'Sorting decision', d: 'confidence-gated bin routing' },
  { n: 'Feedback', d: 'corrections → review queue' },
  { n: 'Retraining', d: 'verified labels feed the next run' },
]

function HeroScanner({
  dataset,
  onResult,
  busy,
  result,
  error,
}: {
  dataset: DatasetInfo | null
  onResult: () => void
  busy: boolean
  result: PredictionResult | null
  error: string | null
}) {
  const samples = dataset?.gallery ?? {}
  const classes = dataset?.classes ?? []
  const [idx, setIdx] = useState(0)

  const pool = useMemo(() => {
    const out: { cls: string; url: string }[] = []
    for (const c of classes) for (const url of samples[c] ?? []) out.push({ cls: c, url })
    return out
  }, [classes, samples])

  useEffect(() => {
    if (pool.length === 0 || result) return
    const id = setInterval(() => setIdx((i) => (i + 1) % pool.length), 3200)
    return () => clearInterval(id)
  }, [pool.length, result])

  const current = pool.length ? pool[idx % pool.length] : null

  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[32px] bg-emerald/10 blur-3xl" aria-hidden />
      <div className="relative overflow-hidden rounded-card border border-line bg-surface/70 shadow-lift backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="kicker">Live scanner</span>
          <span className="chip">
            <StatusDot tone={busy ? 'amber' : 'emerald'} />
            {busy ? 'inferring' : result ? 'result' : 'idle'}
          </span>
        </div>

        <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface2">
          {current ? (
            result ? (
              <img
                src={b64url(result.explainability.overlay_png_b64)}
                alt="Grad-CAM overlay of the scanned waste item"
                className="h-full w-full object-contain"
              />
            ) : (
              <img src={current.url} alt={`Sample waste: ${current.cls}`} className="h-full w-full object-cover" />
            )
          ) : (
            <div className="grid h-full w-full place-items-center text-sm text-muted">Loading dataset samples…</div>
          )}

          {/* Animated scan line */}
          <div
            className={cx(
              'pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-transparent via-emerald/25 to-transparent',
              !busy && 'animate-scanline',
            )}
            aria-hidden
          />
          {busy && (
            <div className="absolute inset-0 grid place-items-center bg-black/35 backdrop-blur-[2px]">
              <div className="flex items-center gap-2 rounded-full bg-surface/90 px-4 py-2 text-sm font-medium text-ink shadow-soft">
                <Spinner className="h-4 w-4 text-emerald" /> Running EfficientNetB0 + Grad-CAM…
              </div>
            </div>
          )}

          {/* Detection label */}
          {result && (
            <div
              className="absolute rounded-xl border border-emerald/40 bg-surface/90 px-3 py-2 shadow-glow backdrop-blur animate-fadeUp"
              style={{
                left: `${Math.max(4, Math.min(70, result.explainability.activation_centroid.x_norm * 100 - 12))}%`,
                top: `${Math.max(6, Math.min(72, result.explainability.activation_centroid.y_norm * 100 - 8))}%`,
              }}
            >
              <div className="font-mono text-[11px] font-bold uppercase tracking-wider text-emerald">
                {result.prediction.display}
              </div>
              <div className="font-mono text-[11px] tabular-nums text-muted">
                {result.prediction.confidence_pct.toFixed(1)}%
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
          <div className="min-w-0">
            {result ? (
              <>
                <div className="truncate text-sm font-semibold text-ink">
                  {result.prediction.display} · {result.prediction.confidence_pct.toFixed(2)}%
                </div>
                <div className="truncate font-mono text-[11px] text-muted">
                  {result.sorting.action} → {result.sorting.bin_label} · {result.timings_ms.total_ms.toFixed(0)} ms
                </div>
              </>
            ) : error ? (
              <div className="text-xs text-rose">{error}</div>
            ) : (
              <div className="font-mono text-[11px] text-muted">
                {current ? `real dataset sample · ${current.cls}` : 'no samples'}
              </div>
            )}
          </div>
          <button className="btn-primary !px-3.5 !py-2 text-xs" onClick={onResult} disabled={busy || !current}>
            {busy ? <Spinner className="h-3.5 w-3.5" /> : null}
            {result ? 'Scan again' : 'Run live scan'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Landing() {
  const { theme, toggle } = useTheme()
  const [health, setHealth] = useState<Health | null>(null)
  const [dataset, setDataset] = useState<DatasetInfo | null>(null)
  const [metrics, setMetrics] = useState<{ accuracy?: number; f1?: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PredictionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null))
    api.dataset().then(setDataset).catch(() => setDataset(null))
    api
      .metrics()
      .then((m) =>
        setMetrics(
          m.available && m.evaluation
            ? { accuracy: m.evaluation.metrics.accuracy, f1: m.evaluation.metrics.f1_macro }
            : null,
        ),
      )
      .catch(() => setMetrics(null))
  }, [])

  const runDemo = async () => {
    setBusy(true)
    setError(null)
    try {
      const gallery = dataset?.gallery ?? {}
      const urls = Object.values(gallery).flat()
      if (!urls.length) throw new Error('No dataset samples available')
      const url = urls[Math.floor(Math.random() * urls.length)]
      const blob = await (await fetch(url)).blob()
      setResult(await api.predict(blob, 'upload'))
    } catch (e) {
      setResult(null)
      setError(e instanceof Error ? e.message : 'live scan failed')
    } finally {
      setBusy(false)
    }
  }

  const numClasses = dataset?.num_classes ?? health?.dataset_stats?.num_classes ?? null
  const totalImages = dataset?.total_unique ?? health?.dataset_stats?.total_unique ?? null

  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald/15 text-emerald ring-1 ring-emerald/25">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M7 19V9M12 19V5M17 19v-7" strokeLinecap="round" />
              </svg>
            </span>
            <span className="text-[15px] font-extrabold tracking-tight text-ink">
              Eco<span className="text-emerald">Sort</span>
            </span>
          </Link>
          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {[
              ['/dashboard', 'Dashboard'],
              ['/scan', 'Scanner'],
              ['/robot', 'Robot'],
              ['/evaluation', 'Evaluation'],
              ['/learn', 'Guide'],
            ].map(([to, label]) => (
              <Link
                key={to}
                to={to}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface2 hover:text-ink"
              >
                {label}
              </Link>
            ))}
          </nav>
          <button onClick={toggle} className="btn-ghost !px-2.5 !py-1.5 ml-auto md:ml-2" aria-label="Toggle theme">
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-[0.35]" aria-hidden />
        <div
          className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-emerald/12 blur-[120px]"
          aria-hidden
        />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div className="animate-fadeUp">
            <Badge tone="good" className="mb-5">
              <StatusDot tone="emerald" />
              {health?.model_loaded ? 'Model online' : 'Model not loaded'}
            </Badge>

            <h1 className="text-balance text-5xl font-extrabold leading-[0.95] tracking-[-0.03em] text-ink sm:text-6xl lg:text-7xl">
              Know what
              <br />
              you're <span className="text-emerald">throwing</span>
              <br />
              away.
            </h1>

            <p className="mt-6 max-w-lg text-balance text-lg leading-relaxed text-muted">
              EcoSort uses a real trained <span className="font-medium text-ink">EfficientNetB0</span> vision model to
              identify waste, explain its reasoning with Grad-CAM, and issue confidence-gated sorting decisions — built
              as the perception and decision layer for an autonomous sorting robot.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/scan" className="btn-primary">
                Scan Waste <span aria-hidden>→</span>
              </Link>
              <Link to="/evaluation" className="btn-ghost">
                Explore the Model
              </Link>
            </div>

            <div className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-line pt-6">
              {[
                { v: numClasses ?? '—', l: 'Waste classes' },
                { v: totalImages != null ? totalImages.toLocaleString() : '—', l: 'Audited images' },
                {
                  v: metrics?.accuracy != null ? `${(metrics.accuracy * 100).toFixed(1)}%` : 'training…',
                  l: 'Test accuracy',
                },
              ].map((s) => (
                <div key={s.l}>
                  <div className="font-mono text-2xl font-semibold tabular-nums text-ink sm:text-3xl">{s.v}</div>
                  <div className="mt-1 text-xs text-muted">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="animate-fadeUp" style={{ animationDelay: '120ms' }}>
            <HeroScanner
              dataset={dataset}
              onResult={runDemo}
              busy={busy}
              result={result}
              error={error}
            />
          </div>
        </div>
      </section>

      {/* Model status strip */}
      <section className="border-y border-line bg-surface/40">
        <div className="mx-auto max-w-6xl px-5 py-8">
          <div className="kicker mb-4">Model status</div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { k: 'Architecture', v: 'EfficientNetB0', s: 'ImageNet transfer learning' },
              {
                k: 'Classes',
                v: numClasses != null ? String(numClasses) : '—',
                s: dataset?.classes.join(' · ') ?? 'waste categories',
              },
              {
                k: 'Dataset',
                v: totalImages != null ? totalImages.toLocaleString() : '—',
                s: `${dataset?.total_files_scanned?.toLocaleString?.() ?? '—'} scanned · ${
                  dataset?.duplicates_removed ?? '—'
                } duplicates`,
              },
              {
                k: 'Input',
                v: `${dataset?.image_size ?? 224} × ${dataset?.image_size ?? 224}`,
                s: health?.device ?? 'device unknown',
              },
            ].map((c) => (
              <div key={c.k} className="rounded-card border border-line bg-surface/60 p-4">
                <div className="kicker">{c.k}</div>
                <div className="mt-2 font-mono text-lg font-semibold text-ink">{c.v}</div>
                <div className="mt-1 line-clamp-2 text-xs text-muted">{c.s}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pipeline */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">The full learning loop</h2>
          <p className="mt-3 max-w-2xl text-muted">
            Every stage is implemented and runnable — not a diagram of intentions. Predictions feed corrections,
            corrections feed the review queue, and verified labels feed the next training run.
          </p>
        </div>

        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {PIPELINE.map((p, i) => (
            <li
              key={p.n}
              className="card card-hover relative p-4"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-md bg-emerald/15 font-mono text-[10px] font-bold text-emerald">
                  {i + 1}
                </span>
                <span className="text-sm font-semibold text-ink">{p.n}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">{p.d}</p>
            </li>
          ))}
        </ol>

        <div className="mt-12 flex flex-wrap items-center gap-3">
          <Link to="/dashboard" className="btn-primary">
            Open the dashboard
          </Link>
          <Link to="/robot" className="btn-ghost">
            Robot control center
          </Link>
          <span className="ml-auto text-xs text-muted">
            {health?.cuda_available ? 'CUDA available · ' : ''}
            {health?.model_version ?? 'no model loaded'}
          </span>
        </div>
      </section>
    </div>
  )
}
