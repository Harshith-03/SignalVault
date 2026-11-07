"""Tamper-evident audit log.

    append(pred: EnrichedPrediction, item_text: str, run_id: str, path=None) -> AuditRecord
    verify_chain(path=None) -> tuple[bool, int]      # (chain ok?, number of records)

Writes outputs/audit.jsonl. Each record stores sha256(item_text), never the text itself, and no
quotes: aspects keep only polarity, speaker and offsets. prev_hash = sha256 of the previous line, so
editing or deleting any line breaks the chain. The last line has no successor to vouch for it, so
we also keep its hash in `audit.jsonl.head`; verify_chain checks that too.

Honest scope: tamper-EVIDENT, not tamper-proof. Someone who rewrites the whole file and the head
can forge a consistent chain; the UI shows the head hash so it can be written down or anchored.
"""
from __future__ import annotations

import hashlib
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from engine import config
from engine.schema import ASPECTS, AuditRecord, EnrichedPrediction

_LOCK = threading.Lock()


def default_path() -> Path:
    return Path(config.OUTPUTS) / "audit.jsonl"     # resolved per call, so tests can point OUTPUTS elsewhere


def _sha(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _head_path(path: Path) -> Path:
    return path.with_name(path.name + ".head")


def _lines(path: Path) -> list[str]:
    if not path.exists():
        return []
    with open(path, encoding="utf-8", newline="") as f:
        return [line.rstrip("\r\n") for line in f if line.strip()]


def append(pred: EnrichedPrediction, item_text: str, run_id: str, path: Optional[Path] = None) -> AuditRecord:
    path = Path(path) if path else default_path()
    aspects = {}
    for a in ASPECTS:
        asp = getattr(pred, a)
        if asp is not None:
            m = pred.meta.aspects.get(a)
            aspects[a] = {"polarity": asp.polarity, "speaker": asp.speaker,
                          "start": m.start if m else None, "end": m.end if m else None}
    with _LOCK:
        lines = _lines(path)
        rec = AuditRecord(ts=datetime.now(timezone.utc).isoformat(timespec="seconds"), run_id=run_id,
                          item_id=pred.item_id, input_sha256=_sha(item_text or ""), source=pred.meta.source,
                          model=pred.meta.model, prompt_version=pred.meta.prompt_version,
                          rule_hits=list(pred.meta.rule_hits), signal_type=pred.signal_type,
                          actionable=pred.actionable, aspects=aspects, review_status=pred.meta.review_status,
                          prev_hash=_sha(lines[-1]) if lines else "")
        line = rec.model_dump_json()
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8", newline="\n") as f:
            f.write(line + "\n")
        _head_path(path).write_text(_sha(line), encoding="utf-8")
    return rec


def verify_chain(path=None) -> tuple[bool, int]:
    """Re-hash every line. (True, 0) for a missing/empty log: nothing to contradict."""
    path = Path(path) if path else default_path()
    lines = _lines(path)
    prev = ""
    for line in lines:
        try:
            rec = AuditRecord.model_validate_json(line)
        except ValueError:
            return False, len(lines)
        if rec.prev_hash != prev:
            return False, len(lines)
        prev = _sha(line)
    head = _head_path(path)
    if lines and head.exists() and head.read_text(encoding="utf-8").strip() != prev:
        return False, len(lines)
    return True, len(lines)


def head_hash(path=None) -> Optional[str]:
    """sha256 of the last record line (what the UI can display as the chain head)."""
    lines = _lines(Path(path) if path else default_path())
    return _sha(lines[-1]) if lines else None
