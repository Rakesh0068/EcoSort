import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { api, type Health } from '../api'
import { useTheme } from '../theme'
import { Badge, StatusDot, cx } from './ui'

interface NavEntry {
  to: string
  label: string
}
interface NavGroup {
  group: string
  items: NavEntry[]
}

export const NAV: NavGroup[] = [
  { group: 'Overview', items: [{ to: '/dashboard', label: 'Dashboard' }] },
  {
    group: 'Classify',
    items: [
      { to: '/scan', label: 'Scan Waste' },
      { to: '/history', label: 'History' },
    ],
  },
  { group: 'Robot', items: [{ to: '/robot', label: 'Control Center' }] },
  {
    group: 'ML Lab',
    items: [
      { to: '/dataset', label: 'Dataset' },
      { to: '/training', label: 'Training' },
      { to: '/evaluation', label: 'Evaluation' },
    ],
  },
  {
    group: 'Learning',
    items: [{ to: '/review', label: 'Review Queue' }],
  },
  { group: 'Knowledge', items: [{ to: '/learn', label: 'Waste Guide' }] },
]

const FLAT: NavEntry[] = NAV.flatMap((g) => g.items)

function Wordmark() {
  return (
    <Link to="/" className="group flex items-center gap-2.5">
      <span className="relative grid h-8 w-8 place-items-center rounded-xl bg-emerald/15 text-emerald ring-1 ring-emerald/25 transition-transform duration-300 ease-spring group-hover:scale-105">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M7 19V9M12 19V5M17 19v-7" strokeLinecap="round" />
        </svg>
      </span>
      <span className="text-[15px] font-extrabold tracking-tight text-ink">
        Eco<span className="text-emerald">Sort</span>
      </span>
    </Link>
  )
}

function ModelPill({ health }: { health: Health | null }) {
  if (!health) return <span className="chip">checking…</span>
  const loaded = health.model_loaded
  return (
    <span className="chip" title={health.checkpoint ?? 'no checkpoint loaded'}>
      <StatusDot tone={loaded ? 'emerald' : 'amber'} pulse={loaded} />
      {loaded ? (health.model_version ?? 'model loaded') : 'model not loaded'}
    </span>
  )
}

function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [classes, setClasses] = useState<{ id: string; display: string }[]>([])
  const nav = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQ('')
    setTimeout(() => inputRef.current?.focus(), 20)
    api.classes().then((r) => setClasses(r.classes)).catch(() => setClasses([]))
  }, [open])

  const results = useMemo(() => {
    const term = q.trim().toLowerCase()
    const pages = FLAT.filter((p) => !term || p.label.toLowerCase().includes(term)).map((p) => ({
      kind: 'Page',
      label: p.label,
      to: p.to,
    }))
    const cls = classes
      .filter((c) => term && (c.display.toLowerCase().includes(term) || c.id.includes(term)))
      .map((c) => ({ kind: 'Waste class', label: c.display, to: `/learn?class=${c.id}` }))
    return [...pages, ...cls].slice(0, 9)
  }, [q, classes])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Search EcoSort"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-card border border-line bg-surface shadow-lift animate-fadeUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <span className="text-muted">⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'Enter' && results[0]) {
                nav(results[0].to)
                onClose()
              }
            }}
            placeholder="Search pages, waste classes…"
            className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-muted/70"
          />
          <kbd className="chip shrink-0">esc</kbd>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {results.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted">No matches</div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.kind}-${r.label}`}
              onClick={() => {
                nav(r.to)
                onClose()
              }}
              className={cx(
                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                i === 0 ? 'bg-emerald/10 text-ink' : 'text-muted hover:bg-surface2 hover:text-ink',
              )}
            >
              <span className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted/70">
                {r.kind}
              </span>
              <span className="flex-1 font-medium">{r.label}</span>
              <span className="text-muted/50">↵</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { theme, toggle } = useTheme()
  const [health, setHealth] = useState<Health | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const loc = useLocation()

  useEffect(() => {
    let alive = true
    const load = () => api.health().then((h) => alive && setHealth(h)).catch(() => alive && setHealth(null))
    load()
    const id = setInterval(load, 10000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  useEffect(() => setNavOpen(false), [loc.pathname])

  const onKey = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      setSearchOpen((v) => !v)
    }
  }, [])
  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  return (
    <div className="min-h-screen bg-bg">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
          <button
            className="btn-ghost !px-2 !py-1.5 lg:hidden"
            onClick={() => setNavOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            ☰
          </button>
          <Wordmark />

          <button
            onClick={() => setSearchOpen(true)}
            className="ml-auto hidden items-center gap-2 rounded-xl border border-line bg-surface2/60 px-3 py-1.5 text-sm text-muted transition-colors hover:border-emerald/40 md:flex"
          >
            <span>⌕</span>
            <span>Search EcoSort…</span>
            <kbd className="chip ml-6 !py-0.5">⌘K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-2 md:ml-3">
            <ModelPill health={health} />
            <button
              onClick={toggle}
              className="btn-ghost !px-2.5 !py-1.5"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 sm:px-6">
        {/* Sidebar */}
        <aside
          className={cx(
            'fixed inset-x-0 top-14 z-30 max-h-[calc(100vh-3.5rem)] overflow-y-auto border-b border-line bg-bg/95 p-4 backdrop-blur-xl lg:sticky lg:top-20 lg:block lg:h-fit lg:w-60 lg:shrink-0 lg:border-0 lg:bg-transparent lg:p-0 lg:py-6',
            navOpen ? 'block' : 'hidden',
          )}
        >
          <nav className="space-y-5">
            {NAV.map((g) => (
              <div key={g.group}>
                <div className="mb-1.5 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/60">
                  {g.group}
                </div>
                <div className="space-y-0.5">
                  {g.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) => cx('nav-item', isActive && 'nav-item-active')}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-6 hidden rounded-card border border-line bg-surface/60 p-3 lg:block">
            <div className="kicker mb-2">Runtime</div>
            <div className="space-y-1.5 font-mono text-[11px] text-muted">
              <div className="flex justify-between gap-2">
                <span>device</span>
                <span className="text-ink">{health?.device ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>training</span>
                <span className={health?.training_active ? 'text-emerald' : 'text-ink'}>
                  {health?.training_active ? 'active' : 'idle'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span>dataset</span>
                <span className="text-ink">{health?.dataset_prepared ? 'ready' : 'missing'}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1 py-6">{children}</main>
      </div>

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />

      <footer className="mx-auto max-w-[1600px] px-4 pb-10 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-xs text-muted">
          <span>
            EcoSort — robot-ready waste intelligence. EfficientNetB0 · {health?.dataset_stats?.num_classes ?? '—'} classes ·{' '}
            {health?.dataset_stats?.total_unique?.toLocaleString?.() ?? '—'} images
          </span>
          <Badge tone={health?.cuda_available ? 'good' : 'warn'}>
            <StatusDot tone={health?.cuda_available ? 'emerald' : 'amber'} pulse={false} />
            {health?.device ?? 'unknown device'}
          </Badge>
        </div>
      </footer>
    </div>
  )
}
