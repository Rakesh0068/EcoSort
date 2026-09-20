"""SQLite persistence for scans, corrections, the review queue and robot events.

This is the durable store behind the Continuous Learning loop: predictions are
recorded, low-confidence ones land in a review queue, and user corrections become
verified training candidates.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime

from ml import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS scans (
    id              TEXT PRIMARY KEY,
    created_at      TEXT NOT NULL,
    source          TEXT NOT NULL,
    image_path      TEXT,
    predicted_class TEXT NOT NULL,
    confidence      REAL NOT NULL,
    state           TEXT NOT NULL,
    action          TEXT NOT NULL,
    target_bin      TEXT,
    top5            TEXT NOT NULL,
    latency         TEXT,
    quality         TEXT,
    centroid        TEXT,
    model_version   TEXT,
    was_correct     INTEGER,
    corrected_class TEXT
);

CREATE TABLE IF NOT EXISTS corrections (
    id              TEXT PRIMARY KEY,
    scan_id         TEXT,
    created_at      TEXT NOT NULL,
    predicted_class TEXT NOT NULL,
    correct_class   TEXT NOT NULL,
    source          TEXT NOT NULL,
    verified        INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (scan_id) REFERENCES scans(id)
);

CREATE TABLE IF NOT EXISTS robot_events (
    id          TEXT PRIMARY KEY,
    created_at  TEXT NOT NULL,
    kind        TEXT NOT NULL,
    state       TEXT,
    cls         TEXT,
    confidence  REAL,
    target_bin  TEXT,
    detail      TEXT
);

CREATE TABLE IF NOT EXISTS dataset_sources (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    reference      TEXT,
    license        TEXT,
    added_at       TEXT NOT NULL,
    image_count    INTEGER NOT NULL DEFAULT 0,
    categories     TEXT NOT NULL DEFAULT '[]',
    source_version TEXT,
    status         TEXT NOT NULL DEFAULT 'imported',
    notes          TEXT
);

CREATE TABLE IF NOT EXISTS dataset_versions (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    created_at         TEXT NOT NULL,
    base_version       TEXT,
    source_changes     TEXT NOT NULL DEFAULT '[]',
    num_samples        INTEGER NOT NULL,
    class_distribution TEXT NOT NULL DEFAULT '{}',
    duplicates_removed INTEGER NOT NULL DEFAULT 0,
    verified_added     INTEGER NOT NULL DEFAULT 0,
    split_sizes        TEXT NOT NULL DEFAULT '{}',
    test_frozen        INTEGER NOT NULL DEFAULT 1,
    notes              TEXT
);

CREATE TABLE IF NOT EXISTS model_versions (
    id              TEXT PRIMARY KEY,
    run_id          TEXT NOT NULL,
    checkpoint      TEXT NOT NULL,
    dataset_version TEXT,
    experiment_id   TEXT,
    created_at      TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'EXPERIMENTAL',
    input_size      INTEGER NOT NULL,
    num_classes     INTEGER NOT NULL,
    metrics         TEXT,
    size_bytes      INTEGER,
    notes           TEXT
);

CREATE TABLE IF NOT EXISTS experiments (
    id              TEXT PRIMARY KEY,
    run_id          TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    dataset_version TEXT,
    model           TEXT NOT NULL,
    hyperparams     TEXT NOT NULL DEFAULT '{}',
    augmentation    TEXT NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL,
    checkpoint      TEXT,
    model_version   TEXT,
    metrics         TEXT
);

CREATE TABLE IF NOT EXISTS system_logs (
    id         TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    level      TEXT NOT NULL,
    component  TEXT NOT NULL,
    message    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS robot_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scans_created ON scans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_class ON scans(predicted_class);
CREATE INDEX IF NOT EXISTS idx_corr_created ON corrections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_created ON robot_events(created_at DESC);
"""


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def db():
    conn = _connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with db() as conn:
        conn.executescript(SCHEMA)
    _migrate()


