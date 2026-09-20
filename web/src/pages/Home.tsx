import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, assetUrl, type ClassInfo, type DatasetInfo, type PredictionResult } from '../api'
import { SiteSection, displayName, wasteVisual } from '../components/ui'

function HeroDemo() {
  const [dataset, setDataset] = useState<DatasetInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PredictionResult | null>(null)
  const [sampleUrl, setSampleUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.dataset().then(setDataset).catch(() => setDataset(null))
  }, [])

  const pool = useMemo(() => {
    if (!dataset) return []
    const out: { cls: string; url: string }[] = []
    for (const c of dataset.classes) for (const url of dataset.gallery[c] ?? []) out.push({ cls: c, url })
    return out
  }, [dataset])

  useEffect(() => {
    if (!pool.length || result) return
    setSampleUrl(pool[0].url)
    let i = 0
    const id = setInterval(() => {
      i = (i + 1) % pool.length
      setSampleUrl(pool[i].url)
    }, 4000)
    return () => clearInterval(id)
  }, [pool, result])

  const runDemo = async () => {
    if (!pool.length) {
      setError('No example photos available yet.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const pick = pool[Math.floor(Math.random() * pool.length)]
      setSampleUrl(pick.url)
      const blob = await (await fetch(pick.url)).blob()
      const r = await api.predict(blob, 'upload')
      setResult(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not run the demo')
    } finally {
      setBusy(false)
    }
  }

  const label = result ? displayName(result.prediction.class) : sampleUrl ? 'Plastic bottle' : 'Waste item'

  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[36px] bg-emerald/10 blur-3xl" aria-hidden />
      <div className="relative overflow-hidden rounded-[28px] border border-line bg-surface shadow-lift">
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-[13px] font-semibold text-muted">Try it right here</span>
          <span className="chip">
            <span className={`h-2 w-2 rounded-full ${busy ? 'bg-amber' : 'bg-emerald'}`} />
            {busy ? 'Looking…' : result ? 'Identified' : 'Ready'}
          </span>
        </div>
        <div className="relative mx-4 overflow-hidden rounded-2xl border border-line bg-surface2">
          <div className="pointer-events-none absolute inset-3 rounded-xl border-2 border-dashed border-emerald/50" aria-hidden />
          {sampleUrl || result ? (
            <img
              src={result ? `data:image/png;base64,${result.explainability.overlay_png_b64}` : assetUrl(sampleUrl)}
              alt="Waste item inside the EcoSort scanner frame"
              className="aspect-[4/3] w-full object-cover"
            />
          ) : (
            <div className="grid aspect-[4/3] w-full place-items-center text-[14px] text-muted">Loading examples…</div>
          )}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-transparent via-emerald/20 to-transparent animate-scanline" aria-hidden />
          {busy && (
            <div className="absolute inset-0 grid place-items-center bg-black/30">
              <div className="rounded-full bg-surface px-4 py-2 text-[14px] font-medium text-ink shadow-soft">
                Looking at your waste…
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-4">
          {result ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-surface2 text-2xl">
                {wasteVisual(result.prediction.class).icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-muted">EcoSort identifies:</div>
                <div className="text-[19px] font-bold text-ink">
                  {displayName(result.prediction.class)}{' '}
                  <span className="ml-1 rounded-full bg-emerald/10 px-2.5 py-1 text-[13px] font-semibold text-forest dark:text-emerald">
                    {result.prediction.state === 'high' ? 'High confidence' : result.prediction.state === 'moderate' ? 'Fairly confident' : 'Not very sure'}
                  </span>
                </div>
                <Link to="/scan" className="mt-0.5 inline-block text-[14px] font-semibold text-emerald hover:underline">
                  See what to do with it →
                </Link>
              </div>
              <button className="btn-ghost !py-2 text-[14px]" onClick={() => setResult(null)} disabled={busy}>
                Try another
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-ink">{label}</div>
                <div className="text-[13px] text-muted">See what EcoSort notices in a real photo.</div>
                {error && <div className="mt-1 text-[13px] text-rose">{error}</div>}
              </div>
              <button className="btn-primary !py-2.5 text-[14px]" onClick={runDemo} disabled={busy || !pool.length}>
                {busy ? 'Looking…' : 'Identify this'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const STEPS = [
  { n: '01', title: 'Take a photo', text: 'Hold up whatever you are about to throw away. Any phone camera works.' },
  { n: '02', title: 'EcoSort identifies it', text: 'We look at the shape, material and details and tell you what it likely is.' },
  { n: '03', title: 'Find out what to do next', text: 'Get simple next steps — what bin, what preparation, what to avoid.' },
]

function TrustSection() {
  const [eval_, setEval_] = useState<{ accuracy: number; f1: number; n: number } | null>(null)

  useEffect(() => {
    api
      .metrics()
      .then((m) => {
        if (m.available && m.evaluation) {
          setEval_({
            accuracy: m.evaluation.metrics.accuracy,
            f1: m.evaluation.metrics.f1_macro,
            n: m.evaluation.num_samples,
          })
        }
      })
      .catch(() => setEval_(null))
  }, [])

  return (
    <section className="border-t border-line bg-surface/50">
      <div className="container-site section-pad">
        <SiteSection
          title="Built on real ML experiments."
          sub="Measured on the held-out EcoSort test set — images the model never trained on. Past results don't promise future performance."
        />
        <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-3">
          {[
            { v: eval_ ? `${(eval_.accuracy * 100).toFixed(2)}%` : '—', l: 'Test accuracy' },
            { v: eval_ ? eval_.f1.toFixed(3) : '—', l: 'Macro F1' },
            { v: eval_ ? eval_.n.toLocaleString() : '—', l: 'Held-out test images' },
          ].map((s) => (
            <div key={s.l} className="card p-6 text-center">
              <div className="font-display text-4xl text-ink">{s.v}</div>
              <div className="mt-2 text-[14px] text-muted">{s.l}</div>
            </div>
          ))}
        </div>
        {!eval_ && (
          <p className="mt-4 text-center text-[13px] text-muted">Model evaluation has not been completed yet.</p>
        )}
        <div className="mt-8 text-center">
          <Link to="/research" className="text-[15px] font-semibold text-emerald hover:underline">
            Explore the research →
          </Link>
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [totalImages, setTotalImages] = useState<number | null>(null)

  useEffect(() => {
    api.classes().then((r) => setClasses(r.classes)).catch(() => setClasses([]))
    api.dataset().then((d) => setTotalImages(d.total_unique)).catch(() => setTotalImages(null))
  }, [])

  return (
    <div>
      {/* Hero */}
      <section className="hero-blob relative overflow-hidden">
        <div className="container-site grid items-center gap-12 py-14 lg:grid-cols-[1.02fr_1fr] lg:py-20">
          <div>
            <h1 className="font-display text-balance text-5xl leading-[1.02] text-ink sm:text-6xl lg:text-[4.4rem]">
              Know your waste.
              <br />
              Sort it better.
            </h1>
            <p className="mt-6 max-w-lg text-balance text-[19px] leading-relaxed text-muted">
              EcoSort uses AI to identify everyday waste and help you understand how it should be handled.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/scan" className="btn-primary !px-7 !py-3.5 !text-[16px]">
                Scan Waste
              </Link>
              <Link to="/guide" className="btn-ghost !px-7 !py-3.5 !text-[16px]">
                Explore Waste Guide
              </Link>
            </div>
            <p className="mt-6 text-[13px] text-muted">
              {totalImages != null ? `Learns from ${totalImages.toLocaleString()} waste photos` : 'Learns from thousands of waste photos'} · Free to try
            </p>
          </div>
          <HeroDemo />
        </div>
      </section>

      {/* How it works in 5 seconds */}
      <section className="border-t border-line bg-surface/50">
        <div className="container-site section-pad">
          <SiteSection title="Just show us what you're throwing away." sub="No manuals. No sorting charts taped to the fridge. Just a photo." />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="card card-hover p-7">
                <div className="font-display text-4xl text-emerald/70">{s.n}</div>
                <div className="mt-3 text-[19px] font-bold text-ink">{s.title}</div>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Big scanner CTA */}
      <section>
        <div className="container-site section-pad">
          <div className="overflow-hidden rounded-[32px] bg-forest px-6 py-14 text-center text-white sm:px-12 dark:bg-emerald/15 dark:text-ink dark:ring-1 dark:ring-emerald/25">
            <h2 className="font-display mx-auto max-w-xl text-4xl leading-[1.05] sm:text-5xl">What is it?</h2>
            <p className="mx-auto mt-4 max-w-md text-[17px] leading-relaxed opacity-80">
              Upload a photo or use your camera. EcoSort will take a look.
            </p>
            <div className="mx-auto mt-8 max-w-lg rounded-3xl border-2 border-dashed border-white/30 p-8 dark:border-emerald/30">
              <div className="text-4xl">📸</div>
              <div className="mt-3 text-[17px] font-semibold">Drop a waste photo here</div>
              <div className="mt-1 text-[14px] opacity-70">or open your camera</div>
              <Link
                to="/scan"
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-[16px] font-bold text-forest transition hover:brightness-95 dark:bg-emerald dark:text-white"
              >
                Identify Waste
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* From identification to action */}
      <section className="border-t border-line bg-surface/50">
        <div className="container-site section-pad">
          <SiteSection
            title="From identification to action."
            sub="EcoSort doesn't stop at a name. It tells you what to do next — in plain language."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: '🍶', name: 'Plastic', note: 'Usually recyclable', hint: 'Rinse it, check local guidance.' },
              { icon: '🫙', name: 'Glass', note: 'Usually recyclable', hint: 'Rinse it, keep it separate.' },
              { icon: '📦', name: 'Cardboard', note: 'Widely recyclable', hint: 'Flatten it, keep it dry.' },
              { icon: '🔋', name: 'Battery', note: 'Needs special handling', hint: 'Never bin it — find a drop-off.' },
            ].map((c) => (
              <div key={c.name} className="card card-hover p-6">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-surface2 text-3xl">{c.icon}</div>
                <div className="mt-4 text-[19px] font-bold text-ink">{c.name}</div>
                <div className="mt-1 text-[14px] font-semibold text-emerald">{c.note}</div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{c.hint}</p>
                <div className="mt-4 flex gap-2">
                  <Link to="/scan" className="rounded-full bg-surface2 px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-emerald/10">What to do</Link>
                  <Link to="/guide" className="rounded-full bg-surface2 px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-emerald/10">Learn more</Link>
                </div>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-xl text-center text-[13px] leading-relaxed text-muted">
            Guidance is general and educational. Recycling rules differ by area — always check local guidance for the final word.
          </p>
        </div>
      </section>

      {/* Built to get smarter */}
      <section>
        <div className="container-site section-pad">
          <SiteSection
            title="Built to get smarter."
            sub="EcoSort learns from thousands of waste images and continuously improves through testing, evaluation and verified feedback."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              { t: 'Learns from images', d: 'Trained on real photos of everyday waste, carefully checked and organised.' },
              { t: 'Understands different waste types', d: 'Recognises the materials people actually throw away — from glass to clothes to batteries.' },
              { t: 'Improves through verified feedback', d: 'When people correct EcoSort, those corrections help future versions get better.' },
            ].map((c) => (
              <div key={c.t} className="card p-7">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald/10 text-xl text-emerald">✓</div>
                <div className="mt-4 text-[18px] font-bold text-ink">{c.t}</div>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{c.d}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link to="/how-it-works" className="text-[15px] font-semibold text-emerald hover:underline">
              How EcoSort works →
            </Link>
          </div>
        </div>
      </section>

      {/* Trust section — real measured numbers only */}
      <TrustSection />

      {/* Robot future */}
      <section className="border-t border-line bg-surface/50">
        <div className="container-site section-pad grid items-center gap-10 lg:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[13px] font-semibold text-forest">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald" /> Looking ahead
            </div>
            <h2 className="font-display mt-4 text-4xl leading-[1.05] sm:text-5xl">Designed for the future of waste sorting.</h2>
            <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-muted">
              Today, EcoSort helps people identify waste. Tomorrow, the same intelligence can help automated sorting
              systems recognize and separate waste at scale.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/future" className="btn-primary">Explore the Technology</Link>
            </div>
          </div>
          <div className="card p-6">
            <div className="flex items-center justify-between text-[13px] font-semibold text-muted">
              <span>Camera</span><span>→</span><span>Recognition</span><span>→</span><span>Sorting decision</span><span>→</span><span>Robot</span>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center">
              {['📷', '🔍', '🗂️', '🤖'].map((e, i) => (
                <div key={i} className="rounded-2xl bg-surface2 py-6 text-3xl">{e}</div>
              ))}
            </div>
            <p className="mt-4 rounded-2xl bg-surface2/70 p-3 text-[13px] leading-relaxed text-muted">
              Future hardware integration — today you can try the simulation to see how it would work.
            </p>
          </div>
        </div>
      </section>

      {/* Waste types */}
      <section>
        <div className="container-site section-pad">
          <SiteSection title="Explore waste types" sub="The everyday materials EcoSort can recognise. Pick one to learn more." />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(classes.length
              ? classes.map((c) => ({ id: c.id, blurb: c.guide.action }))
              : ['plastic', 'glass', 'metal', 'paper', 'cardboard', 'biological', 'battery', 'clothes', 'shoes'].map((id) => ({ id, blurb: '' }))
            ).map((c) => {
              const v = wasteVisual(c.id)
              return (
                <Link key={c.id} to={`/guide?class=${c.id}`} className="card card-hover group p-6">
                  <div className="flex items-center gap-4">
                    <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-3xl ${v.tint}`}>{v.icon}</span>
                    <div className="min-w-0">
                      <div className="text-[18px] font-bold text-ink">{displayName(c.id)}</div>
                      <div className="truncate text-[13px] text-muted">{v.blurb}</div>
                    </div>
                    <span className="ml-auto text-muted transition-transform group-hover:translate-x-1">→</span>
                  </div>
                  {c.blurb && <p className="mt-3 line-clamp-2 text-[14px] leading-relaxed text-muted">{c.blurb}</p>}
                  <span className="mt-3 inline-block text-[14px] font-semibold text-emerald">Learn more →</span>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* Simple how it works */}
      <section className="border-t border-line bg-surface/50">
        <div className="container-site section-pad">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
            <SiteSection
              align="left"
              title="Here's what happens when you scan."
              sub="Five quiet steps between your photo and useful guidance."
            >
              <div className="mt-6">
                <Link to="/how-it-works" className="btn-ghost">See the technical details</Link>
              </div>
            </SiteSection>
            <ol className="space-y-3">
              {[
                'You provide an image.',
                'EcoSort processes it.',
                'EcoSort identifies the waste type.',
                'You get useful guidance.',
                'Verified feedback can help improve future versions.',
              ].map((t, i) => (
                <li key={t} className="card flex items-center gap-4 p-5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-forest text-[15px] font-bold text-white dark:bg-emerald">{i + 1}</span>
                  <span className="text-[16px] font-medium text-ink">{t}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </div>
  )
}
