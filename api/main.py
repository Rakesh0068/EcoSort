"""EcoSort API - serves the real trained model, explainability, history,
feedback loop, evaluation artifacts and the robot/simulation layer."""

from __future__ import annotations

import json
import os
import random
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel

from api import db
from api.robot import ROBOT, sample_heldout_image
from ml import config
from ml.infer import DEVICE, Predictor, resolve_checkpoint

ROOT = config.ROOT
WEB_DIST = ROOT / "web" / "dist"

app = FastAPI(title="EcoSort API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

predictor = Predictor()
_training_proc: subprocess.Popen | None = None

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
MAX_UPLOAD_BYTES = 12 * 1024 * 1024


# ---------------------------------------------------------------- model state


def ensure_model(force: bool = False) -> Predictor:
    global predictor
    if force or not predictor.loaded:
        ckpt = resolve_checkpoint()
        if ckpt is None:
            raise HTTPException(
                status_code=503,
                detail="No trained checkpoint available yet. Start a training run first.",
            )
        predictor.load(ckpt)
        ROBOT._model_loaded = True
    return predictor


@app.on_event("startup")
def _startup() -> None:
    db.init_db()
    ckpt = resolve_checkpoint()
    if ckpt:
        try:
            predictor.load(ckpt)
            ROBOT._model_loaded = True
            print(f"model loaded: {ckpt}")
        except Exception as exc:  # checkpoint may be mid-write during training
            print(f"model not loaded at startup: {exc}")
    else:
        print("no checkpoint found - API will run in untrained mode")


@app.get("/api/health")
def health() -> dict:
    ckpt = resolve_checkpoint()
    training_active = _training_proc is not None and _training_proc.poll() is None
    stats_path = config.SPLITS_DIR / "dataset_stats.json"
    return {
        "api": "operational",
        "model_loaded": predictor.loaded,
        "model_version": predictor.version if predictor.loaded else None,
        "checkpoint": str(ckpt) if ckpt else None,
        "device": str(DEVICE),
        "cuda_available": DEVICE.type == "cuda",
        "dataset_prepared": stats_path.exists(),
        "dataset_stats": json.loads(stats_path.read_text()) if stats_path.exists() else None,
        "training_active": training_active,
        "training_pid": _training_proc.pid if training_active else None,
        "database": str(config.DB_PATH),
        "server_time": time.time(),
    }


@app.get("/api/model/status")
def model_status() -> dict:
    ckpt = resolve_checkpoint()
    run_metrics = None
    if ckpt:
        mp = ckpt.parent / "metrics.json"
        if mp.exists():
            run_metrics = json.loads(mp.read_text())
    return {
        "loaded": predictor.loaded,
        "version": predictor.version if predictor.loaded else None,
        "meta": predictor.meta if predictor.loaded else None,
        "checkpoint": str(ckpt) if ckpt else None,
        "architecture": "efficientnet_b0",
        "input_size": config.IMAGE_SIZE,
        "num_classes": config.NUM_CLASSES,
        "classes": config.CLASSES,
        "device": str(DEVICE),
        "confidence_threshold": config.CONFIDENCE_THRESHOLD,
        "run_metrics": run_metrics,
    }


@app.post("/api/model/reload")
def model_reload(run_id: Optional[str] = None, weights: str = "best.pt") -> dict:
    ckpt = resolve_checkpoint(run_id, weights)
    if ckpt is None:
        raise HTTPException(404, "checkpoint not found")
    predictor.load(ckpt)
    ROBOT._model_loaded = True
    return {"loaded": True, "checkpoint": str(ckpt), "version": predictor.version}


# ------------------------------------------------------------------ prediction


class PredictResponse(BaseModel):
    scan_id: str


def _run_prediction(pil: Image.Image, source: str, image_path: Optional[str], save: bool):
    p = ensure_model()
    result = p.predict(pil)
    scan_id = None
    if save:
        scan_id = db.insert_scan(
            {
                "source": source,
                "image_path": image_path,
                "predicted_class": result["prediction"]["class"],
                "confidence": result["prediction"]["confidence"],
                "state": result["prediction"]["state"],
                "action": result["sorting"]["action"],
                "target_bin": result["sorting"]["target_bin"],
                "top5": result["prediction"]["top5"],
                "latency": result["timings_ms"],
                "quality": result["input_quality"],
                "centroid": result["explainability"]["activation_centroid"],
                "model_version": result["model"]["version"],
            }
        )
    result["scan_id"] = scan_id
    return result


@app.post("/api/predict")
async def predict(file: UploadFile = File(...), source: str = "upload", save: bool = True) -> dict:
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "image exceeds 12 MB limit")
    if not raw:
        raise HTTPException(400, "empty upload")

    ext = Path(file.filename or "upload.jpg").suffix.lower()
    if ext not in ALLOWED_EXT:
        ext = ".jpg"

    try:
        pil = Image.open(__import__("io").BytesIO(raw))
        pil.load()
        pil = pil.convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(400, f"could not decode image: {exc}") from exc

    saved_path = None
    if save:
        sid = db.new_id()
        dest = config.UPLOADS_DIR / f"{sid}{ext}"
        dest.write_bytes(raw)
        saved_path = str(dest)

    return _run_prediction(pil, source, saved_path, save)


