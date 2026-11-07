"""Public engine API (lead-owned).

    analyze_item(item: Item, model=None, fewshot=None) -> EnrichedPrediction
    analyze_text(req: AnalyzeRequest) -> EnrichedPrediction      # transcripts / pasted text from the UI

LangGraph workflow:

    START ─► rules ──(complete: ctgov, fda_event)──────────────────────────┐
                └─(judgment needed)─► fewshot ─► llm ─► verify/guard ──────┤
                                                                           ▼
                                                                       finalize ─► END
"""
from __future__ import annotations

import hashlib
import json
import operator
import re
from datetime import date
from functools import lru_cache
from typing import Annotated, Literal, Optional, TypedDict

from langgraph.graph import END, START, StateGraph

from . import config
from .llm import FewShot, LLMError, label
from .prompts import PROMPT_VERSION
from .rules import SOURCE_SPEAKER, RuleResult, apply_rules, evidence_caveat
from .schema import (ASPECTS, AnalyzeRequest, Aspect, AspectMeta, EnrichedPrediction, Item, Meta, iso_week)
from .transcript import parse_turns, role_at
from .verify import locate

STUB = False
CONF = {"high": 0.85, "medium": 0.65, "low": 0.45}
AGE_RE = re.compile(r"\b\d{1,3}[- ]year[- ]old\b|\bcase report\b|\bwe (report|present|describe) a\b", re.I)
OFFLABEL_RE = re.compile(r"\boff[- ]label\b", re.I)
PIVOTAL_RE = re.compile(r"phase (3|iii)|randomi[sz]ed", re.I)


class State(TypedDict, total=False):
    item: Item
    model: str
    fewshot: Optional[FewShot]
    rules: RuleResult
    examples: list
    raw: dict
    latency_ms: int
    error: str
    notes: Annotated[list[str], operator.add]
    result: EnrichedPrediction


# ---------------------------------------------------------------- nodes
def n_rules(s: State) -> dict:
    return {"rules": apply_rules(s["item"]), "notes": []}


def route(s: State) -> Literal["fewshot", "finalize"]:
    return "finalize" if s["rules"].complete else "fewshot"


def n_fewshot(s: State) -> dict:
    fs = s.get("fewshot")
    return {"examples": fs.pick(s["item"], k=3) if fs else []}


def n_llm(s: State) -> dict:
    try:
        raw, ms = label(s["item"], s["rules"], s.get("examples", []), s.get("model"))
        return {"raw": raw, "latency_ms": ms}
    except LLMError as e:
        return {"error": str(e), "notes": [f"llm_error: {e}"]}


def _guard_aspects(item: Item, rules: RuleResult, raw: dict) -> tuple[dict[str, Aspect], dict[str, AspectMeta], list[str]]:
    """Verify every quote against the text; enforce source rules; drop anything unverifiable."""
    aspects, metas, notes = {}, {}, []
    base = CONF.get(raw.get("confidence", "medium"), 0.65)
    turns = parse_turns(item.text or "") if item.source == "transcript" else []
    for a in raw.get("aspects", []) or []:
        name = a.get("aspect")
        if name not in ASPECTS or name in aspects:
            continue
        loc = locate(a.get("quote"), item.text)
        if loc is None:
            notes.append(f"dropped {name}: quote not found in text")
            continue
        pol = max(-2, min(2, int(a.get("polarity", 0))))
        spk = SOURCE_SPEAKER.get(item.source) or a.get("speaker") or "media"
        if turns:
            spk = role_at(turns, loc.start, default=a.get("speaker") or "hcp")
            if spk is None:
                notes.append(f"dropped {name}: quote is the moderator's, not an opinion holder's")
                continue
        conf = base * (1.0 if loc.method != "fuzzy" else 0.8)
        aspects[name] = Aspect(polarity=pol, speaker=spk, span=loc.span)
        metas[name] = AspectMeta(start=loc.start, end=loc.end, confidence=round(conf, 2), origin="llm")
    return aspects, metas, notes


