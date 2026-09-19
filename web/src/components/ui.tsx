import type { ReactNode } from 'react'
import type { ConfidenceState } from '../api'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

export function Card({
  children,
  className,
  hover = false,
}: {
  children: ReactNode
  className?: string
  hover?: boolean
}) {
  return <div className={cx('card p-5', hover && 'card-hover', className)}>{children}</div>
}

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('kicker', className)}>{children}</div>
}

export function SectionTitle({
  title,
  sub,
  right,
}: {
  title: string
  sub?: string
  right?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h2>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

export function StatusDot({ tone = 'emerald', pulse = true }: { tone?: string; pulse?: boolean }) {
  const tones: Record<string, string> = {
    emerald: 'bg-emerald',
    lime: 'bg-lime',
    amber: 'bg-amber',
    rose: 'bg-rose',
    muted: 'bg-muted',
  }
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {pulse && (
        <span className={cx('absolute inline-flex h-full w-full rounded-full opacity-60 animate-pulseDot', tones[tone])} />
      )}
      <span className={cx('relative inline-flex h-2 w-2 rounded-full', tones[tone])} />
    </span>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info'
  className?: string
}) {
  const tones = {
    neutral: 'border-line bg-surface2 text-muted',
    good: 'border-emerald/30 bg-emerald/12 text-emerald',
    warn: 'border-amber/30 bg-amber/12 text-amber',
    bad: 'border-rose/30 bg-rose/12 text-rose',
    info: 'border-lime/30 bg-lime/12 text-lime',
  }
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium tracking-wide',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function confidenceTone(state: ConfidenceState | string) {
  if (state === 'high') return { tone: 'good' as const, color: 'rgb(var(--emerald))', label: 'High confidence' }
  if (state === 'moderate') return { tone: 'warn' as const, color: 'rgb(var(--amber))', label: 'Moderate confidence' }
  return { tone: 'bad' as const, color: 'rgb(var(--rose))', label: 'Low confidence' }
}

export function Stat({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: ReactNode
}) {
  return (
    <Card hover className="relative overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <Kicker>{label}</Kicker>
        {icon && <div className="text-muted/70">{icon}</div>}
      </div>
      <div className="stat-value mt-3">{value}</div>
      {sub && <div className="mt-1.5 text-xs text-muted">{sub}</div>}
    </Card>
  )
}

export function Bar({
  label,
  value,
  max = 1,
  color = 'rgb(var(--emerald))',
  display,
  delay = 0,
}: {
  label: ReactNode
  value: number
  max?: number
  color?: string
  display?: string
  delay?: number
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className="group flex items-center gap-3">
      <div className="w-24 shrink-0 truncate text-sm text-muted sm:w-32">{label}</div>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-surface2">
        <div
          className="h-full origin-left rounded-full transition-[width] duration-700 ease-spring group-hover:brightness-110"
          style={{ width: `${pct}%`, background: color, animationDelay: `${delay}ms` }}
        />
      </div>
      <div className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-ink">
        {display ?? `${pct.toFixed(1)}%`}
      </div>
    </div>
  )
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={cx('animate-spinSlow', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted">
      <Spinner className="h-5 w-5" />
      {label}…
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="border-rose/30 bg-rose/5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-rose">⚠</span>
        <div className="flex-1">
          <div className="text-sm font-semibold text-ink">Something went wrong</div>
          <p className="mt-1 break-words font-mono text-xs text-muted">{message}</p>
          {onRetry && (
            <button className="btn-ghost mt-3 px-3 py-1.5 text-xs" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}

export function Empty({ title, hint, icon = '◇' }: { title: string; hint?: string; icon?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-line px-6 py-16 text-center">
      <div className="mb-3 text-2xl text-muted/50">{icon}</div>
      <div className="text-sm font-semibold text-ink">{title}</div>
      {hint && <p className="mt-1 max-w-sm text-xs text-muted">{hint}</p>}
    </div>
  )
}

export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={cx('skeleton', className)} />
}

export function MetricRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/60 py-2 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="font-mono text-sm tabular-nums text-ink">{value}</span>
    </div>
  )
}

export function pct(v: number | null | undefined, digits = 1) {
  return v == null ? '—' : `${(v * 100).toFixed(digits)}%`
}

export function ms(v: number | null | undefined) {
  return v == null ? '—' : `${v.toFixed(v < 10 ? 2 : 0)} ms`
}

export function relTime(iso: string) {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const diff = Date.now() - then
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function clockTime(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function dayLabel(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const yest = new Date(Date.now() - 86400000)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Today'
  if (same(d, yest)) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })
}