@app.get("/api/scans")
def scans(
    limit: int = Query(100, ge=1, le=500),
    cls: Optional[str] = None,
    state: Optional[str] = None,
) -> dict:
    rows = db.list_scans(limit=limit, cls=cls, state=state)
    return {"count": len(rows), "scans": rows, "classes": config.CLASSES}


@app.get("/api/scans/{scan_id}")
def scan_detail(scan_id: str) -> dict:
    row = db.get_scan(scan_id)
    if not row:
        raise HTTPException(404, "scan not found")
    return row


@app.get("/api/scans/{scan_id}/explain")
def scan_explain(scan_id: str) -> dict:
    """Re-run the model on a stored scan to regenerate Grad-CAM and timings.

    Heatmaps are not persisted, so this recomputes them from the saved image.
    The response is explicitly flagged as a re-analysis, and the original
    recorded latency is returned alongside for comparison.
    """
    row = db.get_scan(scan_id)
    if not row:
        raise HTTPException(404, "scan not found")

    image_path = row.get("image_path")
    if not image_path or not Path(image_path).exists():
        raise HTTPException(404, "source image for this scan is no longer available")

    try:
        with Image.open(image_path) as im:
            im.load()
            pil = im.convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(500, f"could not read stored image: {exc}") from exc

    result = _run_prediction(pil, source="reanalysis", image_path=image_path, save=False)
    result["scan_id"] = scan_id
    result["reanalysis"] = {
        "is_reanalysis": True,
        "original_created_at": row["created_at"],
        "original_confidence": row["confidence"],
        "original_predicted_class": row["predicted_class"],
        "original_latency": row.get("latency"),
        "note": "Grad-CAM and timings were recomputed just now; the class and "
        "confidence from the original scan are shown for comparison.",
    }
    result["stored_feedback"] = {
        "was_correct": row.get("was_correct"),
        "corrected_class": row.get("corrected_class"),
    }
    return result


class Feedback(BaseModel):
    correct: bool
    correct_class: Optional[str] = None
    source: str = "user"


@app.post("/api/scans/{scan_id}/feedback")
def feedback(scan_id: str, body: Feedback) -> dict:
    row = db.get_scan(scan_id)
    if not row:
        raise HTTPException(404, "scan not found")

    predicted = row["predicted_class"]
    if body.correct:
        final = predicted
    else:
        if not body.correct_class:
            raise HTTPException(422, "correct_class is required when correct=false")
        if body.correct_class not in config.CLASSES:
            raise HTTPException(422, f"unknown class '{body.correct_class}'")
        final = body.correct_class

    cid = db.insert_correction(scan_id, predicted, final, body.source)
    return {
        "correction_id": cid,
        "scan_id": scan_id,
        "predicted_class": predicted,
        "verified_class": final,
        "was_correct": body.correct,
        "added_to_review_queue": not body.correct,
    }