def _migrate() -> None:
    """Additive, idempotent migrations. Never drops or rewrites user data."""
    with db() as conn:
        cols = lambda t: {r["name"] for r in conn.execute(f"PRAGMA table_info({t})")}
        if "dataset_version" not in cols("scans"):
            conn.execute("ALTER TABLE scans ADD COLUMN dataset_version TEXT")
        if "status" not in cols("corrections"):
            conn.execute("ALTER TABLE corrections ADD COLUMN status TEXT DEFAULT 'verified'")


def new_id() -> str:
    return uuid.uuid4().hex[:16]


def now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def insert_scan(row: dict) -> str:
    sid = row.get("id") or new_id()
    with db() as conn:
        conn.execute(
            """INSERT INTO scans (id, created_at, source, image_path, predicted_class, confidence,
               state, action, target_bin, top5, latency, quality, centroid, model_version,
               dataset_version)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                sid,
                row.get("created_at") or now(),
                row.get("source", "upload"),
                row.get("image_path"),
                row["predicted_class"],
                row["confidence"],
                row["state"],
                row["action"],
                row.get("target_bin"),
                json.dumps(row.get("top5", [])),
                json.dumps(row.get("latency", {})),
                json.dumps(row.get("quality", {})),
                json.dumps(row.get("centroid", {})),
                row.get("model_version"),
                row.get("dataset_version"),
            ),
        )
    return sid


def _decode(row: sqlite3.Row) -> dict:
    d = dict(row)
    for key in ("top5", "latency", "quality", "centroid"):
        if d.get(key):
            try:
                d[key] = json.loads(d[key])
            except json.JSONDecodeError:
                pass
    return d


def list_scans(limit: int = 200, cls: str | None = None, state: str | None = None) -> list[dict]:
    q = "SELECT * FROM scans"
    where, params = [], []
    if cls:
        where.append("predicted_class = ?")
        params.append(cls)
    if state:
        where.append("state = ?")
        params.append(state)
    if where:
        q += " WHERE " + " AND ".join(where)
    q += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    with db() as conn:
        return [_decode(r) for r in conn.execute(q, params)]


def get_scan(scan_id: str) -> dict | None:
    with db() as conn:
        row = conn.execute("SELECT * FROM scans WHERE id = ?", (scan_id,)).fetchone()
    return _decode(row) if row else None


REVIEW_STATUSES = ("verified", "uncertain", "rejected")


def insert_correction(
    scan_id: str | None,
    predicted: str,
    correct: str,
    source: str = "user",
    status: str = "verified",
) -> str:
    """Record feedback. Raw user feedback (source='user') and reviewer verdicts
    (source='review') both land here; only reviewed + verified rows ever become
    dataset candidates. The test set is never touched by this path."""
    if status not in REVIEW_STATUSES:
        raise ValueError(f"unknown review status '{status}'")
    cid = new_id()
    with db() as conn:
        conn.execute(
            """INSERT INTO corrections
               (id, scan_id, created_at, predicted_class, correct_class, source, verified, status)
               VALUES (?,?,?,?,?,?,?,?)""",
            (cid, scan_id, now(), predicted, correct, source,
             1 if predicted == correct else 0, status),
        )
        if scan_id and source == "user":
            conn.execute(
                "UPDATE scans SET was_correct = ?, corrected_class = ? WHERE id = ?",
                (1 if predicted == correct else 0, correct, scan_id),
            )
    return cid


def list_corrections(limit: int = 100) -> list[dict]:
    with db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM corrections ORDER BY created_at DESC LIMIT ?", (limit,)
        )]


def review_queue(limit: int = 100) -> list[dict]:
    """Low-confidence or user-rejected scans that still lack a verified label.

    A scan leaves the queue once the review flow itself has recorded a label
    for it (corrections.source = 'review'); user feedback alone only puts it
    here.
    """
    with db() as conn:
        rows = conn.execute(
            """SELECT * FROM scans s
               WHERE (state = 'low' OR was_correct = 0)
                 AND NOT EXISTS (
                   SELECT 1 FROM corrections c
                   WHERE c.scan_id = s.id AND c.source = 'review'
                 )
               ORDER BY created_at DESC LIMIT ?""",
            (limit,),
        ).fetchall()
    return [_decode(r) for r in rows]


def log_robot_event(kind: str, **fields) -> str:
    eid = new_id()
    with db() as conn:
        conn.execute(
            """INSERT INTO robot_events (id, created_at, kind, state, cls, confidence, target_bin, detail)
               VALUES (?,?,?,?,?,?,?,?)""",
            (
                eid,
                now(),
                kind,
                fields.get("state"),
                fields.get("cls"),
                fields.get("confidence"),
                fields.get("target_bin"),
                json.dumps(fields.get("detail", {})),
            ),
        )
    return eid


def list_robot_events(limit: int = 100) -> list[dict]:
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM robot_events ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        if d.get("detail"):
            try:
                d["detail"] = json.loads(d["detail"])
            except json.JSONDecodeError:
                pass
        out.append(d)
    return out


def activity_summary() -> dict:
    with db() as conn:
        total = conn.execute("SELECT COUNT(*) c FROM scans").fetchone()["c"]
        corrections = conn.execute("SELECT COUNT(*) c FROM corrections").fetchone()["c"]
        low = conn.execute("SELECT COUNT(*) c FROM scans WHERE state='low'").fetchone()["c"]
        by_class = {
            r["predicted_class"]: r["c"]
            for r in conn.execute(
                "SELECT predicted_class, COUNT(*) c FROM scans GROUP BY predicted_class ORDER BY c DESC"
            )
        }
        avg_conf = conn.execute("SELECT AVG(confidence) a FROM scans").fetchone()["a"]
        by_day = {
            r["d"]: r["c"]
            for r in conn.execute(
                """SELECT substr(created_at,1,10) d, COUNT(*) c FROM scans
                   GROUP BY d ORDER BY d DESC LIMIT 14"""
            )
        }
        by_bin = {
            r["target_bin"]: r["c"]
            for r in conn.execute(
                """SELECT target_bin, COUNT(*) c FROM scans
                   WHERE target_bin IS NOT NULL GROUP BY target_bin ORDER BY c DESC"""
            )
        }
    return {
        "scans": total,
        "corrections": corrections,
        "low_confidence": low,
        "average_confidence": round(avg_conf, 4) if avg_conf else None,
        "by_class": by_class,
        "by_bin": by_bin,
        "by_day": dict(sorted(by_day.items())),
        "most_scanned": max(by_class, key=by_class.get) if by_class else None,
    }


# ------------------------------------------------------------------ key/value


def kv_get(table: str, key: str, default: str | None = None) -> str | None:
    with db() as conn:
        row = conn.execute(f"SELECT value FROM {table} WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def kv_set(table: str, key: str, value: str) -> None:
    with db() as conn:
        conn.execute(
            f"INSERT INTO {table} (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )


def kv_all(table: str) -> dict:
    with db() as conn:
        return {r["key"]: r["value"] for r in conn.execute(f"SELECT key, value FROM {table}")}


# ------------------------------------------------------------------ system logs


def log_system(level: str, component: str, message: str) -> str:
    lid = new_id()
    with db() as conn:
        conn.execute(
            "INSERT INTO system_logs (id, created_at, level, component, message) VALUES (?,?,?,?,?)",
            (lid, now(), level, component, message),
        )
    return lid


def list_system_logs(limit: int = 200) -> list[dict]:
    with db() as conn:
        return [
            dict(r)
            for r in conn.execute("SELECT * FROM system_logs ORDER BY created_at DESC LIMIT ?", (limit,))
        ]


# ------------------------------------------------------------------ dataset sources


def add_dataset_source(rec: dict) -> str:
    sid = rec.get("id") or new_id()
    with db() as conn:
        conn.execute(
            """INSERT INTO dataset_sources
               (id, name, reference, license, added_at, image_count, categories, source_version, status, notes)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (
                sid,
                rec["name"],
                rec.get("reference"),
                rec.get("license"),
                rec.get("added_at") or now(),
                int(rec.get("image_count") or 0),
                json.dumps(rec.get("categories") or []),
                rec.get("source_version"),
                rec.get("status") or "imported",
                rec.get("notes"),
            ),
        )
    return sid


