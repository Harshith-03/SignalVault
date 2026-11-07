"""PII redaction for DISPLAY and STORAGE only.

    redact(text: str, source: str = "transcript") -> RedactionResult
    python -m privacy.redact fixtures/transcripts/synthetic_kol_interview_04.txt

Never applied to the text the engine scores (spans must stay verbatim). Applied to private
transcripts before they are stored or shown, to card text and to logs.

Runs fully offline. The layers below run in order, and when two spans overlap the higher layer wins:
  1. Regex: emails, phones, ID-like numbers, dates (to ISO week; a date of birth becomes [DOB]),
     ages (to 10-year bands, e.g. [AGE 70-79]).
  2. Person rules: transcript speaker labels ("DR. ALAN FAKENAME (", "[00:01:05] Gary Invented:",
     "P1 (Teresa, 63, ..."), titles ("Dr. X", "Nurse X"), and context cues ("Moderator: X", "pt (X").
     These also tell us the ROLE, so a person gets a role-tag like [HCP-1] or [PATIENT-1].
  3. spaCy en_core_web_sm NER (a local wheel, no download at runtime): PERSON, plus GPE/LOC/FAC
     as LOCATION, plus ORG only when it is a care institution (hospital, clinic, institute, ...).
  4. Propagation: once a name is known, every other mention of the full name or any part of it
     (in Title or UPPER case) gets the same tag, e.g. "Thank you, Teresa".
Drug names and clinical terms (PROTECTED) are never redacted: spaCy tags "Lazcluze" as PERSON.

Honest limits: lowercase names ("maria"), nicknames, rare name formats, free-text addresses,
and quasi-identifiers such as occupation ("a retired teacher") or exact event timelines are NOT
caught. Sex is kept (it is clinically needed in an AE narrative); cards strip it separately.
"""
from __future__ import annotations

import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import date
from functools import lru_cache
from typing import Optional

from engine.schema import RedactionResult, RedactionSpan
from privacy.demographics import INITIALS

# ---------------------------------------------------------------- vocab
PROTECTED = {  # never redacted, even when NER thinks they are people or places
    "osimertinib", "amivantamab", "lazertinib", "tagrisso", "rybrevant", "lazcluze", "apixaban",
    "egfr", "nsclc", "met", "ild", "cns", "pfs", "os", "orr", "ae", "sae", "faers", "fda", "ema", "nice",
    "flaura", "flaura2", "mariposa", "mariposa-2", "papillon", "paloma", "paloma-3", "chrysalis", "kol", "msl",
    "pa", "pbm", "subq", "iv", "sc", "dvt", "pe", "vte", "rash", "paronychia", "diarrhoea", "diarrhea",
}
STOP = {  # capitalised words that are not names (sentence starts, roles, headers)
    "q", "a", "p", "dr", "mr", "mrs", "ms", "prof", "nurse", "moderator", "facilitator", "interviewer",
    "respondent", "participant", "participants", "patient", "patients", "advocate", "caregiver", "payer",
    "thanks", "thank", "honestly", "yes", "no", "sure", "welcome", "efficacy", "safety", "cost", "access",
    "prior", "stage", "phase", "grade", "synthetic", "transcript", "note", "notes", "the", "and", "my", "our",
    "first", "one", "about", "for", "from", "more", "what", "how", "did", "any", "and", "but", "we", "i",
    "medical", "director", "health", "plan", "oncology", "oncologist", "general", "network", "example",
    "advisory", "board", "market", "call", "office", "clinic", "university", "hospital", "institute",
}
# Countries, regions and US states are not identifying (HIPAA allows state); only smaller places are redacted.
KEEP_PLACES = {p.casefold() for p in (
    "U.S. US USA America United States Europe EU European Union UK U.K. United Kingdom Britain England Scotland "
    "Wales Ireland Canada Mexico Brazil Argentina China Japan Korea South Korea Taiwan India Australia Germany "
    "France Italy Spain Netherlands Belgium Switzerland Sweden Norway Denmark Finland Poland Austria Israel Turkey "
    "Russia Asia Africa North America Latin America Oceania Singapore Hong Kong Thailand Vietnam Malaysia "
    "Alabama Alaska Arizona Arkansas California Colorado Connecticut Delaware Florida Georgia Hawaii Idaho Illinois "
    "Indiana Iowa Kansas Kentucky Louisiana Maine Maryland Massachusetts Michigan Minnesota Mississippi Missouri "
    "Montana Nebraska Nevada New Hampshire New Jersey New Mexico New York North Carolina North Dakota Ohio "
    "Oklahoma Oregon Pennsylvania Rhode Island South Carolina South Dakota Tennessee Texas Utah Vermont "
    "Virginia Washington West Virginia Wisconsin Wyoming"
).split()} | {"united states", "united kingdom", "european union", "north america", "latin america", "south korea",
              "hong kong", "new york", "new jersey", "new mexico", "new hampshire", "north carolina",
              "south carolina", "north dakota", "south dakota", "rhode island", "west virginia"}
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
          "november", "december"]