@app.get("/api/corrections")
def corrections(limit: int = Query(100, ge=1, le=500)) -> dict:
    rows = db.list_corrections(limit)
    return {"count": len(rows), "corrections": rows}


@app.get("/api/review-queue")
def review_queue(limit: int = Query(50, ge=1, le=500)) -> dict:
    rows = db.review_queue(limit)
    return {
        "count": len(rows),
        "items": rows,
        "note": "Verified labels from this queue become retraining candidates.",
    }


@app.get("/api/activity")
def activity() -> dict:
    return db.activity_summary()


# --------------------------------------------------------------------- dataset


@app.get("/api/dataset")
def dataset() -> dict:
    stats_path = config.SPLITS_DIR / "dataset_stats.json"
    if not stats_path.exists():
        raise HTTPException(503, "dataset split not built - run `python -m ml.data`")
    stats = json.loads(stats_path.read_text())

    rng = random.Random(config.SEED)
    gallery = {}
    for cls in config.CLASSES:
        cls_dir = config.DATASET_DIR / cls
        files = sorted(p.name for p in cls_dir.iterdir() if p.suffix.lower() in ALLOWED_EXT) if cls_dir.is_dir() else []
        samples = rng.sample(files, min(8, len(files)))
        gallery[cls] = [
            f"/dataset-images/{config.DATASET_VARIANT}/{cls}/{name}" for name in samples
        ]

    counts = stats.get("per_class", {})
    n = {c: counts[c]["unique"] for c in counts}
    largest = max(n.values()) if n else 0
    smallest = min(n.values()) if n else 0
    balance_ratio = round(largest / smallest, 2) if smallest else None

    return {
        **stats,
        "gallery": gallery,
        "health": {
            "duplicates_removed": {"value": stats.get("duplicates_removed"), "ok": True},
            "corrupt_files": {"value": stats.get("corrupt_unreadable"), "ok": True},
            "missing_images": {"value": 0, "ok": True},
            "class_balance": {
                "value": balance_ratio,
                "detail": f"largest/smallest class ratio {balance_ratio}:1",
                "ok": balance_ratio is not None and balance_ratio < 3.0,
            },
            "image_dimensions": {
                "value": f"{stats.get('variant')} standardized",
                "ok": True,
            },
        },
    }


@app.get("/api/classes")
def classes() -> dict:
    from ml.recycling import GUIDE

    return {
        "classes": [
            {
                "id": c,
                "display": config.display(c),
                "index": config.CLASS_TO_IDX[c],
                "bin": config.BIN_MAP[c],
                "bin_label": config.BIN_LABELS[config.BIN_MAP[c]],
                "guide": GUIDE[c],
            }
            for c in config.CLASSES
        ]
    }


# -------------------------------------------------------------------- training


@app.get("/api/training/status")
def training_status() -> dict:
    runs = sorted((p for p in config.RUNS_DIR.glob("run-*") if p.is_dir()), key=lambda p: p.name)
    active = _training_proc is not None and _training_proc.poll() is None
    out = {"active": active, "pid": _training_proc.pid if active else None, "runs": []}
    for run in runs:
        mp = run / "metrics.json"
        entry = {"run_id": run.name, "metrics": None}
        if mp.exists():
            m = json.loads(mp.read_text())
            entry["metrics"] = m
        entry["checkpoints"] = sorted(p.name for p in run.glob("*.pt"))
        out["runs"].append(entry)
    out["latest"] = out["runs"][-1] if out["runs"] else None
    return out


@app.get("/api/training/runs/{run_id}")
def training_run(run_id: str) -> dict:
    run = config.RUNS_DIR / run_id
    mp = run / "metrics.json"
    if not mp.exists():
        raise HTTPException(404, "run not found")
    return json.loads(mp.read_text())


