"""Shared test helpers. Every test runs offline; nothing here touches the network."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))

from engine.schema import AspectMeta, EnrichedPrediction, Meta, iso_week  # noqa: E402

TRANSCRIPTS = REPO / "fixtures" / "transcripts"


def make_pred(item_id="T-1", signal="efficacy", actionable="yes", source="news", product="A",
              published="2026-03-10", title="", why="", flags=(), sig_conf=0.9, act_conf=0.9,
              text=None, aspects=None, review_status="auto") -> EnrichedPrediction:
    """aspects: {name: (polarity, speaker, span)}; offsets are located in `text` when given."""
    aspects = aspects or {}
    body, meta_aspects = {}, {}
    for name, (pol, spk, span) in aspects.items():
        body[name] = {"polarity": pol, "speaker": spk, "span": span}
        start = text.find(span) if text else 0
        meta_aspects[name] = AspectMeta(start=start, end=start + len(span), confidence=0.8, origin="llm")
    return EnrichedPrediction(
        item_id=item_id, signal_type=signal, actionable=actionable, **body,
        meta=Meta(source=source, published=published, week=iso_week(published), product=product, title=title,
                  url=f"https://example.org/{item_id}", signal_confidence=sig_conf, actionable_confidence=act_conf,
                  aspects=meta_aspects, review_status=review_status, why_actionable=why, flags=list(flags),
                  model="test-model", prompt_version="t1"))


@pytest.fixture
def transcripts() -> dict[str, str]:
    return {p.name: p.read_text(encoding="utf-8") for p in sorted(TRANSCRIPTS.glob("*.txt"))}
