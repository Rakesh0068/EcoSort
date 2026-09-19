# EcoSort — AI Waste Intelligence

EcoSort is a robot-ready waste classification system: a real PyTorch EfficientNet-B0 model
classifies waste images into 10 categories, explains every decision with Grad-CAM, and drives a
simulated sorting robot — wrapped in a FastAPI backend and a React dashboard.

Everything in the pipeline is real: real training on CUDA, real test-set evaluation, real
Grad-CAM overlays, real SQLite persistence, and a real human-feedback loop that queues
low-confidence scans for review and feeds verified labels into retraining.

## Model

| | |
|---|---|
| Architecture | EfficientNet-B0, ImageNet-pretrained (head training → full fine-tune) |
| Input | 224 × 224 RGB, ImageNet normalization |
| Classes | battery · biological · cardboard · clothes · glass · metal · paper · plastic · shoes · trash |
| Reference run | `run-001` — 96.2% validation accuracy on 12,259 images |
| Hardware | trained on CUDA (RTX 3050 6 GB); inference runs on CPU or GPU |

## Features

- **Scan** — upload an image (or use the robot simulation) and get a prediction with
  confidence state (high / moderate / low), top-5 probabilities, input-quality checks and a
  Grad-CAM overlay with activation centroid.
- **Sorting decisions** — class → bin routing with a configurable bin map; low-confidence or
  poor-quality inputs are held for review instead of being sorted.
- **History & feedback** — every scan is persisted in SQLite; users mark predictions
  correct/wrong, wrong scans join the review queue and become retraining candidates.
- **Training center** — launch and monitor real `python -m ml.train` subprocess runs from the
  browser, with live epoch curves, ETA and resumable checkpoints.
- **Evaluation** — test-set audit with per-class precision/recall/F1, interactive confusion
  matrix, most-frequent confusion pairs with example galleries, and selective accuracy
  (accuracy vs. coverage when the model abstains below a confidence threshold).
- **Waste guide** — recycling guide per class: stream, bin, preparation steps, hazards and the
  look-alike pairs that dominate the confusion matrix.

## Project structure

```
api/            FastAPI app (main.py), SQLite layer (db.py), robot/simulation engine (robot.py)
ml/             PyTorch pipeline: config, data prep, training, evaluation, inference + Grad-CAM,
                recycling guide
web/            React 18 + Vite + Tailwind dashboard (TypeScript)
artifacts/      Runtime outputs (gitignored): checkpoints, metrics, split manifests, uploads,
                ecosort.db
```

## Getting started

### 1. Backend

Python 3.10+ recommended. For GPU training install PyTorch with the CUDA wheels first:

```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt
```

Point `DATASET_ROOT` in `ml/config.py` at an image dataset laid out as
`<root>/<variant>/<class>/<image>.jpg` (any [TrashNet](https://github.com/garythung/trashnet)-style
folder-per-class dataset works; the classes above are discovered from the directory).

Prepare the dataset split, then train and evaluate:

```bash
python -m ml.data                                      # dedupe + stratified splits -> artifacts/splits/
python -m ml.train --epochs-head 5 --epochs-finetune 15 --batch-size 32
python -m ml.evaluate --checkpoint artifacts/runs/run-001/best.pt
```

Run the API (it serves the built frontend and the model in one process):

```bash
uvicorn api.main:app --host 127.0.0.1 --port 8000
```

### 2. Frontend

```bash
cd web
npm install
npm run dev        # dev server on :5173, proxied to the API on :8000
# or
npm run build      # outputs web/dist, served by the API at http://127.0.0.1:8000/
```

## API overview

Full interactive docs at `/docs` once the server is running. Main groups:

- `GET /api/health`, `GET /api/model/status`, `POST /api/model/reload`
- `POST /api/predict` — multipart image upload → full prediction payload
- `GET /api/scans`, `GET /api/scans/{id}`, `GET /api/scans/{id}/explain`,
  `POST /api/scans/{id}/feedback`
- `GET /api/review-queue`, `GET /api/corrections`, `GET /api/activity`
- `GET /api/dataset`, `GET /api/classes`
- `GET /api/training/status`, `POST /api/training/start`
- `GET /api/metrics`, `GET /api/metrics/misclassified`
- `GET /api/robot/status`, `POST /api/robot/simulate/step`,
  `POST /api/robot/emergency-stop`, `POST /api/robot/reset`, `PUT /api/robot/bin-map`,
  `GET /api/robot/events`, `GET /api/robot/compatibility`

## Notes

- Training via the API requires CUDA; the API refuses to start CPU-only runs. Checkpoint
  artifacts, metrics, uploads and the database are gitignored.
- `artifacts/runs/run-001/` ships `metrics.json` with the full per-epoch history of the
  reference run; evaluation JSON lives in `artifacts/metrics/`.
