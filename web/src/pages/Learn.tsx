import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, type ClassInfo } from '../api'
import { Badge, Card, ErrorState, Kicker, Loading, SectionTitle, cx } from '../components/ui'

export default function Learn() {
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()

  useEffect(() => {
    let alive = true
    api
      .classes()
      .then((r) => alive && setClasses(r.classes))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'failed to load the guide'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const selected = useMemo(() => {
    const id = params.get('class')
    return classes.find((c) => c.id === id) ?? classes[0] ?? null
  }, [classes, params])

  if (loading) return <Loading label="Loading the waste guide" />
  if (error) return <ErrorState message={error} />
  if (!selected) return <ErrorState message="No classes available — is the API running?" />

  const g = selected.guide

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Waste Guide"
        sub="What the model classes mean in the real world — streams, bins, preparation rules and the look-alikes that confuse everyone, humans included."
      />

      {/* Class selector */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {classes.map((c) => (
          <button
            key={c.id}
            onClick={() => setParams({ class: c.id }, { replace: true })}
            className={cx(
              'rounded-card border p-3 text-left transition-all duration-200 ease-spring',
              selected.id === c.id
                ? 'border-emerald/50 bg-emerald/[0.08] shadow-soft'
                : 'border-line bg-surface/60 hover:border-emerald/30 hover:bg-surface',
            )}
          >
            <div className="text-sm font-bold capitalize text-ink">{c.display}</div>
            <div className="mt-1 font-mono text-[10px] text-muted">{c.bin_label}</div>
          </button>
        ))}
      </div>

      {/* Detail */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-2xl font-extrabold tracking-tight text-ink">{selected.display}</h3>
            <Badge tone={g.recyclable ? 'good' : 'bad'}>{g.recyclable ? 'recyclable stream' : 'not recyclable'}</Badge>
            <Badge tone="info">{selected.bin_label}</Badge>
            {g.hazard && g.hazard.toLowerCase() !== 'none' && <Badge tone="warn">⚠ {g.hazard}</Badge>}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-muted">{g.why}</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <Kicker>Stream</Kicker>
              <p className="mt-1.5 text-sm text-ink">{g.stream}</p>
            </div>
            <div>
              <Kicker>Sorting action</Kicker>
              <p className="mt-1.5 text-sm text-ink">{g.action}</p>
            </div>
          </div>

          {g.prep.length > 0 && (
            <div className="mt-5">
              <Kicker>Preparation before recycling</Kicker>
              <ul className="mt-2 space-y-1.5">
                {g.prep.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-muted">
                    <span className="mt-0.5 text-emerald">✓</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {g.note && (
            <div className="mt-5 rounded-xl border border-line bg-surface2/50 p-3">
              <p className="text-xs leading-relaxed text-muted">
                <span className="font-semibold text-ink">Note — </span>
                {g.note}
              </p>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <Kicker>Bin routing</Kicker>
            <div className="mt-3 flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald/15 text-lg text-emerald ring-1 ring-emerald/25">
                ⇥
              </span>
              <div>
                <div className="font-mono text-sm font-semibold text-ink">{selected.bin}</div>
                <div className="text-xs text-muted">{selected.bin_label}</div>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              The robot control center routes this class to the bin above whenever confidence clears the threshold.
            </p>
          </Card>

          {g.confusion.length > 0 && (
            <Card>
              <Kicker>Commonly confused with</Kicker>
              <div className="mt-3 flex flex-wrap gap-2">
                {g.confusion.map((other) => {
                  const target = classes.find((c) => c.id === other || c.display.toLowerCase() === other.toLowerCase())
                  return target ? (
                    <button
                      key={other}
                      onClick={() => setParams({ class: target.id }, { replace: true })}
                      className="rounded-lg border border-line bg-surface2/50 px-3 py-1.5 text-xs font-medium capitalize text-muted transition-colors hover:border-emerald/40 hover:text-ink"
                    >
                      {target.display}
                    </button>
                  ) : (
                    <span key={other} className="chip capitalize">
                      {other}
                    </span>
                  )
                })}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted">
                These pairs also dominate the model's confusion matrix — see the Evaluation page for the measured rates.
              </p>
            </Card>
          )}

          <Card>
            <Kicker>Model mapping</Kicker>
            <div className="mt-3 space-y-1.5 font-mono text-[11px] text-muted">
              <div className="flex justify-between gap-2">
                <span>class index</span>
                <span className="text-ink">{selected.index}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>label id</span>
                <span className="text-ink">{selected.id}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>bin</span>
                <span className="text-ink">{selected.bin}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
