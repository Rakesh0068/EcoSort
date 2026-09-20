"""Runtime-overridable robot configuration, persisted in SQLite.

Defaults live in ml.config. Anything an operator changes through the API is
written to the robot_config table and re-applied at startup, so inference,
evaluation and the sorting engine always agree on the same thresholds.
"""

from __future__ import annotations

import json

from ml import config

from . import db

TABLE = "robot_config"

FLOAT_KEYS = {
    "confidence_threshold": "CONFIDENCE_THRESHOLD",
    "margin_threshold": "MARGIN_THRESHOLD",
}


def current() -> dict:
    return {
        "confidence_threshold": config.CONFIDENCE_THRESHOLD,
        "margin_threshold": config.MARGIN_THRESHOLD,
        "bin_map": dict(config.BIN_MAP),
        "bin_labels": dict(config.BIN_LABELS),
    }


def load() -> dict:
    stored = db.kv_all(TABLE)
    for key, attr in FLOAT_KEYS.items():
        raw = stored.get(key)
        if raw is None:
            continue
        try:
            setattr(config, attr, float(raw))
        except ValueError:
            db.kv_set(TABLE, key, repr(getattr(config, attr)))
    raw_map = stored.get("bin_map")
    if raw_map:
        try:
            loaded = json.loads(raw_map)
        except json.JSONDecodeError:
            loaded = None
        if isinstance(loaded, dict) and loaded:
            config.BIN_MAP = {
                k: v for k, v in loaded.items() if k in config.CLASSES and v in config.BIN_LABELS
            }
    return current()


def save_thresholds(confidence: float | None = None, margin: float | None = None) -> dict:
    if confidence is not None:
        if not 0.05 <= confidence <= 0.99:
            raise ValueError("confidence threshold must be between 0.05 and 0.99")
        config.CONFIDENCE_THRESHOLD = round(confidence, 4)
        db.kv_set(TABLE, "confidence_threshold", repr(config.CONFIDENCE_THRESHOLD))
    if margin is not None:
        if not 0.0 <= margin <= 0.95:
            raise ValueError("margin threshold must be between 0.0 and 0.95")
        config.MARGIN_THRESHOLD = round(margin, 4)
        db.kv_set(TABLE, "margin_threshold", repr(config.MARGIN_THRESHOLD))
    return current()


def save_bin_map(mapping: dict) -> dict:
    unknown_class = [k for k in mapping if k not in config.CLASSES]
    if unknown_class:
        raise ValueError(f"unknown classes: {unknown_class}")
    unknown_bin = [v for v in mapping.values() if v not in config.BIN_LABELS]
    if unknown_bin:
        raise ValueError(f"unknown bins: {sorted(set(unknown_bin))}")
    config.BIN_MAP = {**config.BIN_MAP, **mapping}
    db.kv_set(TABLE, "bin_map", json.dumps(config.BIN_MAP))
    return dict(config.BIN_MAP)