def list_dataset_sources() -> list[dict]:
    with db() as conn:
        rows = conn.execute("SELECT * FROM dataset_sources ORDER BY added_at DESC").fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["categories"] = json.loads(d.pop("categories") or "[]")
        out.append(d)
    return out


# ------------------------------------------------------------------ dataset versions


def next_dataset_version_id() -> str:
    with db() as conn:
        n = conn.execute("SELECT COUNT(*) c FROM dataset_versions").fetchone()["c"]
    return f"v{n + 1}"


def add_dataset_version(rec: dict) -> str:
    vid = rec.get("id") or next_dataset_version_id()
    with db() as conn:
        conn.execute(
            """INSERT INTO dataset_versions
               (id, name, created_at, base_version, source_changes, num_samples,
                class_distribution, duplicates_removed, verified_added, split_sizes, test_frozen, notes)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                vid,
                rec.get("name") or f"EcoSort Dataset {vid}",
                rec.get("created_at") or now(),
                rec.get("base_version"),
                json.dumps(rec.get("source_changes") or []),
                int(rec.get("num_samples") or 0),
                json.dumps(rec.get("class_distribution") or {}),
                int(rec.get("duplicates_removed") or 0),
                int(rec.get("verified_added") or 0),
                json.dumps(rec.get("split_sizes") or {}),
                1 if rec.get("test_frozen", True) else 0,
                rec.get("notes"),
            ),
        )
    return vid


def list_dataset_versions() -> list[dict]:
    with db() as conn:
        rows = conn.execute("SELECT * FROM dataset_versions ORDER BY created_at DESC").fetchall()
    out = []
    for r in rows:
        d = dict(r)
        for k in ("source_changes", "class_distribution", "split_sizes"):
            d[k] = json.loads(d.pop(k) or ("[]" if k == "source_changes" else "{}"))
        out.append(d)
    return out


# ------------------------------------------------------------------ model versions

MODEL_STATUSES = ("EXPERIMENTAL", "EVALUATED", "STAGING", "ACTIVE", "ARCHIVED")


def add_model_version(rec: dict) -> str:
    mid = rec["id"]
    with db() as conn:
        conn.execute(
            """INSERT INTO model_versions
               (id, run_id, checkpoint, dataset_version, experiment_id, created_at, status,
                input_size, num_classes, metrics, size_bytes, notes)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                mid,
                rec["run_id"],
                rec["checkpoint"],
                rec.get("dataset_version"),
                rec.get("experiment_id"),
                rec.get("created_at") or now(),
                rec.get("status") or "EXPERIMENTAL",
                int(rec.get("input_size") or 0),
                int(rec.get("num_classes") or 0),
                json.dumps(rec.get("metrics") or {}),
                rec.get("size_bytes"),
                rec.get("notes"),
            ),
        )
    return mid


