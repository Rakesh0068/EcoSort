"""100K dataset infrastructure: canonical classes, targets, source registry,
version ledger, health reporting and honest progress accounting.

Everything here is computed from files on disk. Nothing is fabricated:
if only 12,259 legitimate images exist, every consumer reports 12,259 / 100,000.
"""

from __future__ import annotations

import datetime as _dt
import json
from pathlib import Path

from . import config

TARGET_TOTAL = 100_000

# Canonical 13-class taxonomy required by the 100K goal. The trained model
# currently covers 10 classes; the dataset layer tracks all 13 and reports
# which ones have no training data yet instead of pretending they do.
CANONICAL_13 = [
    "battery",
    "brown_glass",
    "cardboard",
    "clothes",
    "glass",
    "green_glass",
    "metal",
    "organic",
    "paper",
    "plastic",
    "shoes",
    "trash",
    "white_glass",
]

CANONICAL_DISPLAY = {
    "battery": "Battery",
    "brown_glass": "Brown Glass",
    "cardboard": "Cardboard",
    "clothes": "Clothes",
    "glass": "Glass",
    "green_glass": "Green Glass",
    "metal": "Metal",
    "organic": "Organic Waste",
    "paper": "Paper",
    "plastic": "Plastic",
    "shoes": "Shoes",
    "trash": "Trash",
    "white_glass": "White Glass",
}

# Legacy model-class dir names -> canonical classes. "biological" is the
# legacy name for organic waste; bare "glass" stays generic until a source
# provides colour-separated glass.
ALIAS_TO_CANONICAL = {
    "battery": "battery",
    "biological": "organic",
    "organic": "organic",
    "organic_waste": "organic",
    "cardboard": "cardboard",
    "clothes": "clothes",
    "clothing": "clothes",
    "textile": "clothes",
    "glass": "glass",
    "brown_glass": "brown_glass",
    "green_glass": "green_glass",
    "white_glass": "white_glass",
    "metal": "metal",
    "paper": "paper",
    "plastic": "plastic",
    "shoes": "shoes",
    "shoe": "shoes",
    "trash": "trash",
    "landfill": "trash",
    "residual": "trash",
}

# Canonical class -> on-disk directory name. The legacy "biological" folder is
# kept so existing checkpoints, BIN_MAP and GUIDE stay compatible; the
# canonical 13-class view maps it to "organic" for reporting.
MODEL_CLASSES = list(config.CLASSES)

DISK_DIR = {
    "battery": "battery",
    "brown_glass": "brown_glass",
    "cardboard": "cardboard",
    "clothes": "clothes",
    "glass": "glass",
    "green_glass": "green_glass",
    "metal": "metal",
    "organic": "biological",
    "paper": "paper",
    "plastic": "plastic",
    "shoes": "shoes",
    "trash": "trash",
    "white_glass": "white_glass",
}


def disk_dir(canonical_cls: str) -> str:
    return DISK_DIR.get(canonical_cls, canonical_cls)

SOURCES_FILE = config.ARTIFACTS / "dataset_sources.json"
VERSIONS_FILE = config.ARTIFACTS / "dataset_versions.json"
HEALTH_FILE = config.ARTIFACTS / "dataset_health.json"
ACQ_TARGETS_FILE = config.ARTIFACTS / "acquisition_targets.json"
TAGS_FILE = config.SPLITS_DIR / "robot_ready_tags.json"


def _now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds")


def _read_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def canonical(cls: str) -> str | None:
    return ALIAS_TO_CANONICAL.get(cls.strip().lower())


def per_class_target(total: int = TARGET_TOTAL) -> dict[str, int]:
    """Approximately-even planning target across the 13 classes.

    Rounded down with the remainder dealt to the first classes so the
    targets always sum exactly to `total`. This is planning guidance,
    not a claim about the data on disk.
    """
    n = len(CANONICAL_13)
    base, rem = divmod(total, n)
    return {c: base + (1 if i < rem else 0) for i, c in enumerate(CANONICAL_13)}


def load_sources() -> list[dict]:
    return _read_json(SOURCES_FILE, [])


def save_sources(rows: list[dict]) -> None:
    SOURCES_FILE.write_text(json.dumps(rows, indent=2))


