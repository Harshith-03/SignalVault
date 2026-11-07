"""Public engine API (lead-owned). STUB: returns deterministic mock output so the app can be built now.

Contract (do not change signatures):
    analyze_item(item: Item) -> EnrichedPrediction
    analyze_text(req: AnalyzeRequest) -> EnrichedPrediction   # transcripts / pasted text from the UI

The real version is a LangGraph workflow:
    route_by_source ─┬─ rules (ctgov / fda_event / fda_label / fda_notice)
                     └─ llm_label (≤ local Ollama model, JSON schema)
                 ─► verify spans ─► repair (≤ MAX_ATTEMPTS) ─► confidence_route ─► EnrichedPrediction
"""
from __future__ import annotations

import hashlib
from datetime import date

from .schema import AnalyzeRequest, Aspect, AspectMeta, EnrichedPrediction, Item, Meta, iso_week

STUB = True


def analyze_item(item: Item) -> EnrichedPrediction:
    """STUB. Picks the first sentence as an efficacy span so the UI has something real-shaped to render."""
    text = item.text or ""
    first = text.split(". ")[0][:120]
    start = text.find(first) if first else -1
    aspects, meta_aspects = {}, {}
    if first and start >= 0:
        aspects["efficacy"] = Aspect(polarity=1, speaker="researcher", span=first)
        meta_aspects["efficacy"] = AspectMeta(start=start, end=start + len(first), confidence=0.5, origin="llm")
    return EnrichedPrediction(
        item_id=item.item_id, signal_type="efficacy", actionable="no", **aspects,
        meta=Meta(source=item.source, published=item.published, week=iso_week(item.published),
                  product=item.product, title=item.title, url=item.url, signal_confidence=0.5,
                  actionable_confidence=0.5, aspects=meta_aspects, review_status="review",
                  why_actionable="STUB output: engine not wired yet.", uncertainty="stub",
                  model="stub", prompt_version="stub"),
    )


def analyze_text(req: AnalyzeRequest) -> EnrichedPrediction:
    item_id = "TX-" + hashlib.sha256(req.text.encode()).hexdigest()[:10]
    return analyze_item(Item(item_id=item_id, source=req.source, title=req.title, product=req.product,
                             published=req.published or date.today().isoformat(), text=req.text))
