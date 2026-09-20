import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type CameraProbe, type RobotConfig, type RobotEvent, type RobotStatus } from '../api'
import { Badge, Card, Empty, ErrorState, Kicker, MetricRow, Stat, StatusDot, cx, ms, pct } from './ui'

type Compat = {
  model_version: string | null
  checks: Record<string, boolean>
  ready_for_deployment: boolean
  blocking: string[]
  hardware_connected: boolean
  interface: string
  note: string
}

export function SimulationBanner({ status }: { status: RobotStatus | null }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-lime/25 bg-lime/8 px-4 py-3">
      <Badge tone="info">
        <StatusDot tone="lime" pulse />
        SIMULATION MODE
      </Badge>
      <p className="text-xs leading-relaxed text-muted">
        Hardware not connected. Decisions are produced by the real model on real held-out images, but no arm is
        actuated — commands are logged only.
      </p>
      {status && (
        <span className="ml-auto font-mono text-[11px] text-muted/80">
          interface {status.interface} · uptime {Math.round(status.uptime_seconds)}s
        </span>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- sorting queue */

const KIND_TONE: Record<string, 'good' | 'warn' | 'bad' | 'info' | 'neutral'> = {
  sort_decision: 'good',
  sort_command: 'info',
  emergency_stop: 'bad',
  config_change: 'neutral',
  reset: 'neutral',
  pause: 'warn',
  resume: 'neutral',
}

export function QueuePanel() {
  const [events, setEvents] = useState<RobotEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<string>('all')

  const load = useCallback(() => {
    api
      .robotEvents(200)
      .then((r) => {
        setEvents(r.events)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'could not load robot events'))
  }, [])

  useEffect(load, [load])

  const kinds = useMemo(() => {
    const set = new Set((events ?? []).map((e) => e.kind))
    return ['all', ...Array.from(set).sort()]
  }, [events])

  const rows = useMemo(
    () => (events ?? []).filter((e) => kind === 'all' || e.kind === kind),
    [events, kind],
  )

  const sorted = useMemo(
    () =>
      (events ?? []).filter((e) => e.kind === 'sort_decision' || e.kind === 'sort_command').reduce(
        (acc, e) => {
          const d = (e.detail ?? {}) as Record<string, unknown>
          const decision = typeof d.decision === 'string' ? d.decision : 'UNKNOWN'
          acc[decision] = (acc[decision] ?? 0) + 1
          return acc
        },
        {} as Record<string, number>,
      ),
    [events],
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Logged events" value={(events ?? []).length.toLocaleString()} sub="persisted in SQLite" />
        {Object.entries(sorted)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([decision, n]) => (
            <Stat
              key={decision}
              label={decision.replace(/_/g, ' ')}
              value={n.toLocaleString()}
              sub="sorting outcomes"
            />
          ))}
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      <Card className="!p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <Kicker>Robot sorting log</Kicker>
          <span className="text-[11px] text-muted">
            separate from scan history — these are controller events, not user scans
          </span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {kinds.map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={cx(
                  'rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors',
                  kind === k
                    ? 'border-emerald/40 bg-emerald/12 text-emerald'
                    : 'border-line bg-surface2 text-muted hover:text-ink',
                )}
              >
                {k}
              </button>
            ))}
            <button onClick={load} className="btn-ghost !px-2.5 !py-1 text-[11px]">
              refresh
            </button>
          </div>
        </div>

        {!events ? (
          <div className="p-6 text-sm text-muted">Loading robot events…</div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <Empty
              title="No robot events yet"
              hint="Run the simulator or issue a sort command — every decision is recorded here with a real timestamp."
            />
          </div>
        ) : (
          <div className="max-h-[32rem] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface2/95 font-mono text-[10px] uppercase tracking-wider text-muted backdrop-blur">
                <tr>
                  <th className="px-4 py-2.5">time</th>
                  <th className="px-4 py-2.5">event</th>
                  <th className="px-4 py-2.5">state</th>
                  <th className="px-4 py-2.5">class</th>
                  <th className="px-4 py-2.5 text-right">conf</th>
                  <th className="px-4 py-2.5">bin</th>
                  <th className="px-4 py-2.5">detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {rows.map((e) => {
                  const d = (e.detail ?? {}) as Record<string, unknown>
                  return (
                    <tr key={e.id} className="align-top hover:bg-surface2/40">
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-muted">
                        {new Date(e.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={KIND_TONE[e.kind] ?? 'neutral'}>{e.kind.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-ink">{e.state ?? '—'}</td>
                      <td className="px-4 py-2.5 capitalize text-ink">{e.cls ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[11px] text-muted">
                        {e.confidence != null ? pct(e.confidence, 1) : '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-emerald">{e.target_bin ?? '—'}</td>
                      <td className="px-4 py-2.5 text-[11px] text-muted">
                        {typeof d.reason === 'string' ? d.reason : typeof d.decision === 'string' ? d.decision : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

/* -------------------------------------------------------------- robot status */

export function StatusPanel({ status, compat }: { status: RobotStatus | null; compat: Compat | null }) {
  const [camera, setCamera] = useState<CameraProbe | null>(null)
  const [probing, setProbing] = useState(false)
  const [probeError, setProbeError] = useState<string | null>(null)

  const probe = useCallback(() => {
    setProbing(true)
    setProbeError(null)
    api
      .systemCamera(0)
      .then(setCamera)
      .catch((e) => setProbeError(e instanceof Error ? e.message : 'camera probe failed'))
      .finally(() => setProbing(false))
  }, [])

  const t = status?.telemetry

  return (
    <div className="space-y-4">
      <SimulationBanner status={status} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Objects processed" value={(t?.objects_processed ?? 0).toLocaleString()} sub="since controller start" />
        <Stat
          label="Sorted"
          value={(t?.sorted ?? 0).toLocaleString()}
          sub={t?.sort_rate != null ? `${pct(t.sort_rate, 1)} sort rate` : 'no decisions yet'}
        />
        <Stat label="Held for review" value={(t?.held_for_review ?? 0).toLocaleString()} sub="below confidence gate" />
        <Stat label="Avg inference" value={ms(t?.avg_inference_ms ?? null)} sub={`${t?.inference_count ?? 0} timed runs`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <Kicker>Subsystem health</Kicker>
          <div className="mt-3 space-y-2">
            {Object.entries(status?.health ?? {}).map(([k, v]) => (
              <div key={k} className="border-b border-line/60 py-1.5 last:border-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs capitalize text-muted">{k.replace(/_/g, ' ')}</span>
                  <span className="flex items-center gap-2 font-mono text-[11px] text-ink">
                    <StatusDot
                      tone={
                        v.status === 'online' || v.status === 'loaded' || v.status === 'ready'
                          ? 'emerald'
                          : v.status === 'simulated' || v.status === 'browser_side'
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
                {v.detail && <p className="mt-1 text-[11px] leading-relaxed text-muted/80">{v.detail}</p>}
              </div>
            ))}
          </div>
          <div className="mt-4">
            <MetricRow label="Mode" value={status?.mode ?? '—'} />
            <MetricRow label="Paused" value={status?.paused ? 'yes' : 'no'} />
            <MetricRow label="Emergency stop" value={status?.emergency_stop ? 'engaged' : 'released'} />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <Kicker>Software readiness</Kicker>
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
          <p className="mt-3 text-[11px] leading-relaxed text-muted">{compat?.note}</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-2">
            <Kicker>Camera device</Kicker>
            <button onClick={probe} disabled={probing} className="btn-ghost !px-2.5 !py-1 text-[11px]">
              {probing ? 'probing…' : camera ? 'probe again' : 'probe device 0'}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            Opens the local camera through OpenCV and grabs one frame. Nothing is assumed — the result below is what
            the driver actually reported.
          </p>
          {probeError && <p className="mt-3 text-[11px] text-rose">{probeError}</p>}
          {!camera && !probing && !probeError && (
            <p className="mt-3 font-mono text-[11px] text-muted/70">not probed yet</p>
          )}
          {camera && (
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <StatusDot
                  tone={camera.status === 'online' ? 'emerald' : camera.status === 'offline' ? 'rose' : 'amber'}
                  pulse={camera.status === 'online'}
                />
                <span className="font-mono text-xs uppercase text-ink">{camera.status}</span>
              </div>
              <div className="mt-2">
                {camera.resolution && (
                  <MetricRow label="Resolution" value={`${camera.resolution[0]} × ${camera.resolution[1]}`} />
                )}
                {camera.probe_ms != null && <MetricRow label="Probe time" value={ms(camera.probe_ms)} />}
                <MetricRow label="Device index" value={String(camera.device_index)} />
                {camera.detail && <MetricRow label="Detail" value={camera.detail} />}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- calibration */

export function CalibrationPanel({
  status,
  cfg,
  onChanged,
}: {
  status: RobotStatus | null
  cfg: RobotConfig | null
  onChanged: () => void
}) {
  const [conf, setConf] = useState<string>('')
  const [margin, setMargin] = useState<string>('')
  const [bins, setBins] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<'thresholds' | 'bins' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!cfg) return
    setConf(String(cfg.confidence_threshold))
    setMargin(String(cfg.margin_threshold))
    setBins(cfg.bin_map)
  }, [cfg])

  const binOptions = useMemo(() => Object.keys(cfg?.bin_labels ?? {}), [cfg])
  const classes = useMemo(() => Object.keys(bins), [bins])
  const dirtyBins = useMemo(
    () => classes.filter((c) => cfg && bins[c] !== cfg.bin_map[c]),
    [classes, bins, cfg],
  )

  const saveThresholds = async () => {
    setBusy('thresholds')
    setError(null)
    setMsg(null)
    try {
      const r = await api.robotConfigPut({
        confidence_threshold: Number(conf),
        margin_threshold: Number(margin),
      })
      setMsg(
        `Saved — auto-sort at ≥ ${pct(r.confidence_threshold, 0)}, high confidence needs a ${pct(
          r.margin_threshold,
          0,
        )} margin. Applied to live inference immediately.`,
      )
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not save thresholds')
    } finally {
      setBusy(null)
    }
  }

  const saveBins = async () => {
    setBusy('bins')
    setError(null)
    setMsg(null)
    try {
      const mapping = Object.fromEntries(dirtyBins.map((c) => [c, bins[c]]))
      await api.robotBinMap(mapping)
      setMsg(`Saved ${dirtyBins.length} bin mapping${dirtyBins.length === 1 ? '' : 's'} to the robot config store.`)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not save bin map')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-amber/25 bg-amber/6">
        <Kicker className="!text-amber">Hardware integration required</Kicker>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Geometric and hand-eye calibration (arm zeroing, camera extrinsics, bin pose teaching, conveyor speed
          matching) needs the physical robot. No arm is attached, so those steps cannot be performed or measured here —
          EcoSort will not invent calibration values. What <span className="text-ink">is</span> configurable today is
          the decision layer below, and it is persisted in SQLite.
        </p>
      </Card>

      {error && <ErrorState message={error} />}
      {msg && <p className="rounded-card border border-emerald/25 bg-emerald/8 px-4 py-2.5 text-xs text-emerald">{msg}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <Kicker>Confidence gating</Kicker>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            Below the confidence threshold the arm never actuates and the item goes to the review queue. Above it, the
            margin over the runner-up decides whether the prediction is reported as high or moderate confidence.
          </p>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
                confidence threshold (auto-sort gate)
              </span>
              <div className="mt-1.5 flex items-center gap-3">
                <input
                  type="range"
                  min={0.05}
                  max={0.99}
                  step={0.01}
                  value={Number(conf) || 0.6}
                  onChange={(e) => setConf(e.target.value)}
                  className="flex-1 accent-emerald"
                />
                <span className="w-16 text-right font-mono text-sm text-ink">{pct(Number(conf), 0)}</span>
              </div>
            </label>
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
                margin threshold (high vs moderate)
              </span>
              <div className="mt-1.5 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={0.95}
                  step={0.01}
                  value={Number(margin) || 0}
                  onChange={(e) => setMargin(e.target.value)}
                  className="flex-1 accent-lime"
                />
                <span className="w-16 text-right font-mono text-sm text-ink">{pct(Number(margin), 0)}</span>
              </div>
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={() => void saveThresholds()} disabled={busy !== null} className="btn-primary !px-3.5 !py-2 text-xs">
              {busy === 'thresholds' ? 'Saving…' : 'Save thresholds'}
            </button>
            <span className="font-mono text-[11px] text-muted">
              active now: {pct(status?.confidence_threshold ?? null, 0)} / {pct(status?.margin_threshold ?? null, 0)}
            </span>
          </div>
        </Card>

        <Card>
          <Kicker>Class → bin mapping</Kicker>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            The controller resolves the taxonomy to physical bins here, so the model never needs to know about them.
          </p>
          <div className="mt-3 max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {classes.map((c) => (
              <div key={c} className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-xs capitalize text-ink">{c}</span>
                <select
                  value={bins[c]}
                  onChange={(e) => setBins((b) => ({ ...b, [c]: e.target.value }))}
                  className="input flex-1 !py-1.5 font-mono text-[11px]"
                >
                  {binOptions.map((b) => (
                    <option key={b} value={b}>
                      {b} — {cfg?.bin_labels[b]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => void saveBins()}
              disabled={busy !== null || dirtyBins.length === 0}
              className="btn-primary !px-3.5 !py-2 text-xs"
            >
              {busy === 'bins' ? 'Saving…' : `Save ${dirtyBins.length || ''} change${dirtyBins.length === 1 ? '' : 's'}`}
            </button>
            <button onClick={() => cfg && setBins(cfg.bin_map)} className="btn-ghost !px-3 !py-2 text-xs">
              Discard
            </button>
          </div>
        </Card>
      </div>
    </div>
  )
}
