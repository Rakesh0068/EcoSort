"""Real hardware probes.

Nothing here is simulated: if a probe fails, times out or the driver misbehaves
we report exactly that instead of guessing a status.
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout

_EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="hw-probe")


def _open_camera(index: int) -> dict:
    import cv2

    started = time.perf_counter()
    cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
    try:
        if not cap.isOpened():
            return {"status": "offline", "device_index": index, "detail": "device did not open"}
        ok, frame = cap.read()
        if not ok or frame is None:
            return {
                "status": "offline",
                "device_index": index,
                "detail": "device opened but returned no frame",
            }
        h, w = frame.shape[:2]
        return {
            "status": "online",
            "device_index": index,
            "resolution": [int(w), int(h)],
            "probe_ms": round((time.perf_counter() - started) * 1000, 1),
            "probed_at": time.time(),
        }
    finally:
        cap.release()


def probe_camera(index: int = 0, timeout: float = 8.0) -> dict:
    """Try to open a local camera and grab one frame. Blocks the caller for at
    most `timeout` seconds; the probe itself runs on a worker thread so a stuck
    driver cannot wedge the API event loop."""
    future = _EXECUTOR.submit(_open_camera, index)
    try:
        return future.result(timeout=timeout)
    except FutureTimeout:
        return {"status": "unknown", "device_index": index, "detail": f"probe exceeded {timeout:.0f}s"}
    except Exception as exc:
        return {"status": "unknown", "device_index": index, "detail": f"{type(exc).__name__}: {exc}"}
