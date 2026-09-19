import { useState } from 'react'
import { api, b64url, type PredictionResult } from '../api'
import { Badge, Bar, Card, Kicker, MetricRow, StatusDot, confidenceTone, cx, ms, pct } from './ui'

const HAZARD_TONE: Record<string, 'good' | 'warn' | 'bad' | 'neutral'> = {
  none: 'good',
  low: 'warn',
  high: 'bad',
  unknown: 'neutral',
}

function ExplainToggle({ result }: { result: PredictionResult }) {
  const [view, setView] = useState<'original' | 'heatmap' | 'overlay'>('overlay')
  const [opacity, setOpacity] = useState(result.explainability.opacity)

  const src =
    view === 'original'
      ? result.__sourceUrl
      : view === 'heatmap'
        ? b64url(result.explainability.heatmap_png_b64)
        : b64url(result.explainability.overlay_png_b64)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Kicker className="mr-auto">What the model saw</Kicker>
        {(['original', 'overlay', 'heatmap'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cx(
              'rounded-lg px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-wide transition-colors',
              view === v ? 'bg-emerald/15 text-emerald ring-1 ring-emerald/30' : 'text-muted hover:bg-surface2',
            )}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-xl border border-line bg-surface2">
        {src ? (
          <img src={src} alt={`${view} view`} className="aspect-square w-full object-contain" />
        ) : (
          <div className="grid aspect-square w-full place-items-center text-xs text-muted">No source image</div>
        )}
        {view !== 'original' && (
          <div className="absolute bottom-2 left-2 rounded-lg bg-black/60 px-2 py-1 font-mono text-[10px] text-white backdrop-blur">
            {result.explainability.target_layer}
          </div>
        )}
      </div>

      {view === 'overlay' && (
        <label className="mt-3 block">
          <span className="kicker">Heatmap opacity</span>
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="mt-2 w-full accent-emerald"
          />
          <span className="font-mono text-[11px] text-muted">{opacity.toFixed(2)}</span>
        </label>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px] text-muted">
        <div className="rounded-lg bg-surface2/60 px-2.5 py-2">
          centroid x,y
          <div className="mt-0.5 text-ink">
            {result.explainability.activation_centroid.x_px}, {result.explainability.activation_centroid.y_px}
          </div>
        </div>
        <div className="rounded-lg bg-surface2/60 px-2.5 py-2">
          focus
          <div className="mt-0.5 text-ink">
            {pct(result.explainability.activation_centroid.concentration, 0)}
          </div>
        </div>
      </div>
    </div>
  )
}

function FeedbackBlock({
  result,
  classes,
  onDone,
}: {
  result: PredictionResult
  classes: string[]
  onDone: () => void
}) {
  const [verdict, setVerdict] = useState<null | boolean>(null)
  const [chosen, setChosen] = useState(result.prediction.class)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (!result.scan_id) {
    return (
      <Card>
        <Kicker>Was this correct?</Kicker>
        <p className="mt-2 text-xs text-muted">
          Feedback is only recorded for saved scans. This result was not persisted.
        </p>
      </Card>
    )
  }

  const submit = async () => {
    if (verdict === null) return
    setBusy(true)
    setErr(null)
    try {
      const r = await api.feedback(result.scan_id, verdict, verdict ? undefined : chosen)
      setMsg(
        r.was_correct
          ? 'Marked as correct — thanks for verifying.'
          : `Correction recorded: ${result.prediction.display} → ${chosen}. Added to the review queue as a verified training candidate.`,
      )
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'could not submit feedback')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <Kicker>Was this correct?</Kicker>
      <p className="mt-1.5 text-xs text-muted">
        Corrections become verified training data. This is the input to the continuous-learning loop.
      </p>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => {
            setVerdict(true)
            setMsg(null)
          }}
          className={cx(
            'btn flex-1',
            verdict === true ? 'bg-emerald text-white shadow-glow' : 'btn-ghost',
          )}
        >
          👍 Yes
        </button>
        <button
          onClick={() => {
            setVerdict(false)
            setMsg(null)
          }}
          className={cx('btn flex-1', verdict === false ? 'bg-rose text-white' : 'btn-ghost')}
        >
          👎 No
        </button>
      </div>

      {verdict === false && (
        <div className="mt-3 animate-fadeUp">
          <label className="kicker block">What was the correct category?</label>
          <select value={chosen} onChange={(e) => setChosen(e.target.value)} className="input mt-2">
            {classes.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </div>
      )}

      {verdict !== null && !msg && (
        <button className="btn-primary mt-3 w-full" onClick={submit} disabled={busy}>
          {busy ? 'Submitting…' : 'Submit correction'}
        </button>
      )}

      {msg && (
        <div className="mt-3 rounded-xl border border-emerald/30 bg-emerald/10 p-3 text-xs text-ink animate-fadeUp">
          {msg}
        </div>
      )}
      {err && <div className="mt-3 rounded-xl border border-rose/30 bg-rose/10 p-3 text-xs text-rose">{err}</div>}
    </Card>
  )
}

export function ResultView({
  result,
  classes,
  onRescan,
  onFeedback,
}: {
  result: PredictionResult
  classes: string[]
  onRescan?: () => void
  onFeedback?: () => void
}) {
  const [whyOpen, setWhyOpen] = useState(false)
  const p = result.prediction
  const tone = confidenceTone(p.state)
  const q = result.input_quality
  const t = result.timings_ms

  return (
    <div className="space-y-4">
      {/* Main result */}
      <Card className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-[0.13] blur-2xl"
          style={{ background: tone.color }}
          aria-hidden
        />
        <div className="relative text-center">
          <Kicker>Predicted class</Kicker>
          <div className="mt-2 text-4xl font-extrabold uppercase tracking-tight text-ink sm:text-5xl">
            {p.display}
          </div>
          <div className="mt-3 font-mono text-3xl font-semibold tabular-nums sm:text-4xl" style={{ color: tone.color }}>
            {p.confidence_pct.toFixed(2)}%
          </div>
          <div className="mt-1 text-xs text-muted">Model confidence</div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Badge tone={tone.tone}>
              <StatusDot tone={p.state === 'low' ? 'rose' : p.state === 'moderate' ? 'amber' : 'emerald'} />
              {tone.label}
            </Badge>
            <Badge tone="neutral">margin {pct(p.margin, 1)}</Badge>
            <Badge tone="neutral">entropy {p.normalized_entropy.toFixed(3)}</Badge>
            <Badge tone="neutral">threshold {pct(p.threshold, 0)}</Badge>
          </div>
          <p className="mx-auto mt-3 max-w-md text-xs text-muted">{p.state_reason}</p>
        </div>
      </Card>

      {/* Low-confidence safety state */}
      {p.state === 'low' && (
        <Card className="border-amber/35 bg-amber/[0.06]">
          <div className="flex items-start gap-3">
            <span className="text-lg text-amber">⚠</span>
            <div className="flex-1">
              <div className="text-sm font-bold text-ink">Model uncertainty</div>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                The model isn't sufficiently confident about this image, so no sorting command would be issued. A
                physical robot would hold this item for human verification instead of actuating.
              </p>
              {result.uncertainty_tips.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {result.uncertainty_tips.map((tip) => (
                    <li key={tip} className="flex gap-2 text-xs text-muted">
                      <span className="text-amber">•</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              )}
              {q.issues.length > 0 && (
                <div className="mt-3 rounded-lg bg-surface2/70 p-2.5 font-mono text-[11px] text-muted">
                  detected issues: {q.issues.join(' · ')}
                </div>
              )}
              {onRescan && (
                <button className="btn-ghost mt-3 !px-3 !py-1.5 text-xs" onClick={onRescan}>
                  Scan again
                </button>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <ExplainToggle result={result} />
        </Card>

        <Card>
          <Kicker>Model output</Kicker>
          <p className="mt-1 mb-4 text-xs text-muted">
            Full softmax over {result.model.num_classes} classes — top {p.top5.length} shown.
          </p>
          <div className="space-y-2.5">
            {p.top5.map((c, i) => (
              <Bar
                key={c.class}
                label={c.display}
                value={c.probability}
                max={Math.max(p.top5[0].probability, 0.0001)}
                color={i === 0 ? 'rgb(var(--emerald))' : 'rgb(var(--forest) / 0.45)'}
                display={`${(c.probability * 100).toFixed(2)}%`}
                delay={i * 70}
              />
            ))}
          </div>
          <div className="mt-4 border-t border-line pt-3 font-mono text-[11px] text-muted">
            Σ top-{p.top5.length} = {pct(p.top5.reduce((a, b) => a + b.probability, 0), 2)}
          </div>
        </Card>
      </div>

      {/* Why this prediction */}
      <Card>
        <button
          onClick={() => setWhyOpen((v) => !v)}
          className="flex w-full items-center gap-3 text-left"
          aria-expanded={whyOpen}
        >
          <span className="flex-1">
            <Kicker>Why this prediction?</Kicker>
            <span className="mt-1 block text-sm font-semibold text-ink">
              {whyOpen ? 'Hide explanation' : 'Show attention map and reasoning'}
            </span>
          </span>
          <span className={cx('text-muted transition-transform duration-300', whyOpen && 'rotate-180')}>▾</span>
        </button>

        {whyOpen && (
          <div className="mt-4 space-y-3 border-t border-line pt-4 animate-fadeUp">
            <p className="text-sm leading-relaxed text-muted">
              The model identified visual patterns associated with the{' '}
              <span className="font-semibold text-ink">{p.display}</span> class. The heatmap below is a{' '}
              <span className="font-medium text-ink">Grad-CAM</span> projection: gradients of the predicted class score
              are pooled over the final convolutional feature map to show which regions drove the decision.
            </p>
            <p className="text-xs leading-relaxed text-muted">
              This is an attribution of the network's own activations — not a claim that the model understands the
              object. Bright regions contributed most to the class score.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl bg-surface2/60 p-3">
                <Kicker>Method</Kicker>
                <div className="mt-1.5 font-mono text-xs text-ink">{result.explainability.method}</div>
                <div className="mt-0.5 font-mono text-[11px] text-muted">{result.explainability.target_layer}</div>
              </div>
              <div className="rounded-xl bg-surface2/60 p-3">
                <Kicker>Activation centroid</Kicker>
                <div className="mt-1.5 font-mono text-xs text-ink">
                  x {result.explainability.activation_centroid.x_norm.toFixed(3)} · y{' '}
                  {result.explainability.activation_centroid.y_norm.toFixed(3)}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-muted">
                  {result.explainability.activation_centroid.source}
                </div>
              </div>
            </div>
            {p.top5.length > 1 && (
              <div className="rounded-xl bg-surface2/60 p-3">
                <Kicker>Runner-up</Kicker>
                <p className="mt-1.5 text-xs text-muted">
                  <span className="font-semibold text-ink">{p.top5[1].display}</span> at{' '}
                  {pct(p.top5[1].probability, 2)} — a gap of {pct(p.margin, 1)}.{' '}
                  {result.guidance.confusion.includes(p.top5[1].class)
                    ? 'This pair is a documented confusion case for this class.'
                    : ''}
                </p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Recycling guide */}
      <Card className="border-emerald/25">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Kicker>♻ Recycling guide</Kicker>
            <div className="mt-1.5 text-xl font-bold uppercase tracking-tight text-ink">{p.display}</div>
            <div className="mt-1 font-mono text-xs text-emerald">{result.guidance.stream}</div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Badge tone={HAZARD_TONE[result.guidance.hazard] ?? 'neutral'}>
              hazard: {result.guidance.hazard}
            </Badge>
            <Badge tone={result.guidance.recyclable ? 'good' : 'neutral'}>
              {result.guidance.recyclable ? 'recyclable' : 'not recyclable'}
            </Badge>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-ink">{result.guidance.action}</p>

        {result.guidance.prep.length > 0 && (
          <div className="mt-4">
            <Kicker className="mb-2">Before recycling</Kicker>
            <ul className="space-y-1.5">
              {result.guidance.prep.map((step) => (
                <li key={step} className="flex gap-2.5 text-sm text-muted">
                  <span className="mt-0.5 text-emerald">✓</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.guidance.why && (
          <div className="mt-4 rounded-xl bg-surface2/60 p-3">
            <Kicker className="mb-1">Why it matters</Kicker>
            <p className="text-xs leading-relaxed text-muted">{result.guidance.why}</p>
          </div>
        )}

        {result.guidance.note && (
          <p className="mt-3 border-l-2 border-emerald/40 pl-3 text-xs italic leading-relaxed text-muted">
            {result.guidance.note}
          </p>
        )}

        {result.guidance.confusion.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="kicker">Often confused with</span>
            {result.guidance.confusion.map((c) => (
              <span key={c} className="chip capitalize">
                {c}
              </span>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Model analysis */}
        <Card>
          <Kicker>Model analysis</Kicker>
          <div className="mt-3">
            <MetricRow label="Prediction" value={p.display} />
            <MetricRow label="Confidence" value={`${p.confidence_pct.toFixed(2)}%`} />
            <MetricRow label="Top alternative" value={p.top5[1] ? `${p.top5[1].display} — ${pct(p.top5[1].probability, 2)}` : '—'} />
            <MetricRow label="Input quality" value={`${q.label} (${q.score.toFixed(2)})`} />
            <MetricRow label="Sharpness" value={q.sharpness.toFixed(1)} />
            <MetricRow label="Brightness" value={q.brightness.toFixed(3)} />
            <MetricRow label="Resolution" value={`${q.resolution.width}×${q.resolution.height}`} />
            <MetricRow label="Model version" value={<span className="break-all">{result.model.version}</span>} />
          </div>
        </Card>

        {/* Sorting + latency */}
        <div className="space-y-4">
          <Card>
            <Kicker>Sorting decision</Kicker>
            <div className="mt-3 flex items-center gap-3">
              <Badge tone={result.sorting.action === 'SORT' ? 'good' : 'warn'}>
                <StatusDot tone={result.sorting.action === 'SORT' ? 'emerald' : 'amber'} />
                {result.sorting.action}
              </Badge>
              <span className="font-mono text-sm text-ink">{result.sorting.bin_label}</span>
              <span className="ml-auto font-mono text-xs text-muted">{result.sorting.target_bin}</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">{result.sorting.reason}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px] text-muted">
              <div className="rounded-lg bg-surface2/60 px-2.5 py-2">
                target x,y (px)
                <div className="mt-0.5 text-ink">
                  {result.sorting.centroid.x_px}, {result.sorting.centroid.y_px}
                </div>
              </div>
              <div className="rounded-lg bg-surface2/60 px-2.5 py-2">
                normalized
                <div className="mt-0.5 text-ink">
                  {result.sorting.centroid.x_norm.toFixed(2)}, {result.sorting.centroid.y_norm.toFixed(2)}
                </div>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted/80">
              Position is the Grad-CAM activation centroid — a real signal from the classifier, not a detector bounding
              box. True localization would require an object-detection model.
            </p>
          </Card>

          <Card>
            <Kicker>Inference latency</Kicker>
            <div className="mt-3 space-y-2">
              {[
                ['Preprocessing', t.preprocess_ms],
                ['Model forward', t.model_ms],
                ['Postprocessing', t.postprocess_ms],
                ['Grad-CAM', t.gradcam_ms],
              ].map(([label, v], i) => (
                <Bar
                  key={String(label)}
                  label={label as string}
                  value={Number(v)}
                  max={Math.max(t.total_ms, 1)}
                  color={i === 1 ? 'rgb(var(--emerald))' : 'rgb(var(--forest) / 0.4)'}
                  display={ms(Number(v))}
                  delay={i * 60}
                />
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
              <span className="text-xs text-muted">Total inference</span>
              <span className="font-mono text-sm font-semibold tabular-nums text-ink">{ms(t.total_ms)}</span>
            </div>
            <div className="mt-1 font-mono text-[11px] text-muted">measured on {result.model.device}</div>
          </Card>
        </div>
      </div>

      <FeedbackBlock result={result} classes={classes} onDone={() => onFeedback?.()} />
    </div>
  )
}
