import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Correction, type Scan } from '../api'
import {
  Badge,
  Card,
  Empty,
  ErrorState,
  Kicker,
  Loading,
  SectionTitle,
  clockTime,
  cx,
  pct,
  relTime,
} from '../components/ui'

function thumbUrl(s: Scan): string | null {
  if (!s.image_path || s.source !== 'upload') return null
  const name = s.image_path.replace(/\\/g, '/').split('/').pop()
  return name ? `/uploads/${name}` : null
}

export default function Review() {
  const [queue, setQueue] = useState<Scan[]>([])
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [classes, setClasses] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [chosenClass, setChosenClass] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [q, c, cl] = await Promise.all([api.reviewQueue(100), api.corrections(50), api.classes()])
      setQueue(q.items)
      setCorrections(c.corrections)
      setClasses(cl.classes.map((x) => x.id))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load review queue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async (id: string, correct: boolean, correctClass?: string) => {
    setActingId(id)
    setError(null)
    setNotice(null)
    try {
      const r = await api.feedback(id, correct, correctClass)
      setNotice(
        r.was_correct
          ? `Scan ${id.slice(0, 8)} verified as correct — removed from the queue.`
          : `Correction recorded: ${r.verified_class}. The scan left the queue and joined the retraining candidates.`,
      )
      setRejectId(null)
      setChosenClass('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to submit feedback')
    } finally {
      setActingId(null)
    }
  }

  if (loading) return <Loading label="Loading review queue" />

  const lowConf = queue.filter((s) => s.state === 'low').length
  const rejected = queue.filter((s) => s.was_correct === 0).length

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Review Queue"
        sub="Low-confidence and human-rejected scans waiting for a verified label. Verified labels feed the next retraining run."
        right={<Badge tone={queue.length ? 'warn' : 'good'}>{queue.length} pending</Badge>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Awaiting review', String(queue.length)],
          ['Low confidence', String(lowConf)],
          ['Human-rejected', String(rejected)],
        ].map(([k, v]) => (
          <Card key={k} className="!p-4">
            <Kicker>{k}</Kicker>
            <div className="mt-2 font-mono text-xl font-semibold tabular-nums text-ink">{v}</div>
          </Card>
        ))}
      </div>

      {error && <ErrorState message={error} />}
      {notice && (
        <Card className="border-emerald/30 bg-emerald/[0.06]">
          <p className="text-xs text-ink">{notice}</p>
        </Card>
      )}

      {!queue.length && !error && (
        <Empty
          title="The review queue is empty"
          hint="Every scan so far is either high-confidence and verified, or already corrected. New low-confidence scans appear here automatically."
          icon="✓"
        />
      )}

      <div className="space-y-3">
        {queue.map((s) => {
          const thumb = thumbUrl(s)
          const rejecting = rejectId === s.id
          return (
            <Card key={s.id} className="!p-4">
              <div className="flex flex-wrap items-start gap-4">
                {thumb ? (
                  <img
                    src={thumb}
                    alt={s.predicted_class}
                    loading="lazy"
                    className="h-16 w-16 shrink-0 rounded-xl border border-line object-cover"
                  />
                ) : (
                  <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl border border-line bg-surface2 font-mono text-lg text-muted">
                    {s.predicted_class.slice(0, 2).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold capitalize text-ink">{s.predicted_class}</span>
                    <Badge tone={s.state === 'low' ? 'bad' : 'warn'}>{pct(s.confidence, 1)}</Badge>
                    {s.was_correct === 0 && <Badge tone="bad">rejected</Badge>}
                    <span className="chip">{s.source}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-[11px] text-muted">
                    <span title={s.created_at}>{relTime(s.created_at)} · {clockTime(s.created_at)}</span>
                    {s.target_bin && <span>→ {s.target_bin}</span>}
                    {s.model_version && <span>{s.model_version}</span>}
                    <Link to={`/scan?id=${s.id}`} className="text-emerald hover:underline">
                      open full analysis →
                    </Link>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    className="btn-ghost !px-3 !py-1.5 text-xs"
                    disabled={actingId === s.id}
                    onClick={() => void submit(s.id, true)}
                  >
                    {actingId === s.id ? '…' : '✓ Correct'}
                  </button>
                  <button
                    className={cx(
                      'btn !px-3 !py-1.5 text-xs',
                      rejecting
                        ? 'border-rose/50 bg-rose/10 text-ink'
                        : 'border-line bg-surface/60 text-muted hover:border-rose/50 hover:text-ink',
                    )}
                    disabled={actingId === s.id}
                    onClick={() => {
                      setRejectId(rejecting ? null : s.id)
                      setChosenClass('')
                    }}
                  >
                    ✗ Wrong
                  </button>
                </div>
              </div>

              {rejecting && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <span className="text-xs text-muted">What is it actually?</span>
                  <select
                    value={chosenClass}
                    onChange={(e) => setChosenClass(e.target.value)}
                    className="input !w-auto !py-1.5 text-xs"
                  >
                    <option value="">Select class…</option>
                    {classes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn-primary !px-3 !py-1.5 text-xs"
                    disabled={!chosenClass || actingId === s.id}
                    onClick={() => void submit(s.id, false, chosenClass)}
                  >
                    Record correction
                  </button>
                  <button
                    className="btn-ghost !px-3 !py-1.5 text-xs"
                    onClick={() => {
                      setRejectId(null)
                      setChosenClass('')
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Corrections log */}
      <Card>
        <Kicker>Correction log — last {corrections.length}</Kicker>
        {!corrections.length ? (
          <p className="mt-3 text-xs text-muted">No corrections recorded yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-line/60">
            {corrections.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="font-mono text-[11px] text-muted">{relTime(c.created_at)}</span>
                <span className="capitalize text-muted line-through">{c.predicted_class}</span>
                <span className="text-emerald">→</span>
                <span className="font-semibold capitalize text-ink">{c.correct_class}</span>
                {c.scan_id && (
                  <Link to={`/scan?id=${c.scan_id}`} className="font-mono text-[11px] text-emerald hover:underline">
                    scan {c.scan_id.slice(0, 8)}
                  </Link>
                )}
                <span className="ml-auto chip">{c.source}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