WEEKDAYS = {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}
INSTITUTION = re.compile(r"\b(?:Hospital|General|Clinic|Medical\s+Cent(?:er|re)|Cancer\s+(?:Cent(?:er|re)|Institute)"
                         r"|University|Institute|Infirmary|Oncology|Associates|Health\s+System|Practice)\b", re.I)

# ---------------------------------------------------------------- regex layer
_MON = r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?" \
       r"|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE = re.compile(r"(?<![\w+])(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?!\w)"
                   r"|\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}(?!\w)")
ID_LABELLED = re.compile(r"\b(?:MRN|NPI|SSN|ID|Member\s+ID|Policy(?:\s+(?:no\.?|number))?|Record\s+(?:no\.?|number))"
                         r"\s*[:#]?\s*(?P<id>[A-Z0-9][A-Z0-9-]{3,})\b")
ID_BARE = re.compile(r"(?<![\w$.,/-])(?:\d{3}-\d{2}-\d{4}|\d{6,})(?![\w/]|[.,]\d)")
DATE_ISO = re.compile(r"\b(?P<y>(?:19|20)\d{2})-(?P<m>\d{1,2})-(?P<d>\d{1,2})\b")
DATE_NUM = re.compile(r"\b(?P<a>\d{1,2})/(?P<b>\d{1,2})/(?P<y>(?:19|20)?\d{2})\b|\b(?P<a2>\d{1,2})\.(?P<b2>\d{1,2})\.(?P<y2>(?:19|20)\d{2})\b")
DATE_DMY = re.compile(rf"\b(?P<d>\d{{1,2}})(?:st|nd|rd|th)?\s+(?P<m>{_MON})\.?,?\s+(?P<y>(?:19|20)\d{{2}})\b", re.I)
DATE_MDY = re.compile(rf"\b(?P<m>{_MON})\.?\s+(?P<d>\d{{1,2}})(?:st|nd|rd|th)?,?\s+(?P<y>(?:19|20)\d{{2}})\b", re.I)
DATE_MY = re.compile(rf"\b(?P<m>{_MON})\.?\s+(?P<y>(?:19|20)\d{{2}})\b", re.I)
DOB_CUE = re.compile(r"(?:\bDOB|\bD\.O\.B\.|\bdate\s+of\s+birth|\bborn(?:\s+on)?)\s*[:\-]?\s*$", re.I)
AGES = [
    re.compile(r"\b(?P<n>\d{1,3})\s*-?\s*(?:years?|yrs?)\s*-?\s*old\b", re.I),
    re.compile(r"\b(?P<n>\d{1,3})\s*(?:y/o|yo|y\.o\.)(?!\w)", re.I),
    re.compile(r"\baged?\s*:?\s*(?P<n>\d{1,3})\b(?!\s*(?:\+|or\s+|and\s+|years?\s+(?:or|and)\s+)"
               r"(?:older|over|above|younger|under))", re.I),                # cohort thresholds are not PII
    re.compile(r"\b(?P<n>\d{2})\s?[MF]\b"),
    re.compile(r"\b[A-Z][a-z]+,\s*(?P<n>\d{2})(?=\s*[,)])"),                  # "Teresa, 63," in a speaker label
    re.compile(r"\b(?:in\s+(?:his|her|their)\s+)?(?:early\s+|mid-?\s*|late\s+)?"
               r"(?P<w>twenties|thirties|forties|fifties|sixties|seventies|eighties|nineties)\b", re.I),
]
DECADE = {w: 10 * (i + 2) for i, w in enumerate(["twenties", "thirties", "forties", "fifties", "sixties",
                                                  "seventies", "eighties", "nineties"])}

