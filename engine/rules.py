"""Deterministic rules from LABELING_GUIDE.md. Rules decide what the guide fixes; the LLM only does judgment calls.

    apply_rules(item) -> RuleResult   (complete=True means no LLM call is needed)

Sources fully handled here: ctgov, fda_event. Others get priors (fixed speaker, allowed signals) for the LLM.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from .schema import Aspect, Item

# speaker fixed by source (guide: "speaker (who holds the opinion)")
SOURCE_SPEAKER = {"pubmed": "researcher", "ctgov": "company", "fda_label": "regulator", "fda_notice": "regulator",
                  "press_release": "company"}
# signal types the guide allows per source (None = any)
SOURCE_SIGNALS = {"ctgov": ["trial_update"], "fda_event": ["safety"], "fda_label": ["regulatory", "none"],
                  "fda_notice": ["regulatory"]}

# FAERS special reactions (guide: "Rules per source -> fda_event")
NEUTRAL_REACTIONS = {"off label use", "product use issue", "no adverse event"}
EFFICACY_REACTIONS = {"drug ineffective", "disease progression", "malignant neoplasm progression"}
ACCESS_REACTIONS = {"inability to afford medication", "product unavailable"}

OUR_SPONSORS = re.compile(r"AstraZeneca|Janssen|Johnson\s*&\s*Johnson", re.I)
FUTILITY = re.compile(r"futility|lack of efficacy|insufficient efficacy|did not meet|not effective", re.I)
TOXICITY = re.compile(r"toxicit|safety concern|adverse event|unacceptable", re.I)
NOT_RELATED = re.compile(r"not related to (any )?safety|not (due|related) to (safety|efficacy)", re.I)


@dataclass
class RuleResult:
    complete: bool                       # True -> final, skip the LLM
    signal_type: Optional[str] = None
    actionable: Optional[str] = None
    aspects: dict[str, Aspect] = field(default_factory=dict)
    speaker: Optional[str] = None        # prior for the LLM
    allowed_signals: Optional[list[str]] = None
    hits: list[str] = field(default_factory=list)
    extra: dict = field(default_factory=dict)   # parsed fields (faers reporter, ct status...)


def _faers(item: Item) -> RuleResult:
    t = item.text or ""
    hits = ["fda_event:signal=safety", "fda_event:actionable=no"]
    rep = re.search(r"Reporter: ([^.]+)\.", t)
    reporter = (rep.group(1).strip().lower() if rep else "unknown")
    speaker = "patient" if reporter == "consumer" else "hcp"
    m = re.search(r"Reactions: (.+?)\. Serious:", t)
    aspects: dict[str, Aspect] = {}
    if m:
        reac_str = m.group(1)
        parts = [p.strip() for p in reac_str.split(",")]
        low = [p.lower() for p in parts]
        # safety span = contiguous run of ordinary reactions from the start, stopping at the first special term
        run = []
        for p, l in zip(parts, low):
            if l in NEUTRAL_REACTIONS | EFFICACY_REACTIONS | ACCESS_REACTIONS:
                break
            run.append(p)
        if not run:  # list starts with a special term: take the first ordinary reaction anywhere
            run = [p for p, l in zip(parts, low) if l not in NEUTRAL_REACTIONS | EFFICACY_REACTIONS | ACCESS_REACTIONS][:1]
        if run:
            aspects["safety"] = Aspect(polarity=-1, speaker=speaker, span=", ".join(run))
            hits.append("fda_event:safety=-1 (single report cap)")
        for p, l in zip(parts, low):
            if l in EFFICACY_REACTIONS and "efficacy" not in aspects:
                aspects["efficacy"] = Aspect(polarity=-1, speaker=speaker, span=p)
                hits.append("fda_event:efficacy=-1")
            if l in ACCESS_REACTIONS and "access_cost" not in aspects:
                aspects["access_cost"] = Aspect(polarity=-1, speaker=speaker, span=p)
                hits.append("fda_event:access_cost=-1")
    serious = re.search(r"Serious: (yes|no)", t)
    return RuleResult(True, "safety", "no", aspects, speaker, ["safety"], hits,
                      {"reporter": reporter, "serious": serious.group(1) if serious else "unknown"})


def _ctgov(item: Item) -> RuleResult:
    t = item.text or ""
    hits = ["ctgov:signal=trial_update"]
    pm = re.search(r"· ([^·]+) ·", t)
    phases = pm.group(1) if pm else ""
    status = re.search(r"Status(?: as of last update \([^)]*\))?: ([A-Z_]+)", t)
    status = status.group(1) if status else "UNKNOWN"
    reason = re.search(r'Reason given: "([^"]*)"', t)
    reason = reason.group(1) if reason else ""
    sponsor = re.search(r"Sponsor: ([^.]+(?:\.,? ?[A-Z][^.]*)?)\.", t)
    ours = bool(OUR_SPONSORS.search(sponsor.group(1) if sponsor else ""))
    aspects: dict[str, Aspect] = {}
    if reason and not NOT_RELATED.search(reason):
        if FUTILITY.search(reason):
            aspects["efficacy"] = Aspect(polarity=-2, speaker="company", span=reason)
            hits.append("ctgov:stop reason judges efficacy -> -2")
        elif TOXICITY.search(reason):
            aspects["safety"] = Aspect(polarity=-2, speaker="company", span=reason)
            hits.append("ctgov:stop reason judges safety -> -2")
    new_reg = "New registration" in t
    actionable = "no"
    if new_reg and phases and "PHASE3" in phases:
        actionable = "yes"; hits.append("ctgov:new phase 3 registration -> actionable")
    if status in ("TERMINATED", "WITHDRAWN", "SUSPENDED") and (ours or aspects):
        actionable = "yes"; hits.append("ctgov:our trial stopped -> actionable")
    return RuleResult(True, "trial_update", actionable, aspects, "company", ["trial_update"], hits,
                      {"status": status, "phases": phases, "new_registration": new_reg, "ours": ours})


def apply_rules(item: Item) -> RuleResult:
    src = item.source
    if src == "fda_event":
        return _faers(item)
    if src == "ctgov":
        return _ctgov(item)
    return RuleResult(False, speaker=SOURCE_SPEAKER.get(src), allowed_signals=SOURCE_SIGNALS.get(src),
                      hits=[f"source:{src}"])
