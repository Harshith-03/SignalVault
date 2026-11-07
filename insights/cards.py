"""Insight cards (teammate-owned). STUB with the final signature.

    build_cards(preds: list[EnrichedPrediction]) -> list[Card]

Rules to implement (see CONTRACTS.md §4):
- One card per item with signal_type != 'none' (actionable first, then by date).
- headline: short, factual, from the title + signal type; never claims causality.
- owner routing: safety/AE -> pharmacovigilance; access_pricing -> market_access;
  trial_update -> clinical_ops; off-label flag -> medical_affairs; competitor_move/efficacy -> brand
  (medical_affairs for pubmed/expert_opinion). Keep this table in one dict.
- caveats: fda_event -> 'Single spontaneous report; causality not established.'
  case reports -> 'Single case report.'; retrospective -> 'Retrospective evidence.'
- confidence band: high >= 0.8, medium >= 0.6, else low (min of signal/actionable confidence).
- citations: one per non-null aspect, with start/end from meta.aspects.
- Never put patient demographics (ages, sex, initials) in headline / why_it_matters.
"""
from __future__ import annotations

from engine.schema import Card, EnrichedPrediction


def build_cards(preds: list[EnrichedPrediction]) -> list[Card]:
    raise NotImplementedError("teammate: implement; until then the API serves fixtures/cards.sample.json")
