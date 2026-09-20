# EcoSort Deployment

## Architecture (measured, not assumed)

```
INTERNET
   |
   v
+-------------------+
|      VERCEL       |
| EcoSort Frontend  |
| React + Vite      |
+---------+---------+
          | HTTPS API (VITE_API_URL)
          v
+-------------------+
| PYTHON ML API     |  FastAPI/Uvicorn, PyTorch, EfficientNet-B0 run-002
+---------+---------+
          |              |
          v              v
Model Registry      Persistent Storage
run-002 pinned      SQLite / feedback / uploads (persistent disk required)
```

| Layer | Stack | Deploy target |
|---|---|---|
| Frontend | Vite + React 18 + Tailwind (static SPA, ~700 KB JS) | **Vercel** (compatible) |
| API | FastAPI + SQLAlchemy-less SQLite + local filesystem | GPU host / VM (see below) |
| ML inference | PyTorch (4.58 GB installed) + 16 MB EfficientNet-B0 checkpoint, CUDA | **Cannot run on Vercel** |

Vercel serverless functions enforce strict code-size limits (250 MB
unzipped); the installed torch package alone measures 4.58 GB, inference
benefits from CUDA, the API reads a 25 K-image dataset from local disk,
persists to a file SQLite database and accepts 12 MB uploads. None of that
fits ephemeral serverless functions. Per project rules this incompatibility
is documented, not faked: **frontend on Vercel, ML inference on an
appropriate external/server backend**, connected over HTTPS.

## Frontend → Vercel

1. Connect the repo to Vercel, Production branch `main`, Root Directory repo
   root (`vercel.json`: build `cd web && npm ci && npm run build`, output
   `web/dist`, SPA rewrites to `/index.html`).
2. Set `VITE_API_URL=https://<permanent-api-host>` (public value, not a secret).
3. Deploy. Rollback = Vercel dashboard → previous deployment → Promote.

Verified locally: `tsc + vite` green; bundle contains no localhost/tunnel
URLs; SPA deep links (`/`, `/scan`) load; client downscales phone photos
before upload and maps every API error status to a human message
(`tests/frontend_api.test.mjs`, 14 passing).

## API host (operator-run)

```bash
pip install -r requirements-prod.txt   # CPU torch variant pins included
uvicorn api.main:app --host 0.0.0.0 --port $PORT   # real module path
```

- Env actually read by the code: `FRONTEND_ORIGINS` (preferred) or
  `ALLOWED_ORIGINS` (comma-separated; `*` local-testing only),
  `MAX_UPLOAD_MB` (default 12; 4 where payload caps apply),
  `ECOSORT_DATASET_ROOT` (defaults to the dev path in `ml/config.py`),
  `PORT` (uvicorn flag convention), `VITE_API_URL` (frontend build only).
- The API serves `web/dist` itself when present, so single-host deployment
  also works without Vercel.
- GPU (RTX 3050 6 GB here) used for training; inference runs CPU or GPU and
  reports the executing device per request (CPU verified: 686 MB peak,
  ~450 ms warm — see `docs/VERCEL_DEPLOYMENT_REPORT.md`).

## Persistent storage (required on the host)

SQLite (`artifacts/ecosort.db`), `uploads/`, the dataset tree and
`artifacts/` (registry, checkpoints) assume a persistent local disk.
Ephemeral filesystems lose feedback/predictions/uploads — the host must
provide a persistent volume (or a future external DB/blob migration, not
yet implemented). No silent data loss is acceptable; do not deploy the API
where disk does not persist.

## Deployment workflow (models)

1. `POST /api/models/deploy {"run_id": "..."}` pins production
   (`artifacts/deployed_model.json`) — explicit action, never automatic.
2. `POST /api/model/reload` (no args — follows the pin) activates it.
3. Rollback = deploy the previous run again (run-002 is the known-stable
   fallback), then reload. Registry statuses: EXPERIMENT → EVALUATED →
   CANDIDATE → APPROVED → DEPLOYED, ARCHIVED for superseded runs.

## Rollback (site)

- Frontend: Vercel dashboard → previous deployment → Promote.
- Model: deploy run-002 + reload (one API call each, verified by tests).

## Status (2026-09-20, tested)

- Frontend: built (`tsc + vite` green), **NOT deployed to Vercel** — no
  Vercel account/credentials exist in this environment, and creating hosting
  accounts is outside the operator's scope here. `vercel.json` + build config
  are ready for `vercel --prod` or a Git-connected project.
- API: verified locally via uvicorn AND over public HTTPS through an
  ephemeral Cloudflare tunnel: health (run-002/v3/cuda/simulation),
  paper prediction at 86.4% high confidence with 294 ms inference,
  API↔direct-predictor output identical, feedback stored with model+dataset
  versions, invalid/corrupt/empty → 400 + oversize → 413 with no stack
  traces, restart preserves run-002 serving. Tunnel URL was ephemeral and is
  not recorded as a production URL.
- CORS verified live: allow-listed dev origin echoed, unlisted origins get
  no access header.
- Browser smoke (system Chrome, real served build): all 6 public pages,
  Scan→prediction→feedback, mobile 390px viewport incl. prediction and
  simulation label, zero JS errors. API-down shows a human message
  ("Could not reach the EcoSort service…"), never a traceback.
- Permanent public hosting still requires: a Vercel account (frontend) and
  a persistent host for the API (SQLite/uploads/dataset need real disk —
  see `docs/VERCEL_DEPLOYMENT_REPORT.md`).

Backend-on-Vercel verdict (tested 2026-09-20, see
`docs/VERCEL_DEPLOYMENT_REPORT.md`): **not compatible** — 1,497 MB
production bundle vs 500 MB standard limit, 4.5 MB request cap vs 12 MB
uploads, ephemeral filesystem vs SQLite/local-disk design. Split
architecture stands.
