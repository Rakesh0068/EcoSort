"""File-backed model registry: the run directories and evaluation JSONs are the
single source of truth. Nothing here invents metrics — a run without an
evaluation file reports its test metrics as N/A.

Statuses:
  DEPLOYED   the checkpoint the API is actually serving right now
  CANDIDATE  evaluated, newest non-deployed run (next in line, nothing more)
  EVALUATED  has an evaluation file
  EXPERIMENT no evaluation yet
  ARCHIVED   superseded but preserved for reproducibility
"""

from __future__ import annotations

import json
from pathlib import Path

from . import config

ARCHIVED_RUNS: set[str] = set()

# Explicit deployment pin. When present, the API serves exactly this
# checkpoint — a newer run never auto-replaces production. Managed via
# POST /api/models/deploy; rollback = deploy the previous run again.
PIN_FILE = config.ARTIFACTS / 'deployed_model.json'


def get_pin() -> dict | None:
    return _read_json(PIN_FILE)


def set_pin(run_id: str, weights: str = 'best.pt', note: str = '') -> dict:
    ckpt = config.RUNS_DIR / run_id / weights
    if not ckpt.exists():
        raise FileNotFoundError(f'no such checkpoint: {ckpt}')
    pin = {'run_id': run_id, 'weights': weights,
           'checkpoint': str(ckpt), 'note': note}
    PIN_FILE.write_text(json.dumps(pin, indent=2))
    return pin


def _read_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def _run_metrics(run_id: str) -> dict | None:
    return _read_json(config.RUNS_DIR / run_id / "metrics.json")


def _eval_for_run(run_id: str) -> tuple[dict | None, str | None]:
    """Newest evaluation JSON whose run_id matches. Returns (payload, filename)."""
    best = None
    for f in sorted(config.METRICS_DIR.glob("evaluation_*.json"), key=lambda p: p.stat().st_mtime):
        payload = _read_json(f)
        if payload and payload.get("run_id") == run_id:
            best = (payload, f.name)
    return best if best else (None, None)


def _dataset_version_for_run(metrics: dict | None, ckpt_config: dict) -> str | None:
    if not metrics:
        return None
    run_meta = metrics.get("run") or {}
    return run_meta.get("dataset_version") or ckpt_config.get("dataset_version")


def _checkpoint_for_run(run_id: str) -> Path | None:
    for name in ("best.pt", "final.pt", "last.pt"):
        c = config.RUNS_DIR / run_id / name
        if c.exists():
            return c
    return None


