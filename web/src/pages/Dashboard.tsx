import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Activity, type CameraProbe, type Health, type RobotEvent, type RobotStatus } from '../api'
import {
  Badge,
  Card,
  ErrorState,
  Kicker,
  Loading,
  MetricRow,
  Stat,
  StatusDot,
  clockTime,
  cx,
  ms,
  pct,
} from '../components/ui'

const CLASS_COLORS = [
  'rgb(var(--emerald))',
  'rgb(var(--lime))',
  'rgb(var(--forest))',
  '#5eead4',
  '#a3e635',
  '#34d399',
]

/* ------------------------------------------------------------------ statuses */

function StatusTile({
  label,
  value,
  tone,
  pulse,
  sub,
  action,
}: {
  label: string
  value: string
  tone: 'emerald' | 'lime' | 'amber' | 'rose' | 'muted'
  pulse?: boolean
  sub?: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted/70">{label}</span>
        <StatusDot tone={tone} pulse={pulse} />
      </div>
      <div className="mt-2 font-mono text-sm font-semibold uppercase tracking-wide text-ink">{value}</div>
      {sub && <div className="mt-1 truncate text-[11px] text-muted" title={sub}>{sub}</div>}
      {action}
    </div>
  )
}

/* ------------------------------------------------------- live camera sorting */

type SortCommand = Awaited<ReturnType<typeof api.robotSort>>['command']

/** System status — every value from runtime APIs, updated live. */
function SystemStatus({ health }: { health: Health }) {
  const [deployed, setDeployed] = useState<string | null>(null)
  const [evalAvailable, setEvalAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    api.models().then((r) => alive && setDeployed(r.deployed)).catch(() => alive && setDeployed(null))
    api.metrics().then((r) => alive && setEvalAvailable(r.available)).catch(() => alive && setEvalAvailable(null))
    return () => {
      alive = false
    }
  }, [])

  const rows: [string, string][] = [
    ['Model', deployed ? `EcoSort ${deployed}` : health.model_loaded ? (health.model_version ?? 'loaded') : 'No trained model is available'],
    ['Dataset', health.dataset_version ?? (health.dataset_prepared ? 'prepared (unversioned)' : 'No training data available')],
    ['Evaluation', evalAvailable === null ? '…' : evalAvailable ? 'available' : 'Model evaluation has not been completed yet'],
    ['Robot', health.robot_mode === 'simulation' ? 'simulation' : (health.robot_mode ?? 'unknown')],
    ['Training', health.training_active ? `active (pid ${health.training_pid})` : 'inactive'],
  ]
  return (
    <Card>
      <Kicker>System status</Kicker>
      <div className="mt-3">
        {rows.map(([k, v]) => (
          <MetricRow key={k} label={k} value={v} />
        ))}
      </div>
    </Card>
  )
}

