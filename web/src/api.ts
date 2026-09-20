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
    run_id?: string | null
    architecture: string
    input_size: number
    device: string
    num_classes: number
    checkpoint: string | null
    dataset_version?: string | null
    dataset_verified_images?: number | null
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

export interface Goal100KClass {
  have: number
  target: number
  gap: number
  pct_of_dataset: number
  pct_of_target: number
  display: string
  train: number
  val: number
  test: number
}

export interface Goal100K {
  target: number
  verified: number
  remaining: number
  reached: boolean
  progress_frac: number
  train: number
  val: number
  test: number
  per_class: Record<string, Goal100KClass>
  strongest_classes: string[]
  underrepresented_classes: string[]
  missing_classes: string[]
}

export interface DatasetSource {
  name: string
  source?: string
  url?: string
  license: string
  import_date?: string
  original_image_count?: number
  imported_image_count?: number
  mapped_classes?: string[]
  per_class?: Record<string, number>
  note?: string
}

export interface DatasetVersion {
  version: string
  created_at?: string
  total_images: number
  class_distribution?: Record<string, number>
  sources?: (string | { name?: string })[]
  duplicates_removed?: number
  split?: Record<string, number>
  note?: string
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
  near_duplicates_removed?: number
  corrupt_unreadable: number
  low_quality_removed?: number
  unmapped_skipped?: number
  split_sizes: { train: number; val: number; test: number }
  per_class: Record<string, { unique: number; train: number; val: number; test: number }>
  gallery: Record<string, string[]>
  health: Record<string, { value: unknown; detail?: string; ok: boolean }>
  goal_100k?: Goal100K
  robot_ready?: { tagged_images: number; per_class: Record<string, number>; note: string }
}

export interface RobotStatus {
  state: string
  mode: string
  interface: string
  hardware_connected: boolean
  paused: boolean
  emergency_stop: boolean
  uptime_seconds: number
  current_object: RobotDecision | null
  telemetry: {
    objects_processed: number
    sorted: number
    held_for_review: number
    rejected: number
    errors: number
    inference_ms_sum: number
    inference_count: number
    avg_inference_ms: number | null
    sort_rate: number | null
  }
  recent: RobotDecision[]
  bin_map: Record<string, string>
  bins: string[]
  confidence_threshold: number
  margin_threshold: number
  health: Record<string, { status: string; mode?: string; detail?: string }>
}

export interface Capability {
  supported: boolean
  detail?: string
  method?: string
  model?: string
  mode?: string
  threshold?: number
  margin_threshold?: number
}

export interface RobotConfig {
  confidence_threshold: number
  margin_threshold: number
  bin_map: Record<string, string>
  bin_labels: Record<string, string>
  states: string[]
  simulated_motion_phases: string[]
  capabilities: Record<string, Capability>
}

export interface RobotEvent {
  id: string
  created_at: string
  kind: string
  state: string | null
  cls: string | null
  confidence: number | null
  target_bin: string | null
  detail: Record<string, unknown> | string | null
}

export interface CameraProbe {
  status: 'online' | 'offline' | 'unknown'
  device_index: number
  resolution?: [number, number]
  probe_ms?: number
  probed_at?: number
  detail?: string
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
  motion_phases: string[]
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
  dataset_version?: string | null
  dataset_stats: DatasetInfo | null
  training_active: boolean
  training_pid: number | null
  database: string
  database_status?: string
  robot_mode?: string
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
  status?: string
}

export interface ModelEntry {
  model_id: string
  run_id: string
  architecture: string
  dataset_version: string | null
  training_images: number | null
  validation_images: number | null
  test_images: number | null
  training_epochs: number | null
  epochs_completed: number | null
  best_validation_accuracy: number | null
  test_accuracy: number | null
  macro_f1: number | null
  test_precision_macro: number | null
  test_recall_macro: number | null
  checkpoint_path: string | null
  checkpoint_weights: string | null
  evaluation_file: string | null
  hyperparams: Record<string, unknown>
  augmentation: unknown
  device: string | null
  training_status: string | null
  created_at: string | null
  status: 'DEPLOYED' | 'APPROVED' | 'CANDIDATE' | 'EVALUATED' | 'EXPERIMENT' | 'ARCHIVED'
}

export interface ErrorAnalysis {
  run_id: string
  available: boolean
  note?: string
  evaluation_file?: string | null
  num_samples?: number
  per_class?: { class: string; precision: number; recall: number; f1: number; support: number }[]
  lower_performing?: { class: string; precision: number; recall: number; f1: number; support: number }[]
  confusion_pairs_top?: { true_class: string; predicted_class: string; count: number }[]
  confusion_matrix?: number[][]
  classes?: string[]
}

export interface ALQueueItem extends Scan {
  priority: number
  reasons: string[]
}

