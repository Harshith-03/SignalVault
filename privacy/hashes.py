"""Fingerprints for the privacy page: which data files and which exact model produced the output.

    file_sha256(path) -> str
    model_digest(model) -> str | None     # from local Ollama /api/tags; None if Ollama is unreachable
"""
from __future__ import annotations

import hashlib
import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

from engine import config


def file_sha256(path) -> str:
    h = hashlib.sha256()
    with open(Path(path), "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def model_digest(model: str, base_url: Optional[str] = None, timeout: float = 1.5) -> Optional[str]:
    """Ask the LOCAL Ollama for the model's content digest. Never raises: the UI must not crash."""
    url = (base_url or config.OLLAMA_URL).rstrip("/") + "/api/tags"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            tags = json.loads(r.read().decode("utf-8"))
    except (OSError, urllib.error.URLError, ValueError):
        return None
    for m in tags.get("models", []):
        names = {m.get("name"), m.get("model")}
        if model in names or f"{model}:latest" in names:
            d = m.get("digest")
            return (d if str(d).startswith("sha256:") else f"sha256:{d}") if d else None
    return None
