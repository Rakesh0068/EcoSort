# EcoSort API

Interactive docs at `/docs` when the server runs. All responses below return
measured/stored values; simulation responses carry `simulation: true`.

Errors use the FastAPI schema `{"detail": "..."}` with appropriate HTTP status
codes (400 validation, 404 missing, 409 state conflict, 413 oversize, 422
semantic errors, 503 unavailable). No stack traces are exposed.

## System

- `GET /api/health` — model_loaded, model_version, dataset_version,
  database_status, robot_mode, training state.
- `GET /api/model/status`, `POST /api/model/reload?run_id=&weights=`

## Prediction & feedback

- `POST /api/predict` (multipart `file`, `source`, `save`) → prediction +
  confidence state + guidance + Grad-CAM + timings + model/run/dataset ids.
- `GET /api/scans{,/{id}}`, `GET /api/scans/{id}/explain`,
  `GET /api/scans/{id}/image`, `POST /api/scans/{id}/feedback`
  (`{correct, correct_class, source}`).
- `GET /api/predictions?model=&cls=&min_conf=&max_conf=&date_from=&date_to=&feedback=`
- `GET /api/analytics` — totals, by class/model, avg confidence, feedback
  rate, measured latency.

## Models & evaluation

- `GET /api/models` (registry + deployed id), `GET /api/models/compare?ids=`,
  `GET /api/models/error-analysis?run_id=`
- `POST /api/models/deploy` (explicit pin), `GET /api/models/deployment`
- `GET /api/metrics` (latest evaluation), `GET /api/metrics/misclassified`

## Active learning & dataset growth

- `GET /api/review-queue`, `GET /api/corrections`
- `GET /api/active-learning/queue` (priority + reasons per item),
  `GET /api/active-learning/stats` (pending/verified/rejected/uncertain)
- `POST /api/active-learning/review` (`{scan_id, action: accept|correct|reject|uncertain, correct_class?}`)
- `GET /api/dataset/candidates` (verified labels for a future version; the
  frozen test set is never modified by feedback)
- `GET /api/acquisition/targets`, `PUT /api/acquisition/targets` (configurable v4 goals)
- `GET /api/dataset{,/sources,/versions,/health,/targets}`

## Training

- `GET /api/training/status`, `GET /api/training/runs/{id}`,
  `POST /api/training/start` (CUDA required; refuses CPU-only runs)

## Robot (simulation — no hardware attached)

- `GET /api/robot/status`, `GET /api/robot/compatibility`,
  `GET /api/robot/capabilities`, `GET /api/robot/config`
- `POST /api/robot/predict` (perception only), `POST /api/robot/sort`
  (gated decision, `actuated: false`)
- `POST /api/robot/simulate/step`, `POST /api/robot/stop`,
  `POST /api/robot/emergency-stop`, `POST /api/robot/reset`,
  `POST /api/robot/pause`, `POST /api/robot/feedback`
- `GET /api/robot/events`, `GET /api/robot/adapter`
- `PUT /api/robot/bin-map`, `PUT /api/robot/config`

## Reference data

- `GET /api/classes` (taxonomy + recycling guide + bin map)
- `GET /api/system/camera?index=` (probe result, honest offline when absent)
