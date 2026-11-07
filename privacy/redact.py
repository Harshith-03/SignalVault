"""PII redaction for DISPLAY and STORAGE only (teammate-owned). STUB with the final signature.

    redact(text: str, source: str = "transcript") -> RedactionResult

Never applied to the text the engine scores (spans must stay verbatim). Applied to:
private transcripts before they are stored/shown, card text, logs.

Must run fully offline. Suggested: regex rules first (emails, phones, ages -> bands, dates -> ISO week,
MRN/ID-like numbers), then a local NER (Presidio + spaCy model installed from a wheel, or GLiNER-PII)
for PERSON / LOCATION. Same person -> same tag within one document ([HCP-1], [PATIENT-1], [PERSON-2]).
Public-figure handling: in packet news/press, named clinicians are shown by ROLE in the UI.
"""
from __future__ import annotations

from engine.schema import RedactionResult


def redact(text: str, source: str = "transcript") -> RedactionResult:
    return RedactionResult(text=text, spans=[], counts={})  # STUB: no-op
