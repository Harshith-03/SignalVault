"""Insight cards: one per item that carries a signal (CONTRACTS.md §4).

    build_cards(preds: list[EnrichedPrediction], texts: dict | None = None) -> list[Card]

Rules:
- One card per item with signal_type != 'none' (actionable first, then newest first).
- headline: short, factual, from the title + signal type; never claims causality.
- owner routing: one ordered dict, ROUTES (first matching rule wins).
- caveats: fda_event -> 'Single spontaneous report; causality not established.'
  case reports -> 'Single case report.'; retrospective -> 'Retrospective evidence.'
- confidence band: high >= 0.8, medium >= 0.6, else low (min of signal/actionable confidence).
- citations: one per non-null aspect, with start/end from meta.aspects. If `texts` is given, the
  offsets are checked against the item text (and relocated if they drifted), because a citation
  whose offsets don't match is worse than no citation (AGENTS.md rule 3).
- Patient demographics (ages, sex, initials) never reach headline / why_it_matters.
"""
from __future__ import annotations

import re
from typing import Optional

from engine.schema import ASPECTS, PRODUCT_NAMES, Card, Citation, EnrichedPrediction
from privacy.demographics import strip_demographics

# ---- owner routing: ONE table. Keys are matched in order; the first hit wins.
#   "flag:<f>"            item carries meta flag f
#   "signal:<s>/<src>"    signal type s from source src
#   "signal:<s>"          signal type s from any source
# Patient safety beats everything else, so AE flags and safety signals come first.
ROUTES: dict[str, str] = {
    "flag:pv_possible_ae": "pharmacovigilance",
    "flag:reportable_case_candidate": "pharmacovigilance",
    "signal:safety": "pharmacovigilance",
    "flag:off_label": "medical_affairs",
    "signal:access_pricing": "market_access",
    "signal:trial_update": "clinical_ops",
    "signal:efficacy/pubmed": "medical_affairs",
    "signal:competitor_move/pubmed": "medical_affairs",
    "signal:expert_opinion": "medical_affairs",
    "signal:guideline": "medical_affairs",
    "signal:efficacy": "brand",
    "signal:competitor_move": "brand",
    "signal:regulatory": "brand",
}
DEFAULT_OWNER = "brand"

SIGNAL_LABEL = {"efficacy": "Efficacy", "safety": "Safety", "regulatory": "Regulatory",
                "trial_update": "Trial update", "competitor_move": "Competitor move",
                "access_pricing": "Access & pricing", "guideline": "Guideline", "expert_opinion": "Expert opinion"}
SOURCE_LABEL = {"pubmed": "publication", "ctgov": "trial registry record", "fda_event": "FAERS report",
                "fda_label": "label update", "fda_notice": "FDA notice", "press_release": "press release",
                "news": "news item", "transcript": "transcript"}

# Review actions for a human. Never a medical or causal conclusion.
ACTIONS = {
    "pharmacovigilance": "Route to PV for case assessment; PV decides whether a report is needed.",
    "medical_affairs": "Medical Affairs to review the cited evidence and decide on any scientific response.",
    "market_access": "Market Access to review the payer/access impact and decide whether materials need updating.",
    "clinical_ops": "Clinical Ops to review the trial status change and assess impact on plans.",
    "brand": "Brand team to review the cited evidence and decide whether messaging needs updating.",
}
ACTION_OVERRIDES = {  # (owner, source or flag) -> more specific review action
    ("pharmacovigilance", "fda_event"): "PV to confirm this FAERS record is already captured; no new report expected.",
    ("pharmacovigilance", "pubmed"): "Route to PV for literature-case assessment.",
    ("pharmacovigilance", "transcript"): "Route to PV per the AE-reporting SOP for market research.",
    ("medical_affairs", "off_label"): "Medical Affairs to review the off-label mention; not for promotional use.",
    ("brand", "competitor_move"): "Brand team to review the competitor development and assess positioning.",
}
MONITOR_ACTION = "Monitor; no review needed unless this becomes a trend."

CAVEAT_FAERS = "Single spontaneous report; causality not established."
CAVEAT_CASE = "Single case report."
CAVEAT_RETRO = "Retrospective evidence."
CAVEAT_OFF_LABEL = "Off-label use mentioned; Medical Affairs to review."

_CASE_REPORT = re.compile(r"\bcase\s+(?:report|presentation|study of a)\b|\ba\s+case\s+of\b|\breport of a case\b", re.I)
_RETRO = re.compile(r"\bretrospective(?:ly)?\b", re.I)
# Titles are the source's words, but a card headline must not assert causality.
_CAUSAL = [(re.compile(r"-induced\b", re.I), "-associated"), (re.compile(r"\binduced by\b", re.I), "associated with"),
           (re.compile(r"\bcaused by\b", re.I), "reported with")]
