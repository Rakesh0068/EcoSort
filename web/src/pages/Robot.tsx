import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, b64url, type RobotConfig, type RobotEvent, type RobotStatus, type SimStep } from '../api'
import { CalibrationPanel, QueuePanel, SimulationBanner, StatusPanel } from '../components/RobotPanels'
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
  StatusDot,
  cx,
  ms,
  pct,
} from '../components/ui'

const STATE_TONE: Record<string, 'good' | 'warn' | 'bad' | 'info' | 'neutral'> = {
  IDLE: 'neutral',
  READY: 'neutral',
  SCANNING: 'info',
  CLASSIFYING: 'info',
  OBJECT_DETECTED: 'info',
  DECISION_READY: 'info',
  MOVING: 'info',
  PICKING: 'info',
  RELEASING: 'info',
  SORTING: 'good',
  COMPLETED: 'good',
  LOW_CONFIDENCE: 'warn',
  ERROR: 'bad',
  EMERGENCY_STOP: 'bad',
}

const TABS = [
  { id: 'control', label: 'Control Center' },
  { id: 'simulation', label: 'Simulation' },
  { id: 'queue', label: 'Sorting Queue' },
  { id: 'status', label: 'Robot Status' },
  { id: 'calibration', label: 'Calibration' },
] as const

type TabId = (typeof TABS)[number]['id']
type Compat = Awaited<ReturnType<typeof api.robotCompatibility>>

/** Conveyor / arm / bins scene. The arm animates to the bin chosen by the real
 *  sorting engine, and the item is a real held-out dataset image. */
function SimScene({
  bins,
  activeBin,
  step,
  moving,
  phase,
}: {
  bins: string[]
  activeBin: string | null
  step: SimStep | null
  moving: boolean
  phase: string | null
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

      {phase && (
        <text x={W - 12} y={28} textAnchor="end" fontSize={11} fill="rgb(var(--lime))" fontFamily="monospace">
          SIM · {phase}
        </text>
      )}
    </svg>
  )
}

function Readout({ step }: { step: SimStep | null }) {
  const decided = step?.decision
  return (
    <>
      <div className="grid gap-px border-t border-line bg-line/60 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Classification', decided?.display ?? '—'],
          ['Confidence', decided ? pct(decided.confidence, 1) : '—'],
          ['Position (centroid)', decided ? `x ${decided.centroid.x_px} · y ${decided.centroid.y_px}` : '—'],
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
            source: real held-out test image · inference {ms(decided.latency_ms)} · input quality {decided.quality} ·
            position is the Grad-CAM activation centroid, not a detection box
          </p>
        </div>
      )}
    </>
  )
}

function EventLog({ events, limit = 14 }: { events: RobotEvent[] | null; limit?: number }) {
  if (!events) return <p className="mt-3 text-xs text-muted">Loading event log…</p>
  if (!events.length)
    return (
      <p className="mt-3 text-xs text-muted">
        No events recorded yet — every state change, decision and config edit is written here.
      </p>
    )
  return (
    <div className="mt-3 max-h-80 space-y-1 overflow-y-auto pr-1 font-mono text-[11px]">
      {events.slice(0, limit).map((e) => {
        const d = (e.detail ?? {}) as Record<string, unknown>
        return (
          <div key={e.id} className="flex flex-wrap items-baseline gap-2 border-b border-line/50 py-1.5 last:border-0">
            <span className="text-muted/70">{new Date(e.created_at).toLocaleTimeString()}</span>
            <span
              className={cx(
                'uppercase tracking-wide',
                e.kind === 'emergency_stop' ? 'text-rose' : e.kind.startsWith('sort') ? 'text-emerald' : 'text-lime',
              )}
            >
              {e.kind}
            </span>
            {e.cls && <span className="capitalize text-ink">{e.cls}</span>}
            {e.confidence != null && <span className="text-muted">{pct(e.confidence, 1)}</span>}
            {e.target_bin && <span className="text-emerald">{e.target_bin}</span>}
            {typeof d.decision === 'string' && <span className="text-muted">{d.decision}</span>}
          </div>
        )
      })}
    </div>
  )
}