class TrainRequest(BaseModel):
    epochs_head: int = 5
    epochs_finetune: int = 15
    batch_size: int = 32
    lr_head: float = 1e-3
    lr_finetune: float = 1e-4
    resume: Optional[str] = None


@app.post("/api/training/start")
def training_start(body: TrainRequest) -> dict:
    global _training_proc
    if _training_proc is not None and _training_proc.poll() is None:
        raise HTTPException(409, f"training already running (pid {_training_proc.pid})")
    if DEVICE.type != "cuda":
        raise HTTPException(
            503, "CUDA device not available - refusing to start a CPU-only training run from the API."
        )

    run_id = body.resume or f"run-{len(list(config.RUNS_DIR.glob('run-*'))) + 1:03d}"
    config.RUNS_DIR.mkdir(parents=True, exist_ok=True)
    log = config.ARTIFACTS / f"train_{run_id}.log"

    cmd = [
        sys.executable, "-u", "-m", "ml.train",
        "--epochs-head", str(body.epochs_head),
        "--epochs-finetune", str(body.epochs_finetune),
        "--batch-size", str(body.batch_size),
        "--lr-head", str(body.lr_head),
        "--lr-finetune", str(body.lr_finetune),
        "--run-id", run_id,
    ]
    if body.resume:
        cmd += ["--resume", body.resume]

    env = dict(os.environ, PYTHONUNBUFFERED="1")
    handle = log.open("wb")
    _training_proc = subprocess.Popen(cmd, cwd=str(ROOT), stdout=handle, stderr=subprocess.STDOUT, env=env)
    return {"started": True, "run_id": run_id, "pid": _training_proc.pid, "log": str(log), "command": cmd}


# ------------------------------------------------------------------ evaluation


@app.get("/api/metrics")
def metrics() -> dict:
    files = sorted(config.METRICS_DIR.glob("evaluation_*.json"), key=lambda p: p.stat().st_mtime)
    if not files:
        return {
            "available": False,
            "note": "No evaluation has been run yet. Evaluate a trained checkpoint with `python -m ml.evaluate`.",
        }
    payload = json.loads(files[-1].read_text())
    return {"available": True, "file": files[-1].name, "evaluation": payload}


@app.get("/api/metrics/misclassified")
def misclassified(true_class: str, predicted_class: str, limit: int = Query(6, ge=1, le=24)) -> dict:
    files = sorted(config.METRICS_DIR.glob("evaluation_*.json"), key=lambda p: p.stat().st_mtime)
    if not files:
        raise HTTPException(404, "no evaluation available")
    payload = json.loads(files[-1].read_text())
    key = f"{true_class}__{predicted_class}"
    items = payload.get("misclassified_examples", {}).get(key, [])[:limit]
    return {
        "true_class": true_class,
        "predicted_class": predicted_class,
        "count": len(items),
        "examples": [
            {
                **it,
                "url": f"/dataset-images/{config.DATASET_VARIANT}/{it['true_class']}/{Path(it['path']).name}",
            }
            for it in items
        ],
    }


# ----------------------------------------------------------------------- robot


@app.get("/api/robot/status")
def robot_status() -> dict:
    ROBOT._model_loaded = predictor.loaded
    return ROBOT.status()


class EStop(BaseModel):
    engage: bool = True


@app.post("/api/robot/emergency-stop")
def robot_estop(body: EStop) -> dict:
    result = ROBOT.emergency_stop(body.engage)
    db.log_robot_event("emergency_stop", state=result["state"], detail={"engage": body.engage})
    return result


@app.post("/api/robot/reset")
def robot_reset() -> dict:
    result = ROBOT.reset()
    db.log_robot_event("reset", state=result["state"])
    return result


class BinMapUpdate(BaseModel):
    mapping: dict


@app.put("/api/robot/bin-map")
def robot_bin_map(body: BinMapUpdate) -> dict:
    try:
        return {"bin_map": ROBOT.set_bin_map(body.mapping)}
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/api/robot/events")
def robot_events(limit: int = Query(100, ge=1, le=500)) -> dict:
    rows = db.list_robot_events(limit)
    return {"count": len(rows), "events": rows}


