# EcoSort ML Pipeline

Real data → data quality → dataset version → training → model version →
real evaluation → prediction → confidence → human feedback → active learning →
new verified data → next dataset version → next experiment → robot-ready decision.

## Stages

1. **Ingest** (`python -m ml.ingest …`) — licence required, image validation,
   class mapping onto the canonical 13 classes, exact (MD5) + near-duplicate
   (dHash ≤ 4, same class) removal, quality filtering. Only new images count.
2. **Audit + split** (`python -m ml.data`) — re-validates the whole corpus,
   groups near-duplicates so no pair straddles train/val/test, writes seeded
   stratified manifests to `artifacts/splits/`, records a dataset version and
   a health report. Augmented copies are train-time only and never counted.
3. **Train** (`python -m ml.train --epochs-head 5 --epochs-finetune 15
   --batch-size 32`) — EfficientNet-B0, ImageNet-pretrained, two-phase
   (frozen head → full fine-tune), weighted sampling for class imbalance,
   CUDA required via the API. Records dataset version, hyperparams,
   augmentation config, per-epoch history in `artifacts/runs/<run>/`.
4. **Evaluate** (`python -m ml.evaluate --checkpoint …`) — held-out test split
   only: accuracy, macro/weighted precision/recall/F1, per-class table,
   confusion matrix + top pairs, misclassified examples, confidence
   distribution, selective accuracy. Saved to
   `artifacts/metrics/evaluation_<run>_<weights>.json`.
5. **Serve** — `resolve_checkpoint()` picks the newest completed run;
   `POST /api/model/reload` reloads safely. The predictor is loaded once and
   cached, never per-request.
6. **Learn** — predictions persist to SQLite; corrections flow
   user → review queue → verified candidates → future dataset version.
   The frozen test set is never modified by feedback.

## Current state

- Dataset v3: 23,172 verified (train 16,219 / val 3,475 / test 3,478).
- run-002 (DEPLOYED): 97.93% val, 97.27% test, macro F1 0.968.
- run-001 (ARCHIVED): 96.19% val, 96.36% test on 1,840 images. Preserved.
