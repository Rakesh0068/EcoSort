import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, assetUrl, type Correction, type Scan } from '../api'
import {
  Badge,
  Card,
  Empty,
  ErrorState,
  Kicker,
  Loading,
  MetricRow,
  SectionTitle,
  Stat,
  confidenceTone,
  cx,
  pct,
  relTime,
} from '../components/ui'

type Tab = 'queue' | 'verified'

/** One queued scan with its own label picker and submit state. */
function QueueItem({
  scan,
  classes,
  onDone,
}: {
  scan: Scan
  classes: string[]
  onDone: () => void
}) {
  const [choice, setChoice] = useState<string>(scan.corrected_class ?? scan.predicted_class)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [broken, setBroken] = useState(false)
  const tone = confidenceTone(scan.state)

  const submit = async (correct: boolean) => {
    setBusy(true)
    setError('')
    try {
      await api.feedback(scan.id, correct, correct ? undefined : choice, 'review')
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const rejected = scan.was_correct === 0
  const alternatives = scan.top5.filter((t) => t.class !== scan.predicted_class).slice(0, 3)

  return (
    <Card className="flex flex-col gap-4 sm:flex-row">
      <div className="relative h-40 w-full shrink-0 overflow-hidden rounded-xl border border-line bg-surface2 sm:h-32 sm:w-32">
        {broken ? (
          <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-muted">
            image no longer available
          </div>
        ) : (
          <img
            src={assetUrl(`/api/scans/${scan.id}/image`)}
            alt={`Scan predicted as ${scan.predicted_class}`}
            loading="lazy"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold capitalize text-ink">{scan.predicted_class}</span>
          <Badge tone={tone.tone}>{pct(scan.confidence, 1)}</Badge>
          <Badge tone={rejected ? 'bad' : 'warn'}>
            {rejected ? 'user rejected' : 'low confidence'}
          </Badge>
          <span className="ml-auto text-xs text-muted">{relTime(scan.created_at)}</span>
        </div>

        <p className="mt-1.5 text-xs text-muted">
          {rejected
            ? 'A user marked this prediction wrong. The verified label below replaces it in the training candidates.'
            : 'The model was not confident enough for this to drive a sorting action, so it was held instead of guessed.'}
        </p>

        {alternatives.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {alternatives.map((a) => (
              <button
                key={a.class}
                onClick={() => setChoice(a.class)}
                className={cx(
                  'rounded-full border px-2.5 py-1 text-[11px] capitalize transition',
                  choice === a.class
                    ? 'border-emerald/50 bg-emerald/12 text-emerald'
                    : 'border-line bg-surface2 text-muted hover:text-ink',
                )}
              >
                {a.display} {pct(a.probability, 1)}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            disabled={busy}
            className="rounded-lg border border-line bg-surface2 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-emerald/60"
            aria-label="Correct class"
          >
            {classes.map((c) => (
              <option key={c} value={c} className="capitalize">
                {c}
              </option>
            ))}
          </select>
          <button className="btn-primary px-3 py-1.5 text-xs" disabled={busy} onClick={() => submit(false)}>
            {busy ? 'Saving…' : 'Verify label'}
          </button>
          <button
            className="btn-ghost px-3 py-1.5 text-xs"
            disabled={busy}
            onClick={() => submit(true)}
            title="The prediction was actually right; it was just uncertain."
          >
            Prediction was correct
          </button>
          <Link className="btn-ghost px-3 py-1.5 text-xs" to={`/scan?id=${scan.id}`}>
            Open analysis
          </Link>
        </div>

        {error && <p className="mt-2 font-mono text-xs text-rose">{error}</p>}
      </div>
    </Card>
  )
}

export default function Review() {
  const [tab, setTab] = useState<Tab>('queue')
  const [queue, setQueue] = useState<Scan[] | null>(null)
  const [corrections, setCorrections] = useState<Correction[] | null>(null)
  const [classes, setClasses] = useState<string[]>([])
  const [activity, setActivity] = useState<{ scans: number; corrections: number; low_confidence: number } | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [threshold, setThreshold] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const [q, c, a] = await Promise.all([api.reviewQueue(100), api.corrections(200), api.activity()])
      setQueue(q.items)
      setCorrections(c.corrections)
      setActivity({ scans: a.scans, corrections: a.corrections, low_confidence: a.low_confidence })
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    load()
    api
      .classes()
      .then((r) => setClasses(r.classes.map((c) => c.id)))
      .catch(() => setClasses([]))
    api
      .robotStatus()
      .then((r) => setThreshold(r.confidence_threshold))
      .catch(() => setThreshold(null))
  }, [load])

  const verifiedCount = corrections?.filter((c) => c.verified).length ?? 0

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Review queue"
        sub="Predictions the model was unsure about, plus every correction users submitted. Verified labels here are the training candidates for the next run."
        right={
          <div className="flex gap-1.5">
            {(['queue', 'verified'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cx(
                  'rounded-full border px-3 py-1.5 text-xs capitalize transition',
                  tab === t
                    ? 'border-emerald/50 bg-emerald/12 text-emerald'
                    : 'border-line bg-surface2 text-muted hover:text-ink',
                )}
              >
                {t === 'queue' ? 'Needs review' : 'Verified labels'}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Awaiting review" value={queue?.length ?? '—'} sub="Low confidence or rejected" />
        <Stat label="Corrections logged" value={corrections?.length ?? '—'} sub="From users and reviewers" />
        <Stat label="Verified labels" value={verifiedCount} sub="Confirmed by a reviewer here" />
        <Stat
          label="Low-confidence rate"
          value={
            activity && activity.scans > 0 ? pct(activity.low_confidence / activity.scans, 1) : '—'
          }
          sub={`${activity?.low_confidence ?? 0} of ${activity?.scans ?? 0} scans`}
        />
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {note && (
        <Card className="border-emerald/30 bg-emerald/5">
          <p className="text-sm text-ink">{note}</p>
        </Card>
      )}

      {tab === 'queue' && (
        <>
          {queue === null && !error ? (
            <Loading label="Loading review queue" />
          ) : queue && queue.length === 0 ? (
            <Empty
              title="Nothing is waiting for review"
              hint="Scans below the confidence gate, and any prediction a user marks wrong, appear here automatically."
              icon="✓"
            />
          ) : (
            <div className="space-y-3">
              {queue?.map((s) => (
                <QueueItem
                  key={s.id}
                  scan={s}
                  classes={classes}
                  onDone={() => {
                    setNote(`Label for ${s.predicted_class} scan saved. It is now a retraining candidate.`)
                    load()
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'verified' && (
        <Card>
          <Kicker>Correction log</Kicker>
          {corrections === null && !error ? (
            <Loading label="Loading corrections" />
          ) : corrections && corrections.length === 0 ? (
            <Empty
              title="No corrections yet"
              hint="Use the feedback controls under any scan result, or verify a label from the review queue."
              icon="◇"
            />
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Predicted</th>
                    <th className="py-2 pr-3 font-medium">Corrected to</th>
                    <th className="py-2 pr-3 font-medium">Source</th>
                    <th className="py-2 pr-3 font-medium">Scan</th>
                  </tr>
                </thead>
                <tbody>
                  {corrections?.map((c) => (
                    <tr key={c.id} className="border-b border-line/50 last:border-0">
                      <td className="py-2.5 pr-3 text-xs text-muted">{relTime(c.created_at)}</td>
                      <td className="py-2.5 pr-3">
                        <span className="capitalize text-rose">{c.predicted_class}</span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="capitalize text-emerald">{c.correct_class}</span>
                        {c.predicted_class === c.correct_class && (
                          <span className="ml-2 text-xs text-muted">confirmed correct</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <Badge tone={c.verified ? 'good' : 'neutral'}>{c.source}</Badge>
                      </td>
                      <td className="py-2.5 pr-3">
                        {c.scan_id ? (
                          <Link className="text-xs text-emerald hover:underline" to={`/scan?id=${c.scan_id}`}>
                            open
                          </Link>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Card>
        <Kicker>How this feeds back into the model</Kicker>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 text-sm text-muted">
            <p>
              1. A prediction below the {threshold != null ? pct(threshold, 0) : '—'} gate — or one a user rejects —
              lands in this queue instead of being acted on.
            </p>
            <p>2. A reviewer assigns the correct class. The label is stored against the original image.</p>
            <p>
              3. Verified labels are exported as training candidates and folded into the next training run, which is
              started manually from the Training page so the dataset change is deliberate.
            </p>
            <p>
              4. The new checkpoint is re-evaluated on the untouched test split, so improvement is measured rather than
              assumed.
            </p>
          </div>
          <div>
            <MetricRow label="Loop status" value="labels collected, retraining manual" />
            <MetricRow label="Queue source" value="confidence gate + user feedback" />
            <MetricRow label="Storage" value="SQLite (scans, corrections)" />
            <MetricRow label="Evaluation split" value="test — never retrained on" />
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Nothing here retrains the model on its own. Closing the loop means exporting these labels and starting a run
          you can inspect — an automatic retrain would silently change what the robot does.
        </p>
      </Card>
    </div>
  )
}
