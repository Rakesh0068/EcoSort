import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { api, type Health } from '../api'
import { useTheme } from '../theme'
import { cx } from './ui'

const PUBLIC_NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/scan', label: 'Scan Waste' },
  { to: '/guide', label: 'Waste Guide' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/future', label: 'Robot' },
  { to: '/about', label: 'About' },
]

function Wordmark() {
  return (
    <Link to="/" className="group flex items-center gap-2.5" aria-label="EcoSort home">
      <span className="grid h-9 w-9 place-items-center rounded-2xl bg-forest text-white transition-transform duration-300 group-hover:scale-105 dark:bg-emerald">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M4 9c2-3.5 5-5 8-5 4 0 7 2.5 8 6-.5 5-4 9.5-9 9.5-2.5 0-4.5-1-6-2.5" strokeLinecap="round" />
          <path d="M4 9l1.5 4L9 14M4 9l4 1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-[19px] font-extrabold tracking-tight text-ink">EcoSort</span>
    </Link>
  )
}

function ReadyPill({ health }: { health: Health | null }) {
  if (!health) return <span className="chip">Getting ready…</span>
  const ready = health.model_loaded
  return (
    <span className="chip" title={ready ? 'EcoSort is ready to identify waste' : 'EcoSort is starting up'}>
      <span className={cx('h-2 w-2 rounded-full', ready ? 'bg-emerald' : 'bg-amber')} />
      {ready ? 'EcoSort is ready' : 'Starting up…'}
    </span>
  )
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { theme, toggle } = useTheme()
  const [health, setHealth] = useState<Health | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const loc = useLocation()
  const onResearch = loc.pathname.startsWith('/research')

  useEffect(() => {
    let alive = true
    const load = () => api.health().then((h) => alive && setHealth(h)).catch(() => alive && setHealth(null))
    load()
    const id = setInterval(load, 15000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  useEffect(() => setMenuOpen(false), [loc.pathname, loc.search])

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-xl">
        <div className="container-site flex h-[68px] items-center gap-3">
          <Wordmark />

          <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="Main">
            {PUBLIC_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => cx('nav-link', isActive && 'nav-link-active')}
              >
                {item.label}
              </NavLink>
            ))}
            <NavLink
              to="/research"
              className={({ isActive }) =>
                cx(
                  'nav-link !px-3 text-[13px]',
                  isActive || onResearch ? 'nav-link-active' : 'opacity-70',
                )
              }
              title="Dataset, training, evaluation and system health"
            >
              Research
            </NavLink>
          </nav>

          <div className="ml-auto hidden items-center gap-2 md:flex">
            <ReadyPill health={health} />
            <button
              onClick={toggle}
              className="btn-ghost !rounded-full !px-3 !py-2 text-sm"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <Link to="/scan" className="btn-primary !py-2.5">
              Scan My Waste
            </Link>
          </div>

          <button
            className="btn-ghost ml-auto !rounded-full !px-3.5 !py-2 lg:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>

        {menuOpen && (
          <nav className="border-t border-line bg-bg px-5 py-4 lg:hidden" aria-label="Mobile">
            <div className="grid gap-1">
              {PUBLIC_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cx(
                      'rounded-2xl px-4 py-3 text-[16px] font-medium',
                      isActive ? 'bg-surface2 text-ink' : 'text-muted',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <NavLink
                to="/research"
                className="rounded-2xl px-4 py-3 text-[14px] font-medium text-muted"
              >
                Research & ML →
              </NavLink>
              <Link to="/scan" className="btn-primary mt-2 w-full">
                Scan My Waste
              </Link>
              <div className="mt-2 flex items-center justify-between px-1">
                <ReadyPill health={health} />
                <button onClick={toggle} className="btn-ghost !rounded-full !px-3 !py-1.5 text-sm">
                  {theme === 'dark' ? '☀ Light' : '☾ Dark'}
                </button>
              </div>
            </div>
          </nav>
        )}
      </header>

      <main className="min-w-0 flex-1">{children}</main>

      <footer className="mt-8 border-t border-line bg-surface/60">
        <div className="container-site grid gap-10 py-12 md:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-forest text-white dark:bg-emerald">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M4 9c2-3.5 5-5 8-5 4 0 7 2.5 8 6-.5 5-4 9.5-9 9.5-2.5 0-4.5-1-6-2.5" strokeLinecap="round" />
                </svg>
              </span>
              <span className="text-[17px] font-extrabold tracking-tight">EcoSort</span>
            </div>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted">
              Show EcoSort your waste. We'll help you identify it and know what to do with it.
            </p>
            <div className="mt-5">
              <ReadyPill health={health} />
            </div>
          </div>
          <div>
            <div className="text-[14px] font-semibold text-ink">Explore</div>
            <div className="mt-3 grid gap-2 text-[15px]">
              <Link className="text-muted hover:text-ink" to="/scan">Scan waste</Link>
              <Link className="text-muted hover:text-ink" to="/how-it-works">How it works</Link>
              <Link className="text-muted hover:text-ink" to="/guide">Waste guide</Link>
              <Link className="text-muted hover:text-ink" to="/future">Where EcoSort is going</Link>
              <Link className="text-muted hover:text-ink" to="/my-scans">My scans</Link>
            </div>
          </div>
          <div>
            <div className="text-[14px] font-semibold text-ink">For researchers</div>
            <div className="mt-3 grid gap-2 text-[15px]">
              <Link className="text-muted hover:text-ink" to="/research">Research overview</Link>
              <Link className="text-muted hover:text-ink" to="/research/dataset">Dataset</Link>
              <Link className="text-muted hover:text-ink" to="/research/training">Training</Link>
              <Link className="text-muted hover:text-ink" to="/research/evaluation">Evaluation</Link>
              <Link className="text-muted hover:text-ink" to="/about">About EcoSort</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-line">
          <div className="container-site flex flex-wrap items-center gap-3 py-5 text-[13px] text-muted">
            <span>© {new Date().getFullYear()} EcoSort. Learn to sort better.</span>
            <span className="ml-auto">Simulation available · hardware integrations are clearly labelled.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
