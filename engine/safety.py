"""Safety Inbox: finds POSSIBLE reportable individual adverse-event cases (triage aid; PV decides).

    is_candidate(item, pred) -> bool          cheap prefilter (no model call)
    detect_case(item, pred, model=None) -> SafetyCase | None

Rules (docs/SAFETY_RULES.md, verified): a valid case needs all four minimum criteria —
identifiable patient (age/age group, sex, initials, DOB, name, ID…; a bare count is NOT enough),
identifiable reporter, suspect product (INN counts as ours), adverse event. Literature/news = spontaneous;
market research / advisory boards = solicited (always flag; PV assesses causality). FAERS records are already
in FDA's database and are never flagged for resubmission. Every criterion quote is verified verbatim.
"""
from __future__ import annotations

import json
import re
from datetime import date, timedelta
from typing import Optional

import requests

from . import config
from .schema import Criterion, EnrichedPrediction, Item, SafetyCase
from .transcript import parse_turns, turn_at
from .verify import locate

OUR_DRUGS = re.compile(r"osimertinib|tagrisso|amivantamab|rybrevant|lazertinib|lazcluze|azd9291|jnj-61186372", re.I)
PATIENT_ID = re.compile(r"\b\d{1,3}[- ]?(year|yr|month)s?[- ]old\b|\b(man|woman|male|female|boy|girl|gentleman|lady)\b"
                        r"|\b(aged?|in (his|her) \d0s)\b|\b[A-Z]\.[A-Z]\.\b|\bpatient (ID|number)\b|\bdate of birth\b|"
                        r"\bDOB\b|\bhis\b|\bher\b|\bpregnan", re.I)
CASE_HINT = re.compile(r"\b\d{1,3}[- ]year[- ]old\b|\bcase report\b|\bwe (report|present|describe)\b|"
                       r"\b(a|one) (patient|man|woman)\b", re.I)
AE_HINT = re.compile(r"develop|toxicit|adverse|reaction|pneumonitis|interstitial|rash|embol|thromb|hepat|death|died|"
                     r"hospitali|grade [3-5]|discontinu|ILD|myocard|cardio|QT|keratitis|paronychia", re.I)

SCHEMA = {"type": "object", "properties": {
    "patient_quote": {"type": "string"}, "reporter_quote": {"type": "string"},
    "suspect_drug_quote": {"type": "string"}, "adverse_event_quote": {"type": "string"},
    "events": {"type": "array", "items": {"type": "string"}, "maxItems": 6},
    "serious": {"type": "string", "enum": ["yes", "no", "unknown"]}, "seriousness_quote": {"type": "string"},
    "causality_excluded": {"type": "boolean"}},
    "required": ["patient_quote", "reporter_quote", "suspect_drug_quote", "adverse_event_quote", "events", "serious",
                 "seriousness_quote", "causality_excluded"]}

PROMPT = """You help a pharmacovigilance team triage a text for a POSSIBLE individual adverse-event case report about
osimertinib (Tagrisso), amivantamab (Rybrevant) or lazertinib (Lazcluze).
Extract, copying CHARACTER-FOR-CHARACTER short phrases from the text (empty string if absent):
- patient_quote: words identifying ONE specific patient (age, sex, initials, e.g. "a 71-year-old woman"). A group or count of patients is NOT a single patient -> "".
- reporter_quote: who reports it (a named speaker / clinician / author statement). "" if none.
- suspect_drug_quote: our drug as named in the text for that patient.
- adverse_event_quote: the adverse event that patient experienced (e.g. "developed a pulmonary embolism").
- events: the adverse event terms, copied verbatim.
- serious: "yes" if death, life-threatening, hospitalisation, disability, or the text says serious/grade 3-5; "no" if clearly mild; else "unknown". seriousness_quote: the phrase supporting it, or "".
- causality_excluded: true ONLY if the reporter explicitly says the event was NOT caused by the drug.
Return JSON only.
SOURCE: {source}
TEXT: {text}"""


