# EcoSort Forensic Audit

Scope: hardening pass only. No retraining, no changes to run-001 / run-002 /
frozen test set. All findings below were checked against repository artifacts,
runtime behavior and the test suite (32 pytest cases).

## 1. Executive Summary

EcoSort is honest end to end: metrics originate in evaluation artifacts, the
model registry is file-backed, the dataset tracker reads the live registry,
and the robot layer reports simulation truthfully. The audit found no
fabricated metrics, no phantom hardware, and no secrets. Fixes applied were
small and structural: 3 unused imports removed, 2 UI text hardcodes made
dynamic, run-selector options sourced from the registry, a model-load lock
added, `.pytest_cache/` explicitly ignored, and 19 hardening tests added
covering boundaries, invalid operations and interlocks.

## 2. Architecture Findings

- Single source of truth per domain: run dirs + eval JSONs (models),
  `dataset_stats.json` + registry JSONs (dataset), SQLite scans/corrections
  (predictions/feedback). No parallel hardcoded copies — except two UI text
  strings, both fixed (§10).
- Dead code: none found. `api/hardware.py` (camera probing) and
  `api/runtime_config.py` (threshold/bin-map persistence) are both wired into
  live endpoints. Legacy pages (Landing, Robot, Learn, History) are reachable
  only via redirects, kept for bookmarks.
- `db.py` tables `model_versions`/`experiments` helpers exist but no endpoint
  uses them; the file-backed `ml/model_registry.py` is the serving path.
  Verdict: dormant, not dead — left untouched, noted here so a future cleanup
  can remove or adopt them without guessing.

## 3. ML Integrity

- run-001 ARCHIVED, run-002 DEPLOYED, discovered dynamically from `run-*`
  directories; statuses derived from served checkpoint + eval presence.
- run-001 predates dataset versioning → `dataset_version: null` → UI shows
  N/A. Verified correct behavior, not a gap.
- Evaluation integrity: accuracy, macro F1, per-class table, confusion
  matrix, test count all read from `evaluation_run-002_best.json`
  (3,478 samples). No UI path substitutes validation metrics — the Training
  page reads `metrics.json` (labeled validation) and the Evaluation page
  reads the eval artifact (labeled test). Covered by
  `test_run002_counts_match_files` and `test_registry_reports_deployed_run002`.
- Thresholds: `CONFIDENCE_THRESHOLD = 0.60`, `MARGIN_THRESHOLD = 0.15`
  (`ml/config.py`, overridable via `PUT /api/robot/config` and read live at
  every prediction — no stale copies). HIGH = conf ≥ 0.60 and margin ≥ 0.15;
  MEDIUM = conf ≥ 0.60 with close runner-up; LOW = below threshold → hold.
  Boundary-tested at threshold ± epsilon: at-threshold sorts (defined
  behavior), epsilon-below holds. No float bug: comparisons are direct
  `>=`/`<` on the same stored threshold both layers use.

## 4. Dataset Integrity

- v3 (23,172 verified; train 16,219 / val 3,475 / test 3,478) immutable:
  nothing in the API writes to split manifests or dataset dirs.
- Candidates endpoint returns only `source='review' AND status='verified'`
  rows; test manifest hash-identical before/after candidate flow (tested).
- Invalid operations fail safely (tested): feedback on unknown scan → 404,
  unknown class → 422, missing class → 422, bad review action → 422,
  unknown review target → 404, bad bin-map class → 422.

## 5. API Integrity

- All 46 documented endpoints verified present (48 routes incl. compat).
- Upload safety: 12 MB cap (413), extension allowlist with content re-check
  via PIL decode (400 on garbage/empty/text), server-generated storage names
  (user filenames never trusted), image serving only from DB-recorded paths.
- Validation: Pydantic + explicit guards; consistent `{"detail"}` errors, no
  stack traces (tested across predict/feedback/scan/robot paths).
- Model reload: locked, 404 on missing checkpoint, keeps the previous model
  on load failure (`load()` only swaps internals after a successful read),
  tested swapping run-001 → run-002 with state restored.
- Latency: measured with `perf_counter` around preprocess/forward/post/Grad-CAM
  (CUDA-synchronized), reported per request with the executing device. No
  benchmarks presented as guarantees.