# ---------------------------------------------------------------- person rules
_NAME = r"[A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+){0,2}"
_TITLE = r"(?i:dr|doctor|prof|professor|nurse|mr|mrs|ms|miss|mx)"
TITLE_NAME = re.compile(rf"\b(?P<title>{_TITLE})\.?\s+(?P<name>{_NAME})")
SPEAKER_LABEL = re.compile(
    r"^(?:\[\d{1,2}:\d{2}(?::\d{2})?\]\s*)?"
    r"(?P<label>(?:[A-Z][A-Za-z0-9'\-]*\.?[ \t]+){0,5}[A-Z][A-Za-z0-9'\-]*\.?)"
    r"[ \t]*(?:\((?P<paren>[^)\n]{0,160})\))?[ \t]*:(?!\d)", re.M)
NAME_PAREN = re.compile(rf"(?P<name>[A-Z][a-z'\-]+(?:\s+[A-Z][a-z'\-]+){{1,2}})\s*\((?P<paren>[^)\n]{{1,160}})\)")
CUE_NAME = re.compile(r"\b(?P<cue>(?i:moderator|facilitator|interviewer|respondent|caregiver|advocate|patient|pt"
                      r"|office\s+(?:mgr|manager)|colleague|sister|brother|wife|husband|daughter|son))\b"
                      rf"\s*[:,]?\s*\(?(?P<name>[A-Z][a-z'\-]+(?:\s+[A-Z][a-z'\-]+){{0,2}})")
LOC_CUE = re.compile(r"\b(?:in|near)\s+(?P<loc>[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b")
CODE_LABEL = re.compile(r"^(?:P|R|PT|Participant|Respondent)\s*-?\s*\d+$", re.I)

ROLE_PREFIX = {"DR": "HCP", "DOCTOR": "HCP", "PROF": "HCP", "PROFESSOR": "HCP", "NURSE": "HCP", "NP": "HCP",
               "RN": "HCP", "PHARMACIST": "HCP", "PATIENT": "PATIENT", "CAREGIVER": "CAREGIVER",
               "ADVOCATE": "ADVOCATE", "MODERATOR": "MODERATOR", "FACILITATOR": "MODERATOR",
               "INTERVIEWER": "MODERATOR", "PAYER": "PAYER", "MR": None, "MRS": None, "MS": None, "MISS": None}
ROLE_KEYWORDS = [  # checked in order against parenthetical / cue text
    ("MODERATOR", r"moderator|facilitator|interviewer"),
    ("CAREGIVER", r"caregiver|carer|\bwife\b|\bhusband\b|daughter|\bson\b"),
    ("ADVOCATE", r"advoca"),
    ("PAYER", r"health\s+plan|payer|benefit|formulary|\bpbm\b|insur"),
    ("HCP", r"oncolog|physician|nurse|pharmacist|doctor|surgeon|clinician|navigator|\bmd\b|fellow|colleague"),
    ("PATIENT", r"patient|\bpt\b|\bon\s+\w+|diagnos"),
]
PRIORITY = {"EMAIL": 100, "PHONE": 90, "ID": 85, "DOB": 80, "DATE": 75, "AGE": 70, "PERSON_RULE": 60,
            "INITIALS": 55, "PERSON_PROP": 50, "PERSON_NER": 45, "ORG": 40, "LOCATION": 35}
_TOTALS: Counter = Counter()   # redaction counts accumulated in this process (shown on the privacy page)


@dataclass
class _Cand:
    start: int
    end: int
    kind: str                       # final kind: PERSON, AGE, ...
    layer: str                      # key into PRIORITY
    replacement: str = ""
    person: Optional[int] = None    # person id for PERSON spans


