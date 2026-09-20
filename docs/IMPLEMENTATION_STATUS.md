# EcoSort Implementation Status

Generated from measured artifacts and test runs — not aspirations.

## COMPLETED

- run-002 trained (16,219 train / 3,475 val), best val 97.93%, test 97.27%,
  macro F1 0.968 on 3,478 held-out images. Served by default.
- run-001 preserved (96.19% val / 96.36% test) and reproducible.
- Model registry (`GET /api/models`, Research → Models) with
  DEPLOYED / CANDIDATE / EVALUATED / EXPERIMENT / ARCHIVED.
- Model comparison run-001 vs run-002 (Research → Experiments), N/A where unevaluated.
- Evaluation page: overall, per-class, confusion matrix + example gallery,
  confidence distribution, selective accuracy, metadata.
- Error analysis with measured confusion pairs (no causal claims).
- Public Scan flow with confidence safety (high / verify / hold) and
  Correct/Incorrect feedback storing image ref, prediction, confidence,
  correct class, model + dataset version, timestamp, review status.
- Test set frozen: feedback only creates candidates, never edits splits.
- Active learning queue with measured priority signals + reviewer actions
  (accept / correct / reject / uncertain) → verified v4 candidates.
- Dataset v1–v3 versioned and immutable; v4 pipeline documented.
- 100K tracker reading the live registry (23,172 / 100,000).
- Grad-CAM explainability (Research → Explainability) with honest caption.
- Prediction log with filters + analytics from stored records.
- Robot simulation: gated decisions, safety logic, events, adapter
  abstraction, all marked simulation; hardware correctly reported absent.
- Docs: README, ML_PIPELINE, DATASET, ROBOT_INTEGRATION, EXPERIMENTS, API.
- Tests: 43 pytest cases (model, prediction, policy, feedback loop, active
  learning, robot sim, registry + data integrity, v4 gate, serving
  boundary) — all passing.
- Frontend production build passes (`tsc + vite`); browser smoke passes
  (desktop + mobile, zero JS errors); API verified over local uvicorn and
  ephemeral public HTTPS.

## SIMULATION ONLY

- Robot arm, conveyor actuation, camera attachment, ROS2/Arduino/Pi adapters,
  multi-object detection.

## PLANNED

- Dataset v4: gate evaluated 2026-09-20 — **refused** (1 candidate considered,
  auto-rejected as a v3 exact duplicate; 0 accepted; gate needs 200 verified
  across ≥2 classes). v3 stays the training dataset; review queue holds 4
  items awaiting human review. Report:
  `artifacts/analysis/v4-candidate-report.json`. run-003 trains only after v4
  passes with a documented hypothesis.
- Brown/Green/White Glass data acquisition (currently missing, honestly shown).
- Continued imports toward 100,000 verified images.

## REQUIRES HARDWARE

- Any physical robot connection, on-device camera, edge deployment.
