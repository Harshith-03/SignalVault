"""Sentiment trend report (teammate-owned). STUB with the final signature.

    build_trends(preds: list[EnrichedPrediction]) -> list[TrendPoint]

Rules (CONTRACTS.md §5):
- Group by product × aspect × speaker × meta.week. Items with product 'both' count toward 'both'
  (the UI may also fold them into A and B; keep the raw grouping here).
- mean_polarity over NON-NULL aspects only. A week with no observations is ABSENT, never 0.
- n = number of observations; quotes = up to 3 with the largest |polarity|, newest first on ties.
- Skip items with no week (missing published date) and say so in a counter the API can show.
"""
from __future__ import annotations

from engine.schema import EnrichedPrediction, TrendPoint


def build_trends(preds: list[EnrichedPrediction]) -> list[TrendPoint]:
    raise NotImplementedError("teammate: implement; until then the API serves fixtures/trends.sample.json")
