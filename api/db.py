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
from pathlib import Path

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


def new_id() -> str:
    return uuid.uuid4().hex[:16]


def now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def insert_scan(row: dict) -> str:
    sid = row.get("id") or new_id()
    with db() as conn:
        conn.execute(
            """INSERT INTO scans (id, created_at, source, image_path, predicted_class, confidence,
               state, action, target_bin, top5, latency, quality, centroid, model_version)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
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


def insert_correction(scan_id: str | None, predicted: str, correct: str, source: str = "user") -> str:
    cid = new_id()
    with db() as conn:
        conn.execute(
            """INSERT INTO corrections (id, scan_id, created_at, predicted_class, correct_class, source, verified)
               VALUES (?,?,?,?,?,?,?)""",
            (cid, scan_id, now(), predicted, correct, source, 1 if predicted == correct else 0),
        )
        if scan_id:
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


init_db()
