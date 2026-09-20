# EcoSort Experiments

The run directories and evaluation JSONs are the source of truth
(`ml/model_registry.py` reads them; the UI never hardcodes metrics).

## run-002 — DEPLOYED (current inference candidate)

- Architecture: EfficientNet-B0 (ImageNet-pretrained)
- Dataset: EcoSort Dataset v3 — train 16,219 / val 3,475 / test 3,478
- Training: 5 head + 15 fine-tune epochs, batch 32, AdamW, RTX 3050
- Best validation accuracy: **97.93%**
- Test: **97.27%** accuracy, macro F1 **0.968** (3,478 held-out images)
- Checkpoints: `artifacts/runs/run-002/{best,last,final}.pt`
- Evaluation: `artifacts/metrics/evaluation_run-002_best.json`
- Measured weak spots: trash F1 0.933, paper 0.946 (see Error Analysis;
  top observed pair: clothes → shoes, 9 images)

## run-001 — ARCHIVED (preserved, reproducible)

- Dataset: pre-versioning corpus — train 8,580 / val 1,839 / test 1,840
- Training: 5 head + 15 fine-tune epochs, batch 32, RTX 3050
- Best validation accuracy: 96.19%
- Test: 96.36% accuracy, macro F1 0.9565 (1,840 images)
- Checkpoints: `artifacts/runs/run-001/{best,last,final}.pt`
- Evaluation: `artifacts/metrics/evaluation_run-001_best.json`
- Note: test sets differ in size/composition — compare directionally, not as
  a controlled ablation.

## Policy

- Do not train run-003 without a documented reason. Pipeline: error analysis
  → hard samples → active learning → verified feedback → Dataset v4 → run-003.
- Statuses: EXPERIMENT → EVALUATED → CANDIDATE → DEPLOYED, with ARCHIVED for
  superseded-but-preserved runs. DEPLOYED means the API is actually serving it.
