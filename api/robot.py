"""Robot control layer: state machine, confidence-gated sorting decisions,
telemetry and a simulation mode.

The simulator is honest by construction - it feeds real held-out dataset images
through the actual trained model and animates the resulting decisions. Positions
come from the Grad-CAM activation centroid, which is a real (if coarse) spatial
signal from a classifier, not a fabricated bounding box from a detector.
"""

from __future__ import annotations

import json
import random
import time
from pathlib import Path

from ml import config

VALID_STATES = (
    "READY",
    "SCANNING",
    "CLASSIFYING",
    "OBJECT_DETECTED",
    "SORTING",
    "COMPLETED",
    "LOW_CONFIDENCE",
    "ERROR",
    "EMERGENCY_STOP",
)


class RobotController:
    def __init__(self):
        self.state = "READY"
        self.emergency = False
        self.mode = "simulation"
        self.current: dict | None = None
        self.started_at = time.time()
        self.telemetry = {
            "objects_processed": 0,
            "sorted": 0,
            "held_for_review": 0,
            "rejected": 0,
            "errors": 0,
            "inference_ms_sum": 0.0,
            "inference_count": 0,
        }
        self.history: list[dict] = []
        self.bin_map = dict(config.BIN_MAP)

    def set_state(self, state: str) -> None:
        if state not in VALID_STATES:
            raise ValueError(f"invalid robot state: {state}")
        self.state = state

    def emergency_stop(self, engage: bool = True) -> dict:
        self.emergency = engage
        self.set_state("EMERGENCY_STOP" if engage else "READY")
        self.current = None
        return self.status()

    def reset(self) -> dict:
        self.emergency = False
        self.current = None
        self.set_state("READY")
        return self.status()

    def health(self) -> dict:
        model_loaded = bool(getattr(self, "_model_loaded", False))
        return {
            "camera": {"status": "online" if model_loaded else "degraded", "mode": self.mode},
            "ml_model": {"status": "loaded" if model_loaded else "not_loaded"},
            "inference_api": {"status": "online" if model_loaded else "offline"},
            "motor_controller": {
                "status": "simulated" if self.mode == "simulation" else ("online" if not self.emergency else "halted")
            },
            "object_sensor": {"status": "online" if model_loaded else "offline"},
            "emergency_stop": {"status": "engaged" if self.emergency else "ready"},
        }

    def status(self) -> dict:
        avg = (
            self.telemetry["inference_ms_sum"] / self.telemetry["inference_count"]
            if self.telemetry["inference_count"]
            else None
        )
        return {
            "state": self.state,
            "mode": self.mode,
            "emergency_stop": self.emergency,
            "uptime_seconds": round(time.time() - self.started_at, 1),
            "current_object": self.current,
            "telemetry": {
                **self.telemetry,
                "avg_inference_ms": round(avg, 2) if avg else None,
                "sort_rate": (
                    round(self.telemetry["sorted"] / self.telemetry["objects_processed"], 4)
                    if self.telemetry["objects_processed"]
                    else None
                ),
            },
            "recent": self.history[-20:][::-1],
            "bin_map": self.bin_map,
            "bins": sorted(set(self.bin_map.values())),
            "confidence_threshold": config.CONFIDENCE_THRESHOLD,
            "health": self.health(),
        }

    def decide(self, prediction: dict, source: str = "simulation") -> dict:
        """Turn a real model prediction into a robot decision.

        The confidence gate is the safety system: below threshold the arm does
        not actuate and the item is routed to human review instead.
        """
        self.telemetry["objects_processed"] += 1
        cls = prediction["prediction"]["class"]
        conf = prediction["prediction"]["confidence"]
        state = prediction["prediction"]["state"]
        target_bin = self.bin_map.get(cls)
        centroid = prediction["explainability"]["activation_centroid"]
        latency = prediction["timings_ms"].get("total_ms")

        if latency:
            self.telemetry["inference_ms_sum"] += latency
            self.telemetry["inference_count"] += 1

        if self.emergency:
            decision = "BLOCKED_ESTOP"
            reason = "Emergency stop engaged - no motion permitted."
            self.telemetry["rejected"] += 1
            self.set_state("EMERGENCY_STOP")
        elif target_bin is None:
            decision = "NO_BIN_MAPPED"
            reason = f"No bin configured for class '{cls}'."
            self.telemetry["errors"] += 1
            self.set_state("ERROR")
        elif conf < config.CONFIDENCE_THRESHOLD:
            decision = "HOLD_FOR_REVIEW"
            reason = (
                f"Confidence {conf * 100:.1f}% is below the "
                f"{config.CONFIDENCE_THRESHOLD * 100:.0f}% safety threshold."
            )
            self.telemetry["held_for_review"] += 1
            self.set_state("LOW_CONFIDENCE")
        else:
            decision = "SORT"
            reason = f"Confidence {conf * 100:.1f}% clears the threshold - routing to {target_bin}."
            self.telemetry["sorted"] += 1
            self.set_state("SORTING")

        record = {
            "timestamp": time.time(),
            "source": source,
            "class": cls,
            "display": prediction["prediction"]["display"],
            "confidence": conf,
            "confidence_state": state,
            "decision": decision,
            "reason": reason,
            "target_bin": target_bin,
            "bin_label": config.BIN_LABELS.get(target_bin) if target_bin else None,
            "centroid": centroid,
            "latency_ms": latency,
            "quality": prediction["input_quality"]["label"],
        }
        self.history.append(record)
        if len(self.history) > 500:
            self.history = self.history[-500:]

        if decision == "SORT":
            self.current = record
            self.set_state("COMPLETED")
        elif decision == "HOLD_FOR_REVIEW":
            self.current = record
        else:
            self.current = record

        return record

    def set_bin_map(self, mapping: dict) -> dict:
        unknown = [k for k in mapping if k not in config.CLASSES]
        if unknown:
            raise ValueError(f"unknown classes in bin map: {unknown}")
        self.bin_map.update(mapping)
        return self.bin_map


ROBOT = RobotController()


def sample_heldout_image(rng: random.Random | None = None) -> Path | None:
    """Pull a real image from the held-out test split for simulation."""
    manifest = config.SPLITS_DIR / "test.json"
    if not manifest.exists():
        return None
    rows = json.loads(manifest.read_text())
    if not rows:
        return None
    row = (rng or random).choice(rows)
    p = Path(row["path"])
    return p if p.exists() else None
