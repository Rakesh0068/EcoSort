"""Request-side preprocessing: byte validation shared by every upload path.

Limits: default 12 MB (MAX_UPLOAD_MB env override, e.g. 4 where serverless
payload caps apply). Only content that PIL can decode as RGB is accepted;
user filenames are never trusted for anything but an extension hint.
"""

from __future__ import annotations

import io
import os
from pathlib import Path

from PIL import Image, UnidentifiedImageError

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def max_upload_bytes() -> int:
    try:
        mb = float(os.environ.get("MAX_UPLOAD_MB", "12"))
    except ValueError:
        mb = 12
    return int(max(1, min(mb, 100)) * 1024 * 1024)


def decode_upload(raw: bytes, filename: str | None = None) -> tuple[Image.Image, str]:
    """Returns (RGB image, safe extension). Raises ValueError on any problem."""
    if not raw:
        raise ValueError("empty upload")
    if len(raw) > max_upload_bytes():
        raise ValueError(f"image exceeds {max_upload_bytes() // (1024 * 1024)} MB limit")
    ext = Path(filename or "upload.jpg").suffix.lower()
    if ext not in ALLOWED_EXT:
        ext = ".jpg"
    try:
        pil = Image.open(io.BytesIO(raw))
        pil.load()
        return pil.convert("RGB"), ext
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError(f"could not decode image: {exc}") from exc
