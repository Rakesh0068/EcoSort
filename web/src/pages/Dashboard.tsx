import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api, type Activity, type Health, type RunMetrics, type Scan } from '../api'
import {
  Badge,
  Bar as HBar,
  Card,
  ErrorState,
  Kicker,
  Loading,
  MetricRow,
  SectionTitle,
  Stat,
  StatusDot,
  clockTime,
  cx,
  pct,
} from '../components/ui'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const CLASS_COLORS = [
  'rgb(var(--emerald))',
  'rgb(var(--lime))',
  'rgb(var(--forest))',
  '#5eead4',
  '#a3e635',
  '#34d399',
  '#86efac',
  '#bef264',
  '#6ee7b7',
  '#d9f99d',
]

export default function Dashboard() {
  const [activity, setActivity] = useState<Activity | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [scans, setScans] = useState<Scan[]>([])
  const [run, setRun] = useState<RunMetrics | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const [a, h, s, t] = await Promise.all([
          api.activity(),
          api.health(),
          api.scans(6),
          api.trainingStatus(),
        ])
        if (!alive) return
        setActivity(a)
        setHealth(h)
        setScans(s.scans)
        setRun(t.latest?.metrics ?? null)
        setError(null)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'failed to load dashboard')
      }
    }
    load()
    const id = setInterval(load, 5000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  if (error && !activity) return <ErrorState message={error} />
  if (!activity || !health) return <Loading label="Loading dashboard" />

  const byDay = Object.entries(activity.by_day).map(([d, c]) => ({
    day: d.slice(5),
    scans: c,
  }))
  const byClass = Object.entries(activity.by_class).map(([c, n]) => ({ name: c, count: n }))
  const maxClass = Math.max(1, ...byClass.map((c) => c.count))

  const training = run && run.status === 'running'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Kicker>Overview</Kicker>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-ink sm:text-4xl">{greeting()}</h1>
          <p className="mt-2 text-sm text-muted">Your waste intelligence dashboard — every number below is measured.</p>
        </div>
        <Link to="/scan" className="btn-primary">
          Scan waste <span aria-hidden>→</span>
        </Link>
      </div>

      {/* Primary stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Scans completed" value={activity.scans.toLocaleString()} sub="stored in SQLite" />
        <Stat
          label="Avg confidence"
          value={pct(activity.average_confidence, 1)}
          sub={`${activity.low_confidence} low-confidence`}
        />
        <Stat
          label="Waste classes"
          value={health.dataset_stats?.num_classes ?? '—'}
          sub={`${(health.dataset_stats?.total_unique ?? 0).toLocaleString()} audited images`}
        />
        <Stat
          label="Corrections"
          value={activity.corrections.toLocaleString()}
          sub="verified training candidates"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Model + training */}
        <Card className="lg:col-span-1">
          <div className="flex items-center justify-between">
            <Kicker>Model status</Kicker>
            <Badge tone={health.model_loaded ? 'good' : 'warn'}>
              <StatusDot tone={health.model_loaded ? 'emerald' : 'amber'} pulse={health.model_loaded} />
              {health.model_loaded ? 'online' : 'offline'}
            </Badge>
          </div>
          <div className="mt-4 space-y-0.5">
            <MetricRow label="Architecture" value="EfficientNetB0" />
            <MetricRow label="Version" value={<span className="break-all">{health.model_version ?? '—'}</span>} />
            <MetricRow label="Device" value={health.device} />
            <MetricRow label="Input" value={`${health.dataset_stats?.image_size ?? 224}²`} />
            <MetricRow
              label="Checkpoint"
              value={health.checkpoint ? health.checkpoint.split(/[\\/]/).slice(-2).join('/') : '—'}
            />
          </div>

          <div className="mt-5 rounded-xl border border-line bg-surface2/50 p-3">
            <div className="flex items-center justify-between">
              <span className="kicker">Training</span>
              <Badge tone={training ? 'info' : 'neutral'}>
                <StatusDot tone={training ? 'lime' : 'muted'} pulse={training ?? false} />
                {run?.status ?? 'idle'}
              </Badge>
            </div>
            {run ? (
              <>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-emerald transition-[width] duration-700 ease-spring"
                    style={{ width: `${Math.round(run.progress * 100)}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between font-mono text-[11px] text-muted">
                  <span>
                    epoch {run.epoch}/{run.total_epochs} · {run.phase}
                  </span>
                  <span>best val {pct(run.best_val_acc, 2)}</span>
                </div>
                <Link to="/training" className="mt-3 inline-block text-xs font-semibold text-emerald hover:underline">
                  Open training center →
                </Link>
              </>
            ) : (
              <p className="mt-2 text-xs text-muted">
                No training run recorded yet.{' '}
                <Link to="/training" className="font-semibold text-emerald hover:underline">
                  Start one →
                </Link>
              </p>
            )}
          </div>
        </Card>

        {/* Scan activity */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <Kicker>Scan activity</Kicker>
            <span className="font-mono text-[11px] text-muted">last {byDay.length} days</span>
          </div>
          <div className="mt-4 h-44">
            {byDay.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={byDay} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                  <defs>
                    <linearGradient id="gScans" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(var(--emerald))" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="rgb(var(--emerald))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgb(var(--surface))',
                      border: '1px solid rgb(var(--line))',
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Area type="monotone" dataKey="scans" stroke="rgb(var(--emerald))" strokeWidth={2} fill="url(#gScans)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted">
                No scans recorded yet — run your first scan.
              </div>
            )}
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <Kicker className="mb-3">Distribution by class</Kicker>
            {byClass.length ? (
              <div className="space-y-2">
                {byClass.slice(0, 6).map((c, i) => (
                  <HBar
                    key={c.name}
                    label={c.name}
                    value={c.count}
                    max={maxClass}
                    color={CLASS_COLORS[i % CLASS_COLORS.length]}
                    display={String(c.count)}
                    delay={i * 60}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted">No predictions yet.</p>
            )}
          </div>
        </Card>
      </div>

      {/* Recent predictions */}
      <Card>
        <div className="flex items-center justify-between">
          <Kicker>Recent predictions</Kicker>
          <Link to="/history" className="text-xs font-semibold text-emerald hover:underline">
            View all →
          </Link>
        </div>

        {scans.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            Nothing scanned yet.{' '}
            <Link to="/scan" className="font-semibold text-emerald hover:underline">
              Run your first scan →
            </Link>
          </p>
        ) : (
          <div className="mt-3 divide-y divide-line/60">
            {scans.map((s) => (
              <Link
                key={s.id}
                to={`/scan?id=${s.id}`}
                className="flex items-center gap-4 py-3 transition-colors hover:bg-surface2/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold capitalize text-ink">
                      {s.predicted_class}
                    </span>
                    <Badge tone={s.state === 'high' ? 'good' : s.state === 'moderate' ? 'warn' : 'bad'}>
                      {s.state}
                    </Badge>
                    {s.was_correct === 0 && <Badge tone="bad">corrected</Badge>}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted">
                    {clockTime(s.created_at)} · {s.source} · {s.action}
                    {s.target_bin ? ` → ${s.target_bin}` : ''}
                  </div>
                </div>
                <div className="w-24 shrink-0">
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
                    <div
                      className={cx('h-full rounded-full', s.state === 'low' ? 'bg-rose' : 'bg-emerald')}
                      style={{ width: `${Math.round(s.confidence * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 text-right font-mono text-[11px] tabular-nums text-muted">
                    {pct(s.confidence, 1)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <SectionTitle title="Where to next" sub="The three real systems behind EcoSort." />
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            to: '/scan',
            t: 'User system',
            d: 'Scan → prediction → Grad-CAM explanation → recycling guidance → feedback → history.',
            icon: '🔍',
          },
          {
            to: '/training',
            t: 'ML system',
            d: 'Dataset → augmentation → transfer learning → evaluation → explainability → registry.',
            icon: '🧠',
          },
          {
            to: '/review',
            t: 'Continuous learning',
            d: 'Low-confidence and corrected predictions enter review, then become retraining data.',
            icon: '🔄',
          },
        ].map((c) => (
          <Link key={c.to} to={c.to} className="card card-hover block p-5">
            <div className="text-xl">{c.icon}</div>
            <div className="mt-3 text-sm font-bold text-ink">{c.t}</div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{c.d}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
