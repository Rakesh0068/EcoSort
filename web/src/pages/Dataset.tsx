import { useEffect, useState } from 'react'
import { api, assetUrl, type DatasetInfo, type DatasetSource, type DatasetVersion } from '../api'
import { Bar as HBar, Badge, Card, Empty, ErrorState, Kicker, Loading, SectionTitle, Stat, cx } from '../components/ui'

function ProgressBar({ frac }: { frac: number }) {
  const pct = Math.max(0, Math.min(100, frac * 100))
  return (
    <div className="h-4 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to 100,000 verified images">
      <div
        className="h-full rounded-full bg-emerald transition-[width] duration-700"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export default function Dataset() {
  const [data, setData] = useState<DatasetInfo | null>(null)
  const [sources, setSources] = useState<DatasetSource[]>([])
  const [versions, setVersions] = useState<DatasetVersion[]>([])
  const [healthReport, setHealthReport] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api
      .dataset()
      .then((d) => {
        if (!alive) return
        setData(d)
        setActive(d.classes[0] ?? null)
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'dataset unavailable'))
    api.datasetSources().then((r) => alive && setSources(r.sources)).catch(() => undefined)
    api.datasetVersions().then((r) => alive && setVersions(r.versions)).catch(() => undefined)
    api.datasetHealth().then((r) => alive && setHealthReport(r.report)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  if (error) return <ErrorState message={error} />
  if (!data) return <Loading label="Loading dataset" />

  const counts = Object.fromEntries(data.classes.map((c) => [c, data.per_class[c]?.unique ?? 0]))
  const values = Object.values(counts)
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 1)
  const goal = data.goal_100k

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Dataset"
        sub="The real audited image corpus behind the model — counted from disk, not quoted from a spec sheet."
      />

      {/* 100K progress hero */}
      {goal && (
        <Card className="border-emerald/25">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Kicker>{goal.reached ? '100,000+ verified images' : 'Training dataset'}</Kicker>
              <div className="stat-value mt-2">
                {goal.verified.toLocaleString()}
                <span className="text-lg text-muted"> / {goal.target.toLocaleString()}</span>
              </div>
              <div className="mt-1 text-xs text-muted">
                {goal.reached
                  ? 'Target reached — verified source images only; augmented copies are never counted.'
                  : `${goal.remaining.toLocaleString()} more legitimate images needed. Only the real number is shown.`}
              </div>
            </div>
            <Badge tone={goal.reached ? 'good' : 'warn'}>
              {goal.reached ? 'target reached' : `${(goal.progress_frac * 100).toFixed(1)}% of target`}
            </Badge>
          </div>
          <div className="mt-4">
            <ProgressBar frac={goal.progress_frac} />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {[
              ['Training images', goal.train],
              ['Validation images', goal.val],
              ['Test images', goal.test],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-surface2/60 px-3 py-2.5">
                <div className="text-[11px] text-muted">{k}</div>
                <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-ink">
                  {(v as number).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Total verified images"
          value={data.total_unique.toLocaleString()}
          sub={`${data.total_files_scanned.toLocaleString()} files scanned`}
        />
        <Stat
          label="Removed duplicates"
          value={(data.duplicates_removed + (data.near_duplicates_removed ?? 0)).toLocaleString()}
          sub={`${data.duplicates_removed} exact · ${data.near_duplicates_removed ?? 0} near-duplicate`}
        />
        <Stat
          label="Removed corrupt / low-quality"
          value={((data.corrupt_unreadable ?? 0) + (data.low_quality_removed ?? 0)).toLocaleString()}
          sub={`${data.corrupt_unreadable} corrupt · ${data.low_quality_removed ?? 0} low-quality`}
        />
        <Stat
          label="Classes with data"
          value={`${data.num_classes}`}
          sub={`13-class goal · ${goal?.missing_classes.length ?? '—'} still missing`}
        />
      </div>

      {/* 13-class distribution with targets */}
      {goal && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Kicker>Class distribution vs target (13 classes)</Kicker>
            <span className="font-mono text-[11px] text-muted">
              ≈{(goal.target / 13).toLocaleString(undefined, { maximumFractionDigits: 0 })} per class · actuals only
            </span>
          </div>
          {(goal.strongest_classes.length > 0 || goal.missing_classes.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
              {goal.strongest_classes.length > 0 && (
                <span className="chip">strongest: {goal.strongest_classes.join(' · ')}</span>
              )}
              {goal.underrepresented_classes.length > 0 && (
                <span className="chip">needs more: {goal.underrepresented_classes.slice(0, 5).join(' · ')}{goal.underrepresented_classes.length > 5 ? ` +${goal.underrepresented_classes.length - 5}` : ''}</span>
              )}
              {goal.missing_classes.length > 0 && (
                <span className="chip !border-rose/40">missing: {goal.missing_classes.join(' · ')}</span>
              )}
            </div>
          )}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Class</th>
                  <th className="py-2 pr-3 text-right font-medium">Images</th>
                  <th className="py-2 pr-3 text-right font-medium">% of data</th>
                  <th className="py-2 pr-3 text-right font-medium">Target</th>
                  <th className="py-2 pr-3 text-right font-medium">Gap</th>
                  <th className="py-2 pr-3 text-right font-medium">Train</th>
                  <th className="py-2 pr-3 text-right font-medium">Val</th>
                  <th className="py-2 text-right font-medium">Test</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(goal.per_class).map(([id, r]) => (
                  <tr key={id} className={cx('border-b border-line/50 last:border-0', r.have === 0 && 'opacity-70')}>
                    <td className="py-2 pr-3 font-medium capitalize text-ink">
                      {r.display}
                      {r.have === 0 && <Badge tone="bad" className="ml-2">no data</Badge>}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-ink">{r.have.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted">{r.pct_of_dataset.toFixed(1)}%</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted">{r.target.toLocaleString()}</td>
                    <td className={cx('py-2 pr-3 text-right font-mono tabular-nums', r.gap > 0 ? 'text-amber' : 'text-emerald')}>
                      {r.gap > 0 ? `−${r.gap.toLocaleString()}` : 'met'}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted">{r.train.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted">{r.val.toLocaleString()}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-muted">{r.test.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Targets are planning guidance (≈even split of 100,000), not claims. Gaps show additional legitimate images
            required per class — never filled by duplicating or renaming existing files.
          </p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Class distribution (model classes) */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <Kicker>Images per model class</Kicker>
            <span className="font-mono text-[11px] text-muted">unique verified images</span>
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
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Near-duplicate groups are kept inside a single split — the same or near-identical image never appears in
              both training and test.
            </p>
          </Card>

          <Card>
            <Kicker>Robot-ready data</Kicker>
            <div className="mt-2 font-mono text-xl font-semibold tabular-nums text-ink">
              {(data.robot_ready?.tagged_images ?? 0).toLocaleString()}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              {data.robot_ready?.note ?? 'Real-world diversity images (clutter, varied lighting/angles, conveyor scenes) tagged at import time.'}
            </p>
          </Card>
        </div>
      </div>

      {/* 100K health report */}
      {healthReport && (
        <Card>
          <Kicker>100K dataset health report</Kicker>
          <p className="mt-1 mb-3 text-xs text-muted">Generated {String(healthReport.generated_at ?? '—')} — before training, every time.</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {(
              [
                ['Total imported', healthReport.total_imported],
                ['Valid', healthReport.valid],
                ['Exact duplicates', healthReport.exact_duplicates],
                ['Near duplicates', healthReport.near_duplicates],
                ['Corrupt', healthReport.corrupt],
                ['Low-quality', healthReport.low_quality],
                ['Unmapped', healthReport.unmapped],
                ['Verified images', healthReport.verified],
                ['Final training candidates', healthReport.final_training_candidates],
              ] as [string, unknown][]
            ).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-surface2/60 px-3 py-2.5">
                <div className="text-[11px] text-muted">{k}</div>
                <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-ink">
                  {typeof v === 'number' ? v.toLocaleString() : String(v ?? '—')}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Original dataset: {(data.total_unique).toLocaleString()} · Training augmentation: enabled (generated at
            train time, never counted as source images).
          </p>
        </Card>
      )}

      {/* Sources */}
      <Card>
        <div className="flex items-center justify-between">
          <Kicker>Dataset sources & licences</Kicker>
          <Badge tone="neutral">{sources.length} registered</Badge>
        </div>
        {sources.length === 0 ? (
          <div className="mt-3"><Empty title="No licensed imports yet" hint="Import a lawfully obtained dataset with python -m ml.ingest; it will appear here with its licence." icon="—" /></div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Dataset</th>
                  <th className="py-2 pr-3 font-medium">Licence</th>
                  <th className="py-2 pr-3 font-medium">Reference</th>
                  <th className="py-2 pr-3 text-right font-medium">Scanned</th>
                  <th className="py-2 pr-3 text-right font-medium">Imported</th>
                  <th className="py-2 pr-3 font-medium">Import date</th>
                  <th className="py-2 font-medium">Classes</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.name} className="border-b border-line/50 align-top last:border-0">
                    <td className="py-2.5 pr-3 font-medium text-ink">{s.name}</td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={/unknown/i.test(s.license) ? 'warn' : 'good'}>{s.license}</Badge>
                      {s.note && <div className="mt-1 max-w-xs text-[11px] leading-relaxed text-muted">{s.note}</div>}
                    </td>
                    <td className="max-w-[220px] truncate py-2.5 pr-3 font-mono text-[11px] text-muted" title={s.url || s.source || ''}>
                      {s.url || s.source || '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-muted">{(s.original_image_count ?? 0).toLocaleString()}</td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-ink">{(s.imported_image_count ?? 0).toLocaleString()}</td>
                    <td className="py-2.5 pr-3 font-mono text-[11px] text-muted">{s.import_date ? new Date(s.import_date).toLocaleDateString() : '—'}</td>
                    <td className="py-2.5 text-[11px] capitalize text-muted">{(s.mapped_classes ?? []).join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 rounded-xl bg-surface2/60 p-3 font-mono text-[11px] leading-relaxed text-muted">
          Expand with legitimate data only: python -m ml.ingest --source-dir &lt;folder&gt; --dataset-name NAME
          --license "CC BY 4.0" --url https://… --class-map srcLabel:plastic … [--robot-ready] [--dry-run]
        </p>
      </Card>

      {/* Versions */}
      <Card>
        <div className="flex items-center justify-between">
          <Kicker>Dataset versions</Kicker>
          <Badge tone="neutral">{versions.length} versions</Badge>
        </div>
        {versions.length === 0 ? (
          <div className="mt-3"><Empty title="No versions recorded yet" hint="Versions are written automatically by audits and ingestions." icon="—" /></div>
        ) : (
          <div className="mt-3 space-y-2">
            {[...versions].reverse().map((v) => (
              <div key={v.version} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface2/60 px-3.5 py-2.5">
                <span className="text-sm font-bold text-ink">{v.version}</span>
                <span className="font-mono text-xs tabular-nums text-emerald">{v.total_images.toLocaleString()} verified</span>
                {v.created_at && <span className="font-mono text-[11px] text-muted">{new Date(v.created_at).toLocaleDateString()}</span>}
                {v.note && <span className="w-full text-[11px] leading-relaxed text-muted">{v.note}</span>}
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Active learning: verified corrections from the review queue become candidates for future versions, so the
          dataset can grow past 100,000 (110K, 120K, 150K+) without changing the architecture. Retraining stays manual
          and every run records its dataset version.
        </p>
      </Card>

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
                    src={assetUrl(url)}
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
            src={assetUrl(lightbox)}
            alt="Enlarged dataset sample"
            className="max-h-[85vh] max-w-full rounded-card border border-line object-contain shadow-lift animate-fadeUp"
          />
        </div>
      )}
    </div>
  )
}
