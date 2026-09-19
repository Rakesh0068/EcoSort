import { useEffect, useState } from 'react'
import { api, type DatasetInfo } from '../api'
import { Bar as HBar, Badge, Card, Empty, ErrorState, Kicker, Loading, SectionTitle, Stat, cx } from '../components/ui'

export default function Dataset() {
  const [data, setData] = useState<DatasetInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    api
      .dataset()
      .then((d) => {
        setData(d)
        setActive(d.classes[0] ?? null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'dataset unavailable'))
  }, [])

  if (error) return <ErrorState message={error} />
  if (!data) return <Loading label="Loading dataset" />

  const counts = Object.fromEntries(data.classes.map((c) => [c, data.per_class[c]?.unique ?? 0]))
  const values = Object.values(counts)
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 1)

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Dataset"
        sub="The real audited image corpus behind the model — counted from disk, not quoted from a spec sheet."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Images"
          value={data.total_unique.toLocaleString()}
          sub={`${data.total_files_scanned.toLocaleString()} files scanned · ${data.duplicates_removed} duplicates`}
        />
        <Stat label="Classes" value={data.num_classes} sub={data.classes.join(' · ')} />
        <Stat label="Standardized" value={`${data.variant.replace('standardized_', '')}²`} sub={`model input ${data.image_size}²`} />
        <Stat
          label="Class balance"
          value={`${(max / min).toFixed(2)}:1`}
          sub={`largest ${max.toLocaleString()} · smallest ${min.toLocaleString()}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Class distribution */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <Kicker>Class distribution</Kicker>
            <span className="font-mono text-[11px] text-muted">unique images per class</span>
          </div>
          <div className="mt-4 space-y-2.5">
            {data.classes.map((c, i) => (
              <button key={c} className="block w-full text-left" onClick={() => setActive(c)}>
                <HBar
                  label={<span className={cx('capitalize', active === c && 'font-semibold text-ink')}>{c}</span>}
                  value={counts[c]}
                  max={max}
                  color={active === c ? 'rgb(var(--emerald))' : 'rgb(var(--forest) / 0.4)'}
                  display={counts[c].toLocaleString()}
                  delay={i * 50}
                />
              </button>
            ))}
          </div>
          <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-muted">
            The spread is genuinely imbalanced — a {(max / min).toFixed(1)}:1 ratio between the largest and smallest
            class. Training compensates with a weighted random sampler rather than pretending the data is balanced.
          </p>
        </Card>

        {/* Health + splits */}
        <div className="space-y-4">
          <Card>
            <Kicker>Dataset health</Kicker>
            <div className="mt-3 space-y-2">
              {Object.entries(data.health).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 border-b border-line/60 py-1.5 last:border-0">
                  <span className="text-xs capitalize text-muted">{k.replace(/_/g, ' ')}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-ink">
                      {typeof v.value === 'number' ? v.value : String(v.value ?? '—')}
                    </span>
                    <span className={v.ok ? 'text-emerald' : 'text-amber'}>{v.ok ? '✓' : '⚠'}</span>
                  </span>
                </div>
              ))}
            </div>
            {data.health.class_balance?.detail && (
              <p className="mt-3 text-[11px] leading-relaxed text-muted">{data.health.class_balance.detail}</p>
            )}
          </Card>

          <Card>
            <Kicker>Split</Kicker>
            <p className="mt-1.5 text-[11px] text-muted">
              Stratified, seeded ({data.seed}), ratios {data.split_ratios.map((r) => `${Math.round(r * 100)}%`).join(' / ')}
            </p>
            <div className="mt-3 space-y-2.5">
              {(['train', 'val', 'test'] as const).map((s, i) => (
                <HBar
                  key={s}
                  label={s}
                  value={data.split_sizes[s]}
                  max={data.split_sizes.train}
                  color={['rgb(var(--emerald))', 'rgb(var(--lime))', 'rgb(var(--forest) / 0.5)'][i]}
                  display={data.split_sizes[s].toLocaleString()}
                  delay={i * 70}
                />
              ))}
            </div>
            <div className="mt-3 font-mono text-[11px] text-muted">
              total {Object.values(data.split_sizes).reduce((a, b) => a + b, 0).toLocaleString()} assigned
            </div>
          </Card>
        </div>
      </div>

      {/* Gallery */}
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Kicker className="mr-auto">Class gallery</Kicker>
          <div className="flex flex-wrap gap-1.5">
            {data.classes.map((c) => (
              <button
                key={c}
                onClick={() => setActive(c)}
                className={cx(
                  'rounded-lg px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors',
                  active === c
                    ? 'bg-emerald text-white'
                    : 'border border-line bg-surface/60 text-muted hover:border-emerald/40 hover:text-ink',
                )}
              >
                {c} <span className="opacity-70">{counts[c]}</span>
              </button>
            ))}
          </div>
        </div>

        {active && (
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-bold capitalize text-ink">{active}</span>
              <Badge tone="neutral">{counts[active].toLocaleString()} images</Badge>
              <span className="font-mono text-[11px] text-muted">
                train {data.per_class[active]?.train} · val {data.per_class[active]?.val} · test{' '}
                {data.per_class[active]?.test}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {(data.gallery[active] ?? []).map((url) => (
                <button
                  key={url}
                  onClick={() => setLightbox(url)}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-surface2"
                >
                  <img
                    src={url}
                    alt={`${active} sample`}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 ease-spring group-hover:scale-110"
                  />
                </button>
              ))}
            </div>
            {!(data.gallery[active] ?? []).length && <Empty title="No sample images found for this class" />}
          </div>
        )}
      </Card>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <img
            src={lightbox}
            alt="Enlarged dataset sample"
            className="max-h-[85vh] max-w-full rounded-card border border-line object-contain shadow-lift animate-fadeUp"
          />
        </div>
      )}
    </div>
  )
}