def list_model_versions() -> list[dict]:
    with db() as conn:
        rows = conn.execute("SELECT * FROM model_versions ORDER BY created_at DESC").fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["metrics"] = json.loads(d.pop("metrics") or "{}")
        out.append(d)
    return out


def set_model_status(model_id: str, status: str) -> None:
    if status not in MODEL_STATUSES:
        raise ValueError(f"unknown model status '{status}'")
    with db() as conn:
        # Only one model may be ACTIVE at a time; promoting one archives the previous.
        if status == "ACTIVE":
            conn.execute("UPDATE model_versions SET status = 'ARCHIVED' WHERE status = 'ACTIVE'")
        conn.execute("UPDATE model_versions SET status = ? WHERE id = ?", (status, model_id))


def active_model_version() -> dict | None:
    with db() as conn:
        row = conn.execute("SELECT * FROM model_versions WHERE status = 'ACTIVE'").fetchone()
    if not row:
        return None
    d = dict(row)
    d["metrics"] = json.loads(d.pop("metrics") or "{}")
    return d


# ------------------------------------------------------------------ experiments


def next_experiment_id() -> str:
    with db() as conn:
        n = conn.execute("SELECT COUNT(*) c FROM experiments").fetchone()["c"]
    return f"EXP-{n + 1:03d}"


