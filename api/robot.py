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
    "IDLE",
    "READY",
    "SCANNING",
    "CLASSIFYING",
    "OBJECT_DETECTED",
    "DECISION_READY",
    "MOVING",
    "PICKING",
    "SORTING",
    "RELEASING",
    "COMPLETED",
    "LOW_CONFIDENCE",
    "ERROR",
    "EMERGENCY_STOP",
)

# Motion phases the simulated arm performs after a SORT decision. These are
# animation stages, not hardware feedback - no physical arm is attached.
SIMULATED_MOTION_PHASES = ("MOVING", "PICKING", "RELEASING", "COMPLETED")


class RobotController:
    def __init__(self):
        self.state = "READY"
        self.emergency = False
        self.paused = False
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

    def sync_config(self) -> None:
        """Re-read the persisted bin map (thresholds are read live from config)."""
        self.bin_map = dict(config.BIN_MAP)

    def pause(self, paused: bool = True) -> dict:
        self.paused = paused
        if paused and not self.emergency:
            self.set_state("IDLE")
        elif not paused and self.state == "IDLE":
            self.set_state("READY")
        return self.status()

    def capabilities(self) -> dict:
        """What this interface can honestly claim to do today."""
        return {
            "classification": {
                "supported": True,
                "model": "efficientnet_b0",
                "detail": "whole-image classifier; returns class, confidence and top-k probabilities",
            },
            "object_detection": {
                "supported": False,
                "detail": "no detector is trained - bounding boxes are not available",
            },
            "position_estimate": {
                "supported": True,
                "method": "gradcam_activation_centroid",
                "detail": "coarse attention-weighted centroid from the classifier, not a detection box",
            },
            "explainability": {"supported": True, "method": "gradcam"},
            "confidence_gating": {
                "supported": True,
                "threshold": config.CONFIDENCE_THRESHOLD,
                "margin_threshold": config.MARGIN_THRESHOLD,
            },
            "hardware": {
                "supported": False,
                "mode": self.mode,
                "detail": "no physical robot is connected; commands are logged and simulated",
            },
            "ros2": {"supported": False, "detail": "interface is HTTP/JSON; a ROS2 bridge can wrap it"},
            "multi_object": {
                "supported": False,
                "detail": "multi-object detection planned - the classifier sees one whole image; "
                          "per-object boxes need a detector that is not trained yet",
            },
        }

    def health(self) -> dict:
        model_loaded = bool(getattr(self, "_model_loaded", False))
        return {
            "camera": {
                "status": "browser_side",
                "mode": self.mode,
                "detail": "no camera is attached to the controller; capture happens in the browser",
            },
            "ml_model": {"status": "loaded" if model_loaded else "not_loaded"},
            "inference_api": {"status": "online" if model_loaded else "offline"},
            "motor_controller": {
                "status": "simulated" if self.mode == "simulation" else ("online" if not self.emergency else "halted")
            },
            "object_sensor": {
                "status": "not_installed",
                "detail": "no detector is trained - the classifier reports no bounding boxes",
            },
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
            "interface": "SIMULATION",
            "hardware_connected": False,
            "paused": self.paused,
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
            "margin_threshold": config.MARGIN_THRESHOLD,
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
        from . import runtime_config

        runtime_config.save_bin_map(mapping)
        self.bin_map = dict(config.BIN_MAP)
        return self.bin_map


ROBOT = RobotController()


# ------------------------------------------------------- hardware abstraction


class RobotAdapter:
    """Hardware interface. Every method must report what it really did."""

    name = "base"

    def connect(self) -> dict:
        raise NotImplementedError

    def disconnect(self) -> dict:
        raise NotImplementedError

    def get_status(self) -> dict:
        raise NotImplementedError

    def send_command(self, command: dict) -> dict:
        raise NotImplementedError

    def stop(self) -> dict:
        raise NotImplementedError

    def get_telemetry(self) -> dict:
        raise NotImplementedError


class SimulationRobotAdapter(RobotAdapter):
    """Virtual arm: accepts SORT/HOLD commands, animates nothing physical,
    logs everything. All responses carry simulation=true."""

    name = "simulation"

    def __init__(self, controller: RobotController):
        self._c = controller
        self._connected = False

    def connect(self) -> dict:
        self._connected = True
        return {"connected": True, "simulation": True, "adapter": self.name,
                "note": "virtual connection - no hardware involved"}

    def disconnect(self) -> dict:
        self._connected = False
        return {"connected": False, "simulation": True, "adapter": self.name}

    def get_status(self) -> dict:
        return {"connected": self._connected, "simulation": True,
                "adapter": self.name, **self._c.status()}

    def send_command(self, command: dict) -> dict:
        if not self._connected:
            return {"accepted": False, "simulation": True,
                    "reason": "adapter not connected - call connect() first"}
        if self._c.emergency:
            return {"accepted": False, "simulation": True,
                    "reason": "emergency stop engaged"}
        db_log = command.get("action") in ("SORT", "HOLD_FOR_REVIEW", "BLOCKED_ESTOP", "NO_BIN_MAPPED")
        return {"accepted": db_log, "simulation": True, "actuated": False,
                "command": command,
                "note": "logged only - no physical arm exists to move"}

    def stop(self) -> dict:
        self._c.emergency_stop(True)
        return {"stopped": True, "simulation": True, "state": self._c.state}

    def get_telemetry(self) -> dict:
        return {"simulation": True, **self._c.status()["telemetry"]}


# Future physical backends implement RobotAdapter against real drivers:
# ROS2RobotAdapter, ArduinoRobotAdapter, RaspberryPiRobotAdapter.
# None exist yet - claiming otherwise would be fabrication.
ADAPTER = SimulationRobotAdapter(ROBOT)


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
