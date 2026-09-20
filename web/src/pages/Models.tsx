import { useEffect, useState } from 'react'
import { api, type ModelEntry } from '../api'
import { Badge, Card, Empty, ErrorState, Loading, MetricRow, SectionTitle, cx, pct } from '../components/ui'

const STATUS_TONE: Record<string, 'good' | 'warn' | 'bad' | 'info' | 'neutral'> = {
  DEPLOYED: 'good',
  APPROVED: 'info',
  CANDIDATE: 'info',
  EVALUATED: 'neutral',
  EXPERIMENT: 'warn',
  ARCHIVED: 'neutral',
}

function val(v: number | null | undefined, fmt: (n: number) => string = (n) => String(n)) {
  return v === null || v === undefined ? 'N/A' : fmt(v)
}

export default function Models() {
  const [models, setModels] = useState<ModelEntry[] | null>(null)
  const [deployed, setDeployed] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api
      .models()
      .then((r) => alive && (setModels(r.models), setDeployed(r.deployed)))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'models unavailable'))
    return () => {
      alive = false
    }
  }, [])

  if (error) return <ErrorState message={error} />
  if (!models) return <Loading label="Loading model registry" />

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Models"
        sub="Every trained checkpoint, built from the run directories and evaluation files. DEPLOYED means the API is actually serving it."
      />

      {models.length === 0 && <Empty title="No trained models yet" hint="Train a run first — it will appear here automatically." />}

      <div className="space-y-4">
        {models.map((m) => (
          <Card key={m.run_id} className={cx(m.status === 'DEPLOYED' && 'border-emerald/40')}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-mono text-lg font-bold text-ink">EcoSort {m.run_id}</h3>
              <Badge tone={STATUS_TONE[m.status] ?? 'neutral'}>{m.status}</Badge>
              {deployed === m.run_id && <Badge tone="good">serving now</Badge>}
              <span className="ml-auto font-mono text-[11px] text-muted">{m.architecture}</span>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <MetricRow label="Dataset" value={m.dataset_version ?? 'N/A'} />
                <MetricRow label="Training images" value={val(m.training_images, (n) => n.toLocaleString())} />
                <MetricRow label="Validation images" value={val(m.validation_images, (n) => n.toLocaleString())} />
                <MetricRow label="Test images" value={val(m.test_images, (n) => n.toLocaleString())} />
                <MetricRow
                  label="Epochs"
                  value={m.epochs_completed != null && m.training_epochs != null ? `${m.epochs_completed}/${m.training_epochs}` : 'N/A'}
                />
                <MetricRow label="Checkpoint" value={<span className="break-all">{m.checkpoint_path?.split(/[/\\]/).slice(-2).join('/') ?? 'N/A'}</span>} />
              </div>
              <div>
                <MetricRow label="Best validation accuracy" value={val(m.best_validation_accuracy, (n) => pct(n, 2))} />
                <MetricRow label="Test accuracy" value={val(m.test_accuracy, (n) => pct(n, 2))} />
                <MetricRow label="Macro F1" value={val(m.macro_f1, (n) => n.toFixed(3))} />
                <MetricRow label="Evaluation file" value={m.evaluation_file ?? 'N/A'} />
                <MetricRow
                  label="Hyperparams"
                  value={
                    <span>
                      bs {String(m.hyperparams.batch_size ?? 'N/A')} · lr {String(m.hyperparams.lr_head ?? '?')}/{String(m.hyperparams.lr_finetune ?? '?')}
                    </span>
                  }
                />
                <MetricRow label="Created" value={m.created_at ? new Date(m.created_at).toLocaleString() : 'N/A'} />
              </div>
            </div>

            {m.status === 'EXPERIMENT' && (
              <p className="mt-3 text-[11px] text-muted">
                No evaluation file for this run — test metrics are N/A until it is evaluated. It is never promoted on guesses.
              </p>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
