/** Typed client for the EcoSort FastAPI backend. */

export type ConfidenceState = 'high' | 'moderate' | 'low'

export interface Top5Entry {
  class: string
  display: string
  probability: number
  index: number
}

export interface Centroid {
  x_norm: number
  y_norm: number
  x_px: number
  y_px: number
  concentration: number
  source: string
}

export interface Guidance {
  stream: string
  recyclable: boolean
  hazard: string
  action: string
  prep: string[]
  why: string
  confusion: string[]
  note: string
}

export interface PredictionResult {
  scan_id: string | null
  /** Client-only: object URL of the scanned image, attached in the browser for the "original" view. */
  __sourceUrl?: string
  /** Present when the payload was recomputed from a stored scan rather than a fresh upload. */
  reanalysis?: {
    is_reanalysis: boolean
    original_created_at: string
    original_confidence: number
    original_predicted_class: string
    original_latency: Record<string, number> | null
    note: string
  }
  stored_feedback?: { was_correct: number | null; corrected_class: string | null }
  prediction: {
    class: string
    display: string
    confidence: number
    confidence_pct: number
    state: ConfidenceState
    state_reason: string
    margin: number
    entropy: number
    normalized_entropy: number
    threshold: number
    top5: Top5Entry[]
  }
  explainability: {
    method: string
    target_layer: string
    heatmap_png_b64: string
    overlay_png_b64: string
    cam_size: [number, number]
    activation_centroid: Centroid
    opacity: number
  }
  guidance: Guidance
  sorting: {
    target_bin: string
    bin_label: string
    action: string
    reason: string
    centroid: Centroid
  }
  input_quality: {
    score: number
    label: string
    brightness: number
    sharpness: number
    resolution: { width: number; height: number }
    issues: string[]
  }
  uncertainty_tips: string[]
  timings_ms: Record<string, number>
  model: {
    version: string
    architecture: string
    input_size: number
    device: string
    num_classes: number
    checkpoint: string | null
  }
}

export interface Scan {
  id: string
  created_at: string
  source: string
  image_path: string | null
  predicted_class: string
  confidence: number
  state: ConfidenceState
  action: string
  target_bin: string | null
  top5: Top5Entry[]
  latency: Record<string, number> | null
  quality: PredictionResult['input_quality'] | null
  centroid: Centroid | null
  model_version: string | null
  was_correct: number | null
  corrected_class: string | null
}

export interface EpochRecord {
  epoch: number
  phase: string
  train_loss: number
  train_acc: number
  val_loss: number
  val_acc: number
  lr: number
  seconds: number
}

export interface RunMetrics {
  run_id: string
  status: string
  phase: string
  epoch: number
  total_epochs: number
  step?: number
  steps_per_epoch?: number
  train_loss?: number
  train_acc?: number
  val_loss?: number
  val_acc?: number
  best_val_acc: number
  lr?: number
  progress: number
  eta_seconds?: number
  started_at?: string
  updated_at?: string
  device?: string
  params?: { total: number; trainable: number; frozen: number }
  run?: {
    image_size?: number
    architecture?: string
    pretrained?: string
    dataset_variant?: string
    dataset_dir?: string
    num_classes?: number
    classes?: string[]
    train_samples?: number
    val_samples?: number
  }
  history: EpochRecord[]
}

export interface PerClassMetric {
  precision: number
  recall: number
  f1: number
  support: number
  predicted_as: number
}

export interface Evaluation {
  generated_at: string
  checkpoint: string
  run_id: string
  weights: string
  architecture: string
  split: string
  num_samples: number
  num_classes: number
  classes: string[]
  training_best_val_acc: number | null
  metrics: {
    accuracy: number
    precision_macro: number
    recall_macro: number
    f1_macro: number
    precision_weighted: number
    recall_weighted: number
    f1_weighted: number
    per_class: Record<string, PerClassMetric>
  }
  confusion_matrix: number[][]
  confusion_pairs_top: { true_class: string; predicted_class: string; count: number }[]
  misclassified_examples: Record<string, MisclassifiedExample[]>
  confidence_distribution: {
    mean: number | null
    median: number | null
    below_threshold: number
    threshold: number
  }
  selective_accuracy: { threshold: number; coverage: number; accuracy: number | null; samples: number }[]
}

export interface MisclassifiedExample {
  path: string
  true_class: string
  predicted_class: string
  confidence: number
  true_confidence: number
  url?: string
}

export interface DatasetInfo {
  dataset_dir: string
  variant: string
  image_size: number
  seed: number
  split_ratios: number[]
  classes: string[]
  num_classes: number
  total_files_scanned: number
  total_unique: number
  duplicates_removed: number
  corrupt_unreadable: number
  split_sizes: { train: number; val: number; test: number }
  per_class: Record<string, { unique: number; train: number; val: number; test: number }>
  gallery: Record<string, string[]>
  health: Record<string, { value: unknown; detail?: string; ok: boolean }>
}

export interface RobotStatus {
  state: string
  mode: string
  emergency_stop: boolean
  uptime_seconds: number
  current_object: RobotDecision | null
  telemetry: {
    objects_processed: number
    sorted: number
    held_for_review: number
    rejected: number
    errors: number
    avg_inference_ms: number | null
    sort_rate: number | null
  }
  recent: RobotDecision[]
  bin_map: Record<string, string>
  bins: string[]
  confidence_threshold: number
  health: Record<string, { status: string; mode?: string }>
}