def n_finalize(s: State) -> dict:
    item, rules = s["item"], s["rules"]
    notes = list(s.get("notes", []))
    if rules.complete:
        aspects = dict(rules.aspects)
        metas = {}
        for a, v in aspects.items():
            loc = locate(v.span, item.text)
            if loc is None:                       # a rule span must exist verbatim; if not, drop it
                aspects.pop(a); continue
            aspects[a] = Aspect(polarity=v.polarity, speaker=v.speaker, span=loc.span)
            metas[a] = AspectMeta(start=loc.start, end=loc.end, confidence=0.95, origin="rule")
        signal, actionable, sconf, aconf = rules.signal_type, rules.actionable, 0.95, 0.9
        why = "; ".join(h for h in rules.hits if "actionable" in h) or "Routine record under the labeling guide."
        model = "rules"
    elif s.get("error") or not s.get("raw"):
        aspects, metas = {}, {}
        signal = (rules.allowed_signals or ["none"])[0]
        actionable, sconf, aconf, why, model = "no", 0.3, 0.3, "Model unavailable: rules-only fallback.", "fallback"
    else:
        raw = s["raw"]
        aspects, metas, gnotes = _guard_aspects(item, rules, raw)
        notes += gnotes
        signal = raw.get("signal_type", "none")
        if rules.allowed_signals and signal not in rules.allowed_signals:
            signal = rules.allowed_signals[0]
        actionable = raw.get("actionable", "no")
        sconf = aconf = CONF.get(raw.get("confidence", "medium"), 0.65)
        why = (raw.get("why") or "").strip()[:300]
        model = s.get("model") or config.MODEL
        # abstain: aspects below threshold become null (scorer rewards precision on matched aspects)
        for a in [a for a, m in metas.items() if m.confidence < config.ASPECT_MIN_CONF]:
            aspects.pop(a); metas.pop(a); notes.append(f"abstained {a}: low confidence")
        # guide: authors' caveats ("retrospective") = evidence_quality -1
        cav = evidence_caveat(item)
        if cav and "evidence_quality" not in aspects:
            loc = locate(cav, item.text)
            if loc:
                aspects["evidence_quality"] = Aspect(polarity=-1, speaker="researcher", span=loc.span)
                metas["evidence_quality"] = AspectMeta(start=loc.start, end=loc.end, confidence=0.9, origin="rule")
                notes.append("rule: retrospective caveat -> evidence_quality -1")
        # guide: small/retrospective studies usually not actionable; papers need phase 3 / randomized evidence
        if item.source == "pubmed" and actionable == "yes" and not PIVOTAL_RE.search(item.text or ""):
            actionable = "no"; notes.append("rule: pubmed without phase 3/randomized evidence -> actionable no")

    flags = []
    text = item.text or ""
    if item.source == "fda_event":
        flags.append("single_report_no_causality")
    if item.source == "pubmed" and AGE_RE.search(text):
        flags.append("case_report_demographics")
    if OFFLABEL_RE.search(text):
        flags.append("off_label")
    if signal == "competitor_move":
        flags.append("competitor")
    if item.source == "transcript" and ("safety" in aspects or signal == "safety"):
        flags.append("pv_possible_ae")
    status = "auto" if min(sconf, aconf) >= config.REVIEW_CONF else "review"
    pred = EnrichedPrediction(
        item_id=item.item_id, signal_type=signal, actionable=actionable, **aspects,
        meta=Meta(source=item.source, published=item.published, week=iso_week(item.published), product=item.product,
                  title=item.title, url=item.url, signal_confidence=sconf, actionable_confidence=aconf,
                  aspects=metas, review_status=status, why_actionable=why,
                  uncertainty=None if status == "auto" else "low model confidence",
                  rule_hits=rules.hits + notes, flags=flags, model=model, prompt_version=PROMPT_VERSION,
                  latency_ms=int(s.get("latency_ms", 0))))
    return {"result": pred}


@lru_cache(maxsize=1)
def graph():
    g = StateGraph(State)
    g.add_node("rules", n_rules)
    g.add_node("fewshot", n_fewshot)
    g.add_node("llm", n_llm)
    g.add_node("finalize", n_finalize)
    g.add_edge(START, "rules")
    g.add_conditional_edges("rules", route, {"fewshot": "fewshot", "finalize": "finalize"})
    g.add_edge("fewshot", "llm")
    g.add_edge("llm", "finalize")
    g.add_edge("finalize", END)
    return g.compile()


@lru_cache(maxsize=1)
def default_fewshot() -> Optional[FewShot]:
    """All 60 gold dev items as the example pool (used for test / unlabeled / transcripts)."""
    if not (config.SPLITS["dev"].exists() and config.GOLD_DEV.exists()):
        return None
    items = [Item.model_validate(json.loads(l)) for l in open(config.SPLITS["dev"], encoding="utf-8") if l.strip()]
    gold = {json.loads(l)["item_id"]: json.loads(l) for l in open(config.GOLD_DEV, encoding="utf-8") if l.strip()}
    return FewShot(items, gold)


def analyze_item(item: Item, model: str | None = None, fewshot: Optional[FewShot] = None) -> EnrichedPrediction:
    fs = fewshot if fewshot is not None else default_fewshot()
    out = graph().invoke({"item": item, "model": model or config.MODEL, "fewshot": fs, "notes": []})
    return out["result"]


def analyze_text(req: AnalyzeRequest) -> EnrichedPrediction:
    item_id = "TX-" + hashlib.sha256(req.text.encode()).hexdigest()[:10]
    return analyze_item(Item(item_id=item_id, source=req.source, title=req.title, product=req.product,
                             published=req.published or date.today().isoformat(), text=req.text))
