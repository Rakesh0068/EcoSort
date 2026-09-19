"""Deterministic dataset audit + stratified split builder.

Hashes every image to find true duplicates, then writes reproducible
train/val/test manifests so training never depends on directory ordering.
"""

from __future__ import annotations

import hashlib
import json
import random
from collections import Counter, defaultdict
from pathlib import Path

from . import config

EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def _md5(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.md5()
    with path.open("rb") as f:
        while block := f.read(chunk):
            h.update(block)
    return h.hexdigest()


def audit_and_split() -> dict:
    root = config.DATASET_DIR
    if not root.is_dir():
        raise SystemExit(f"dataset not found: {root}")

    by_class: dict[str, list[Path]] = defaultdict(list)
    for cls_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        cls = cls_dir.name.lower()
        if cls not in config.CLASS_TO_IDX:
            print(f"  ! skipping unknown class dir: {cls}")
            continue
        for f in sorted(cls_dir.iterdir()):
            if f.suffix.lower() in EXTS:
                by_class[cls].append(f)

    # Duplicate detection across the whole dataset (hash -> first path seen).
    seen: dict[str, Path] = {}
    duplicates: list[dict] = []
    unique: dict[str, list[Path]] = defaultdict(list)
    corrupt: list[str] = []

    for cls, files in by_class.items():
        for f in files:
            try:
                digest = _md5(f)
            except OSError:
                corrupt.append(str(f))
                continue
            if digest in seen:
                duplicates.append({"path": str(f), "duplicate_of": str(seen[digest])})
            else:
                seen[digest] = f
                unique[cls].append(f)

    rng = random.Random(config.SEED)
    splits: dict[str, list[dict]] = {"train": [], "val": [], "test": []}
    per_class: dict[str, Counter] = {c: Counter() for c in unique}

    for cls, files in unique.items():
        shuffled = files[:]
        rng.shuffle(shuffled)
        n = len(shuffled)
        n_train = round(n * config.SPLIT_RATIOS[0])
        n_val = round(n * config.SPLIT_RATIOS[1])
        buckets = (
            [("train", p) for p in shuffled[:n_train]]
            + [("val", p) for p in shuffled[n_train : n_train + n_val]]
            + [("test", p) for p in shuffled[n_train + n_val :]]
        )
        for split_name, path in buckets:
            splits[split_name].append(
                {"path": str(path), "label": config.CLASS_TO_IDX[cls], "class": cls}
            )
            per_class[cls][split_name] += 1

    for split_name in splits:
        rng.shuffle(splits[split_name])

    total_unique = sum(len(v) for v in unique.values())
    stats = {
        "dataset_dir": str(root),
        "variant": config.DATASET_VARIANT,
        "image_size": config.IMAGE_SIZE,
        "seed": config.SEED,
        "split_ratios": list(config.SPLIT_RATIOS),
        "classes": config.CLASSES,
        "num_classes": config.NUM_CLASSES,
        "total_files_scanned": sum(len(v) for v in by_class.values()),
        "total_unique": total_unique,
        "duplicates_removed": len(duplicates),
        "corrupt_unreadable": len(corrupt),
        "split_sizes": {k: len(v) for k, v in splits.items()},
        "per_class": {
            cls: {
                "unique": len(unique[cls]),
                "train": per_class[cls]["train"],
                "val": per_class[cls]["val"],
                "test": per_class[cls]["test"],
            }
            for cls in sorted(unique)
        },
    }

    for split_name, rows in splits.items():
        out = config.SPLITS_DIR / f"{split_name}.json"
        out.write_text(json.dumps(rows, indent=0))

    (config.SPLITS_DIR / "dataset_stats.json").write_text(json.dumps(stats, indent=2))
    if duplicates:
        (config.SPLITS_DIR / "duplicates.json").write_text(json.dumps(duplicates, indent=0))

    return stats


if __name__ == "__main__":
    s = audit_and_split()
    print(json.dumps({k: v for k, v in s.items() if k != "per_class"}, indent=2))
    print("\nper-class:")
    for cls, d in s["per_class"].items():
        print(f"  {cls:<12} unique={d['unique']:<5} train={d['train']:<5} val={d['val']:<4} test={d['test']}")