def list_models(served_checkpoint: str | None = None) -> list[dict]:
    """All runs, newest last, with measured metrics and a derived status."""
    runs = sorted((p for p in config.RUNS_DIR.glob("run-*") if p.is_dir()), key=lambda p: p.name)
    models = []
    for run in runs:
        run_id = run.name
        metrics = _run_metrics(run_id)
        ckpt = _checkpoint_for_run(run_id)
        ckpt_config = {}
        if ckpt and ckpt.name == "best.pt":
            try:
                import torch

                state = torch.load(str(ckpt), map_location="cpu", weights_only=False)
                ckpt_config = state.get("config", {}) if isinstance(state, dict) else {}
            except Exception:
                ckpt_config = {}
        eval_payload, eval_file = _eval_for_run(run_id)
        tm = (eval_payload or {}).get("metrics", {}) if eval_payload else {}

        history = (metrics or {}).get("history", []) if metrics else []
        train_cfg = ((metrics or {}).get("run") or {}) if metrics else {}
        hyper = {
            "epochs_head": ckpt_config.get("epochs_head"),
            "epochs_finetune": ckpt_config.get("epochs_finetune"),
            "batch_size": ckpt_config.get("batch_size"),
            "lr_head": ckpt_config.get("lr_head"),
            "lr_finetune": ckpt_config.get("lr_finetune"),
            "optimizer": train_cfg.get("optimizer") or ckpt_config.get("optimizer"),
        }
        created = (metrics or {}).get("started_at")

        is_served = bool(served_checkpoint and ckpt and str(ckpt) == str(served_checkpoint))
        pin = get_pin()
        is_pinned = bool(pin and pin.get("run_id") == run_id
                         and ckpt and str(ckpt) == str(pin.get("checkpoint")))
        if is_served:
            status = "DEPLOYED"
        elif is_pinned:
            # Explicitly approved, but the live process still serves something
            # else — activation requires POST /api/model/reload.
            status = "APPROVED"
        elif run_id in ARCHIVED_RUNS:
            status = "ARCHIVED"
        elif eval_payload is not None:
            status = "EVALUATED"
        elif ckpt is not None:
            status = "EXPERIMENT"
        else:
            status = "EXPERIMENT"

        models.append(
            {
                "model_id": f"ecosort-{run_id}",
                "run_id": run_id,
                "architecture": "efficientnet_b0",
                "dataset_version": _dataset_version_for_run(metrics, ckpt_config),
                "training_images": train_cfg.get("train_samples"),
                "validation_images": train_cfg.get("val_samples"),
                "test_images": (eval_payload or {}).get("num_samples"),
                "training_epochs": (metrics or {}).get("total_epochs", len(history) or None),
                "epochs_completed": (metrics or {}).get("epoch"),
                "best_validation_accuracy": (metrics or {}).get("best_val_acc"),
                "test_accuracy": tm.get("accuracy"),
                "macro_f1": tm.get("f1_macro"),
                "test_precision_macro": tm.get("precision_macro"),
                "test_recall_macro": tm.get("recall_macro"),
                "checkpoint_path": str(ckpt) if ckpt else None,
                "checkpoint_weights": ckpt.name if ckpt else None,
                "evaluation_file": eval_file,
                "hyperparams": hyper,
                "augmentation": train_cfg.get("augmentation"),
                "device": (metrics or {}).get("device"),
                "training_status": (metrics or {}).get("status"),
                "created_at": created,
                "status": status,
            }
        )
    # Newest evaluated run that is newer than (or the only alternative to) the
    # deployed one is the candidate; older evaluated runs are archived
    # (superseded but preserved on disk for reproducibility).
    deployed_idx = next((i for i, m in enumerate(models) if m["status"] == "DEPLOYED"), None)
    for i, m in enumerate(models):
        if m["status"] != "EVALUATED":
            continue
        if deployed_idx is not None and i < deployed_idx:
            m["status"] = "ARCHIVED"
    evaluated = [m for m in models if m["status"] == "EVALUATED"]
    for m in evaluated[:-1]:
        m["status"] = "ARCHIVED"
    if evaluated:
        evaluated[-1]["status"] = "CANDIDATE"
    return models


def compare_models(run_ids: list[str], served_checkpoint: str | None = None) -> dict:
    models = {m["run_id"]: m for m in list_models(served_checkpoint)}
    rows = []
    for rid in run_ids:
        if rid in models:
            rows.append(models[rid])
    return {"models": rows, "note": "Missing test metrics are shown as N/A, never estimated."}


def error_analysis(run_id: str) -> dict:
    """Measured low-F1 classes plus the pairs the confusion matrix supports."""
    eval_payload, eval_file = _eval_for_run(run_id)
    if not eval_payload:
        return {"run_id": run_id, "available": False,
                "note": "No evaluation file for this run yet."}
    per = eval_payload.get("metrics", {}).get("per_class", {})
    rows = sorted(
        ({"class": c, **v} for c, v in per.items()),
        key=lambda r: (r.get("f1") is None, r.get("f1") or 0),
    )
    weak = [r for r in rows if (r.get("f1") or 1) < 0.96]
    pairs = eval_payload.get("confusion_pairs_top", [])[:12]
    cm = eval_payload.get("confusion_matrix")
    classes = eval_payload.get("classes", [])
    return {
        "run_id": run_id,
        "available": True,
        "evaluation_file": eval_file,
        "num_samples": eval_payload.get("num_samples"),
        "per_class": rows,
        "lower_performing": weak,
        "confusion_pairs_top": pairs,
        "confusion_matrix": cm,
        "classes": classes,
        "note": ("Potential error patterns below are factual confusion counts from the "
                 "held-out test set, not causal explanations."),
    }
