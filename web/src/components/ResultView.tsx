import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, b64url, type PredictionResult } from '../api'
import { Card, TechDetails, displayName, friendlyConfidence, ms, pct, wasteVisual } from './ui'

function FeedbackBlock({
  result,
  classes,
}: {
  result: PredictionResult
  classes: string[]
}) {
  const [verdict, setVerdict] = useState<null | boolean>(null)
  const [chosen, setChosen] = useState(result.prediction.class)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (!result.scan_id) {
    return (
      <Card>
        <div className="text-[16px] font-bold text-ink">Was EcoSort right?</div>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
          This result wasn't saved, so there's nowhere to attach feedback yet. Scan again with saving enabled.
        </p>
      </Card>
    )
  }

  const submit = async () => {
    if (verdict === null || !result.scan_id) return
    setBusy(true)
    setErr(null)
    try {
      const r = await api.feedback(result.scan_id, verdict, verdict ? undefined : chosen)
      setMsg(
        r.was_correct
          ? 'Thanks — your confirmation helps EcoSort keep improving.'
          : `Thanks — we've noted it as ${displayName(chosen)}. Your correction helps future versions.`,
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save feedback')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="text-[17px] font-bold text-ink">Was this prediction correct?</div>
      <p className="mt-1 text-[14px] text-muted">A quick tap helps EcoSort get smarter over time.</p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            setVerdict(true)
            setMsg(null)
          }}
          className={
            verdict === true
              ? 'rounded-2xl bg-forest px-4 py-3 text-[15px] font-semibold text-white dark:bg-emerald'
              : 'rounded-2xl border border-line bg-surface2/60 px-4 py-3 text-[15px] font-semibold text-ink hover:border-emerald/50'
          }
        >
          Correct
        </button>
        <button
          onClick={() => {
            setVerdict(false)
            setMsg(null)
          }}
          className={
            verdict === false
              ? 'rounded-2xl bg-ink px-4 py-3 text-[15px] font-semibold text-bg'
              : 'rounded-2xl border border-line bg-surface2/60 px-4 py-3 text-[15px] font-semibold text-ink hover:border-emerald/50'
          }
        >
          Incorrect
        </button>
      </div>

      {verdict === false && (
        <div className="mt-3">
          <label className="text-[14px] font-semibold text-ink" htmlFor="correct-class">
            What is it actually?
          </label>
          <select
            id="correct-class"
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            className="input mt-2"
          >
            {classes.map((c) => (
              <option key={c} value={c}>
                {displayName(c)}
              </option>
            ))}
          </select>
        </div>
      )}

      {verdict !== null && !msg && (
        <button className="btn-primary mt-4 w-full" onClick={submit} disabled={busy}>
          {busy ? 'Saving…' : 'Send feedback'}
        </button>
      )}

      {msg && (
        <div className="mt-4 rounded-2xl border border-emerald/30 bg-emerald/[0.08] p-4 text-[14px] leading-relaxed text-ink">
          {msg}
        </div>
      )}
      {err && (
        <div className="mt-4 rounded-2xl border border-rose/30 bg-rose/[0.07] p-4 text-[14px] text-rose">{err}</div>
      )}
    </Card>
  )
}

