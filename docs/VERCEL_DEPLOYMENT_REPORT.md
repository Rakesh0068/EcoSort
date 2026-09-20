# Vercel Deployment Report — Full Backend Compatibility Test

Verdict: **OPTION B — Vercel frontend + external ML API required.**
Decided from measurements below, not assumptions. No deployment performed,
no URL fabricated (no Vercel CLI/credentials in this environment).

## 1. Backend audit (measured)

- Python 3.12.7 (Vercel default runtime: 3.12 ✓), FastAPI 0.141.1,
  torch 2.5.1+cu121, torchvision 0.20.1, opencv 5.0, numpy 2.5, pillow 12.3.
- `requirements.txt` is already training-clean (no training-only packages).
- Checkpoint `run-002/best.pt`: **16.36 MB**. App code (api+ml): 0.20 MB.

## 2. Deployment size (measured, not estimated)

Production install into an isolated target dir (`requirements-prod.txt`,
CPU torch):

| Package | Installed size |
|---|---|
| torch (CPU) | 1,183.3 MB |
| torchvision | 7.5 MB |
| opencv-python | 117.9 MB |
| numpy / pillow / fastapi / pydantic / misc | ~60 MB |
| checkpoint + code | ~17 MB |
| **Total** | **~1,497 MB** |

- Vercel standard Python bundle limit: **500 MB** → exceeded ~3×.
- Large Functions beta: **5 GB** on Fluid compute → fits, but is beta,
  requires `VERCEL_SUPPORT_LARGE_FUNCTIONS=1`, and still leaves every
  blocker below unresolved.

## 3. CPU inference evidence (forced CPU, as on Vercel)

- torch import alone: 465 MB RSS; after loading run-002: 648 MB;
  peak during inference: **686 MB** (fits 2 GB Hobby / 4 GB Pro memory).
- Model load: 8.45 s cold. First prediction wall: 624 ms; warm forward
  83–140 ms, warm total 313–561 ms (Grad-CAM dominates).
- 5/6 correct on real test images (paper→metal miss at low confidence —
  consistent with the measured paper weakness); deterministic across repeats.
- Found and fixed a real bug: device selection used
  `torch.cuda.is_available()` alone, which breaks on hosts with a driver but
  zero visible GPUs. Now requires `device_count() > 0`, else CPU.

## 4. Hard blockers (each independently fatal for full-backend Vercel)

1. **Request payload 4.5 MB** (official 2026 limits): our 12 MB upload cap
   exceeds it. Mitigated in code (`MAX_UPLOAD_MB` env, default 12), but
   phone photos routinely exceed 4.5 MB — needs client downscaling.
2. **Ephemeral filesystem**: SQLite (`ecosort.db`), `uploads/`, dataset reads
   (`/dataset-images`, test-manifest simulation sampling) assume persistent
   local disk. Serverless keeps only `/tmp`. Requires external DB + blob
   store refactor — not a config change.
3. **No GPU**: fine for latency (above), but must be labeled CPU; the RTX
   3050 is training hardware only.
4. **Cold start**: ~8 s model load + torch import per fresh instance eats
   the latency budget on Hobby; Large Functions cold starts are worse.
5. **Large Functions is beta** with plan/pricing implications (Active CPU +
   provisioned memory billing).

## 5. What was still done for deployment readiness

- `inference/` serving boundary (loader / preprocessing / prediction),
  zero training imports; API upload paths consolidated onto it
  (covered by `tests/test_inference.py`, 5 passed).
- `requirements-prod.txt` (CPU-torch production variant).
- `vercel.json` (frontend static build + SPA rewrites),
  `VITE_API_URL` + `assetUrl()` split wiring, `.env.example`,
  CORS allow-list via `ALLOWED_ORIGINS`.
- Frontend production build passes; full suite green (see §7).

## 6. Production endpoints (verified present, all 46 documented)

`POST /api/predict`, `GET /api/health` (reports model run-002, dataset v3
behind the loaded model, device, robot mode),
`POST /api/scans/{id}/feedback`, `POST /api/model/reload` (locked,
keeps old model on failure). Robot APIs stay simulation-flagged; physical
robot controls are correctly absent from any deployment plan.

## 7. Results

- Tests: 43 passed (13 integrity + 19 hardening + 6 v4 gate + 5 inference).
- Frontend build: PASS. Model: run-002 served. Accuracy check: CPU
  predictions match the labeled test images 5/6 with deterministic repeats.
- Deployment result: backend **not deployed to Vercel** (blockers §4, no
  credentials here). Frontend deployable as static; API stays on a GPU host.

## 8. Final architecture

Vercel (static frontend, `VITE_API_URL` → API origin) + external FastAPI
inference service (this repo's `api/`, pinned to run-002). Revisit full
Vercel backend only after: external DB/blob storage, ≤4.5 MB upload flow,
Large Functions GA, and a costed cold-start budget.