def load_versions() -> list[dict]:
    return _read_json(VERSIONS_FILE, [])


def save_versions(rows: list[dict]) -> None:
    VERSIONS_FILE.write_text(json.dumps(rows, indent=2))


def record_source(entry: dict) -> list[dict]:
    """Append or replace-by-name a dataset source record. Requires licence info."""
    required = ["name", "license"]
    for k in required:
        if not entry.get(k):
            raise ValueError(f"source record requires '{k}'")
    rows = load_sources()
    rows = [r for r in rows if r.get("name") != entry["name"]]
    entry.setdefault("import_date", _now_iso())
    rows.append(entry)
    save_sources(rows)
    return rows


def record_version(entry: dict) -> list[dict]:
    rows = load_versions()
    rows.append({"created_at": _now_iso(), **entry})
    save_versions(rows)
    return rows


def current_stats() -> dict | None:
    p = config.SPLITS_DIR / "dataset_stats.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except ValueError:
        return None


def canonical_distribution(stats: dict | None = None) -> dict[str, int]:
    """Map the on-disk per-class counts onto the canonical 13 classes."""
    stats = stats if stats is not None else current_stats()
    per = (stats or {}).get("per_class", {}) if stats else {}
    out = {c: 0 for c in CANONICAL_13}
    for raw, d in per.items():
        c = canonical(raw)
        if c:
            out[c] += int(d.get("unique", 0))
    return out


def ensure_seed_version(stats: dict | None = None) -> list[dict]:
    """Create EcoSort Dataset v1 from the current audited split if no versions exist."""
    rows = load_versions()
    if rows:
        return rows
    stats = stats if stats is not None else current_stats()
    if not stats:
        return rows
    entry = {
        "version": "EcoSort Dataset v1",
        "total_images": int(stats.get("total_unique", 0)),
        "class_distribution": canonical_distribution(stats),
        "sources": [{"name": "bundled-base", "note": "pre-existing local corpus, provenance to be documented per-source"}],
        "duplicates_removed": int(stats.get("duplicates_removed", 0)),
        "corrupt_removed": int(stats.get("corrupt_unreadable", 0)),
        "near_duplicates_removed": int(stats.get("near_duplicates_removed", 0)),
        "low_quality_removed": int(stats.get("low_quality_removed", 0)),
        "split": dict(stats.get("split_sizes", {})),
        "split_ratios": list(stats.get("split_ratios", [])),
        "seed": stats.get("seed"),
        "note": "Seed version bootstrapped from the audited on-disk split. Add per-source licences via `python -m ml.ingest --register-only` or the sources file.",
    }
    return record_version(entry)


def progress(stats: dict | None = None) -> dict:
    """Honest actual-vs-target accounting. Never fabricates the remainder."""
    stats = stats if stats is not None else current_stats()
    verified = int((stats or {}).get("total_unique", 0)) if stats else 0
    dist = canonical_distribution(stats)
    targets = per_class_target()
    per_class = {}
    for c in CANONICAL_13:
        have = dist[c]
        tgt = targets[c]
        per_class[c] = {
            "have": have,
            "target": tgt,
            "gap": max(0, tgt - have),
            "pct_of_dataset": round(have / verified * 100, 2) if verified else 0.0,
            "pct_of_target": round(have / tgt * 100, 1) if tgt else 0.0,
        }
    have_sorted = sorted(per_class.items(), key=lambda kv: kv[1]["have"], reverse=True)
    strongest = [k for k, v in have_sorted[:3] if v["have"] > 0]
    under = [k for k, v in have_sorted if 0 < v["have"] < v["target"]]
    missing = [k for k, v in have_sorted if v["have"] == 0]
    split = dict((stats or {}).get("split_sizes", {})) if stats else {}
    return {
        "target": TARGET_TOTAL,
        "verified": verified,
        "remaining": max(0, TARGET_TOTAL - verified),
        "reached": verified >= TARGET_TOTAL,
        "progress_frac": round(min(1.0, verified / TARGET_TOTAL), 4) if TARGET_TOTAL else 0.0,
        "total_scanned": int((stats or {}).get("total_files_scanned", 0)) if stats else 0,
        "valid": verified,
        "duplicates_removed": int((stats or {}).get("duplicates_removed", 0)) if stats else 0,
        "near_duplicates_removed": int((stats or {}).get("near_duplicates_removed", 0)) if stats else 0,
        "corrupt_removed": int((stats or {}).get("corrupt_unreadable", 0)) if stats else 0,
        "low_quality_removed": int((stats or {}).get("low_quality_removed", 0)) if stats else 0,
        "unmapped_skipped": int((stats or {}).get("unmapped_skipped", 0)) if stats else 0,
        "train": int(split.get("train", 0)),
        "val": int(split.get("val", 0)),
        "test": int(split.get("test", 0)),
        "per_class": per_class,
        "strongest_classes": strongest,
        "underrepresented_classes": under,
        "missing_classes": missing,
        "model_classes": MODEL_CLASSES,
        "model_coverage": f"{len([c for c in MODEL_CLASSES if canonical(c) and dist.get(canonical(c), 0) > 0])}/{len(MODEL_CLASSES)} model classes have data",
    }