export function ResultView({
  result,
  classes,
  onTryAgain,
}: {
  result: PredictionResult
  classes: string[]
  onTryAgain?: () => void
}) {
  const [explainView, setExplainView] = useState<'photo' | 'highlight'>('highlight')
  const p = result.prediction
  const q = result.input_quality
  const low = p.state === 'low'
  const moderate = p.state === 'moderate'
  const visual = wasteVisual(p.class)
  const name = displayName(p.class)
  const hasQualityIssue = q.issues.length > 0

  return (
    <div className="space-y-4">
      <Card className="!p-6 sm:!p-8">
        <p className="text-[15px] font-medium text-muted">{low ? "EcoSort isn't completely sure." : 'We think this is…'}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-surface2 text-3xl">{visual.icon}</span>
          <h2 className="font-display text-4xl text-ink sm:text-5xl">{name}</h2>
        </div>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald/10 px-3.5 py-1.5 text-[14px] font-semibold text-forest dark:text-emerald">
          <span className="h-2 w-2 rounded-full bg-emerald" />
          {friendlyConfidence(p.state)}
        </div>

        {low ? (
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted">
            EcoSort is not confident enough to recommend automatic sorting. Try taking another photo with better
            lighting or a clearer view. If you'd like, tell us what it is below — that helps EcoSort learn.
          </p>
        ) : moderate ? (
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted">
            Please verify this result — EcoSort is fairly confident, but the next-best option is close. {p.state_reason}
          </p>
        ) : (
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted">{p.state_reason}</p>
        )}

        {onTryAgain && low && (
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={onTryAgain}>
              Try again
            </button>
            <a href="#feedback" className="btn-ghost">
              Tell us what it is
            </a>
          </div>
        )}
      </Card>

      {/* Photo with highlight toggle */}
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="text-[16px] font-bold text-ink">Your photo</div>
          <div className="flex gap-1.5 rounded-full bg-surface2 p-1">
            {(['photo', 'highlight'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setExplainView(v)}
                className={
                  explainView === v
                    ? 'rounded-full bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink shadow-soft'
                    : 'rounded-full px-3 py-1.5 text-[13px] font-medium text-muted'
                }
              >
                {v === 'photo' ? 'Photo' : 'What EcoSort noticed'}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface2">
          {explainView === 'photo' ? (
            result.__sourceUrl ? (
              <img src={result.__sourceUrl} alt="Your waste item" className="max-h-[420px] w-full object-contain" />
            ) : (
              <div className="grid place-items-center px-6 py-14 text-center text-[14px] text-muted">
                Original photo isn't available in this view.
              </div>
            )
          ) : (
            <img
              src={b64url(result.explainability.overlay_png_b64)}
              alt={`Highlight showing the part of the image EcoSort focused on for ${name}`}
              className="max-h-[420px] w-full object-contain"
            />
          )}
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          The highlight shows roughly where EcoSort looked. Brighter areas influenced the answer most.
        </p>
      </Card>

      {/* Guidance */}
      <Card className="border-emerald/25">
        <div className="text-[16px] font-bold text-ink">Here's what you can do</div>
        <p className="mt-2 text-[15px] leading-relaxed text-ink">{result.guidance.action}</p>

        {result.guidance.prep.length > 0 && (
          <div className="mt-5">
            <div className="text-[14px] font-semibold text-ink">Preparation</div>
            <ul className="mt-2 space-y-2">
              {result.guidance.prep.map((step) => (
                <li key={step} className="flex gap-2.5 text-[15px] leading-relaxed text-muted">
                  <span className="mt-0.5 text-emerald">✓</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.guidance.why && (
          <div className="mt-5 rounded-2xl bg-surface2/70 p-4">
            <div className="text-[14px] font-semibold text-ink">Why it matters</div>
            <p className="mt-1 text-[14px] leading-relaxed text-muted">{result.guidance.why}</p>
          </div>
        )}

        {result.guidance.note && (
          <p className="mt-3 border-l-2 border-emerald/40 pl-3 text-[13px] italic leading-relaxed text-muted">
            {result.guidance.note}
          </p>
        )}

        {hasQualityIssue && (
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            Photo tip: {q.issues.join(' · ')}. A clearer photo usually gives a more confident answer.
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Link to={`/guide?class=${p.class}`} className="btn-ghost !py-2.5 text-[14px]">
            What to do
          </Link>
          <Link to={`/guide?class=${p.class}`} className="btn-ghost !py-2.5 text-[14px]">
            Learn more
          </Link>
        </div>
      </Card>

      <div id="feedback">
        <FeedbackBlock result={result} classes={classes} />
      </div>

      <TechDetails>
        <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
          <div className="flex justify-between gap-3 rounded-xl bg-surface px-3 py-2">
            <dt className="text-muted">Model</dt>
            <dd className="font-mono text-ink">EcoSort {result.model.run_id ?? result.model.architecture}</dd>
          </div>
          <div className="flex justify-between gap-3 rounded-xl bg-surface px-3 py-2">
            <dt className="text-muted">Architecture</dt>
            <dd className="font-mono text-ink">{result.model.architecture}</dd>
          </div>
          <div className="flex justify-between gap-3 rounded-xl bg-surface px-3 py-2">
            <dt className="text-muted">Model version</dt>
            <dd className="max-w-[180px] truncate font-mono text-ink" title={result.model.version}>{result.model.version}</dd>
          </div>
          <div className="flex justify-between gap-3 rounded-xl bg-surface px-3 py-2">
            <dt className="text-muted">Dataset</dt>
            <dd className="font-mono text-ink">{result.model.dataset_version ?? 'unknown'}</dd>
          </div>
          <div className="flex justify-between gap-3 rounded-xl bg-surface px-3 py-2">
            <dt className="text-muted">Model confidence</dt>
            <dd className="font-mono text-ink">{pct(p.confidence, 2)}</dd>
          </div>
          <div className="flex justify-between gap-3 rounded-xl bg-surface px-3 py-2">
            <dt className="text-muted">Time taken</dt>
            <dd className="font-mono text-ink">{ms(result.timings_ms.total_ms)} on {result.model.device}</dd>
          </div>
          <div className="flex justify-between gap-3 rounded-xl bg-surface px-3 py-2 sm:col-span-2">
            <dt className="text-muted">Top alternatives</dt>
            <dd className="text-right font-mono text-ink">
              {p.top5.slice(1, 4).map((t) => `${displayName(t.class)} ${pct(t.probability, 1)}`).join(' · ') || '—'}
            </dd>
          </div>
        </dl>
        <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted">
          Model confidence is the raw output score, not a measured probability of being correct. Everyday guidance
          lives above; numbers live here.
        </p>
      </TechDetails>
    </div>
  )
}