def is_candidate(item: Item, pred: EnrichedPrediction) -> bool:
    t = item.text or ""
    if item.source == "fda_event" or not OUR_DRUGS.search(t):
        return False
    if item.source == "transcript":
        return bool(AE_HINT.search(t))
    if item.source in ("pubmed", "news", "press_release"):
        return bool(CASE_HINT.search(t)) and bool(AE_HINT.search(t)) and (
            pred.signal_type == "safety" or pred.safety is not None or "case report" in t.lower())
    return False


def _crit(quote: str, text: str, check=None) -> Criterion:
    loc = locate(quote, text) if quote else None
    if loc is None or (check is not None and not check(loc.span)):
        return Criterion(present=False)
    return Criterion(present=True, quote=loc.span, start=loc.start, end=loc.end)


def detect_case(item: Item, pred: EnrichedPrediction, model: str | None = None,
                today: Optional[date] = None) -> Optional[SafetyCase]:
    if not is_candidate(item, pred):
        return None
    text = item.text or ""
    body = {"model": model or config.MODEL, "stream": False, "think": False, "keep_alive": "30m", "format": SCHEMA,
            "messages": [{"role": "user", "content": PROMPT.format(source=item.source, text=text[:7000])}],
            "options": {"temperature": 0, "seed": 7, "num_ctx": config.NUM_CTX, "num_predict": 400}}
    try:
        r = requests.post(f"{config.OLLAMA_URL}/api/chat", json=body, timeout=300)
        r.raise_for_status()
        raw = json.loads(r.json()["message"]["content"])
    except (requests.RequestException, ValueError, KeyError):
        return None
    patient = _crit(raw.get("patient_quote", ""), text, lambda s: bool(PATIENT_ID.search(s)))
    drug = _crit(raw.get("suspect_drug_quote", ""), text, lambda s: bool(OUR_DRUGS.search(s)))
    event = _crit(raw.get("adverse_event_quote", ""), text)
    if item.source == "pubmed":     # literature: the article's authors are the identifiable reporter
        reporter = Criterion(present=True, quote=None)
    else:
        reporter = _crit(raw.get("reporter_quote", ""), text)
        if item.source == "transcript" and event.present:   # the speaker of the AE turn is the reporter
            t = turn_at(parse_turns(text), event.start)
            if t and t.role is not None:
                lab = text[t.start:t.body_start].rstrip(": \t")
                reporter = Criterion(present=True, quote=lab, start=t.start, end=t.start + len(lab))
    if not (event.present and drug.present):
        return None                 # nothing to triage
    events = [e for e in (raw.get("events") or []) if e and e.lower() in text.lower()][:6]
    serious = raw.get("serious", "unknown")
    sq = locate(raw.get("seriousness_quote", ""), text)
    caveats = []
    if raw.get("causality_excluded"):
        caveats.append("Reporter explicitly excludes causality: PV to confirm whether this is a case.")
    if item.source == "transcript":
        caveats.append("Solicited (market research / advisory board): forward to PV within 1 business day "
                       "(EPHMRA 2026); PV assesses causality.")
    elif item.source == "pubmed":
        caveats.append("Literature case: day 0 = date of the literature search; EU MAHs submit individually described "
                       "cases; US 15-day report only if serious AND unexpected (PV decides).")
    else:
        caveats.append("Spontaneous report from media: PV to verify the source.")
    if serious == "unknown":
        caveats.append("Seriousness not stated: conservative 15-day clock shown until PV confirms.")
    d0 = today or date.today()
    due_days = config.NONSERIOUS_DUE_DAYS if serious == "no" else config.SERIOUS_DUE_DAYS
    valid = patient.present and reporter.present and drug.present and event.present and not raw.get("causality_excluded")
    conf = 0.5 + 0.1 * sum(c.present for c in (patient, reporter, drug, event)) - (0.2 if raw.get("causality_excluded") else 0)
    return SafetyCase(case_id=f"SC-{item.item_id}", item_id=item.item_id, source=item.source, product=item.product,
                      title=item.title, url=item.url, patient=patient, reporter=reporter, suspect_drug=drug,
                      adverse_event=event, events=events, serious=serious,
                      seriousness_quote=sq.span if sq else None, valid_case_candidate=valid,
                      already_reported=False, day0=d0.isoformat(),
                      due=(d0 + timedelta(days=due_days)).isoformat() if valid else None,
                      restricted=True, confidence=round(min(conf, 0.95), 2), caveats=caveats)
