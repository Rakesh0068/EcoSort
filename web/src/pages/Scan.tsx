import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, type PredictionResult } from '../api'
import { ResultView } from '../components/ResultView'
import { Badge, Card, ErrorState, Kicker, Loading, SectionTitle, Spinner, StatusDot, cx, ms } from '../components/ui'

type Mode = 'upload' | 'camera' | 'live'

const MAX_BYTES = 12 * 1024 * 1024
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/bmp']

export default function Scan() {
  const [params, setParams] = useSearchParams()
  const [mode, setMode] = useState<Mode>('upload')
  const [classes, setClasses] = useState<string[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<PredictionResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [camError, setCamError] = useState<string | null>(null)
  const [liveOn, setLiveOn] = useState(false)
  const [liveStats, setLiveStats] = useState<{ frames: number; avgMs: number } | null>(null)
  const [storedLoading, setStoredLoading] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    api.classes().then((r) => setClasses(r.classes.map((c) => c.id))).catch(() => setClasses([]))
  }, [])

  const clearPreview = useCallback(() => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setFile(null)
  }, [])

  const acceptFile = useCallback(
    (f: File | undefined | null) => {
      if (!f) return
      if (!ACCEPTED.includes(f.type) && !/\.(jpe?g|png|webp|bmp)$/i.test(f.name)) {
        setError(`Unsupported file type "${f.type || f.name}". Use PNG, JPG or WEBP.`)
        return
      }
      if (f.size > MAX_BYTES) {
        setError(`Image is ${(f.size / 1048576).toFixed(1)} MB — the limit is 12 MB.`)
        return
      }
      setError(null)
      setResult(null)
      setFile(f)
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(f)
      })
    },
    [],
  )

  const analyze = useCallback(
    async (blob: File | Blob, source: 'upload' | 'camera') => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(true)
      setError(null)
      try {
        const r = await api.predict(blob, source)
        r.__sourceUrl = preview ?? undefined
        setResult(r)
        setLiveStats((s) => {
          const total = r.timings_ms.total_ms
          const frames = (s?.frames ?? 0) + 1
          return { frames, avgMs: s ? (s.avgMs * (frames - 1) + total) / frames : total }
        })
        return r
      } catch (e) {
        setError(e instanceof Error ? e.message : 'prediction failed')
        return null
      } finally {
        setBusy(false)
        busyRef.current = false
      }
    },
    [preview],
  )

  // ---- stored scan deep-link (?id=...) -----------------------------------
  useEffect(() => {
    const id = params.get('id')
    if (!id) return
    let alive = true
    setStoredLoading(true)
    api
      .scanExplain(id)
      .then((r) => {
        if (!alive) return
        setResult(r)
        setMode('upload')
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'could not load scan'))
      .finally(() => alive && setStoredLoading(false))
    return () => {
      alive = false
    }
  }, [params])

  // ---- camera lifecycle ---------------------------------------------------
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const startCamera = useCallback(async () => {
    setCamError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setCamError(
        /Permission|NotAllowed/i.test(msg)
          ? 'Camera permission was denied. Allow access in your browser settings, or use Upload mode.'
          : `Camera unavailable: ${msg}`,
      )
    }
  }, [])

  useEffect(() => {
    if (mode === 'camera' || mode === 'live') void startCamera()
    else stopCamera()
    return () => stopCamera()
  }, [mode, startCamera, stopCamera])

  useEffect(() => () => clearPreview(), [clearPreview])

  const captureAndAnalyze = useCallback(async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) {
      setError('Camera is not ready yet.')
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.92))
    if (!blob) {
      setError('Could not capture a frame from the camera.')
      return
    }
    await analyze(blob, 'camera')
  }, [analyze])

  // ---- live detection loop ------------------------------------------------
  useEffect(() => {
    if (mode !== 'live' || !liveOn) return
    let cancelled = false
    let timer: number | undefined

    const tick = async () => {
      if (cancelled) return
      if (!busyRef.current) {
        const video = videoRef.current
        if (video && video.videoWidth) {
          const canvas = document.createElement('canvas')
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          canvas.getContext('2d')?.drawImage(video, 0, 0)
          const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.9))
          if (blob && !cancelled) await analyze(blob, 'camera')
        }
      }
      if (!cancelled) timer = window.setTimeout(tick, 2200)
    }

    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [mode, liveOn, analyze])

  const reset = () => {
    clearPreview()
    setResult(null)
    setError(null)
    setLiveOn(false)
    setLiveStats(null)
    setParams({}, { replace: true })
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Smart Scanner"
        sub="Upload an image or use your camera. Every result is a real inference on the trained EfficientNetB0 model."
        right={
          result ? (
            <button className="btn-ghost !px-3 !py-2 text-xs" onClick={reset}>
              Clear result
            </button>
          ) : null
        }
      />

      {/* Mode switch */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['upload', 'Upload'],
            ['camera', 'Camera'],
            ['live', 'Live Detection'],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => {
              setMode(m)
              setError(null)
              setParams({}, { replace: true })
            }}
            className={cx(
              'rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ease-spring',
              mode === m
                ? 'bg-emerald text-white shadow-glow'
                : 'border border-line bg-surface/60 text-muted hover:border-emerald/40 hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} />}
      {storedLoading && <Loading label="Recomputing Grad-CAM for this scan" />}

      {result?.reanalysis && (
        <Card className="border-lime/30 bg-lime/[0.05]">
          <div className="flex items-start gap-3">
            <span className="text-lime">↻</span>
            <div className="text-xs leading-relaxed text-muted">
              <span className="font-semibold text-ink">Re-analysis of a stored scan.</span>{' '}
              {result.reanalysis.note} Original: {result.reanalysis.original_predicted_class} at{' '}
              {(result.reanalysis.original_confidence * 100).toFixed(2)}%.
            </div>
          </div>
        </Card>
      )}

      <div className={cx('grid gap-4', result ? 'lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]' : '')}>
        {/* Input panel */}
        <div className="space-y-4">
          {mode === 'upload' && (
            <Card>
              <Kicker>Image input</Kicker>
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  acceptFile(e.dataTransfer.files?.[0])
                }}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
                className={cx(
                  'mt-3 grid cursor-pointer place-items-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-all duration-200',
                  dragging
                    ? 'border-emerald bg-emerald/[0.07] scale-[1.01]'
                    : 'border-line bg-surface2/40 hover:border-emerald/50 hover:bg-surface2/70',
                )}
              >
                {preview ? (
                  <img
                    src={preview}
                    alt="Selected waste item"
                    className="max-h-64 w-auto rounded-lg object-contain shadow-soft"
                  />
                ) : (
                  <>
                    <div className="text-3xl text-muted/50">+</div>
                    <div className="mt-3 text-sm font-semibold text-ink">Drop waste image here</div>
                    <div className="mt-1 text-xs text-muted">or click to browse</div>
                    <div className="mt-3 font-mono text-[11px] text-muted/70">PNG · JPG · WEBP · up to 12 MB</div>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPTED.join(',')}
                  className="hidden"
                  onChange={(e) => acceptFile(e.target.files?.[0])}
                />
              </div>

              {file && (
                <div className="mt-3 flex items-center justify-between font-mono text-[11px] text-muted">
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  className="btn-primary flex-1"
                  disabled={!file || busy}
                  onClick={() => file && void analyze(file, 'upload')}
                >
                  {busy ? <Spinner className="h-4 w-4" /> : null}
                  {busy ? 'Analyzing…' : 'Analyze Waste →'}
                </button>
                {(file || result) && (
                  <button className="btn-ghost" onClick={reset}>
                    Reset
                  </button>
                )}
              </div>
            </Card>
          )}

          {(mode === 'camera' || mode === 'live') && (
            <Card>
              <div className="flex items-center justify-between">
                <Kicker>{mode === 'live' ? 'Live detection' : 'Camera input'}</Kicker>
                <Badge tone={camError ? 'bad' : 'good'}>
                  <StatusDot tone={camError ? 'rose' : 'emerald'} pulse={!camError} />
                  {camError ? 'unavailable' : 'streaming'}
                </Badge>
              </div>

              <div className="relative mt-3 aspect-video overflow-hidden rounded-xl border border-line bg-black">
                <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
                {busy && (
                  <div className="absolute inset-0 grid place-items-center bg-black/40 backdrop-blur-[1px]">
                    <div className="flex items-center gap-2 rounded-full bg-surface/90 px-3 py-1.5 text-xs font-medium text-ink">
                      <Spinner className="h-3.5 w-3.5 text-emerald" /> inferring…
                    </div>
                  </div>
                )}
                {!busy && (mode === 'camera' || mode === 'live') && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-transparent via-emerald/20 to-transparent animate-scanline" />
                )}
                {camError && (
                  <div className="absolute inset-0 grid place-items-center bg-surface/95 p-4 text-center">
                    <p className="text-xs leading-relaxed text-muted">{camError}</p>
                  </div>
                )}
              </div>

              {mode === 'camera' ? (
                <button className="btn-primary mt-4 w-full" onClick={() => void captureAndAnalyze()} disabled={busy || !!camError}>
                  {busy ? <Spinner className="h-4 w-4" /> : null}
                  Capture & Analyze
                </button>
              ) : (
                <div className="mt-4 space-y-3">
                  <button
                    className={cx('btn w-full', liveOn ? 'btn-danger' : 'btn-primary')}
                    onClick={() => setLiveOn((v) => !v)}
                    disabled={!!camError}
                  >
                    {liveOn ? '■ Stop live detection' : '● Start live detection'}
                  </button>
                  <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                    {[
                      ['frames', String(liveStats?.frames ?? 0)],
                      ['avg', liveStats ? ms(liveStats.avgMs) : '—'],
                      ['class', result?.prediction.display ?? '—'],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-surface2/60 px-2 py-1.5 text-center">
                        <div className="text-muted/70">{k}</div>
                        <div className="mt-0.5 truncate text-ink">{v}</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted">
                    Captures a frame every ~2.2s and runs a real inference. Each detection is stored in history.
                  </p>
                </div>
              )}
            </Card>
          )}

          {result && !storedLoading && (
            <Card>
              <Kicker>Quick facts</Kicker>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Scan ID</span>
                  <span className="truncate font-mono text-ink">{result.scan_id ?? 'not saved'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Total inference</span>
                  <span className="font-mono text-ink">{ms(result.timings_ms.total_ms)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Device</span>
                  <span className="font-mono text-ink">{result.model.device}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Input quality</span>
                  <span className="font-mono text-ink">
                    {result.input_quality.label} ({result.input_quality.score.toFixed(2)})
                  </span>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Result */}
        {result && !storedLoading && (
          <div className="min-w-0">
            <ResultView result={result} classes={classes} onRescan={reset} onFeedback={() => undefined} />
          </div>
        )}
      </div>
    </div>
  )
}
