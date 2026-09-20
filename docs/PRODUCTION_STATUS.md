# EcoSort Production Status

Live values where stated; everything else is the verified local state.

- Frontend: **NOT DEPLOYED** (build green, `vercel.json` ready; no Vercel
  account in this environment).
- Vercel URL: none — not fabricated.
- API: **LOCAL-VERIFIED** (uvicorn): health run-002 / Dataset v3 / cuda /
  simulation; real paper-image prediction 86.4% high confidence, 294 ms
  inference; feedback round-trip stored; restart-safe on run-002. Also
  exercised over ephemeral public HTTPS (tunnel, since closed — not a
  production URL).
- ML model: **run-002** (`artifacts/runs/run-002/best.pt`), explicitly pinned
  (`artifacts/deployed_model.json`), status DEPLOYED.
- Dataset: v3 working set 23,335 verified (registry v3 record 23,172);
  target 100,000 — live in Research → Dataset.
- Robot: **SIMULATION**, hardware not connected.
- Tests: **43 passed, 0 failed** backend (13 integrity + 19 hardening + 6 v4 gate + 5 inference)
  plus **14 passed** frontend client (`node --test tests/frontend_api.test.mjs`).
  Frontend `tsc + vite` build passes.
- Browser smoke: PASS (desktop + 390px mobile, zero JS errors, API-down
  message human-readable; client downscales phone photos pre-upload).
- run-003: not trained (v4 gate refused — correct per policy).
- Vercel backend verdict: **OPTION B** (split; see `docs/VERCEL_DEPLOYMENT_REPORT.md`).
