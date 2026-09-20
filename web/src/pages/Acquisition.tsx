import { useEffect, useState } from 'react'
import { api } from '../api'
import { Card, Empty, ErrorState, Kicker, Loading, SectionTitle } from '../components/ui'

interface AcqRow {
  display: string
  verified: number
  target: number
  remaining: number
}

export default function Acquisition() {
  const [rows, setRows] = useState<Record<string, AcqRow> | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = () => {
    api
      .acquisitionTargets()
      .then((r) => {
        setRows(r.per_class)
        setDraft(Object.fromEntries(Object.entries(r.per_class).map(([k, v]) => [k, String(v.target)])))
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'targets unavailable'))
  }

  useEffect(load, [])

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const targets: Record<string, number> = {}
      for (const [k, v] of Object.entries(draft)) {
        const n = Number(v)
        if (!Number.isInteger(n) || n < 0 || n > 100000) throw new Error(`Target for ${k} must be an integer 0..100000`)
        targets[k] = n
      }
      await api.acquisitionTargetsPut(targets)
      setMsg('Targets saved.')
      load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'save failed')
    } finally {
      setSaving(false)
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!rows) return <Loading label="Loading acquisition targets" />

  const totalV = Object.values(rows).reduce((a, r) => a + r.verified, 0)
  const totalT = Object.values(rows).reduce((a, r) => a + r.target, 0)

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Data acquisition"
        sub="Targeted collection driven by measured weaknesses — paper and trash default higher because run-002 error analysis measured them weakest. Targets are configurable goals, never claims."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Verified candidates', String(totalV)],
          ['Target candidates', String(totalT)],
          ['Remaining', String(Math.max(0, totalT - totalV))],
        ].map(([k, v]) => (
          <Card key={k} className="!p-4">
            <Kicker>{k}</Kicker>
            <div className="mt-2 font-mono text-xl font-semibold tabular-nums text-ink">{v}</div>
          </Card>
        ))}
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface2/50 text-left">
                <th className="px-4 py-3 font-medium text-muted">Target class</th>
                <th className="px-4 py-3 text-right font-medium text-muted">Verified</th>
                <th className="px-4 py-3 text-right font-medium text-muted">Target</th>
                <th className="px-4 py-3 text-right font-medium text-muted">Remaining</th>
                <th className="px-4 py-3 text-right font-medium text-muted">Set target</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(rows).map(([id, r]) => (
                <tr key={id} className="border-b border-line/50 last:border-0">
                  <td className="px-4 py-2.5 font-medium capitalize text-ink">{r.display}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink">{r.verified}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted">{r.target}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber">{r.remaining}</td>
                  <td className="px-4 py-2.5 text-right">
                    <input
                      value={draft[id] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))}
                      inputMode="numeric"
                      className="input !w-24 !py-1 text-right font-mono text-xs"
                      aria-label={`Target for ${r.display}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary !px-5 !py-2.5 text-sm" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save targets'}
        </button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
        <span className="ml-auto text-[11px] text-muted">
          Sources are registered with licence + provenance via dataset ingestion — see Research → Dataset.
        </span>
      </div>

      {totalV === 0 && (
        <Empty title="No verified candidates yet" hint="Review items in Active Learning to start filling these goals." icon="◇" />
      )}
    </div>
  )
}
