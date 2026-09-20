"""Serving boundary: everything production inference needs, nothing it doesn't.

Training (ml/train.py), evaluation (ml/evaluate.py), ingestion
(ml/ingest.py, ml/data.py, ml/analyze_errors.py, ml/build_v4.py) and
dataset tooling are intentionally NOT imported here. The serving path is:
api/main.py -> inference/* -> ml runtime modules (infer, model, gradcam,
config, recycling, registries for metadata only).
"""