- Concurrency: SQLite WAL + 30 s timeout, per-request connections,
  commit-scoped transactions, FK enforcement; model load/reload serialized
  with `_model_lock`. Reload-vs-predict races cannot serve a half-loaded model.

## 6. Robot Safety

- `hardware_connected: false` and `interface: SIMULATION` from every status
  path; all sim responses carry `simulation: true` (tested).
- `decide()` gate tested at 0.0/0.01/0.3/0.59999/0.60: nothing below the
  threshold sorts; e-stop forces `BLOCKED_ESTOP` even at 99% confidence.
- Paused controller rejects simulation steps (409); stop engages e-stop and
  is logged; `SimulationRobotAdapter` is a separate class from the (nonexistent)
  hardware adapters, so no command path can reach physical hardware.
- Honest limits kept: classifier-only (no detector), centroid-not-box,
  multi-object explicitly "planned".

## 7. Frontend Integrity

- Every Research page fetches live endpoints (Models, Experiments,
  Evaluation, Error Analysis, Dataset, Active Learning, Explainability,
  Predictions, Analytics, Training, Review, Dashboard) — no duplicated
  backend values. Fixed during audit: Experiments interpretive sentence and
  Error Analysis run options now derive from `/api/models`.
- Public site: hero and consumer flows contain no CUDA/epochs/checkpoint
  internals; the single EfficientNet mention lives inside an expandable
  technical section. Result wording avoids "certain/guaranteed/100%";
  confidence is labeled "Model confidence" with the no-calibration disclaimer.
- Robot page labels simulation vs future hardware; animations are presented
  as a demonstration, not a connected machine.
- Accessibility: all images have alt text, form controls labeled, native
  buttons/details/summary (keyboard-free), visible focus ring, responsive
  layouts. No full screen-reader pass performed — noted as remaining.

## 8. Security

- Secret sweep (keys/tokens/passwords/private keys/`.env`/credentials):
  zero findings. `.env*` ignored; no credentials in code or history scope.
- Research endpoints are data APIs, not privileged operations — "hiding"
  them from public nav is UX layering, and the audit confirms no endpoint
  performs an admin-only mutation that would need auth (training start is
  CUDA-gated and local-only by deployment, documented in README).
- Uploads cannot traverse paths (generated names), cannot execute (served
  as static images or not at all), cannot exhaust disk casually (12 MB cap).
- Logs contain operational events only (model load, decisions, config
  changes); no credentials, tokens, or personal data are logged.

## 9. Test Results

- `tests/test_ecosort.py`: 13 passed (loading, prediction, policy,
  E2E feedback→candidate, robot sim, registry + counts).
- `tests/test_hardening.py`: 19 passed (boundaries, 4xx paths, reload
  safety, upload rejection, robot interlocks, error schema).
- Total: **32 passed, 0 failed.**
- Frontend: `tsc --noEmit` + `vite build` PASS.
- Test DB rows cleaned after every run (scan/correction cleanup scripts);
  production `ecosort.db` contains no test fixtures.

## 10. Issues Fixed

1. Unused imports: `Path` (api/db.py), `_cfg` (api/db.py), `Image`
   (ml/evaluate.py).
2. Experiments note hardcoded "Dataset v3" → derived from compared models.
3. Error Analysis run list hardcoded → sourced from `/api/models`
   (evaluated runs only, honest empty state).
4. Model load/reload race → `_model_lock` + failure-keeps-old-model.
5. `.pytest_cache/` added to `.gitignore`.
6. Error schema documented in `docs/API.md`.

## 11. Issues Remaining

- Dormant `model_versions`/`experiments` DB helpers with no endpoint
  consumers (see §2) — adopt or remove in a future cleanup.
- `POST /api/model/reload` with a corrupt `.pt` inside a run dir returns
  500 while keeping the old model — reviewed safe; no live test performed
  against real run dirs to avoid touching history.

## 12. Known Limitations

- Brown/Green/White Glass have no data; shown as missing, not synthesized.
- run-001 lacks dataset-version metadata (predates versioning) → N/A.
- Latency figures are per-request measurements on the serving machine
  (CUDA here), not portable guarantees.
- 100K goal at 23,172 verified — tracker shows the live count, never a
  projection.

## 13. Recommended Next Development Phase

Error analysis → hard-sample review → verified feedback → Dataset v4
(frozen, re-validated) → run-003 with a documented reason. No training until
the v4 candidate pool justifies it.