def add_experiment(rec: dict) -> str:
    eid = rec.get("id") or next_experiment_id()
    with db() as conn:
        conn.execute(
            """INSERT INTO experiments
               (id, run_id, created_at, dataset_version, model, hyperparams, augmentation,
                status, checkpoint, model_version, metrics)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                eid,
                rec["run_id"],
                rec.get("created_at") or now(),
                rec.get("dataset_version"),
                rec.get("model") or "efficientnet_b0",
                json.dumps(rec.get("hyperparams") or {}),
                json.dumps(rec.get("augmentation") or {}),
                rec.get("status") or "completed",
                rec.get("checkpoint"),
                rec.get("model_version"),
                json.dumps(rec.get("metrics") or {}),
            ),
        )
    return eid


def list_experiments() -> list[dict]:
    with db() as conn:
        rows = conn.execute("SELECT * FROM experiments ORDER BY created_at DESC").fetchall()
    out = []
    for r in rows:
        d = dict(r)
        for k in ("hyperparams", "augmentation", "metrics"):
            d[k] = json.loads(d.pop(k) or "{}")
        out.append(d)
    return out


# ------------------------------------------------- predictions log / analytics


def review_stats() -> dict:
    """Queue counters by review status. Pending is derived live from the
    queue definition; the rest count stored reviewer verdicts."""
    with db() as conn:
        by_status = {
            r['status']: r['c']
            for r in conn.execute(
                "SELECT status, COUNT(*) c FROM corrections WHERE source = 'review' GROUP BY status"
            )
        }
    pending = len(review_queue(10000))
    return {
        'pending': pending,
        'verified': by_status.get('verified', 0),
        'rejected': by_status.get('rejected', 0),
        'uncertain': by_status.get('uncertain', 0),
    }


def query_predictions(
    limit: int = 200,
    model: str | None = None,
    cls: str | None = None,
    min_conf: float | None = None,
    max_conf: float | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    feedback: str | None = None,
) -> list[dict]:
    """Real prediction log with filters. feedback: correct|incorrect|none."""
    where, params = [], []
    if model:
        where.append("model_version = ?")
        params.append(model)
    if cls:
        where.append("predicted_class = ?")
        params.append(cls)
    if min_conf is not None:
        where.append("confidence >= ?")
        params.append(min_conf)
    if max_conf is not None:
        where.append("confidence <= ?")
        params.append(max_conf)
    if date_from:
        where.append("created_at >= ?")
        params.append(date_from)
    if date_to:
        where.append("created_at <= ?")
        params.append(date_to)
    if feedback == "correct":
        where.append("was_correct = 1")
    elif feedback == "incorrect":
        where.append("was_correct = 0")
    elif feedback == "none":
        where.append("was_correct IS NULL")
    q = "SELECT * FROM scans"
    if where:
        q += " WHERE " + " AND ".join(where)
    q += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    with db() as conn:
        return [_decode(r) for r in conn.execute(q, params)]


def prediction_analytics() -> dict:
    """All values computed from stored prediction + correction records."""
    with db() as conn:
        scans = conn.execute("SELECT COUNT(*) c FROM scans").fetchone()["c"]
        by_class = {
            r["predicted_class"]: r["c"]
            for r in conn.execute(
                "SELECT predicted_class, COUNT(*) c FROM scans GROUP BY predicted_class"
            )
        }
        avg_conf = conn.execute("SELECT AVG(confidence) a FROM scans").fetchone()["a"]
        low = conn.execute("SELECT COUNT(*) c FROM scans WHERE state = 'low'").fetchone()["c"]
        medium = conn.execute("SELECT COUNT(*) c FROM scans WHERE state = 'moderate'").fetchone()["c"]
        corrected = conn.execute(
            "SELECT COUNT(*) c FROM scans WHERE was_correct = 0"
        ).fetchone()["c"]
        with_feedback = conn.execute(
            "SELECT COUNT(*) c FROM scans WHERE was_correct IS NOT NULL"
        ).fetchone()["c"]
        models = {
            (r["model_version"] or "unknown"): r["c"]
            for r in conn.execute("SELECT model_version, COUNT(*) c FROM scans GROUP BY model_version")
        }
        lat_rows = conn.execute("SELECT latency FROM scans WHERE latency IS NOT NULL").fetchall()
    lat = []
    for r in lat_rows:
        try:
            v = json.loads(r["latency"])
            if isinstance(v, dict) and v.get("total_ms") is not None:
                lat.append(float(v["total_ms"]))
        except (ValueError, TypeError):
            continue
    return {
        "total_predictions": scans,
        "by_class": by_class,
        "by_model": models,
        "average_confidence": round(avg_conf, 4) if avg_conf is not None else None,
        "low_confidence": low,
        "moderate_confidence": medium,
        "corrected_predictions": corrected,
        "feedback_rate": round(with_feedback / scans, 4) if scans else None,
        "avg_inference_ms": round(sum(lat) / len(lat), 2) if lat else None,
        "latency_samples": len(lat),
    }


def dataset_candidates(limit: int = 200) -> list[dict]:
    """Verified reviewer labels eligible for a future dataset version.

    NEVER the test set: these are deployment-time images with human-verified
    labels, exported as candidates for the next dataset version only.
    """
    with db() as conn:
        rows = conn.execute(
            """SELECT c.*, s.image_path, s.confidence, s.model_version
               FROM corrections c LEFT JOIN scans s ON s.id = c.scan_id
               WHERE c.source = 'review' AND c.status = 'verified'
               ORDER BY c.created_at DESC LIMIT ?""",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def active_learning_queue(limit: int = 100) -> list[dict]:
    """Review queue enriched with honest priority signals (all measured)."""
    items = review_queue(limit)
    confusions: dict[str, int] = {}
    with db() as conn:
        for r in conn.execute(
            """SELECT predicted_class || '>' || COALESCE(corrected_class,'?') k, COUNT(*) c
               FROM scans WHERE was_correct = 0 GROUP BY k"""
        ):
            confusions[r["k"]] = r["c"]
    counts: dict[str, int] = {}
    with db() as conn:
        for r in conn.execute("SELECT predicted_class k, COUNT(*) c FROM scans GROUP BY k"):
            counts[r["k"]] = r["c"]
    total = sum(counts.values()) or 1
    out = []
    for s in items:
        reasons, priority = [], 0
        if s.get("state") == "low":
            reasons.append("low model confidence")
            priority += 3
        if s.get("was_correct") == 0:
            reasons.append(f"user said wrong (now {s.get('corrected_class')})")
            priority += 3
        share = counts.get(s["predicted_class"], 0) / total
        if share < 0.05:
            reasons.append("underrepresented predicted class")
            priority += 1
        key = f"{s['predicted_class']}>{s.get('corrected_class') or '?'}"
        if confusions.get(key, 0) >= 2:
            reasons.append("recurring confusion pattern")
            priority += 2
        if (s.get("source") or "") in ("simulation", "robot_api"):
            reasons.append("robot-relevant sample")
            priority += 1
        out.append({**s, "priority": priority, "reasons": reasons or ["needs a human label"]})
    out.sort(key=lambda d: (-d["priority"], d.get("created_at") or ""))
    return out


init_db()