@dataclass
class _People:
    """Same person -> same id. Any shared name token links two mentions (good enough per document)."""
    tokens: dict[str, int] = field(default_factory=dict)
    roles: dict[int, Optional[str]] = field(default_factory=dict)
    names: dict[int, set[str]] = field(default_factory=dict)

    def add(self, name: str, role: Optional[str] = None) -> Optional[int]:
        toks = [t for t in re.findall(r"[A-Za-z][A-Za-z'\-]+", name) if t.casefold() not in STOP]
        if not toks:
            return None
        pid = next((self.tokens[t.casefold()] for t in toks if t.casefold() in self.tokens), None)
        if pid is None:
            pid = len(self.roles)
            self.roles[pid], self.names[pid] = None, set()
        for t in toks:
            self.tokens.setdefault(t.casefold(), pid)
        self.names[pid].update(toks)
        if role and not self.roles[pid]:
            self.roles[pid] = role
        return pid


def _role_from(text: str) -> Optional[str]:
    for role, rx in ROLE_KEYWORDS:
        if re.search(rx, text or "", re.I):
            return role
    return None


def _ok_name(name: str) -> bool:
    toks = re.findall(r"[A-Za-z][A-Za-z'\-]*", name)
    return bool(toks) and all(t[0].isupper() for t in toks) and not any(
        t.casefold() in PROTECTED or t.casefold() in MONTHS or t.casefold() in WEEKDAYS for t in toks) \
        and not all(t.casefold() in STOP for t in toks) and not re.search(r"\d", name)


def _band(age: int) -> str:
    return "[AGE 90+]" if age >= 90 else f"[AGE {age // 10 * 10}-{age // 10 * 10 + 9}]"


def _week(y: int, m: int, d: int) -> str:
    try:
        yy, ww, _ = date(y, m, d).isocalendar()
        return f"[DATE {yy}-W{ww:02d}]"
    except ValueError:
        return "[DATE]"


def _month(s: str) -> int:
    return next(i + 1 for i, name in enumerate(MONTHS) if name.startswith(s.lower().rstrip(".")[:3]))


def _regex_layer(text: str) -> list[_Cand]:
    out = [_Cand(m.start(), m.end(), "EMAIL", "EMAIL", "[EMAIL]") for m in EMAIL.finditer(text)]
    out += [_Cand(m.start(), m.end(), "PHONE", "PHONE", "[PHONE]") for m in PHONE.finditer(text)]
    out += [_Cand(m.start("id"), m.end("id"), "ID", "ID", "[ID]") for m in ID_LABELLED.finditer(text)]
    out += [_Cand(m.start(), m.end(), "ID", "ID", "[ID]") for m in ID_BARE.finditer(text)]

    def add_date(m: re.Match, y: int, mo: int, d: Optional[int]) -> None:
        if DOB_CUE.search(text[max(0, m.start() - 20):m.start()]):
            out.append(_Cand(m.start(), m.end(), "DOB", "DOB", "[DOB]"))
        else:
            rep = _week(y, mo, d) if d else (f"[DATE {y}-{mo:02d}]" if 1 <= mo <= 12 else "[DATE]")
            out.append(_Cand(m.start(), m.end(), "DATE", "DATE", rep))

    for m in DATE_ISO.finditer(text):
        add_date(m, int(m["y"]), int(m["m"]), int(m["d"]))
    for m in DATE_NUM.finditer(text):
        a, b, y = (m["a"], m["b"], m["y"]) if m["a"] else (m["a2"], m["b2"], m["y2"])
        a, b, y = int(a), int(b), int(y)
        y = y + (1900 if y > 30 else 2000) if y < 100 else y
        mo, d = (a, b) if a <= 12 else (b, a)          # US M/D/Y unless the first part cannot be a month
        add_date(m, y, mo, d)
    for rx in (DATE_DMY, DATE_MDY):
        for m in rx.finditer(text):
            add_date(m, int(m["y"]), _month(m["m"]), int(m["d"]))
    for m in DATE_MY.finditer(text):
        add_date(m, int(m["y"]), _month(m["m"]), None)

    for rx in AGES:
        for m in rx.finditer(text):
            if "w" in rx.groupindex and m["w"]:
                rep = _band(DECADE[m["w"].lower()])
                s, e = m.start(), m.end()
            else:
                rep = _band(int(m["n"]))
                s, e = (m.start("n"), m.end("n")) if rx is AGES[4] else (m.start(), m.end())
            out.append(_Cand(s, e, "AGE", "AGE", rep))
    out += [_Cand(m.start(), m.end(), "INITIALS", "INITIALS", "[INITIALS]") for m in INITIALS.finditer(text)]
    return out


