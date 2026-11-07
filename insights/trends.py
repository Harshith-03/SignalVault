"""Sentiment trend report (CONTRACTS.md §5).

    build_trends(preds: list[EnrichedPrediction], stats: dict | None = None) -> list[TrendPoint]

Rules:
- Group by product × aspect × speaker × meta.week. Items with product 'both' count toward 'both'
  (the UI may also fold them into A and B; keep the raw grouping here).
- mean_polarity over NON-NULL aspects only. A week with no observations is ABSENT, never 0:
  we only ever emit cells that have observations, and never pad the calendar.
- n = number of observations; quotes = up to 3 with the largest |polarity|, newest first on ties.
- Items with no week (missing published date) or no product are skipped and counted in `stats`
  (and in LAST_STATS) so the API can say how much data the chart leaves out.
"""
from __future__ import annotations

from typing import Optional

from engine.schema import ASPECTS, EnrichedPrediction, TrendPoint, TrendQuote, iso_week

MAX_QUOTES = 3
LAST_STATS: dict[str, int] = {}


def build_trends(preds: list[EnrichedPrediction], stats: Optional[dict] = None) -> list[TrendPoint]:
    counts = {"items": len(preds), "observations": 0, "skipped_no_week": 0, "skipped_no_product": 0}
    cells: dict[tuple, list[tuple[EnrichedPrediction, object]]] = {}
    for p in preds:
        observed = [(a, getattr(p, a)) for a in ASPECTS if getattr(p, a) is not None]
        if not observed:
            continue
        week = p.meta.week or iso_week(p.meta.published)
        if not week:
            counts["skipped_no_week"] += 1
            continue
        if not p.meta.product:
            counts["skipped_no_product"] += 1
            continue
        for a, asp in observed:
            cells.setdefault((p.meta.product, a, asp.speaker, week), []).append((p, asp))
            counts["observations"] += 1

    out = []
    for (product, aspect, speaker, week), obs in sorted(cells.items()):
        newest_first = sorted(obs, key=lambda o: o[0].meta.published or "", reverse=True)
        strongest = sorted(newest_first, key=lambda o: abs(o[1].polarity), reverse=True)[:MAX_QUOTES]
        out.append(TrendPoint(
            product=product, aspect=aspect, speaker=speaker, week=week, n=len(obs),
            mean_polarity=round(sum(o[1].polarity for o in obs) / len(obs), 2),
            quotes=[TrendQuote(item_id=p.item_id, quote=asp.span, polarity=asp.polarity, url=p.meta.url,
                               published=p.meta.published) for p, asp in strongest]))
    LAST_STATS.clear()
    LAST_STATS.update(counts)
    if stats is not None:
        stats.update(counts)
    return out