export interface RobotDecision {
  timestamp: number
  source: string
  class: string
  display: string
  confidence: number
  confidence_state: ConfidenceState
  decision: string
  reason: string
  target_bin: string | null
  bin_label: string | null
  centroid: Centroid
  latency_ms: number | null
  quality: string
}

export interface SimStep {
  decision: RobotDecision
  robot_state: string
  scan_id: string | null
  source_image: string
  prediction: PredictionResult['prediction']
  overlay_png_b64: string
  centroid: Centroid
  timings_ms: Record<string, number>
  telemetry: RobotStatus['telemetry']
}

export interface Health {
  api: string
  model_loaded: boolean
  model_version: string | null
  checkpoint: string | null
  device: string
  cuda_available: boolean
  dataset_prepared: boolean
  dataset_stats: DatasetInfo | null
  training_active: boolean
  training_pid: number | null
  database: string
  server_time: number
}

export interface ClassInfo {
  id: string
  display: string
  index: number
  bin: string
  bin_label: string
  guide: Guidance
}

export interface Correction {
  id: string
  scan_id: string | null
  created_at: string
  predicted_class: string
  correct_class: string
  source: string
  verified: number
}

export interface Activity {
  scans: number
  corrections: number
  low_confidence: number
  average_confidence: number | null
  by_class: Record<string, number>
  by_bin: Record<string, number>
  by_day: Record<string, number>
  most_scanned: string | null
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export const api = {
  health: () => req<Health>('/api/health'),
  modelStatus: () => req<Record<string, unknown>>('/api/model/status'),
  reloadModel: (runId?: string, weights = 'best.pt') =>
    req<{ loaded: boolean; version: string }>(
      `/api/model/reload?weights=${weights}${runId ? `&run_id=${runId}` : ''}`,
      { method: 'POST' },
    ),

  predict: (file: File | Blob, source = 'upload') => {
    const fd = new FormData()
    fd.append('file', file, source === 'camera' ? 'capture.jpg' : 'upload.jpg')
    fd.append('source', source)
    return req<PredictionResult>('/api/predict', { method: 'POST', body: fd })
  },

  scans: (limit = 100, cls?: string, state?: string) => {
    const p = new URLSearchParams({ limit: String(limit) })
    if (cls) p.set('cls', cls)
    if (state) p.set('state', state)
    return req<{ count: number; scans: Scan[]; classes: string[] }>(`/api/scans?${p}`)
  },
  scan: (id: string) => req<Scan>(`/api/scans/${id}`),
  scanExplain: (id: string) => req<PredictionResult>(`/api/scans/${id}/explain`),
  feedback: (id: string, correct: boolean, correctClass?: string, source = 'user') =>
    req<{ correction_id: string; verified_class: string; was_correct: boolean }>(
      `/api/scans/${id}/feedback`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correct, correct_class: correctClass ?? null, source }),
      },
    ),
  corrections: (limit = 100) =>
    req<{ count: number; corrections: Correction[] }>(`/api/corrections?limit=${limit}`),
  reviewQueue: (limit = 50) => req<{ count: number; items: Scan[] }>(`/api/review-queue?limit=${limit}`),
  activity: () => req<Activity>('/api/activity'),

  dataset: () => req<DatasetInfo>('/api/dataset'),
  classes: () => req<{ classes: ClassInfo[] }>('/api/classes'),

  trainingStatus: () =>
    req<{
      active: boolean
      pid: number | null
      runs: { run_id: string; metrics: RunMetrics | null; checkpoints: string[] }[]
      latest: { run_id: string; metrics: RunMetrics | null } | null
    }>('/api/training/status'),
  trainingRun: (id: string) => req<RunMetrics>(`/api/training/runs/${id}`),
  startTraining: (body: Record<string, unknown>) =>
    req<{ started: boolean; run_id: string; pid: number }>('/api/training/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  metrics: () => req<{ available: boolean; note?: string; evaluation?: Evaluation }>('/api/metrics'),
  misclassified: (trueClass: string, predClass: string) =>
    req<{ count: number; examples: MisclassifiedExample[] }>(
      `/api/metrics/misclassified?true_class=${trueClass}&predicted_class=${predClass}`,
    ),

  robotStatus: () => req<RobotStatus>('/api/robot/status'),
  robotEstop: (engage: boolean) =>
    req<RobotStatus>('/api/robot/emergency-stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engage }),
    }),
  robotReset: () => req<RobotStatus>('/api/robot/reset', { method: 'POST' }),
  robotSimStep: () => req<SimStep>('/api/robot/simulate/step', { method: 'POST' }),
  robotEvents: (limit = 50) => req<{ count: number; events: unknown[] }>(`/api/robot/events?limit=${limit}`),
  robotCompatibility: () =>
    req<{ model_version: string | null; checks: Record<string, boolean>; ready_for_deployment: boolean; blocking: string[] }>(
      '/api/robot/compatibility',
    ),
  robotBinMap: (mapping: Record<string, string>) =>
    req<{ bin_map: Record<string, string> }>('/api/robot/bin-map', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapping }),
    }),
}

export const b64url = (b64: string) => `data:image/png;base64,${b64}`
