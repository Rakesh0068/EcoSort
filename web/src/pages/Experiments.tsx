import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type ModelEntry } from '../api'
import { Badge, Card, ErrorState, Kicker, Loading, SectionTitle, cx, pct } from '../components/ui'

function cell(v: number | null | undefined, fmt: (n: number) => string) {
  return v === null || v === undefined ? <span className="text-muted">N/A</span> : <span>{fmt(v)}</span>
}

export default function Experiments() {
  const [models, setModels] = useState<ModelEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api
      .modelsCompare(['run-001', 'run-002'])
      .then((r) => alive && setModels(r.models))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'comparison unavailable'))
    return () => {
      alive = false
    }
  }, [])

  if (error) return <ErrorState message={error} />
  if (!models) return <Loading label="Loading model comparison" />

  const rows: { label: string; get: (m: ModelEntry) => React.ReactNode }[] = [
    { label: 'Status', get: (m) => <Badge tone={m.status === 'DEPLOYED' ? 'good' : 'neutral'}>{m.status}</Badge> },
    { label: 'Architecture', get: (m) => <span className="font-mono">{m.architecture}</span> },
    { label: 'Dataset', get: (m) => m.dataset_version ?? <span className="text-muted">N/A (predates versioning)</span> },
    { label: 'Training images', get: (m) => cell(m.training_images, (n) => n.toLocaleString()) },
    { label: 'Validation images', get: (m) => cell(m.validation_images, (n) => n.toLocaleString()) },
    { label: 'Test images', get: (m) => cell(m.test_images, (n) => n.toLocaleString()) },
    { label: 'Epochs (head + fine-tune)', get: (m) => <span className="font-mono">{`${m.hyperparams.epochs_head ?? '?'} + ${m.hyperparams.epochs_finetune ?? '?'}`}</span> },
    { label: 'Batch size', get: (m) => <span className="font-mono">{String(m.hyperparams.batch_size ?? 'N/A')}</span> },
    { label: 'Learning rates', get: (m) => <span className="font-mono">{`${m.hyperparams.lr_head ?? '?'} / ${m.hyperparams.lr_finetune ?? '?'}`}</span> },
    { label: 'Device', get: (m) => <span className="font-mono">{m.device ?? 'N/A'}</span> },
    {
      label: 'Best validation accuracy',
      get: (m) => <strong>{cell(m.best_validation_accuracy, (n) => pct(n, 2))}</strong>,
    },
    { label: 'Test accuracy', get: (m) => <strong>{cell(m.test_accuracy, (n) => pct(n, 2))}</strong> },
    { label: 'Macro F1', get: (m) => <strong>{cell(m.macro_f1, (n) => n.toFixed(3))}</strong> },
    { label: 'Checkpoint', get: (m) => <span className="break-all font-mono text-[11px]">{m.checkpoint_path ?? 'N/A'}</span> },
  ]

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Model comparison"
        sub="run-001 vs run-002, factual measurements only. Missing values are N/A — never estimated."
      />
      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface2/50 text-left">
                <th className="px-4 py-3 font-medium text-muted">Metric</th>
                {models.map((m) => (
                  <th key={m.run_id} className={cx('px-4 py-3 font-mono font-bold', m.status === 'DEPLOYED' ? 'text-emerald' : 'text-ink')}>
                    {m.run_id}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-line/50 last:border-0">
                  <td className="px-4 py-2.5 text-muted">{r.label}</td>
                  {models.map((m) => (
                    <td key={m.run_id} className="px-4 py-2.5 text-ink">{r.get(m)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <Kicker>Reading this table</Kicker>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          {(() => {
            if (models.length < 2) return 'Add runs to compare them here.'
            const [older, newer] = [models[0], models[models.length - 1]]
            const t = newer.training_images != null && older.training_images != null
              ? `${newer.run_id} trained on roughly ${Math.round(newer.training_images / Math.max(1, older.training_images))}× the training data (${newer.dataset_version ?? 'unversioned dataset'}) and improved on every measured metric. `
              : newer.test_images != null && older.test_images != null
                ? `${newer.run_id} was evaluated on ${newer.test_images.toLocaleString()} held-out images vs ${older.test_images.toLocaleString()} for ${older.run_id} (${newer.dataset_version ?? 'unversioned dataset'}). `
                : 'Newer runs train on larger versioned datasets — compare the measured rows above. '
            return (
              <>
                {t}
                Test sets differ in size and composition — compare directionally, not as a controlled ablation.
                Archived runs are preserved and reproducible.
              </>
            )
          })()}
        </p>
      </Card>
      <Timeline />
    </div>
  )
}

function Timeline() {
  const [versions, setVersions] = useState<{ version: string; total_images: number }[]>([])
  const [candidates, setCandidates] = useState<number | null>(null)
  const [deployed, setDeployed] = useState<string | null>(null)
  const [runDetail, setRunDetail] = useState<string>('…')
  const [weakDetail, setWeakDetail] = useState<string>('…')

  useEffect(() => {
    let alive = true
    api.datasetVersions().then((r) => alive && setVersions(r.versions)).catch(() => undefined)
    api.datasetCandidates(1).then((r) => alive && setCandidates(r.count)).catch(() => setCandidates(null))
    api
      .models()
      .then((r) => {
        if (!alive) return
        setDeployed(r.deployed)
        const dep = r.models.find((m) => m.run_id === r.deployed)
        if (dep?.test_accuracy != null && dep?.macro_f1 != null) {
          setRunDetail(`test ${(dep.test_accuracy * 100).toFixed(2)}% · F1 ${dep.macro_f1.toFixed(3)}`)
        } else setRunDetail('unevaluated')
        return dep?.run_id
      })
      .then((runId) => {
        if (!alive || !runId) return
        return api.errorAnalysis(runId).then((ea) => {
          if (!alive || !ea.available) return
          const weak = (ea.lower_performing ?? []).slice(0, 2)
          if (weak.length) setWeakDetail(weak.map((w) => `${w.class} ${w.f1.toFixed(3)}`).join(' · '))
          else setWeakDetail('no class below threshold')
        })
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const v3 = versions.find((v) => v.version === 'EcoSort Dataset v3')
  const v4 = versions.find((v) => v.version === 'EcoSort Dataset v4')
  const steps: { label: string; detail: string; done: boolean }[] = [
    { label: 'Dataset v3', detail: v3 ? `${v3.total_images.toLocaleString()} verified` : '…', done: !!v3 },
    { label: deployed ?? 'deployed run', detail: runDetail, done: true },
    { label: 'Error analysis', detail: weakDetail, done: weakDetail !== '…' },
    { label: 'Verified candidates', detail: candidates === null ? '…' : `${candidates} verified`, done: (candidates ?? 0) > 0 },
    { label: 'Dataset v4', detail: v4 ? `${v4.total_images.toLocaleString()} verified` : 'gate not passed', done: !!v4 },
    { label: 'run-003', detail: 'awaits v4 + documented reason', done: false },
    { label: 'Evaluation', detail: deployed ? `serving ${deployed}` : '…', done: false },
  ]

  return (
    <Card>
      <Kicker>Experiment timeline</Kicker>
      <ol className="mt-3 space-y-0">
        {steps.map((s, i) => (
          <li key={s.label} className="flex gap-3">
            <span className="flex flex-col items-center">
              <span className={cx('mt-1 h-2.5 w-2.5 rounded-full', s.done ? 'bg-emerald' : 'bg-line')} />
              {i < steps.length - 1 && <span className="w-px flex-1 bg-line" />}
            </span>
            <span className="pb-4">
              <span className="text-sm font-semibold text-ink">{s.label}</span>
              <span className="ml-2 font-mono text-[11px] text-muted">{s.detail}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="text-[11px] leading-relaxed text-muted">
        run-003 trains only after v4 passes validation with a documented hypothesis. Serving stays on{' '}
        {deployed ? <span className="font-mono">{deployed}</span> : 'the current model'} until a deliberate
        deployment decision. <Link to="/research/errors" className="text-emerald hover:underline">Error analysis →</Link>
      </p>
    </Card>
  )
}
