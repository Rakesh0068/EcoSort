import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type SimStep } from '../api'
import { SiteSection, TechDetails, displayName } from '../components/ui'

function DemoScene({ step, running }: { step: SimStep | null; running: boolean }) {
  const target = step?.decision.decision === 'SORT' ? step.decision.target_bin : null
  return (
    <div className="overflow-hidden rounded-[28px] border border-line bg-surface">
      <div className="flex items-center justify-between px-5 py-3">
        <span className="text-[13px] font-semibold text-muted">Sorting demonstration</span>
        <span className="chip">
          <span className={`h-2 w-2 rounded-full ${running ? 'bg-emerald' : 'bg-muted'}`} />
          {running ? 'Running' : step ? 'Paused' : 'Ready'}
        </span>
      </div>
      {/* Conveyor */}
      <div className="relative mx-4 rounded-2xl bg-surface2 p-4">
        <div className="text-[12px] font-semibold text-muted">Conveyor belt</div>
        <div className="mt-2 flex h-24 items-center justify-center gap-3 overflow-hidden rounded-xl border border-line bg-bg">
          {[...Array(12)].map((_, i) => (
            <span key={i} className={`h-10 w-1.5 rounded-full bg-line ${running ? 'animate-pulse' : ''}`} style={{ animationDelay: `${i * 90}ms` }} />
          ))}
          {step && (
            <img
              src={`data:image/png;base64,${step.overlay_png_b64}`}
              alt="Waste item being sorted in the demonstration"
              className="absolute h-20 w-20 rounded-2xl border-2 border-emerald object-cover shadow-lift"
            />
          )}
        </div>
        <div className="mt-3 flex items-center justify-between text-[12px] font-semibold text-muted">
          <span>📷 Camera</span>
          <span>→</span>
          <span>🔍 Recognition</span>
          <span>→</span>
          <span>🗂️ Sorting decision</span>
          <span>→</span>
          <span>🤖 Robot</span>
        </div>
      </div>
      {/* Bins */}
      <div className="grid grid-cols-4 gap-2 p-4">
        {['Plastic', 'Glass', 'Metal', 'Paper'].map((b) => {
          const isTarget = target?.toLowerCase().includes(b.toLowerCase())
          return (
            <div
              key={b}
              className={`rounded-2xl border-2 py-4 text-center transition ${
                isTarget ? 'border-emerald bg-emerald/10' : 'border-line bg-surface2/60'
              }`}
            >
              <div className="text-2xl">{b === 'Plastic' ? '🍶' : b === 'Glass' ? '🫙' : b === 'Metal' ? '🥫' : '📄'}</div>
              <div className={`mt-1 text-[12px] font-bold ${isTarget ? 'text-forest dark:text-emerald' : 'text-muted'}`}>{b}</div>
            </div>
          )
        })}
      </div>
      <div className="border-t border-line px-5 py-4">
        {!step ? (
          <p className="text-[14px] text-muted">Press Start to watch EcoSort recognise an item and send it to the right bin.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-[14px]">
            <span className="font-bold text-ink">{displayName(step.decision.display ?? step.decision.class)}</span>
            <span className="text-muted">detected —</span>
            <span className="font-semibold text-emerald">
              {step.decision.decision === 'SORT' ? `Sending it to the ${step.decision.bin_label ?? 'correct'} bin…` : 'Holding for a clearer look…'}
            </span>
            {step.decision.decision === 'SORT' && <span className="text-muted">Sorted successfully ✓</span>}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Future() {
  const [step, setStep] = useState<SimStep | null>(null)
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runOne = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await api.robotSimStep()
      setStep(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The demonstration could not run right now.')
      setRunning(false)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!running) return
    let cancelled = false
    let timer: number | undefined
    const tick = async () => {
      if (cancelled) return
      await runOne()
      if (!cancelled) timer = window.setTimeout(tick, 3600)
    }
    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [running, runOne])

  return (
    <div>
      <section className="hero-blob">
        <div className="container-site max-w-3xl py-14 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[13px] font-semibold text-forest">
            Where EcoSort is going
          </div>
          <h1 className="font-display mx-auto mt-4 max-w-2xl text-4xl leading-[1.05] sm:text-5xl">
            From a camera to a sorting robot.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[18px] leading-relaxed text-muted">
            Today, EcoSort helps people identify waste. Tomorrow, the same intelligence can help automated sorting
            systems recognize and separate waste at scale.
          </p>
        </div>
      </section>

      <section className="border-t border-line bg-surface/50">
        <div className="container-site grid max-w-5xl items-start gap-8 section-pad !py-12 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <DemoScene step={step} running={running} />
            <div className="mt-4 flex flex-wrap gap-2">
              {!running ? (
                <button className="btn-primary" onClick={() => setRunning(true)} disabled={busy}>
                  ▶ Start
                </button>
              ) : (
                <button className="btn-ghost" onClick={() => setRunning(false)}>
                  ❚❚ Pause
                </button>
              )}
              <button
                className="btn-ghost"
                onClick={() => {
                  setRunning(false)
                  setStep(null)
                }}
              >
                Reset
              </button>
              {!running && (
                <button className="btn-ghost" onClick={() => void runOne()} disabled={busy}>
                  {busy ? 'Sorting…' : 'Sort one item'}
                </button>
              )}
            </div>
            {error && <p className="mt-3 text-[14px] text-rose">{error}</p>}
            <div className="mt-4">
              <TechDetails summary="Show technical details">
                <div className="font-mono text-[12px] leading-relaxed text-muted">
                  {step ? (
                    <>
                      <div>class: {step.decision.class} · confidence: {(step.decision.confidence * 100).toFixed(1)}%</div>
                      <div>decision: {step.decision.decision} · bin: {step.decision.target_bin ?? 'none'}</div>
                      <div>state: {step.robot_state} · source: real held-out test image</div>
                    </>
                  ) : (
                    'Run the demonstration to see the underlying decision payload.'
                  )}
                </div>
              </TechDetails>
            </div>
          </div>

          <div className="space-y-3">
            <SiteSection align="left" title="A product demo, not a control room." sub="What you're watching is real recognition on real held-out photos — with the arm itself simulated." />
            <div className="card p-6">
              <div className="rounded-2xl border border-amber/30 bg-amber/[0.08] p-4 text-[14px] leading-relaxed text-ink">
                Robot hardware not connected — simulation available.
              </div>
              <ol className="mt-4 space-y-3 text-[15px] leading-relaxed text-muted">
                <li><span className="font-bold text-ink">1. Camera sees an item</span> — a real held-out photo enters the pipeline.</li>
                <li><span className="font-bold text-ink">2. EcoSort recognises it</span> — the same model that powers Scan.</li>
                <li><span className="font-bold text-ink">3. A sorting decision is made</span> — confident items route to a bin; unsure ones are held.</li>
                <li><span className="font-bold text-ink">4. A robot would act</span> — future hardware integration; today the motion is animated.</li>
              </ol>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link to="/scan" className="btn-ghost !py-2.5 text-[14px]">Try the real identifier</Link>
                <Link to="/research" className="btn-ghost !py-2.5 text-[14px]">Inspect the system →</Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
