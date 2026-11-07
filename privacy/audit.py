"""Tamper-evident audit log (teammate-owned). STUB with the final signature.

    append(pred: EnrichedPrediction, item_text: str, run_id: str) -> AuditRecord
    verify_chain(path=None) -> tuple[bool, int]      # (chain ok?, number of records)

Writes outputs/audit.jsonl. Each record stores sha256(item_text), never the text itself, and
prev_hash = sha256 of the previous line, so editing any line breaks the chain.
"""
from __future__ import annotations

from engine.schema import AuditRecord, EnrichedPrediction


def append(pred: EnrichedPrediction, item_text: str, run_id: str) -> AuditRecord:
    raise NotImplementedError


def verify_chain(path=None) -> tuple[bool, int]:
    return (True, 0)  # STUB