def _person_rules(text: str, people: _People) -> list[_Cand]:
    out: list[_Cand] = []

    def add(s: int, e: int, name: str, role: Optional[str]) -> None:
        if _ok_name(name):
            pid = people.add(name, role)
            if pid is not None:
                out.append(_Cand(s, e, "PERSON", "PERSON_RULE", person=pid))

    for m in SPEAKER_LABEL.finditer(text):
        label, paren = m["label"], m["paren"] or ""
        toks = label.split()
        role = None
        while toks and toks[0].rstrip(".").upper() in ROLE_PREFIX:
            role = ROLE_PREFIX[toks[0].rstrip(".").upper()] or role
            toks.pop(0)
        role = _role_from(paren) or role
        if CODE_LABEL.match(label.strip()) and paren:                  # P1 (Teresa, 63, ...)
            nm = re.match(r"\s*(" + _NAME + r")\s*(?=[,)]|$)", paren)
            if nm:
                s = m.start("paren") + nm.start(1)
                add(s, s + len(nm.group(1)), nm.group(1), _role_from(paren[nm.end(1):]) or "PATIENT")
        elif toks and (len(toks) >= 2 or toks[0].casefold() in people.tokens or role):
            add(m.start("label"), m.end("label"), " ".join(toks), role)
    for m in TITLE_NAME.finditer(text):
        title = m["title"].upper()
        add(m.start(), m.end(), m["name"], ROLE_PREFIX.get(title) or ROLE_PREFIX.get(title[:4]))
    for m in NAME_PAREN.finditer(text):
        role = _role_from(m["paren"])
        if role and not INSTITUTION.search(m["name"]):
            add(m.start("name"), m.end("name"), m["name"], role)
    for m in CUE_NAME.finditer(text):
        add(m.start("name"), m.end("name"), m["name"], _role_from(m["cue"]) or "PERSON")
    return out


@lru_cache(maxsize=1)
def _nlp():
    """Load the local spaCy model once. Returns None if it is not installed (regex-only mode)."""
    try:
        import spacy
        return spacy.load("en_core_web_sm", exclude=["parser", "lemmatizer"])
    except (ImportError, OSError):
        return None


def ner_available() -> bool:
    return _nlp() is not None


def _ner_layer(text: str, people: _People) -> list[_Cand]:
    nlp = _nlp()
    if nlp is None:
        return []
    out = []
    for ent in nlp(text).ents:
        s, e, t = ent.start_char, ent.end_char, ent.text
        if any(w.casefold() in PROTECTED for w in re.findall(r"[A-Za-z0-9\-]+", t)):
            continue
        preceded_by_place_word = bool(re.search(r"\b(?:in|near|from)\s+$", text[max(0, s - 6):s]))
        if ent.label_ in ("ORG", "PERSON") and INSTITUTION.search(t) and _ok_name(t.replace("&", "")):
            out.append(_Cand(s, e, "ORG", "ORG", "[INSTITUTION]"))
        elif ent.label_ == "PERSON" and _ok_name(t) and not re.search(r"\b(?:Network|Plan|Inc|Ltd|Group)\b", t):
            pid = people.add(t)
            if pid is not None:
                out.append(_Cand(s, e, "PERSON", "PERSON_NER", person=pid))
        elif t.casefold().removeprefix("the ") in KEEP_PLACES:
            continue
        elif ent.label_ in ("GPE", "LOC", "FAC") and _ok_name(t) and t.casefold() not in STOP:
            out.append(_Cand(s, e, "LOCATION", "LOCATION", "[LOCATION]"))
        elif ent.label_ == "ORG" and preceded_by_place_word and _ok_name(t) and not t.isupper():
            out.append(_Cand(s, e, "LOCATION", "LOCATION", "[LOCATION]"))
    return out


