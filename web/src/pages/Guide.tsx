import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type ClassInfo } from '../api'
import { SiteSection, displayName, wasteVisual } from '../components/ui'

export default function Guide() {
  const [params, setParams] = useSearchParams()
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.classes().then((r) => setClasses(r.classes)).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the guide'))
  }, [])

  const activeId = params.get('class') ?? ''
  const active = classes.find((c) => c.id === activeId) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return classes
    return classes.filter((c) => displayName(c.id).toLowerCase().includes(q) || c.id.includes(q))
  }, [classes, query])

  return (
    <div>
      <section className="hero-blob">
        <div className="container-site max-w-3xl py-14 text-center">
          <h1 className="font-display text-4xl sm:text-5xl">Waste Guide</h1>
          <p className="mx-auto mt-4 max-w-xl text-[18px] leading-relaxed text-muted">
            Practical, plain-language help for everyday materials.
          </p>
          <div className="mx-auto mt-7 max-w-xl">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What are you trying to throw away?"
              className="input !rounded-full !px-6 !py-4 !text-[16px] shadow-soft"
              aria-label="Search waste types"
            />
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-surface/50">
        <div className="container-site section-pad !py-12">
          {error && <div className="rounded-2xl border border-rose/30 bg-rose/[0.06] p-4 text-[14px]">{error}</div>}

          {!active ? (
            <>
              <SiteSection title="Browse by material." sub="Pick the closest match — each page explains what it is and what to do with it." />
              <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((c) => {
                  const v = wasteVisual(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => setParams({ class: c.id })}
                      className="card card-hover p-6 text-left"
                    >
                      <span className={`grid h-14 w-14 place-items-center rounded-2xl text-3xl ${v.tint}`}>{v.icon}</span>
                      <div className="mt-4 text-[19px] font-bold text-ink">{displayName(c.id)}</div>
                      <div className="text-[13px] text-muted">{v.blurb}</div>
                      <p className="mt-2 line-clamp-2 text-[14px] leading-relaxed text-muted">{c.guide.action}</p>
                      <span className="mt-3 inline-block text-[14px] font-semibold text-emerald">Learn more →</span>
                    </button>
                  )
                })}
              </div>
              {!filtered.length && !error && (
                <p className="mt-8 text-center text-[15px] text-muted">
                  Nothing matches “{query}”. Try “plastic”, “glass” or “battery”.
                </p>
              )}
            </>
          ) : (
            <div className="mx-auto max-w-3xl">
              <button onClick={() => setParams({})} className="text-[14px] font-semibold text-emerald hover:underline">
                ← All waste types
              </button>
              <div className="card mt-4 p-7 sm:p-9">
                <div className="flex items-center gap-4">
                  <span className={`grid h-16 w-16 place-items-center rounded-3xl text-4xl ${wasteVisual(active.id).tint}`}>
                    {wasteVisual(active.id).icon}
                  </span>
                  <div>
                    <h2 className="font-display text-3xl sm:text-4xl">{displayName(active.id)}</h2>
                    <p className="mt-1 text-[14px] text-muted">{active.guide.stream}</p>
                  </div>
                </div>

                <div className="mt-7 space-y-7">
                  <div>
                    <h3 className="text-[17px] font-bold text-ink">What is it?</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-muted">{active.guide.action}</p>
                    {active.guide.prep.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {active.guide.prep.slice(0, 3).map((p) => (
                          <li key={p} className="flex gap-2.5 text-[15px] text-muted"><span className="text-emerald">•</span>{p}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h3 className="text-[17px] font-bold text-ink">What to do with it</h3>
                    <ul className="mt-2 space-y-2">
                      {active.guide.prep.map((p) => (
                        <li key={p} className="flex gap-2.5 text-[15px] leading-relaxed text-muted"><span className="mt-0.5 text-emerald">✓</span>{p}</li>
                      ))}
                    </ul>
                  </div>
                  {active.guide.why && (
                    <div className="rounded-2xl bg-surface2/70 p-5">
                      <h3 className="text-[15px] font-bold text-ink">Why it matters</h3>
                      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{active.guide.why}</p>
                    </div>
                  )}
                  <div>
                    <h3 className="text-[17px] font-bold text-ink">Common mistakes</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-muted">
                      {active.guide.note || 'When in doubt, keep it clean, dry and separate — contamination is the most common reason recyclables get rejected.'}
                    </p>
                    {active.guide.confusion.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {active.guide.confusion.map((c) => (
                          <button
                            key={c}
                            onClick={() => setParams({ class: c })}
                            className="rounded-full border border-line bg-surface2 px-3 py-1.5 text-[13px] font-medium text-muted hover:text-ink"
                          >
                            Often confused with {displayName(c)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-6">
                  <Link to="/scan" className="btn-primary">Scan something like this</Link>
                  <button onClick={() => setParams({})} className="btn-ghost">Browse all types</button>
                </div>
              </div>
              <p className="mt-4 text-center text-[13px] leading-relaxed text-muted">
                General guidance for learning — local recycling rules always have the final word.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