export default function Robot() {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : 'control'

  const [status, setStatus] = useState<RobotStatus | null>(null)
  const [compat, setCompat] = useState<Compat | null>(null)
  const [cfg, setCfg] = useState<RobotConfig | null>(null)
  const [events, setEvents] = useState<RobotEvent[] | null>(null)
  const [step, setStep] = useState<SimStep | null>(null)
  const [moving, setMoving] = useState(false)
  const [phase, setPhase] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [auto, setAuto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)
  const timers = useRef<number[]>([])

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }, [])

  const load = useCallback(async () => {
    try {
      const [s, c, k, e] = await Promise.all([
        api.robotStatus(),
        api.robotCompatibility(),
        api.robotConfig(),
        api.robotEvents(50),
      ])
      setStatus(s)
      setCompat(c)
      setCfg(k)
      setEvents(e.events)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'robot status unavailable')
    }
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => clearTimers, [clearTimers])

  const runStep = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    setMoving(false)
    setPhase(null)
    clearTimers()
    try {
      const r = await api.robotSimStep()
      setStep(r)
      if (r.decision.decision === 'SORT' && r.motion_phases.length) {
        r.motion_phases.forEach((p, i) => {
          timers.current.push(
            window.setTimeout(() => {
              setPhase(p)
              if (i === 0) setMoving(true)
            }, 140 + i * 700),
          )
        })
      }
      await load()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'simulation step failed'
      setError(message)
      if (message.toLowerCase().includes('paused') || message.toLowerCase().includes('emergency')) setAuto(false)
    } finally {
      setBusy(false)
      busyRef.current = false
    }
  }, [load, clearTimers])

  // Auto-run loop
  useEffect(() => {
    if (!auto) return
    let cancelled = false
    let timer: number | undefined
    const tick = async () => {
      if (cancelled) return
      await runStep()
      if (!cancelled) timer = window.setTimeout(tick, 3400)
    }
    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [auto, runStep])

  const setTab = (id: TabId) => {
    const next = new URLSearchParams(params)
    if (id === 'control') next.delete('tab')
    else next.set('tab', id)
    setParams(next, { replace: true })
  }

  const start = async () => {
    if (status?.paused) await api.robotPause(false)
    setAuto(true)
    await load()
  }
  const pause = async () => {
    setAuto(false)
    await api.robotPause(true)
    await load()
  }
  const reset = async () => {
    setAuto(false)
    clearTimers()
    setStep(null)
    setMoving(false)
    setPhase(null)
    await api.robotReset()
    await load()
  }

  const bins = status?.bins ?? []
  const activeBin = step?.decision.decision === 'SORT' ? step.decision.target_bin : null
  const t = status?.telemetry
  const decided = step?.decision
  const stateTone = useMemo(() => STATE_TONE[status?.state ?? 'READY'] ?? 'neutral', [status?.state])

  if (!status && !error) return <Loading label="Connecting to robot controller" />

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Robot"
        sub="Confidence-gated sorting decisions from the real model. No physical arm is attached — this is the software layer a robot controller connects to."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={stateTone}>
              <StatusDot
                tone={status?.emergency_stop ? 'rose' : status?.paused ? 'amber' : status?.state === 'COMPLETED' ? 'emerald' : 'lime'}
                pulse={!status?.emergency_stop}
              />
              {status?.state ?? '—'}
            </Badge>
            <Badge tone="info">{status?.interface ?? 'SIMULATION'}</Badge>
          </div>
        }
      />

      <div className="flex flex-wrap gap-1.5 border-b border-line pb-px">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={cx(
              'rounded-t-lg border border-b-0 px-3.5 py-2 text-xs font-medium transition-colors',
              tab === tb.id
                ? 'border-line bg-surface text-ink'
                : 'border-transparent text-muted hover:bg-surface2/60 hover:text-ink',
            )}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {error && tab !== 'queue' && tab !== 'calibration' && <ErrorState message={error} onRetry={() => void load()} />}

      {tab === 'control' && (
        <div className="space-y-4">
          <SimulationBanner status={status} />

          <Card className="!p-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
              <div className="flex items-center gap-3">
                <Kicker>Live sorting view</Kicker>
                <span className="chip">
                  <StatusDot tone={status?.paused ? 'amber' : 'lime'} pulse={busy} />
                  {busy ? 'processing' : auto ? 'auto-running' : status?.paused ? 'paused' : 'idle'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary !px-3.5 !py-2 text-xs" onClick={() => void runStep()} disabled={busy}>
                  {busy ? 'Processing…' : 'Process next item'}
                </button>
                <button className="btn-ghost !px-3.5 !py-2 text-xs" onClick={() => setTab('simulation')}>
                  Open simulator
                </button>
              </div>
            </div>

            <div className="bg-surface2/40 p-3">
              <SimScene bins={bins} activeBin={activeBin} step={step} moving={moving} phase={phase} />
            </div>

            <Readout step={step} />
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Objects processed" value={(t?.objects_processed ?? 0).toLocaleString()} />
            <Stat
              label="Sorted"
              value={(t?.sorted ?? 0).toLocaleString()}
              sub={t?.sort_rate != null ? `${pct(t.sort_rate, 1)} sort rate` : 'no decisions yet'}
            />
            <Stat label="Held for review" value={(t?.held_for_review ?? 0).toLocaleString()} sub="below confidence gate" />
            <Stat
              label="Avg inference"
              value={ms(t?.avg_inference_ms ?? null)}
              sub={`gate ${pct(status?.confidence_threshold ?? null, 0)}`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="flex items-center justify-between">
                <Kicker>Recent decisions</Kicker>
                <span className="font-mono text-[11px] text-muted">{status?.recent.length ?? 0} in memory</span>
              </div>
              {!status?.recent.length ? (
                <p className="mt-3 text-xs text-muted">No decisions yet — process an item to begin.</p>
              ) : (
                <div className="mt-3 divide-y divide-line/60">
                  {status.recent.slice(0, 10).map((d, i) => (
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
              <button onClick={() => setTab('calibration')} className="btn-ghost mt-3 !px-3 !py-1.5 text-[11px]">
                Edit mapping
              </button>
            </Card>
          </div>
        </div>
      )}

      {tab === 'simulation' && (
        <div className="space-y-4">
          <SimulationBanner status={status} />

          <Card className="!p-0 overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
              <Kicker>EcoSort Simulator</Kicker>
              <span className="chip">
                <StatusDot tone={status?.emergency_stop ? 'rose' : busy ? 'lime' : 'muted'} pulse={busy || auto} />
                {status?.emergency_stop
                  ? 'emergency stop'
                  : busy
                    ? 'processing'
                    : auto
                      ? 'running'
                      : status?.paused
                        ? 'paused'
                        : 'idle'}
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <button onClick={() => void start()} disabled={auto || busy} className="btn-primary !px-3.5 !py-2 text-xs">
                  ▶ Start
                </button>
                <button onClick={() => void runStep()} disabled={busy} className="btn-ghost !px-3.5 !py-2 text-xs">
                  Step
                </button>
                <button onClick={() => void pause()} disabled={!auto && status?.paused} className="btn-ghost !px-3.5 !py-2 text-xs">
                  ❚❚ Pause
                </button>
                <button onClick={() => void reset()} className="btn-ghost !px-3.5 !py-2 text-xs">
                  ⟲ Reset
                </button>
                <button
                  className={cx('!px-3.5 !py-2 text-xs', status?.emergency_stop ? 'btn-primary' : 'btn-danger')}
                  onClick={async () => {
                    setAuto(false)
                    await api.robotEstop(!status?.emergency_stop)
                    await load()
                  }}
                >
                  {status?.emergency_stop ? 'Release E-Stop' : '⛔ E-Stop'}
                </button>
              </div>
            </div>

            <div className="bg-surface2/40 p-3">
              <SimScene bins={bins} activeBin={activeBin} step={step} moving={moving} phase={phase} />
            </div>

            <Readout step={step} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between">
                <Kicker>Event log</Kicker>
                <button onClick={() => void load()} className="btn-ghost !px-2.5 !py-1 text-[11px]">
                  refresh
                </button>
              </div>
              <EventLog events={events} limit={20} />
            </Card>

            <Card>
              <Kicker>State machine</Kicker>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                States the controller can report. Motion phases are simulation-only — there is no arm to move.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(cfg?.states ?? []).map((s) => (
                  <span
                    key={s}
                    className={cx(
                      'rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wide',
                      s === status?.state
                        ? 'border-emerald/40 bg-emerald/12 text-emerald'
                        : 'border-line bg-surface2 text-muted',
                    )}
                  >
                    {s.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
              <div className="mt-4">
                <MetricRow label="Confidence gate" value={pct(cfg?.confidence_threshold ?? null, 0)} />
                <MetricRow label="Margin gate" value={pct(cfg?.margin_threshold ?? null, 0)} />
                <MetricRow label="Bins configured" value={String(bins.length)} />
                <MetricRow label="Last decision" value={decided?.decision ?? '—'} />
              </div>
            </Card>
          </div>

          {!step && !busy && (
            <Card>
              <Empty
                title="Simulator idle"
                hint="Press Start to run items continuously, or Step to process one real held-out image at a time."
                icon="▸"
              />
            </Card>
          )}
        </div>
      )}

      {tab === 'queue' && <QueuePanel />}

      {tab === 'status' && <StatusPanel status={status} compat={compat} />}

      {tab === 'calibration' && (
        <CalibrationPanel status={status} cfg={cfg} onChanged={() => void load()} />
      )}
    </div>
  )
}