def _location_cues(text: str, people: _People) -> list[_Cand]:
    out = []
    for m in LOC_CUE.finditer(text):
        loc = m["loc"]
        if _ok_name(loc) and loc.casefold() not in KEEP_PLACES and not INSTITUTION.search(loc) and not any(
                w.casefold() in STOP or w.casefold() in people.tokens for w in loc.split()):
            out.append(_Cand(m.start("loc"), m.end("loc"), "LOCATION", "LOCATION", "[LOCATION]"))
    return out


def _propagate(text: str, people: _People) -> list[_Cand]:
    out = []
    for pid, names in people.names.items():
        for tok in names:
            if len(tok) < 3:
                continue
            for form in {tok[0].upper() + tok[1:].lower(), tok.upper(), tok}:
                for m in re.finditer(rf"(?<![\w@.]){re.escape(form)}(?![\w@])", text):
                    out.append(_Cand(m.start(), m.end(), "PERSON", "PERSON_PROP", person=pid))
    return out


def _resolve(cands: list[_Cand]) -> list[_Cand]:
    kept: list[_Cand] = []
    for c in sorted(cands, key=lambda c: (-PRIORITY[c.layer], -(c.end - c.start), c.start)):
        if c.end > c.start and all(c.end <= k.start or c.start >= k.end for k in kept):
            kept.append(c)
    return sorted(kept, key=lambda c: c.start)


def redact(text: str, source: str = "transcript") -> RedactionResult:
    """Redact PII from `text`. Spans carry ORIGINAL offsets; `counts` is per kind.

    `source` is accepted for the contract; every source gets the same treatment, because a named
    clinician in a news item is still shown by role in the UI.
    """
    if not text:
        return RedactionResult(text=text or "", spans=[], counts={})
    people = _People()
    cands = _regex_layer(text)
    cands += _person_rules(text, people)
    cands += _ner_layer(text, people)
    cands += _location_cues(text, people)
    cands += _propagate(text, people)
    kept = _resolve(cands)

    # Tags in order of first appearance: [HCP-1], [PATIENT-1], [MODERATOR], [PERSON-2] ...
    tags: dict[int, str] = {}
    per_role: Counter = Counter()
    for c in kept:
        if c.person is not None and c.person not in tags:
            role = people.roles.get(c.person) or "PERSON"
            per_role[role] += 1
            n = per_role[role]
            tags[c.person] = f"[{role}]" if role == "MODERATOR" and n == 1 else f"[{role}-{n}]"
        if c.person is not None:
            c.replacement = tags[c.person]

    parts, pos = [], 0
    for c in kept:
        parts += [text[pos:c.start], c.replacement]
        pos = c.end
    parts.append(text[pos:])
    spans = [RedactionSpan(start=c.start, end=c.end, kind=c.kind, replacement=c.replacement) for c in kept]
    counts = dict(Counter(c.kind for c in kept))
    _TOTALS.update(counts)
    return RedactionResult(text="".join(parts), spans=spans, counts=counts)


def totals() -> dict[str, int]:
    """Redaction counts accumulated by this process (for /api/privacy)."""
    return dict(_TOTALS)


def map_offset(spans: list[RedactionSpan], pos: int) -> int:
    """Map an offset in the ORIGINAL text to the redacted text (to re-anchor highlights)."""
    shift = 0
    for s in spans:
        if s.end <= pos:
            shift += len(s.replacement) - (s.end - s.start)
        elif s.start < pos:            # inside a redacted span: snap to its end
            return s.start + shift + len(s.replacement)
    return pos + shift


if __name__ == "__main__":
    for path in sys.argv[1:]:
        with open(path, encoding="utf-8") as f:
            r = redact(f.read())
        print(r.text, "\n", r.counts, sep="")