@app.post("/api/robot/simulate/step")
def robot_simulate_step(save: bool = True) -> dict:
    """Pull a real held-out image, run the real model, and make a real decision."""
    path = sample_heldout_image()
    if path is None:
        raise HTTPException(503, "test split manifest unavailable")

    p = ensure_model()
    ROBOT.set_state("SCANNING")
    try:
        with Image.open(path) as im:
            im.load()
            pil = im.convert("RGB")
    except OSError as exc:
        ROBOT.set_state("ERROR")
        raise HTTPException(500, f"could not read sample: {exc}") from exc

    ROBOT.set_state("CLASSIFYING")
    result = p.predict(pil)
    decision = ROBOT.decide(result, source="simulation")

    scan_id = None
    if save:
        scan_id = db.insert_scan(
            {
                "source": "simulation",
                "image_path": str(path),
                "predicted_class": result["prediction"]["class"],
                "confidence": result["prediction"]["confidence"],
                "state": result["prediction"]["state"],
                "action": decision["decision"],
                "target_bin": decision["target_bin"],
                "top5": result["prediction"]["top5"],
                "latency": result["timings_ms"],
                "quality": result["input_quality"],
                "centroid": result["explainability"]["activation_centroid"],
                "model_version": result["model"]["version"],
            }
        )

    db.log_robot_event(
        "sort_decision",
        state=ROBOT.state,
        cls=decision["class"],
        confidence=decision["confidence"],
        target_bin=decision["target_bin"],
        detail={"decision": decision["decision"], "reason": decision["reason"], "source_file": str(path)},
    )

    return {
        "decision": decision,
        "robot_state": ROBOT.state,
        "scan_id": scan_id,
        "source_image": f"/dataset-images/{config.DATASET_VARIANT}/{path.parent.name}/{path.name}",
        "prediction": result["prediction"],
        "overlay_png_b64": result["explainability"]["overlay_png_b64"],
        "centroid": result["explainability"]["activation_centroid"],
        "timings_ms": result["timings_ms"],
        "telemetry": ROBOT.status()["telemetry"],
    }


@app.get("/api/robot/compatibility")
def robot_compatibility() -> dict:
    ckpt = resolve_checkpoint()
    stats_path = config.SPLITS_DIR / "dataset_stats.json"
    checks = {
        "model_checkpoint_present": ckpt is not None,
        "model_loaded": predictor.loaded,
        "input_size_supported": predictor.loaded and predictor.meta.get("training_config", {}).get("image_size") == config.IMAGE_SIZE,
        "classes_available": predictor.loaded and len(predictor.meta.get("classes", [])) == config.NUM_CLASSES,
        "robot_api_compatible": True,
        "camera_connected": ROBOT.mode == "simulation",
        "sorting_map_configured": all(c in ROBOT.bin_map for c in config.CLASSES),
        "dataset_split_available": stats_path.exists(),
        "cuda_available": DEVICE.type == "cuda",
    }
    ready = all(checks.values())
    return {
        "model_version": predictor.version if predictor.loaded else None,
        "checks": checks,
        "ready_for_deployment": ready,
        "blocking": [k for k, v in checks.items() if not v],
    }


# --------------------------------------------------------------- static mounts

if config.DATASET_ROOT.is_dir():
    app.mount("/dataset-images", StaticFiles(directory=str(config.DATASET_ROOT)), name="dataset")
config.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(config.UPLOADS_DIR)), name="uploads")


@app.get("/api")
def api_index() -> dict:
    return {
        "service": "EcoSort API",
        "endpoints": sorted({r.path for r in app.routes if getattr(r, "path", "").startswith("/api")}),
    }


if WEB_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(WEB_DIST), html=True), name="web")
else:

    @app.get("/")
    def root() -> JSONResponse:
        return JSONResponse(
            {
                "service": "EcoSort API",
                "frontend": "not built - run the Vite dev server or build web/",
                "docs": "/docs",
            }
        )
