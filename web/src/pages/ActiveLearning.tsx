import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, assetUrl, type ALQueueItem, type DatasetCandidate } from '../api'
import { Badge, Card, Empty, ErrorState, Kicker, Loading, SectionTitle, cx, pct, relTime } from '../components/ui'

function QueueCard({ item, classes, onDone }: { item: ALQueueItem; classes: string[]; onDone: () => void }) {
  const [choice, setChoice] = useState(item.corrected_class ?? item.predicted_class)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [broken, setBroken] = useState(false)

  const act = async (action: 'accept' | 'correct' | 'reject' | 'uncertain') => {
    setBusy(true)
    setError('')
    try {
      await api.alReview(item.id, action, action === 'correct' ? choice : undefined)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4 sm:flex-row">
      <div className="relative h-40 w-full shrink-0 overflow-hidden rounded-xl border border-line bg-surface2 sm:h-32 sm:w-32">
        {broken || !item.id ? (
          <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-muted">image no longer available</div>
        ) : (
          <img
            src={assetUrl(`/api/scans/${item.id}/image`)}
            alt={`Scan predicted as ${item.predicted_class}`}
            loading="lazy"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold capitalize text-ink">{item.predicted_class}</span>
          <Badge tone={item.state === 'high' ? 'good' : item.state === 'moderate' ? 'warn' : 'bad'}>{pct(item.confidence, 1)}</Badge>
          <Badge tone="info">priority {item.priority}</Badge>
          <span className="ml-auto text-xs text-muted">{relTime(item.created_at)}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {item.reasons.map((r) => (
            <span key={r} className="chip">{r}</span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value={choice} onChange={(e) => setChoice(e.target.value)} disabled={busy} className="rounded-lg border border-line bg-surface2 px-2.5 py-1.5 text-sm outline-none" aria-label="Correct class">
            {classes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button className="btn-primary px-3 py-1.5 text-xs" disabled={busy} onClick={() => void act('accept')}>Accept prediction</button>
          <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy} onClick={() => void act('correct')}>Verify as {choice}</button>
          <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy} onClick={() => void act('uncertain')}>Mark uncertain</button>
          <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy} onClick={() => void act('reject')}>Reject image</button>
        </div>
        {error && <p className="mt-2 font-mono text-xs text-rose">{error}</p>}
      </div>
    </Card>
  )
}

export default function ActiveLearning() {
  const [queue, setQueue] = useState<ALQueueItem[] | null>(null)
  const [candidates, setCandidates] = useState<DatasetCandidate[]>([])
  const [classes, setClasses] = useState<string[]>([])
  const [stats, setStats] = useState<{ pending: number; verified: number; rejected: number; uncertain: number } | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'queue' | 'candidates'>('queue')

  const load = useCallback(async () => {
    try {
      const [q, c, s] = await Promise.all([api.alQueue(100), api.datasetCandidates(200), api.alStats()])
      setQueue(q.items)
      setCandidates(c.candidates)
      setStats(s)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    load()
    api.classes().then((r) => setClasses(r.classes.map((c) => c.id))).catch(() => setClasses([]))
  }, [load])

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Active learning"
        sub="Verified reviewer labels become candidates for the next dataset version — never edits to the frozen test set."
        right={
          <div className="flex gap-1.5">
            {(['queue', 'candidates'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cx(
                  'rounded-full border px-3 py-1.5 text-xs capitalize transition',
                  tab === t ? 'border-emerald/50 bg-emerald/12 text-emerald' : 'border-line bg-surface2 text-muted hover:text-ink',
                )}
              >
                {t === 'queue' ? 'Needs review' : `Verified candidates (${candidates.length})`}
              </button>
            ))}
          </div>
        }
      />

      {error && <ErrorState message={error} onRetry={load} />}

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Pending', stats?.pending],
          ['Verified', stats?.verified],
          ['Rejected', stats?.rejected],
          ['Uncertain', stats?.uncertain],
        ].map(([k, v]) => (
          <Card key={k as string} className="!p-4">
            <Kicker>{k}</Kicker>
            <div className="mt-2 font-mono text-xl font-semibold tabular-nums text-ink">
              {v === undefined || v === null ? '—' : v}
            </div>
          </Card>
        ))}
      </div>
      <p className="-mt-2 text-[11px] leading-relaxed text-muted">
        Only VERIFIED items can become Dataset v4 candidates. Rejected and uncertain items stay out of supervised training.
      </p>

      {tab === 'queue' && (
        <>
          {queue === null && !error ? (
            <Loading label="Loading active-learning queue" />
          ) : queue && queue.length === 0 ? (
            <Empty title="Queue is empty" hint="Low-confidence scans and user corrections will appear here with their priority reasons." icon="✓" />
          ) : (
            <div className="space-y-3">
              {queue?.map((s) => (
                <QueueCard key={s.id} item={s} classes={classes} onDone={load} />
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'candidates' && (
        <Card>
          <Kicker>Verified candidates for Dataset v4</Kicker>
          {candidates.length === 0 ? (
            <div className="mt-3"><Empty title="No verified candidates yet" hint="Accept or correct queue items to build the v4 candidate pool." icon="◇" /></div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Predicted</th>
                    <th className="py-2 pr-3 font-medium">Verified as</th>
                    <th className="py-2 pr-3 font-medium">Model</th>
                    <th className="py-2 pr-3 font-medium">Scan</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.id} className="border-b border-line/50 last:border-0">
                      <td className="py-2.5 pr-3 text-xs text-muted">{relTime(c.created_at)}</td>
                      <td className="py-2.5 pr-3 capitalize text-muted">{c.predicted_class}</td>
                      <td className="py-2.5 pr-3 capitalize text-emerald">{c.correct_class}</td>
                      <td className="py-2.5 pr-3 font-mono text-[11px] text-muted">{(c.model_version ?? '—').split('-').slice(-1)}</td>
                      <td className="py-2.5 pr-3">
                        {c.scan_id ? <Link className="text-xs text-emerald hover:underline" to={`/scan?id=${c.scan_id}`}>open</Link> : <span className="text-xs text-muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Dataset v3 stays immutable. When this pool is large enough, v4 = v3 + verified candidates, re-validated
            (quality, exact + near-duplicate, class, split and provenance checks) before any training.
          </p>
        </Card>
      )}
    </div>
  )
}
