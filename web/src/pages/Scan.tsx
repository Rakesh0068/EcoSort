import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, type PredictionResult } from '../api'
import { ResultView } from '../components/ResultView'

type Mode = 'photo' | 'camera'

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/bmp']
const MAX_BYTES = 12 * 1024 * 1024

export default function Scan() {
  const [params, setParams] = useSearchParams()
  const [mode, setMode] = useState<Mode>('photo')
  const [classes, setClasses] = useState<string[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<PredictionResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [camError, setCamError] = useState<string | null>(null)
  const [loadingStored, setLoadingStored] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    api.classes().then((r) => setClasses(r.classes.map((c) => c.id))).catch(() => setClasses([]))
  }, [])

  const acceptFile = useCallback((f: File | undefined | null) => {
    if (!f) return
    if (!ACCEPTED.includes(f.type) && !/\.(jpe?g|png|webp|bmp)$/i.test(f.name)) {
      setError('That file type doesn’t work — please use a PNG, JPG or WEBP photo.')
      return
    }
    if (f.size > MAX_BYTES) {
      setError(`That photo is ${(f.size / 1048576).toFixed(1)} MB — the limit is 12 MB.`)
      return
    }
    setError(null)
    setResult(null)
    setFile(f)
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(f)
    })
  }, [])

  const analyze = useCallback(
    async (blob: File | Blob, source: 'upload' | 'camera') => {
      if (busyRef.current) return null
      busyRef.current = true
      setBusy(true)
      setError(null)
      try {
        const r = await api.predict(blob, source)
        r.__sourceUrl = preview ?? undefined
        setResult(r)
        return r
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong while identifying your waste.')
        return null
      } finally {
        setBusy(false)
        busyRef.current = false
      }
    },
    [preview],
  )

  // Stored scan deep-link (?id=...)
  useEffect(() => {
    const id = params.get('id')
    if (!id) return
    let alive = true
    setLoadingStored(true)
    api
      .scanExplain(id)
      .then((r) => alive && (setResult(r), setMode('photo')))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Could not open that scan'))
      .finally(() => alive && setLoadingStored(false))
    return () => {
      alive = false
    }
  }, [params])

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
          ? 'Camera access was blocked. Allow it in your browser settings — or use a photo instead.'
          : `Camera isn't available right now (${msg}). Try uploading a photo instead.`,
      )
    }
  }, [])

  useEffect(() => {
    if (mode === 'camera') void startCamera()
    else stopCamera()
    return () => stopCamera()
  }, [mode, startCamera, stopCamera])

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )

  const captureAndAnalyze = useCallback(async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) {
      setError('The camera isn’t ready yet — give it a second.')
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.92))
    if (!blob) {
      setError('Could not grab a frame from the camera.')
      return
    }
    await analyze(blob, 'camera')
  }, [analyze])

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setFile(null)
    setResult(null)
    setError(null)
    setParams({}, { replace: true })
  }

  return (
    <div className="container-site max-w-4xl py-10">
      <div className="text-center">
        <h1 className="font-display text-4xl text-ink sm:text-5xl">Let's identify it.</h1>
        <p className="mx-auto mt-3 max-w-md text-[17px] leading-relaxed text-muted">
          Take a photo or upload an image of your waste.
        </p>
        <div className="mx-auto mt-6 flex w-fit gap-1.5 rounded-full bg-surface2 p-1.5">
          {(['photo', 'camera'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m)
                setError(null)
              }}
              className={
                mode === m
                  ? 'rounded-full bg-surface px-6 py-2.5 text-[15px] font-semibold text-ink shadow-soft'
                  : 'rounded-full px-6 py-2.5 text-[15px] font-medium text-muted'
              }
            >
              {m === 'photo' ? 'Photo' : 'Camera'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-rose/30 bg-rose/[0.06] p-4 text-[14px] text-ink">
          {error}
        </div>
      )}
      {loadingStored && (
        <div className="mt-6 text-center text-[15px] text-muted">Opening your saved scan…</div>
      )}

      {!result && !loadingStored && (
        <div className="mx-auto mt-6 max-w-2xl">
          {mode === 'photo' ? (
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
              className={`grid cursor-pointer place-items-center rounded-[28px] border-2 border-dashed px-6 py-14 text-center transition ${
                dragging ? 'border-emerald bg-emerald/[0.06]' : 'border-line bg-surface hover:border-emerald/50'
              }`}
            >
              {preview ? (
                <img src={preview} alt="Your waste item" className="max-h-72 w-auto rounded-2xl object-contain shadow-soft" />
              ) : (
                <>
                  <div className="grid h-16 w-16 place-items-center rounded-3xl bg-surface2 text-3xl">📸</div>
                  <div className="mt-4 text-[18px] font-bold text-ink">Drop a waste photo here</div>
                  <div className="mt-1 text-[14px] text-muted">or click to choose one from your device</div>
                  <div className="mt-3 text-[12px] text-muted">PNG, JPG or WEBP · up to 12 MB</div>
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
          ) : (
            <div className="overflow-hidden rounded-[28px] border border-line bg-surface">
              <div className="relative aspect-video bg-black">
                <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
                {busy && (
                  <div className="absolute inset-0 grid place-items-center bg-black/40">
                    <div className="rounded-full bg-surface px-4 py-2 text-[14px] font-medium text-ink">
                      Looking at your waste…
                    </div>
                  </div>
                )}
                {camError && (
                  <div className="absolute inset-0 grid place-items-center bg-surface p-6 text-center">
                    <p className="max-w-sm text-[14px] leading-relaxed text-muted">{camError}</p>
                  </div>
                )}
              </div>
              <div className="p-5">
                <button className="btn-primary w-full" onClick={() => void captureAndAnalyze()} disabled={busy || !!camError}>
                  {busy ? 'Looking…' : 'Take photo & identify'}
                </button>
              </div>
            </div>
          )}

          {mode === 'photo' && (
            <button
              className="btn-primary mt-4 w-full !py-4 !text-[17px]"
              disabled={!file || busy}
              onClick={() => file && void analyze(file, 'upload')}
            >
              {busy ? 'Looking at your waste…' : 'Identify this'}
            </button>
          )}
          <p className="mt-3 text-center text-[13px] text-muted">
            By scanning you agree your photo may be stored to improve EcoSort. No account needed.
          </p>
        </div>
      )}

      {busy && !result && (
        <div className="mx-auto mt-8 max-w-2xl text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-line border-t-emerald" />
          <div className="mt-3 text-[16px] font-medium text-ink">Looking at your waste…</div>
          <div className="mt-1 text-[14px] text-muted">This usually takes a few seconds.</div>
        </div>
      )}

      {result && !loadingStored && (
        <div className="mx-auto mt-8 max-w-2xl">
          <ResultView result={result} classes={classes.length ? classes : [result.prediction.class]} onTryAgain={reset} />
          <button className="btn-ghost mt-4 w-full" onClick={reset}>
            Try another image
          </button>
        </div>
      )}
    </div>
  )
}