export interface DatasetCandidate {
  id: string
  scan_id: string | null
  created_at: string
  predicted_class: string
  correct_class: string
  source: string
  status: string
  image_path: string | null
  confidence: number | null
  model_version: string | null
}

export interface Analytics {
  total_predictions: number
  by_class: Record<string, number>
  by_model: Record<string, number>
  average_confidence: number | null
  low_confidence: number
  moderate_confidence: number
  corrected_predictions: number
  feedback_rate: number | null
  avg_inference_ms: number | null
  latency_samples: number
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

/** API origin for split deployments. Same-origin by default; set
 *  VITE_API_URL to point at the external ML API. Node-safe (no build-time
 *  env required) so the logic stays unit-testable. */
export function apiBase(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  return (env?.VITE_API_URL ?? '').replace(/\/$/, '')
}

/** Human message per HTTP status. Server-provided details win when present. */
export function friendlyHttpError(status: number, serverDetail?: unknown): string {
  if (typeof serverDetail === 'string' && serverDetail) return serverDetail
  switch (status) {
    case 400:
      return 'That image could not be read. Please try a different photo.'
    case 404:
      return 'EcoSort could not find what you asked for.'
    case 409:
      return 'EcoSort is busy with another task. Please try again in a moment.'
    case 413:
      return 'That photo is too large. Try a smaller image or let EcoSort shrink it first.'
    case 415:
      return 'That file type is not supported. Please use a photo instead.'
    case 422:
      return 'Something about that request was incomplete. Please try again.'
    case 429:
      return 'Too many requests. Please wait a moment and try again.'
    case 500:
      return 'EcoSort hit a problem on our side. Please try again.'
    case 503:
      return 'EcoSort is starting up or unavailable right now. Please try again shortly.'
    default:
      return `Request failed (${status}) — please try again.`
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const base = apiBase()
  let res: Response
  try {
    res = await fetch(`${base}${path}`, init)
  } catch {
    // Network-level failure (API down, DNS, offline): never leak raw errors.
    throw new Error('Could not reach the EcoSort service. Check your connection and try again.')
  }
  if (!res.ok) {
    let serverDetail: unknown
    try {
      const body = await res.json()
      serverDetail = body?.detail
    } catch {
      /* non-JSON error body: fall back to the status message */
    }
    throw new Error(friendlyHttpError(res.status, serverDetail))
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

  predict: async (file: File | Blob, source = 'upload') => {
    const fd = new FormData()
    fd.append('file', await prepareUpload(file), source === 'camera' ? 'capture.jpg' : 'upload.jpg')
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
  datasetSources: () =>
    req<{ count: number; sources: DatasetSource[]; note: string }>('/api/dataset/sources'),
  datasetVersions: () =>
    req<{ count: number; versions: DatasetVersion[]; current_verified: number; target: number }>(
      '/api/dataset/versions',
    ),
  datasetHealth: () =>
    req<{ report: Record<string, unknown>; target: number }>('/api/dataset/health'),
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

  models: () => req<{ count: number; models: ModelEntry[]; deployed: string | null }>('/api/models'),
  modelsCompare: (ids: string[]) =>
    req<{ models: ModelEntry[]; note: string }>(`/api/models/compare?ids=${ids.join(',')}`),
  modelsDeploy: (runId: string, weights = 'best.pt', note = '') =>
    req<{ pinned: Record<string, unknown>; active_after_reload: boolean; note: string }>(
      '/api/models/deploy',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId, weights, note }),
      },
    ),
  modelsDeployment: () =>
    req<{ pin: Record<string, unknown> | null; served_checkpoint: string | null }>(
      '/api/models/deployment',
    ),
  errorAnalysis: (runId: string) => req<ErrorAnalysis>(`/api/models/error-analysis?run_id=${runId}`),

  predictions: (filters?: Record<string, string | number>) => {
    const p = new URLSearchParams({ limit: String(filters?.limit ?? 200) })
    for (const k of ['model', 'cls', 'min_conf', 'max_conf', 'date_from', 'date_to', 'feedback']) {
      const v = filters?.[k]
      if (v !== undefined && v !== '') p.set(k, String(v))
    }
    return req<{ count: number; predictions: Scan[] }>(`/api/predictions?${p}`)
  },
  analytics: () => req<Analytics>('/api/analytics'),

  alQueue: (limit = 100) =>
    req<{ count: number; items: ALQueueItem[]; note: string }>(`/api/active-learning/queue?limit=${limit}`),
  alStats: () =>
    req<{ pending: number; verified: number; rejected: number; uncertain: number }>(
      '/api/active-learning/stats',
    ),
  alReview: (scanId: string, action: 'accept' | 'correct' | 'reject' | 'uncertain', correctClass?: string) =>
    req<{ correction_id: string; scan_id: string; candidate?: boolean; status?: string }>(
      '/api/active-learning/review',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scan_id: scanId, action, correct_class: correctClass ?? null }),
      },
    ),
  datasetCandidates: (limit = 200) =>
    req<{ count: number; candidates: DatasetCandidate[]; note: string }>(
      `/api/dataset/candidates?limit=${limit}`,
    ),
  acquisitionTargets: () =>
    req<{
      per_class: Record<string, { display: string; verified: number; target: number; remaining: number }>
      note: string
    }>('/api/acquisition/targets'),
  acquisitionTargetsPut: (targets: Record<string, number>) =>
    req<{ targets: Record<string, number> }>('/api/acquisition/targets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targets }),
    }),

  robotStatus: () => req<RobotStatus>('/api/robot/status'),
  robotEstop: (engage: boolean) =>
    req<RobotStatus>('/api/robot/emergency-stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engage }),
    }),
  robotReset: () => req<RobotStatus>('/api/robot/reset', { method: 'POST' }),
  robotPause: (paused: boolean) =>
    req<RobotStatus>('/api/robot/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused }),
    }),
  robotSimStep: () => req<SimStep>('/api/robot/simulate/step', { method: 'POST' }),
  robotEvents: (limit = 50) => req<{ count: number; events: RobotEvent[] }>(`/api/robot/events?limit=${limit}`),
  robotConfig: () => req<RobotConfig>('/api/robot/config'),
  robotConfigPut: (body: { confidence_threshold?: number; margin_threshold?: number }) =>
    req<{ confidence_threshold: number; margin_threshold: number }>('/api/robot/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  robotSort: (file: File | Blob) => {
    const fd = new FormData()
    fd.append('file', file, 'robot-sort.jpg')
    return req<{
      command: {
        action: string
        target_bin: string | null
        bin_label: string | null
        class: string
        confidence: number
        centroid: Centroid
        reason: string
        issued_at: number
        actuated: boolean
        note: string
      }
      robot_state: string
      prediction: PredictionResult['prediction']
      image_url: string
      telemetry: RobotStatus['telemetry']
    }>('/api/robot/sort', { method: 'POST', body: fd })
  },
  systemCamera: (index = 0) => req<CameraProbe>(`/api/system/camera?index=${index}`),
  robotCompatibility: () =>
    req<{
      model_version: string | null
      checks: Record<string, boolean>
      ready_for_deployment: boolean
      blocking: string[]
      hardware_connected: boolean
      interface: string
      note: string
    }>('/api/robot/compatibility'),
  robotBinMap: (mapping: Record<string, string>) =>
    req<{ bin_map: Record<string, string> }>('/api/robot/bin-map', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapping }),
    }),
  robotPredict: (file: File | Blob) => {
    const fd = new FormData()
    fd.append('file', file, 'robot-predict.jpg')
    return req<{
      simulation: boolean
      prediction: PredictionResult['prediction']
      centroid: Centroid
      timings_ms: Record<string, number>
      model_version: string
      note: string
    }>('/api/robot/predict', { method: 'POST', body: fd })
  },
  robotStop: () =>
    req<{ simulation: boolean; stopped: boolean; state: string }>('/api/robot/stop', { method: 'POST' }),
  robotFeedback: (scanId: string | null, correct: boolean, correctClass?: string) =>
    req<{ simulation: boolean; stored: boolean; note?: string; correction_id?: string; verified_class?: string }>(
      '/api/robot/feedback',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scan_id: scanId, correct, correct_class: correctClass ?? null }),
      },
    ),
  robotAdapter: () =>
    req<{ adapter: string; simulation: boolean; status: RobotStatus; note: string }>('/api/robot/adapter'),
}

