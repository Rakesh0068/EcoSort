"""Thin prediction facade: bytes in, serving payload out.

Keeps the exact confidence policy of ml.infer (thresholds read live from
ml.config): HIGH normal, MEDIUM verify, LOW hold. No training imports.
"""

from __future__ import annotations

from PIL import Image

from inference import loader


def predict_image(pil: Image.Image) -> dict:
    model = loader.get_model()
    result = model.predict(pil.convert("RGB"))
    state = result["prediction"]["state"]
    result["recommendation"] = (
        "normal" if state == "high"
        else "verify" if state == "moderate"
        else "hold"
    )
    return result


def predict_bytes(raw: bytes, filename: str | None = None) -> dict:
    from inference.preprocessing import decode_upload

    pil, _ext = decode_upload(raw, filename)
    return predict_image(pil)
