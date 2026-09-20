# EcoSort 100K Dataset Programme

Target: **100,000+ legitimate source images** across 13 canonical classes.
Current status is always live at `GET /api/dataset/targets` — the UI shows
`actual / 100,000` and never fabricates the remainder.

## Canonical 13 classes

battery, brown_glass, cardboard, clothes, glass, green_glass, metal,
organic, paper, plastic, shoes, trash, white_glass.

On-disk, legacy `biological/` is kept for checkpoint compatibility and
reported under canonical `organic`. Colour-separated glass classes
(brown/green/white) currently have **no data** — they are shown as missing,
not filled with duplicates.

## Pipeline

```
candidate folder (lawfully obtained)
  → python -m ml.ingest --dry-run        # validate only
  → python -m ml.ingest --copy           # import
      licence/source validation (licence string required)
      image validation (decode, min 96px side)
      class mapping (src label → canonical 13)
      exact duplicate removal (MD5 vs whole corpus)
      near-duplicate removal (dHash ≤ 4, same class)
      quality filtering (dark / flat images quarantined)
  → ml.data.audit_and_split()            # re-audit, leakage-safe splits
  → version recorded (EcoSort Dataset vN)
  → train / evaluate (records dataset version)
```

Augmentation stays **train-time only** and is never counted as source images.

## Suggest legitimate sources (verify licence before use)

| Dataset | Why it fits | Licence to verify |
|---|---|---|
| TrashNet (garythung) | clean single-object waste photos | research use; check repo terms |
| TACO (Trash Annotations in Context) | litter in real contexts, robot-relevant | CC BY 4.0 (verify) |
| Open Litter Map / Litter datasets | outdoor, cluttered, real-world | varies; check each contribution |
| Drinking Waste / Kaggle waste classifiers | extra per-class volume | per-dataset Kaggle terms |
| HuggingFace `waste-classification` mirrors | volume | per-repo licence field |

Rules: no Google-Images scraping, no unclear rights, every import records
name + source + URL + licence + dates + counts + class mapping
(`artifacts/dataset_sources.json`).

## Example

```bash
python -m ml.ingest --source-dir C:/data/taco --dataset-name TACO \
  --license "CC BY 4.0" --url https://github.com/pedropro/TACO \
  --class-map plastic:plastic glass:glass metal:metal --robot-ready --dry-run

python -m ml.ingest --source-dir C:/data/taco --dataset-name TACO \
  --license "CC BY 4.0" --url https://github.com/pedropro/TACO \
  --class-map plastic:plastic glass:glass metal:metal --robot-ready

python -m ml.data            # re-audit + splits + health report
python -m ml.train --epochs-head 5 --epochs-finetune 15
python -m ml.evaluate --checkpoint artifacts/runs/<run>/best.pt
```

## Robot-ready data

Pass `--robot-ready` when the source contains real-world diversity
(clutter, varied lighting/angles, occlusion, conveyor scenes, dirty items).
Tags live in `artifacts/splits/robot_ready_tags.json` and are counted at
`GET /api/dataset` → `robot_ready`. Untagged images are simply not counted.

## Active learning

Review-queue verifications (`/api/review-queue` → `/api/corrections`) are
exportable as future-version candidates, letting the corpus grow past 100K
without architecture changes. Retraining stays manual.