export const b64url = (b64: string) => `data:image/png;base64,${b64}`

/** Prefix for same-origin API asset paths when the API lives elsewhere. */
export function assetUrl(path: string | null | undefined): string {
  if (!path) return ''
  if (/^(data:|https?:\/\/)/.test(path)) return path
  return `${apiBase()}${path}`
}

/**
 * Shrink large uploads client-side so normal phone photos survive hosting
 * payload caps (and upload faster). Images already small enough pass through
 * untouched. Returns the original blob when shrinking is impossible.
 */
export async function prepareUpload(file: File | Blob): Promise<File | Blob> {
  const MAX_SIDE = 1600
  const MAX_BYTES = 4 * 1024 * 1024
  try {
    if (file.size <= MAX_BYTES && file.type !== 'image/heic' && file.type !== 'image/heif') {
      // Still need dimensions: decode cheaply to check the long edge.
      const probe = await createImageBitmap(file).catch(() => null)
      if (!probe) return file
      const longEdge = Math.max(probe.width, probe.height)
      probe.close()
      if (longEdge <= MAX_SIDE) return file
    }
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const shrunk: Blob | null = await new Promise((res) =>
      canvas.toBlob(res, 'image/jpeg', 0.85),
    )
    return shrunk ?? file
  } catch {
    return file
  }
}