HEADLINE_MAX = 120


def route_owner(p: EnrichedPrediction) -> str:
    keys = {f"flag:{f}" for f in p.meta.flags} | {f"signal:{p.signal_type}", f"signal:{p.signal_type}/{p.meta.source}"}
    return next((owner for key, owner in ROUTES.items() if key in keys), DEFAULT_OWNER)


def confidence_band(p: EnrichedPrediction) -> str:
    c = min(p.meta.signal_confidence, p.meta.actionable_confidence)
    return "high" if c >= 0.8 else "medium" if c >= 0.6 else "low"


def is_case_report(p: EnrichedPrediction) -> bool:
    return "case_report_demographics" in p.meta.flags or bool(_CASE_REPORT.search(p.meta.title or ""))


def _caveats(p: EnrichedPrediction, owner: str) -> list[str]:
    out = []
    if p.meta.source == "fda_event" or "single_report_no_causality" in p.meta.flags:
        out.append(CAVEAT_FAERS)
    if is_case_report(p):
        out.append(CAVEAT_CASE)
    eq = p.evidence_quality.span if p.evidence_quality else ""
    if _RETRO.search(p.meta.title or "") or _RETRO.search(eq):
        out.append(CAVEAT_RETRO)
    if "off_label" in p.meta.flags and owner != "medical_affairs":
        out.append(CAVEAT_OFF_LABEL)
    return out


def _clip(s: str, n: int) -> str:
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0].rstrip(",;:-") + "…"


def _headline(p: EnrichedPrediction) -> str:
    label = SIGNAL_LABEL.get(p.signal_type, p.signal_type)
    title = strip_demographics(re.sub(r"\s+", " ", p.meta.title or "")).strip().rstrip(".")
    for rx, repl in _CAUSAL:
        title = rx.sub(repl, title)
    if not title:
        prod = PRODUCT_NAMES.get(p.meta.product or "", "")
        title = f"{SOURCE_LABEL.get(p.meta.source, p.meta.source)}" + (f" on {prod}" if prod else "")
    return _clip(f"{label}: {title}", HEADLINE_MAX)


def _why(p: EnrichedPrediction, owner: str) -> str:
    why = strip_demographics(p.meta.why_actionable or "")
    if why:
        return why
    prod = PRODUCT_NAMES.get(p.meta.product or "", "the portfolio")
    src = SOURCE_LABEL.get(p.meta.source, p.meta.source)
    return f"{SIGNAL_LABEL.get(p.signal_type, p.signal_type)} signal on {prod} from a {src}; {owner.replace('_', ' ')} to review."


def _action(p: EnrichedPrediction, owner: str) -> str:
    if p.actionable != "yes" and owner != "pharmacovigilance":
        return MONITOR_ACTION
    for key in (p.meta.source, p.signal_type, *p.meta.flags):
        if (owner, key) in ACTION_OVERRIDES:
            return ACTION_OVERRIDES[(owner, key)]
    return ACTIONS[owner]


def _citations(p: EnrichedPrediction, text: Optional[str]) -> list[Citation]:
    out = []
    for a in ASPECTS:
        asp, m = getattr(p, a), p.meta.aspects.get(a)
        if asp is None:
            continue
        start, end = (m.start, m.end) if m else (-1, -1)
        if text is not None and not (start >= 0 and text[start:end] == asp.span):
            start = text.find(asp.span)            # offsets missing or drifted: relocate the verbatim span
            end = start + len(asp.span)
        if start < 0 or end - start != len(asp.span):
            continue                               # cannot prove the quote is where we say: drop it
        out.append(Citation(aspect=a, quote=asp.span, speaker=asp.speaker, polarity=asp.polarity,
                            url=p.meta.url, start=start, end=end))
    return out


def build_card(p: EnrichedPrediction, text: Optional[str] = None) -> Card:
    owner = route_owner(p)
    return Card(card_id=f"C-{p.item_id}", item_id=p.item_id, headline=_headline(p), signal_type=p.signal_type,
                product=p.meta.product, actionable=p.actionable == "yes", why_it_matters=_why(p, owner), owner=owner,
                recommended_action=_action(p, owner), citations=_citations(p, text), confidence=confidence_band(p),
                review_status=p.meta.review_status, caveats=_caveats(p, owner), published=p.meta.published,
                week=p.meta.week, source=p.meta.source)


def build_cards(preds: list[EnrichedPrediction], texts: Optional[dict[str, str]] = None) -> list[Card]:
    texts = texts or {}
    cards = [build_card(p, texts.get(p.item_id)) for p in preds if p.signal_type != "none"]
    cards.sort(key=lambda c: c.item_id)
    cards.sort(key=lambda c: c.published or "", reverse=True)   # newest first (stable)
    cards.sort(key=lambda c: not c.actionable)                  # actionable first (stable)
    return cards
