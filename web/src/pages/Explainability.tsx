import { useState } from 'react'
import { api, b64url, type PredictionResult } from '../api'
import { Badge, Card, Empty, ErrorState, Kicker, Loading, SectionTitle, Spinner, cx } from '../components/ui'

/** Research-grade explainability: original vs heatmap vs overlay, with the
 *  honest caption about what Grad-CAM is and is not. */
export default function Explainability() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<PredictionResult | null>(null)
  const [view, setView] = useState<'original' | 'heatmap' | 'overlay'>('overlay')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = (f: File | null) => {
    if (!f) return
    setFile(f)
    setResult(null)
    setError(null)
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(f)
    })
  }

  const run = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.predict(file, 'upload')
      r.__sourceUrl = preview ?? undefined
      setResult(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'explanation failed')
    } finally {
      setBusy(false)
    }
  }

  const src =
    !result
      ? null
      : view === 'original'
        ? result.__sourceUrl
        : view === 'heatmap'
          ? b64url(result.explainability.heatmap_png_b64)
          : b64url(result.explainability.overlay_png_b64)

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Explainability"
        sub="Grad-CAM highlights image regions associated with the model's prediction — attribution of activations, not proof or causal reasoning."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card>
          <Kicker>Input image</Kicker>
          <label className="mt-3 grid cursor-pointer place-items-center rounded-xl border-2 border-dashed border-line px-6 py-10 text-center transition hover:border-emerald/50">
            {preview ? (
              <img src={preview} alt="Selected input" className="max-h-56 w-auto rounded-lg object-contain" />
            ) : (
              <>
                <div className="text-3xl text-muted/50">+</div>
                <div className="mt-2 text-sm font-semibold text-ink">Choose an image</div>
                <div className="mt-1 font-mono text-[11px] text-muted">PNG · JPG · WEBP · up to 12 MB</div>
              </>
            )}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/bmp" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </label>
          <button className="btn-primary mt-4 w-full" disabled={!file || busy} onClick={() => void run()}>
            {busy ? <Spinner className="h-4 w-4" /> : null}
            {busy ? 'Explaining…' : 'Explain prediction'}
          </button>
          {error && <div className="mt-3"><ErrorState message={error} /></div>}
        </Card>

        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Kicker className="mr-auto">Attribution view</Kicker>
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
          <div className="relative mt-3 overflow-hidden rounded-xl border border-line bg-surface2">
            {src ? (
              <img src={src} alt={`${view} view`} className="aspect-square w-full object-contain" />
            ) : (
              <div className="grid aspect-square w-full place-items-center text-xs text-muted">
                {busy ? <Loading label="Computing Grad-CAM" /> : 'Run an explanation to see the attribution map'}
              </div>
            )}
            {result && view !== 'original' && (
              <div className="absolute bottom-2 left-2 rounded-lg bg-black/60 px-2 py-1 font-mono text-[10px] text-white">
                {result.explainability.target_layer}
              </div>
            )}
          </div>
          {result && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={result.prediction.state === 'high' ? 'good' : result.prediction.state === 'moderate' ? 'warn' : 'bad'}>
                {result.prediction.display} · {(result.prediction.confidence * 100).toFixed(2)}%
              </Badge>
              <span className="font-mono text-[11px] text-muted">
                centroid x {result.explainability.activation_centroid.x_norm.toFixed(3)} · y{' '}
                {result.explainability.activation_centroid.y_norm.toFixed(3)}
              </span>
            </div>
          )}
          {result && result.scan_id == null && <p className="mt-2 text-[11px] text-muted">This explanation was not persisted.</p>}
        </Card>
      </div>

      <Card>
        <Kicker>What Grad-CAM actually shows</Kicker>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          Gradients of the predicted class score are pooled over the final convolutional feature map to show which
          regions drove the decision. Bright regions contributed most to the class score. This is an attribution of
          the network's own activations — not a claim that the model understands the object, and not a causal
          explanation.
        </p>
      </Card>

      {!result && !busy && (
        <Empty title="No explanation yet" hint="Pick an image on the left and run the explainer. For saved scans, open them from the prediction log." />
      )}
    </div>
  )
}