function LiveSorting() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [command, setCommand] = useState<SortCommand | null>(null)
  const [shot, setShot] = useState<string | null>(null)
  const [latency, setLatency] = useState<number | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
  }, [])

  useEffect(() => stop, [stop])

  const start = async () => {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not expose a camera API (getUserMedia is unavailable).')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraOn(true)
    } catch (e) {
      setError(
        e instanceof Error
          ? `Camera unavailable: ${e.message}`
          : 'Camera unavailable - permission denied or no device attached.',
      )
    }
  }

  const captureAndSort = async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    setBusy(true)
    setError(null)
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setError('Could not read the camera frame in this browser.')
      setBusy(false)
      return
    }
    ctx.drawImage(video, 0, 0)
    const t0 = performance.now()
    try {
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.92))
      if (!blob) throw new Error('frame could not be encoded')
      setShot(URL.createObjectURL(blob))
      const r = await api.robotSort(blob)
      setCommand(r.command)
      setLatency(performance.now() - t0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'sorting request failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <Kicker>Live sorting view</Kicker>
          <Badge tone={cameraOn ? 'good' : 'info'}>
            <StatusDot tone={cameraOn ? 'emerald' : 'lime'} pulse={cameraOn || busy} />
            {cameraOn ? 'BROWSER CAMERA' : 'SIMULATION MODE'}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {!cameraOn ? (
            <button onClick={() => void start()} className="btn-ghost !px-3 !py-1.5 text-xs">
              Enable camera
            </button>
          ) : (
            <>
              <button onClick={() => void captureAndSort()} disabled={busy} className="btn-primary !px-3 !py-1.5 text-xs">
                {busy ? 'Classifying…' : 'Capture & sort'}
              </button>
              <button onClick={stop} className="btn-ghost !px-3 !py-1.5 text-xs">
                Stop camera
              </button>
            </>
          )}
          <Link to="/robot?tab=simulation" className="btn-ghost !px-3 !py-1.5 text-xs">
            Open simulator
          </Link>
        </div>
      </div>

      <div className="grid gap-px bg-line/60 lg:grid-cols-[1.15fr_1fr]">
        <div className="relative min-h-[220px] bg-bg">
          <video
            ref={videoRef}
            playsInline
            muted
            className={cx('h-full w-full object-contain', cameraOn ? 'block' : 'hidden')}
          />
          {!cameraOn && shot && (
            <img src={shot} alt="Last captured frame" className="h-full w-full object-contain" />
          )}
          {!cameraOn && !shot && (
            <div className="grid h-full place-items-center px-6 py-10 text-center">
              <div>
                <p className="text-sm font-semibold text-ink">No camera stream active</p>
                <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted">
                  Enable the browser camera to sort real objects, or run the simulator — it feeds real held-out images
                  through the same model and decision gate.
                </p>
              </div>
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 grid place-items-center bg-bg/70 font-mono text-xs text-emerald">
              running inference…
            </div>
          )}
        </div>

        <div className="bg-surface p-5">
          {error && <p className="mb-3 rounded-lg bg-rose/10 px-3 py-2 text-[11px] text-rose">{error}</p>}
          {!command ? (
            <div className="space-y-2">
              <Kicker>Decision</Kicker>
              <p className="text-xs leading-relaxed text-muted">
                Nothing classified from this panel yet. Captured frames go through the real model, the confidence gate
                and the class → bin map before a command is issued.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <Kicker>Decision</Kicker>
                <Badge tone={command.action === 'SORT' ? 'good' : command.action === 'HOLD_FOR_REVIEW' ? 'warn' : 'bad'}>
                  {command.action.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div className="mt-3 space-y-0.5">
                <MetricRow label="Detected object" value={<span className="capitalize">{command.class}</span>} />
                <MetricRow label="Confidence" value={pct(command.confidence, 1)} />
                <MetricRow
                  label="Position"
                  value={`x ${command.centroid.x_px} · y ${command.centroid.y_px}`}
                />
                <MetricRow label="Target bin" value={`${command.target_bin ?? '—'}${command.bin_label ? ` · ${command.bin_label}` : ''}`} />
                <MetricRow label="Round trip" value={ms(latency)} />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted">{command.reason}</p>
              <p className="mt-2 font-mono text-[10px] text-muted/70">
                position = Grad-CAM activation centroid (not a detection box) · actuated: {String(command.actuated)} —{' '}
                {command.note}
              </p>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ page */

export default function Dashboard() {
  const [activity, setActivity] = useState<Activity | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [robot, setRobot] = useState<RobotStatus | null>(null)
  const [events, setEvents] = useState<RobotEvent[] | null>(null)
  const [camera, setCamera] = useState<CameraProbe | null>(null)
  const [probing, setProbing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const [a, h, r, e] = await Promise.all([
          api.activity(),
          api.health(),
          api.robotStatus(),
          api.robotEvents(8),
        ])
        if (!alive) return
        setActivity(a)
        setHealth(h)
        setRobot(r)
        setEvents(e.events)
        setError(null)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'failed to load command center')
      }
    }
    load()
    const id = setInterval(load, 5000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const probeCamera = () => {
    setProbing(true)
    api
      .systemCamera(0)
      .then(setCamera)
      .catch((e) => setCamera({ status: 'unknown', device_index: 0, detail: e instanceof Error ? e.message : 'probe failed' }))
      .finally(() => setProbing(false))
  }

  if (error && !activity) return <ErrorState message={error} />
  if (!activity || !health) return <Loading label="Loading command center" />

  const byClass = Object.entries(activity.by_class).map(([c, n]) => ({ name: c, count: n }))
  const maxClass = Math.max(1, ...byClass.map((c) => c.count))
  const t = robot?.telemetry
  const current = robot?.current_object

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-card border border-line bg-surface px-6 py-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              'linear-gradient(rgb(var(--line)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--line)) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />
        <div className="relative">
          <Kicker>EcoSort</Kicker>
          <h1 className="mt-2 max-w-3xl text-3xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-[2.6rem]">
            AI-powered robotic waste intelligence
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Computer vision software that identifies waste, explains its decision, and issues confidence-gated sorting
            commands to an autonomous sorting system.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link to="/scan" className="btn-primary">
              Scan waste <span aria-hidden>→</span>
            </Link>
            <Link to="/robot?tab=simulation" className="btn-ghost">
              Open robot simulator
            </Link>
          </div>
        </div>
      </div>

      {/* Status strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusTile
          label="AI model"
          value={health.model_loaded ? 'online' : 'offline'}
          tone={health.model_loaded ? 'emerald' : 'amber'}
          pulse={health.model_loaded}
          sub={health.model_version ?? 'no checkpoint loaded'}
        />
        <StatusTile
          label="Inference API"
          value={health.api === 'operational' ? 'online' : 'degraded'}
          tone={health.api === 'operational' ? 'emerald' : 'rose'}
          pulse={health.api === 'operational'}
          sub={`${health.device} · cuda ${health.cuda_available ? 'available' : 'unavailable'}`}
        />
        <StatusTile
          label="Robot interface"
          value={robot?.interface ?? 'unknown'}
          tone="lime"
          sub={robot?.hardware_connected ? 'hardware connected' : 'hardware not connected'}
        />
        <StatusTile
          label="Camera"
          value={camera ? camera.status : 'not probed'}
          tone={camera?.status === 'online' ? 'emerald' : camera?.status === 'offline' ? 'rose' : 'muted'}
          pulse={camera?.status === 'online'}
          sub={
            camera
              ? camera.resolution
                ? `device ${camera.device_index} · ${camera.resolution[0]}×${camera.resolution[1]} · ${ms(camera.probe_ms)}`
                : (camera.detail ?? `device ${camera.device_index}`)
              : 'opens the device to check it'
          }
          action={
            <button
              onClick={probeCamera}
              disabled={probing}
              className="btn-ghost mt-2.5 !px-2.5 !py-1 text-[11px]"
            >
              {probing ? 'probing…' : camera ? 'probe again' : 'probe now'}
            </button>
          }
        />
      </div>

      <LiveSorting />

      <SystemStatus health={health} />

      {/* Sorting throughput */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Objects processed"
          value={(t?.objects_processed ?? 0).toLocaleString()}
          sub="since the controller started"
        />
        <Stat
          label="Sorted"
          value={(t?.sorted ?? 0).toLocaleString()}
          sub={t?.sort_rate != null ? `${pct(t.sort_rate, 1)} cleared the gate` : 'no decisions yet'}
        />
        <Stat
          label="Held for review"
          value={(t?.held_for_review ?? 0).toLocaleString()}
          sub={`gate ${pct(robot?.confidence_threshold ?? null, 0)}`}
        />
        <Stat label="Avg inference" value={ms(t?.avg_inference_ms ?? null)} sub={`${activity.scans.toLocaleString()} stored scans`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* System state */}
        <Card>
          <Kicker>System state</Kicker>
          <div className="mt-3 space-y-0.5">
            <MetricRow label="Architecture" value="EfficientNetB0" />
            <MetricRow label="Input" value={`${health.dataset_stats?.image_size ?? '—'} × ${health.dataset_stats?.image_size ?? '—'}`} />
            <MetricRow label="Classes" value={health.dataset_stats?.num_classes ?? '—'} />
            <MetricRow label="Dataset images" value={(health.dataset_stats?.total_unique ?? 0).toLocaleString()} />
            <MetricRow label="Scans stored" value={activity.scans.toLocaleString()} />
            <MetricRow label="Corrections" value={activity.corrections.toLocaleString()} />
            <MetricRow label="Awaiting review" value={activity.low_confidence.toLocaleString()} />
            <MetricRow
              label="Training"
              value={
                <Link to="/training" className="text-emerald hover:underline">
                  {health.training_active ? 'run in progress' : 'idle'} →
                </Link>
              }
            />
          </div>
          <div className="mt-4 rounded-xl border border-line bg-surface2/50 p-3">
            <Kicker className="mb-2">Class mix</Kicker>
            {byClass.length ? (
              <div className="space-y-1.5">
                {byClass.slice(0, 6).map((c, i) => (
                  <div key={c.name} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 truncate text-[11px] capitalize text-muted">{c.name}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(3, (c.count / maxClass) * 100)}%`,
                          background: CLASS_COLORS[i % CLASS_COLORS.length],
                        }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono text-[11px] text-ink">{c.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted">No predictions yet.</p>
            )}
          </div>
        </Card>

        {/* Last decision */}
        <Card>
          <div className="flex items-center justify-between">
            <Kicker>Last sorting decision</Kicker>
            <Badge tone={current ? (current.decision === 'SORT' ? 'good' : 'warn') : 'neutral'}>
              <StatusDot tone={robot?.state === 'COMPLETED' ? 'emerald' : 'lime'} pulse={!!current} />
              {robot?.state ?? '—'}
            </Badge>
          </div>
          {!current ? (
            <p className="mt-4 text-xs leading-relaxed text-muted">
              No object has been through the sorting engine in this session yet.{' '}
              <Link to="/robot?tab=simulation" className="font-semibold text-emerald hover:underline">
                Run the simulator →
              </Link>
            </p>
          ) : (
            <>
              <div className="mt-3 space-y-0.5">
                <MetricRow label="Object" value={<span className="capitalize">{current.class}</span>} />
                <MetricRow label="Confidence" value={pct(current.confidence, 1)} />
                <MetricRow label="Gate" value={`${pct(robot?.confidence_threshold ?? null, 0)} · ${current.confidence_state}`} />
                <MetricRow label="Target bin" value={current.target_bin ?? 'none mapped'} />
                <MetricRow label="Decision" value={current.decision.replace(/_/g, ' ')} />
                <MetricRow label="Source" value={current.source} />
                <MetricRow label="When" value={new Date(current.timestamp * 1000).toLocaleTimeString()} />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted">{current.reason}</p>
            </>
          )}
          <div className="mt-4 border-t border-line pt-3">
            <Kicker className="mb-2">Controller events</Kicker>
            {!events?.length ? (
              <p className="text-xs text-muted">Nothing logged yet.</p>
            ) : (
              <div className="space-y-1 font-mono text-[11px]">
                {events.slice(0, 6).map((e) => (
                  <div key={e.id} className="flex items-center gap-2">
                    <span className="text-muted/70">{clockTime(e.created_at)}</span>
                    <span className={cx('uppercase', e.kind.startsWith('sort') ? 'text-emerald' : 'text-muted')}>
                      {e.kind}
                    </span>
                    {e.cls && <span className="capitalize text-ink">{e.cls}</span>}
                    {e.target_bin && <span className="text-emerald">{e.target_bin}</span>}
                  </div>
                ))}
              </div>
            )}
            <Link to="/robot?tab=queue" className="mt-3 inline-block text-xs font-semibold text-emerald hover:underline">
              Full sorting log →
            </Link>
          </div>
        </Card>

        {/* Recent scans */}
        <Card>
          <div className="flex items-center justify-between">
            <Kicker>Recent scans</Kicker>
            <Link to="/history" className="text-xs font-semibold text-emerald hover:underline">
              History →
            </Link>
          </div>
          {activity.scans === 0 ? (
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Nothing scanned yet.{' '}
              <Link to="/scan" className="font-semibold text-emerald hover:underline">
                Run the first scan →
              </Link>
            </p>
          ) : (
            <ScanFeed />
          )}
          <div className="mt-4 border-t border-line pt-3">
            <Kicker className="mb-2">Continuous learning</Kicker>
            <p className="text-[11px] leading-relaxed text-muted">
              Low-confidence predictions and corrections land in the review queue. Verified labels become retraining
              candidates — retraining itself is started manually from the ML Lab.
            </p>
            <Link to="/review" className="mt-2 inline-block text-xs font-semibold text-emerald hover:underline">
              Open review queue →
            </Link>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            to: '/scan',
            t: 'Vision',
            d: 'Upload, webcam or live capture → real inference → Grad-CAM explanation → recycling guidance.',
          },
          {
            to: '/robot',
            t: 'Robot',
            d: 'Confidence-gated sorting decisions, simulator, controller status and persisted configuration.',
          },
          {
            to: '/dataset',
            t: 'ML Lab',
            d: 'Dataset audit, training runs, evaluation metrics and the continuous-learning loop.',
          },
        ].map((c) => (
          <Link key={c.to} to={c.to} className="card card-hover block p-5">
            <div className="text-sm font-bold text-ink">{c.t}</div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{c.d}</p>
            <span className="mt-3 inline-block font-mono text-[11px] text-emerald">open →</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function ScanFeed() {
  const [scans, setScans] = useState<{ id: string; created_at: string; predicted_class: string; confidence: number; state: string; action: string; target_bin: string | null }[]>([])

  useEffect(() => {
    let alive = true
    api
      .scans(8)
      .then((r) => alive && setScans(r.scans))
      .catch(() => alive && setScans([]))
    return () => {
      alive = false
    }
  }, [])

  if (!scans.length) return <p className="mt-4 text-xs text-muted">No stored scans.</p>

  return (
    <div className="mt-3 divide-y divide-line/60">
      {scans.map((s) => (
        <Link key={s.id} to={`/scan?id=${s.id}`} className="flex items-center gap-3 py-2.5 hover:bg-surface2/40">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold capitalize text-ink">{s.predicted_class}</div>
            <div className="mt-0.5 font-mono text-[10px] text-muted">
              {clockTime(s.created_at)} · {s.action}
              {s.target_bin ? ` → ${s.target_bin}` : ''}
            </div>
          </div>
          <span
            className={cx(
              'font-mono text-[11px] tabular-nums',
              s.state === 'low' ? 'text-rose' : s.state === 'moderate' ? 'text-amber' : 'text-emerald',
            )}
          >
            {pct(s.confidence, 1)}
          </span>
        </Link>
      ))}
    </div>
  )
}