def robot_ready_summary() -> dict:
    tags = _read_json(TAGS_FILE, {})
    counts: dict[str, int] = {}
    total = 0
    if isinstance(tags, dict):
        for cls, items in tags.items():
            n = len(items) if isinstance(items, list) else int(items or 0)
            counts[cls] = n
            total += n
    return {
        "tagged_images": total,
        "per_class": counts,
        "note": (
            "Robot-ready tags mark real-world images (clutter, varied lighting/angles, "
            "occlusion, conveyor scenes). Tagging is opt-in per ingestion; untagged "
            "images are simply not counted, never estimated."
        ),
    }


def health_report(stats: dict | None = None) -> dict:
    stats = stats if stats is not None else current_stats()
    stats = stats or {}
    imported = int(stats.get("total_files_scanned", 0))
    valid = int(stats.get("total_unique", 0))
    report = {
        "generated_at": _now_iso(),
        "total_imported": imported,
        "valid": valid,
        "invalid": imported - valid,
        "corrupt": int(stats.get("corrupt_unreadable", 0)),
        "exact_duplicates": int(stats.get("duplicates_removed", 0)),
        "near_duplicates": int(stats.get("near_duplicates_removed", 0)),
        "low_quality": int(stats.get("low_quality_removed", 0)),
        "unmapped": int(stats.get("unmapped_skipped", 0)),
        "verified": valid,
        "final_training_candidates": int(stats.get("split_sizes", {}).get("train", 0)),
        "augmentation_note": "Augmented copies are generated at train time and are never counted as source images.",
    }
    try:
        HEALTH_FILE.write_text(json.dumps(report, indent=2))
    except OSError:
        pass
    return report


# --------------------------------------- acquisition targets (v4 planning)


# Default per-class verified-candidate goals. These are planning goals, not
# measurements: paper/trash default higher because run-002 error analysis
# measured them weakest. Fully configurable via PUT /api/acquisition/targets.
DEFAULT_ACQ_TARGETS = {
    "battery": 25, "brown_glass": 25, "cardboard": 50, "clothes": 50,
    "glass": 50, "green_glass": 25, "metal": 50, "organic": 50,
    "paper": 100, "plastic": 50, "shoes": 50, "trash": 100,
    "white_glass": 25,
}


def load_acq_targets() -> dict[str, int]:
    stored = _read_json(ACQ_TARGETS_FILE, {})
    if not isinstance(stored, dict) or not stored:
        return dict(DEFAULT_ACQ_TARGETS)
    return {c: int(stored.get(c, DEFAULT_ACQ_TARGETS.get(c, 25))) for c in CANONICAL_13}


def save_acq_targets(targets: dict) -> dict[str, int]:
    clean = {}
    for c in CANONICAL_13:
        try:
            v = int(targets.get(c, DEFAULT_ACQ_TARGETS[c]))
        except (ValueError, TypeError):
            raise ValueError(f"target for '{c}' must be an integer")
        if v < 0 or v > 100000:
            raise ValueError(f"target for '{c}' out of range 0..100000")
        clean[c] = v
    ACQ_TARGETS_FILE.write_text(json.dumps(clean, indent=2))
    return clean
