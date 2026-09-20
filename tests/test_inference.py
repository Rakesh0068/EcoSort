"""Serving-boundary tests: the inference/ package loads the real run-002
checkpoint and enforces the same confidence policy, with upload validation
driven by environment (serverless payload caps) rather than code changes.
"""

import io
import random

import pytest
from PIL import Image


def _noise_jpeg(seed: int = 5, size: int = 300) -> bytes:
    rnd = random.Random(seed)
    im = Image.frombytes('RGB', (size, size),
                         bytes(rnd.randrange(256) for _ in range(size * size * 3)))
    buf = io.BytesIO()
    im.save(buf, format='JPEG')
    return buf.getvalue()


def test_loader_serves_run002():
    from inference import loader

    info = loader.model_info()
    assert info['model'] == 'run-002'
    assert info['dataset'] == 'EcoSort Dataset v3'
    assert info['checkpoint'] and 'run-002' in info['checkpoint']


def test_prediction_facade_policy():
    from inference.prediction import predict_bytes
    from ml import config

    out = predict_bytes(_noise_jpeg())
    assert out['prediction']['class'] in config.CLASSES
    assert out['recommendation'] in ('normal', 'verify', 'hold')
    assert out['recommendation'] == ('hold' if out['prediction']['state'] == 'low'
                                     else 'verify' if out['prediction']['state'] == 'moderate'
                                     else 'normal')


def test_facade_rejects_garbage():
    from inference.prediction import predict_bytes

    with pytest.raises(ValueError):
        predict_bytes(b'not an image', 'x.jpg')
    with pytest.raises(ValueError):
        predict_bytes(b'', 'x.jpg')


def test_upload_cap_from_env(monkeypatch):
    from inference import preprocessing

    monkeypatch.setenv('MAX_UPLOAD_MB', 'nonsense')
    assert preprocessing.max_upload_bytes() == 12 * 1024 * 1024
    monkeypatch.setenv('MAX_UPLOAD_MB', '4')
    assert preprocessing.max_upload_bytes() == 4 * 1024 * 1024
    with pytest.raises(ValueError, match='exceeds'):
        preprocessing.decode_upload(b'\xff' * (5 * 1024 * 1024), 'x.jpg')


def test_filename_never_trusted():
    from inference.preprocessing import decode_upload

    pil, ext = decode_upload(_noise_jpeg(), '../../evil.exe')
    assert ext == '.jpg'
    assert pil.size[0] > 0
