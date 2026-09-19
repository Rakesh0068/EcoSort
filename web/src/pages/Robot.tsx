import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, b64url, type RobotStatus, type SimStep } from '../api'
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
  ms,
  pct,
} from '../components/ui'

const STATE_TONE: Record<string, 'good' | 'warn' | 'bad' | 'info' | 'neutral'> = {
  READY: 'neutral',
  SCANNING: 'info',
  CLASSIFYING: 'info',
  OBJECT_DETECTED: 'info',
  SORTING: 'good',
  COMPLETED: 'good',
  LOW_CONFIDENCE: 'warn',
  ERROR: 'bad',
  EMERGENCY_STOP: 'bad',
}

/** Conveyor / arm / bins scene. The arm animates to the bin chosen by the real
 *  sorting engine, and the item is a real held-out dataset image. */
function SimScene({
  bins,
  activeBin,
  step,
  moving,
}: {
  bins: string[]
  activeBin: string | null
  step: SimStep | null
  moving: boolean
}) {
  const W = 900
  const H = 340
  const beltY = 96
  const binY = 232
  const n = Math.max(bins.length, 1)
  const slot = W / n
  const binX = (i: number) => slot * i + slot / 2
  const activeIdx = activeBin ? bins.indexOf(activeBin) : -1
  const armX = activeIdx >= 0 ? binX(activeIdx) : W / 2
  const binW = Math.min(slot * 0.72, 96)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Robot sorting simulation">
      <defs>
        <linearGradient id="belt" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgb(var(--surface-2))" />
          <stop offset="50%" stopColor="rgb(var(--line))" />
          <stop offset="100%" stopColor="rgb(var(--surface-2))" />
        </linearGradient>
        <linearGradient id="armGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--emerald))" stopOpacity="0.95" />
          <stop offset="100%" stopColor="rgb(var(--emerald))" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      {/* Camera housing */}
      <g>
        <rect x={W / 2 - 46} y={14} width={92} height={26} rx={8} fill="rgb(var(--surface-2))" stroke="rgb(var(--line))" />
        <circle cx={W / 2} cy={27} r={7} fill="rgb(var(--emerald))" opacity={0.85} />
        <text x={W / 2} y={56} textAnchor="middle" fontSize={10} fill="rgb(var(--muted))" fontFamily="monospace">
          CAMERA
        </text>
      </g>

      {/* Vision cone */}
      <path
        d={`M ${W / 2} 40 L ${W / 2 - 92} ${beltY - 6} L ${W / 2 + 92} ${beltY - 6} Z`}
        fill="rgb(var(--emerald))"
        opacity={moving ? 0.14 : 0.06}
      />

      {/* Conveyor */}
      <rect x={0} y={beltY} width={W} height={20} rx={10} fill="url(#belt)" stroke="rgb(var(--line))" />
      {Array.from({ length: 22 }).map((_, i) => (
        <line
          key={i}
          x1={i * (W / 22) + 8}
          y1={beltY + 3}
          x2={i * (W / 22) + 2}
          y2={beltY + 17}
          stroke="rgb(var(--muted))"
          strokeOpacity={0.28}
          strokeWidth={2}
        />
      ))}
      <text x={10} y={beltY - 8} fontSize={10} fill="rgb(var(--muted))" fontFamily="monospace">
        CONVEYOR
      </text>

      {/* Item on belt */}
      {step && (
        <g
          style={{
            transform: moving && activeIdx >= 0 ? `translate(${armX - W / 2}px, ${binY - beltY - 34}px)` : 'none',
            transition: 'transform 900ms cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          <image
            href={step.decision.decision === 'SORT' ? b64url(step.overlay_png_b64) : step.source_image}
            x={W / 2 - 30}
            y={beltY - 62}
            width={60}
            height={60}
            preserveAspectRatio="xMidYMid slice"
            clipPath="inset(0 round 8px)"
          />
          <rect
            x={W / 2 - 30}
            y={beltY - 62}
            width={60}
            height={60}
            rx={8}
            fill="none"
            stroke={step.decision.decision === 'SORT' ? 'rgb(var(--emerald))' : 'rgb(var(--amber))'}
            strokeWidth={2}
          />
          {/* centroid marker - real Grad-CAM activation centroid */}
          <circle
            cx={W / 2 - 30 + step.centroid.x_norm * 60}
            cy={beltY - 62 + step.centroid.y_norm * 60}
            r={4}
            fill="rgb(var(--lime))"
            stroke="rgb(var(--bg))"
            strokeWidth={1.5}
          />
        </g>
      )}

      {/* Robot arm */}
      <g
        style={{
          transform: `translateX(${armX - W / 2}px)`,
          transition: 'transform 700ms cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <line x1={W / 2} y1={beltY + 26} x2={W / 2} y2={binY - 46} stroke="url(#armGrad)" strokeWidth={7} strokeLinecap="round" />
        <circle cx={W / 2} cy={beltY + 26} r={9} fill="rgb(var(--emerald))" opacity={0.9} />
        <path
          d={`M ${W / 2 - 15} ${binY - 46} L ${W / 2 + 15} ${binY - 46} L ${W / 2 + 9} ${binY - 30} L ${W / 2 - 9} ${binY - 30} Z`}
          fill="rgb(var(--emerald))"
          opacity={0.85}
        />
      </g>

      {/* Bins */}
      {bins.map((b, i) => {
        const isActive = b === activeBin
        const x = binX(i)
        return (
          <g key={b}>
            <rect
              x={x - binW / 2}
              y={binY}
              width={binW}
              height={70}
              rx={10}
              fill={isActive ? 'rgb(var(--emerald) / 0.22)' : 'rgb(var(--surface-2))'}
              stroke={isActive ? 'rgb(var(--emerald))' : 'rgb(var(--line))'}
              strokeWidth={isActive ? 2.5 : 1.5}
              style={{ transition: 'all 400ms ease' }}
            />
            <text
              x={x}
              y={binY + 30}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fill={isActive ? 'rgb(var(--emerald))' : 'rgb(var(--muted))'}
              fontFamily="monospace"
            >
              {b.replace('BIN_', '')}
            </text>
            <text x={x} y={binY + 50} textAnchor="middle" fontSize={9} fill="rgb(var(--muted))" fontFamily="monospace">
              {String(i + 1).padStart(2, '0')}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function Robot() {
  const [status, setStatus] = useState<RobotStatus | null>(null)
  const [step, setStep] = useState<SimStep | null>(null)
  const [moving, setMoving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [auto, setAuto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [compat, setCompat] = useState<{ checks: Record<string, boolean>; ready_for_deployment: boolean; blocking: string[] } | null>(null)
  const busyRef = useRef(false)

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([api.robotStatus(), api.robotCompatibility()])
      setStatus(s)
      setCompat(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'robot status unavailable')
    }
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(load, 4000)
    return () => clearInterval(id)
  }, [load])

  const runStep = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    setMoving(false)
    try {
      const r = await api.robotSimStep()
      setStep(r)
      if (r.decision.decision === 'SORT') {
        await new Promise((res) => setTimeout(res, 120))
        setMoving(true)
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'simulation step failed')
    } finally {
      setBusy(false)
      busyRef.current = false
    }
  }, [load])

  // Auto-run loop
  useEffect(() => {
    if (!auto) return
    let cancelled = false
    let timer: number | undefined
    const tick = async () => {
      if (cancelled) return
      await runStep()
      if (!cancelled) timer = window.setTimeout(tick, 3200)
    }
    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [auto, runStep])

  const bins = status?.bins ?? []
  const activeBin = step?.decision.decision === 'SORT' ? step.decision.target_bin : null
  const t = status?.telemetry
  const decided = step?.decision

  const stateTone = useMemo(() => STATE_TONE[status?.state ?? 'READY'] ?? 'neutral', [status?.state])

  if (!status && !error) return <Loading label="Connecting to robot controller" />

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Robot Control Center"
        sub="Confidence-gated sorting decisions on real held-out images. No physical arm is attached - this is the software layer a robot would connect to."
        right={
          <div className="flex items-center gap-2">
            <Badge tone={stateTone}>
              <StatusDot
                tone={status?.emergency_stop ? 'rose' : status?.state === 'COMPLETED' ? 'emerald' : 'lime'}
                pulse={!status?.emergency_stop}
              />
              {status?.state ?? '—'}
            </Badge>
          </div>
        }
      />

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {/* Simulation scene */}
      <Card className="!p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="flex items-center gap-3">
            <Kicker>EcoSort Simulator</Kicker>
            <span className="chip">
              <StatusDot tone="lime" pulse={busy} />
              {busy ? 'processing' : auto ? 'auto-running' : 'idle'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary !px-3.5 !py-2 text-xs" onClick={() => void runStep()} disabled={busy}>
              {busy ? 'Processing…' : 'Process next item'}
            </button>
            <button
              className={cx('!px-3.5 !py-2 text-xs', auto ? 'btn-danger' : 'btn-ghost')}
              onClick={() => setAuto((v) => !v)}
              disabled={busy}
            >
              {auto ? '■ Stop auto' : '▶ Auto-run'}
            </button>
            <button
              className="btn-ghost !px-3.5 !py-2 text-xs"
              onClick={async () => {
                setAuto(false)
                await api.robotReset()
                setStep(null)
                setMoving(false)
                await load()
              }}
            >
              Reset
            </button>
            <button
              className={cx('!px-3.5 !py-2 text-xs', status?.emergency_stop ? 'btn-primary' : 'btn-danger')}
              onClick={async () => {
                setAuto(false)
                await api.robotEstop(!status?.emergency_stop)
                await load()
              }}
            >
              {status?.emergency_stop ? 'Release E-Stop' : '⛔ Emergency stop'}
            </button>
          </div>
        </div>

        <div className="bg-surface2/40 p-3">
          <SimScene bins={bins} activeBin={activeBin} step={step} moving={moving} />
        </div>

        {/* Live readout */}
        <div className="grid gap-px border-t border-line bg-line/60 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['Classification', decided?.display ?? '—'],
            ['Confidence', decided ? pct(decided.confidence, 1) : '—'],
            [
              'Position (centroid)',
              decided ? `x ${decided.centroid.x_px} · y ${decided.centroid.y_px}` : '—',
            ],
            ['Target bin', decided?.target_bin ?? '—'],
            ['Decision', decided?.decision ?? '—'],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface px-4 py-3">
              <div className="kicker">{k}</div>
              <div
                className={cx(
                  'mt-1 truncate font-mono text-sm font-semibold',
                  k === 'Decision' && decided?.decision === 'SORT'
                    ? 'text-emerald'
                    : k === 'Decision' && decided
                      ? 'text-amber'
                      : 'text-ink',
                )}
              >
                {v}
              </div>
            </div>
          ))}
        </div>

        {decided && (
          <div className="border-t border-line px-5 py-3">
            <p className="text-xs leading-relaxed text-muted">
              <span className="font-semibold text-ink">Why:</span> {decided.reason}
            </p>
            <p className="mt-1 font-mono text-[11px] text-muted/80">
              source: real held-out test image · inference {ms(decided.latency_ms)} · input quality {decided.quality}
            </p>
          </div>
        )}
      </Card>

      {/* Telemetry */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Objects processed" value={t?.objects_processed.toLocaleString() ?? '0'} />
        <Stat
          label="Sorted"
          value={t?.sorted.toLocaleString() ?? '0'}
          sub={t?.sort_rate != null ? `${pct(t.sort_rate, 1)} sort rate` : 'no decisions yet'}
        />
        <Stat label="Held for review" value={t?.held_for_review.toLocaleString() ?? '0'} sub="below confidence gate" />
        <Stat label="Avg inference" value={ms(t?.avg_inference_ms ?? null)} sub={`threshold ${pct(status?.confidence_threshold ?? 0.6, 0)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Health */}
        <Card>
          <Kicker>Robot health</Kicker>
          <div className="mt-3 space-y-2">
            {Object.entries(status?.health ?? {}).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 border-b border-line/60 py-1.5 last:border-0">
                <span className="text-xs capitalize text-muted">{k.replace(/_/g, ' ')}</span>
                <span className="flex items-center gap-2 font-mono text-[11px] text-ink">
                  <StatusDot
                    tone={
                      v.status === 'online' || v.status === 'loaded' || v.status === 'ready'
                        ? 'emerald'
                        : v.status === 'simulated'
                          ? 'lime'
                          : v.status === 'engaged' || v.status === 'halted'
                            ? 'rose'
                            : 'amber'
                    }
                    pulse={false}
                  />
                  {v.status}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <MetricRow label="Mode" value={status?.mode ?? '—'} />
            <MetricRow label="Uptime" value={`${Math.round(status?.uptime_seconds ?? 0)}s`} />
          </div>
        </Card>

        {/* Compatibility */}
        <Card>
          <div className="flex items-center justify-between">
            <Kicker>Model → robot compatibility</Kicker>
            <Badge tone={compat?.ready_for_deployment ? 'good' : 'warn'}>
              {compat?.ready_for_deployment ? 'ready' : 'blocked'}
            </Badge>
          </div>
          <div className="mt-3 space-y-1.5">
            {Object.entries(compat?.checks ?? {}).map(([k, ok]) => (
              <div key={k} className="flex items-center gap-2 text-xs">
                <span className={ok ? 'text-emerald' : 'text-rose'}>{ok ? '✓' : '✕'}</span>
                <span className="text-muted">{k.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
          {compat && !compat.ready_for_deployment && compat.blocking.length > 0 && (
            <p className="mt-3 rounded-lg bg-amber/10 p-2 text-[11px] text-amber">
              Blocking: {compat.blocking.join(', ')}
            </p>
          )}
        </Card>

        {/* Bin map */}
        <Card>
          <Kicker>Configurable bin mapping</Kicker>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            The robot doesn't need to know the classification taxonomy — EcoSort resolves class → bin here.
          </p>
          <div className="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1">
            {Object.entries(status?.bin_map ?? {}).map(([cls, bin]) => (
              <div key={cls} className="flex items-center justify-between gap-2 rounded-lg bg-surface2/50 px-2.5 py-1.5">
                <span className="text-xs capitalize text-ink">{cls}</span>
                <span className="font-mono text-[11px] text-emerald">{bin}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Decision log */}
      <Card>
        <div className="flex items-center justify-between">
          <Kicker>Recent decisions</Kicker>
          <span className="font-mono text-[11px] text-muted">{status?.recent.length ?? 0} in memory</span>
        </div>
        {!status?.recent.length ? (
          <p className="mt-3 text-xs text-muted">No decisions yet — process an item to begin.</p>
        ) : (
          <div className="mt-3 divide-y divide-line/60">
            {status.recent.slice(0, 12).map((d, i) => (
              <div key={`${d.timestamp}-${i}`} className="flex flex-wrap items-center gap-3 py-2.5">
                <Badge tone={d.decision === 'SORT' ? 'good' : d.decision === 'HOLD_FOR_REVIEW' ? 'warn' : 'bad'}>
                  {d.decision}
                </Badge>
                <span className="text-sm font-semibold capitalize text-ink">{d.display}</span>
                <span className="font-mono text-xs text-muted">{pct(d.confidence, 1)}</span>
                <span className="font-mono text-xs text-muted">{d.target_bin ?? 'no bin'}</span>
                <span className="ml-auto font-mono text-[11px] text-muted/70">
                  {new Date(d.timestamp * 1000).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
