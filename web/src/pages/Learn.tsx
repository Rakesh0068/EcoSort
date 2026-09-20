import { useEffect, useMemo, useState } from 'react'
import { api, assetUrl, type ClassInfo, type DatasetInfo, type Evaluation } from '../api'
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

const HAZARD_TONE: Record<string, 'bad' | 'warn' | 'neutral'> = {
  high: 'bad',
  medium: 'warn',
  low: 'neutral',
  none: 'neutral',
}

export default function Learn() {
  const [classes, setClasses] = useState<ClassInfo[] | null>(null)
  const [dataset, setDataset] = useState<DatasetInfo | null>(null)
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [error, setError] = useState('')
  const [active, setActive] = useState<string>('')
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    api
      .classes()
      .then((r) => {
        if (!live) return
        setClasses(r.classes)
        setActive((prev) => prev || r.classes[0]?.id || '')
      })
      .catch((e: Error) => live && setError(e.message))

    // Supporting data is optional — the guide still renders without it.
    api
      .dataset()
      .then((d) => live && setDataset(d))
      .catch(() => undefined)
    api
      .metrics()
      .then((m) => live && m.available && m.evaluation && setEvaluation(m.evaluation))
      .catch(() => undefined)

    return () => {
      live = false
    }
  }, [])

  const current = useMemo(() => classes?.find((c) => c.id === active) ?? null, [classes, active])

  // Real measured confusions for the selected class, from the test-split evaluation.
  const measured = useMemo(() => {
    if (!evaluation || !current) return []
    return evaluation.confusion_pairs_top
      .filter((p) => p.true_class === current.id || p.predicted_class === current.id)
      .slice(0, 5)
  }, [evaluation, current])

  const perf = current && evaluation ? evaluation.metrics.per_class[current.id] : undefined
  const gallery = current && dataset ? (dataset.gallery[current.id] ?? []) : []
  const counts = current && dataset ? dataset.per_class[current.id] : undefined

  if (error) return <ErrorState message={error} />
  if (!classes) return <Loading label="Loading waste guide" />

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Waste guide"
        sub={`${classes.length} categories the model is actually trained on, with disposal guidance and the confusions it really makes.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Categories" value={classes.length} sub="Classes in the trained model" />
        <Stat
          label="Guide images"
          value={dataset ? dataset.total_unique : '—'}
          sub={dataset ? `${dataset.variant} · deduplicated` : '—'}
        />
        <Stat
          label="Test accuracy"
          value={evaluation ? pct(evaluation.metrics.accuracy, 1) : '—'}
          sub={evaluation ? `${evaluation.num_samples} held-out images` : 'not evaluated yet'}
        />
        <Stat
          label="Recycling streams"
          value={new Set(classes.map((c) => c.bin)).size}
          sub="Distinct target bins in the map"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[15rem_1fr]">
        {/* Class picker */}
        <Card className="h-fit p-3">
          <Kicker className="px-2 pt-1">Categories</Kicker>
          <div className="mt-2 space-y-0.5">
            {classes.map((c) => (
              <button
                key={c.id}
                onClick={() => setActive(c.id)}
                className={cx(
                  'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition',
                  active === c.id
                    ? 'bg-emerald/12 font-medium text-emerald'
                    : 'text-muted hover:bg-surface2 hover:text-ink',
                )}
              >
                <span className="flex-1 capitalize">{c.display}</span>
                {c.guide.hazard === 'high' && <Badge tone="bad">hazard</Badge>}
                {!c.guide.recyclable && <Badge tone="neutral">landfill</Badge>}
              </button>
            ))}
          </div>
        </Card>

        {/* Detail */}
        {current && (
          <div className="space-y-4">
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-bold tracking-tight text-ink">{current.display}</h3>
                  <p className="mt-1 text-sm text-muted">{current.guide.stream}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={current.guide.recyclable ? 'good' : 'neutral'}>
                    {current.guide.recyclable ? 'recyclable' : 'not recyclable'}
                  </Badge>
                  <Badge tone={HAZARD_TONE[current.guide.hazard] ?? 'neutral'}>
                    hazard: {current.guide.hazard}
                  </Badge>
                  <Badge tone="info">{current.bin_label}</Badge>
                </div>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-ink">{current.guide.action}</p>

              <div className="mt-4">
                <Kicker>Before you dispose of it</Kicker>
                <ul className="mt-2 space-y-1.5">
                  {current.guide.prep.map((p) => (
                    <li key={p} className="flex gap-2 text-sm text-muted">
                      <span className="mt-0.5 text-emerald">✓</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-4 rounded-xl border border-line bg-surface2 p-4">
                <Kicker>Why it matters</Kicker>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{current.guide.why}</p>
              </div>

              {current.guide.note && (
                <p className="mt-3 text-xs leading-relaxed text-muted">{current.guide.note}</p>
              )}
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              {/* What the model does with this class */}
              <Card>
                <Kicker>Model behaviour on this class</Kicker>
                <p className="mt-1 mb-3 text-xs text-muted">
                  From the held-out test split. Absent until an evaluation has been run.
                </p>
                {perf ? (
                  <>
                    <div className="space-y-2">
                      <MetricRow label="Precision" value={pct(perf.precision, 1)} />
                      <MetricRow label="Recall" value={pct(perf.recall, 1)} />
                      <MetricRow label="F1" value={pct(perf.f1, 1)} />
                      <MetricRow label="Test images" value={String(perf.support)} />
                      <MetricRow label="Labelled as this class" value={String(perf.predicted_as)} />
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface2">
                      <div
                        className="h-full rounded-full bg-emerald transition-[width] duration-700"
                        style={{ width: `${(perf.f1 ?? 0) * 100}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <Empty title="No evaluation recorded yet" hint="Run the model evaluation to populate this." icon="—" />
                )}
              </Card>

              {/* Real confusion data */}
              <Card>
                <Kicker>Common confusion</Kicker>
                <p className="mt-1 mb-3 text-xs text-muted">
                  Declared look-alikes from the guide, then the pairs the model actually mixed up on test images.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {current.guide.confusion.map((c) => (
                    <button
                      key={c}
                      onClick={() => setActive(c)}
                      className="rounded-full border border-line bg-surface2 px-2.5 py-1 text-xs capitalize text-muted transition hover:border-emerald/40 hover:text-ink"
                    >
                      looks like {c}
                    </button>
                  ))}
                </div>
                {measured.length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    {measured.map((p) => (
                      <div
                        key={`${p.true_class}-${p.predicted_class}`}
                        className="flex items-center justify-between gap-3 border-b border-line/60 pb-1.5 text-xs last:border-0"
                      >
                        <span className="capitalize text-muted">
                          <span className={p.true_class === current.id ? 'text-ink' : 'text-rose'}>
                            {p.true_class}
                          </span>
                          {' → '}
                          <span className={p.predicted_class === current.id ? 'text-ink' : 'text-rose'}>
                            {p.predicted_class}
                          </span>
                        </span>
                        <span className="font-mono tabular-nums text-ink">{p.count} images</span>
                      </div>
                    ))}
                  </div>
                )}
                {!evaluation && (
                  <p className="mt-4 text-xs text-muted">No measured confusions available yet.</p>
                )}
              </Card>
            </div>

            {/* Gallery */}
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <Kicker className="mr-auto">Training examples</Kicker>
                {counts && (
                  <span className="font-mono text-xs text-muted">
                    {counts.unique} unique · {counts.train} train / {counts.val} val / {counts.test} test
                  </span>
                )}
              </div>
              {gallery.length > 0 ? (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
                  {gallery.map((url) => (
                    <button
                      key={url}
                      onClick={() => setLightbox(url)}
                      className="group aspect-square overflow-hidden rounded-xl border border-line bg-surface2"
                    >
                      <img
                        src={assetUrl(url)}
                        alt={`${current.display} training example`}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-3">
                  <Empty title="No sample images available" hint="Dataset gallery data was not loaded." icon="—" />
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* Pipeline explainer */}
      <Card>
        <Kicker>How EcoSort learns</Kicker>
        <p className="mt-1 mb-4 text-xs text-muted">
          The same pipeline every category above went through. Numbers are from the current dataset and run, not
          illustrative.
        </p>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              t: 'Collect & audit',
              d: dataset
                ? `${dataset.total_files_scanned.toLocaleString()} files scanned, ${dataset.duplicates_removed} duplicate hashes removed by MD5.`
                : 'Every file is hashed so duplicates are removed rather than silently inflating a class.',
            },
            {
              t: 'Split',
              d: dataset
                ? `Seeded stratified split: ${dataset.split_sizes.train} train / ${dataset.split_sizes.val} val / ${dataset.split_sizes.test} test.`
                : 'A fixed seed keeps the split reproducible across runs.',
            },
            {
              t: 'Augment & train',
              d: evaluation
                ? `${evaluation.architecture} fine-tuned from ImageNet weights on ${dataset?.split_sizes.train ?? '—'} images.`
                : 'Crops, flips, rotation and colour jitter, then two-phase transfer learning.',
            },
            {
              t: 'Measure & correct',
              d: evaluation
                ? `${pct(evaluation.metrics.accuracy, 1)} accuracy on ${evaluation.num_samples} unseen test images.`
                : 'Evaluated on data the model never trained on, then improved from real user corrections.',
            },
          ].map((s, i) => (
            <li key={s.t} className="rounded-xl border border-line bg-surface2 p-4">
              <div className="font-mono text-xs text-emerald">0{i + 1}</div>
              <div className="mt-1 text-sm font-semibold text-ink">{s.t}</div>
              <p className="mt-1 text-xs leading-relaxed text-muted">{s.d}</p>
            </li>
          ))}
        </ol>
      </Card>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-6 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
          role="presentation"
        >
          <img
            src={assetUrl(lightbox)}
            alt="Enlarged training example"
            className="max-h-full max-w-full rounded-card border border-line object-contain"
          />
        </div>
      )}
    </div>
  )
}
