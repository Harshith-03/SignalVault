"""Patient-demographic patterns (age, sex, initials), shared by cards and the API.

Why a separate module: cards must STRIP demographics from headlines (AGENTS.md rule 5), and the API
must MASK them in citation quotes for non-PV roles. One set of regexes keeps both honest.
"""
from __future__ import annotations

import re

_AGE = (r"(?:\d{1,3}\s*-?\s*(?:years?|yrs?)\s*-?\s*old"          # 71-year-old, 71 years old
        r"|\d{1,3}\s*(?:y/o|yo|y\.o\.)"                            # 71 y/o, 71yo
        r"|aged?\s*:?\s*\d{1,3}(?:\s*(?:years|yrs|y))?"            # aged 71, age: 71
        r"|\d{2}\s?[MF](?![a-zA-Z])"                               # 64F, 71 M
        r"|(?:in\s+(?:his|her|their)\s+)?(?:early\s+|mid-?\s*|late\s+)?"
        r"(?:twenties|thirties|forties|fifties|sixties|seventies|eighties|nineties))")
_SEX_NOUN = r"(?:wom[ae]n|m[ae]n|(?:fe)?males?|gentlem[ae]n|lad(?:y|ies)|boys?|girls?)"
_INITIALS = (r"(?:\b(?:Mr|Mrs|Ms|Miss|Mx)\.?\s+[A-Z]\.?(?:\s?[A-Z]\.?)?(?![a-z])"
             r"|\b(?:patient|pt\.?)\s+[A-Z]\.\s?[A-Z]\.?"
             r"|\b(?!U\.S\.|U\.K\.|E\.U\.)[A-Z]\.\s?[A-Z]\.(?:\s?[A-Z]\.)?)")      # bare initials: J.D., A. B.

# "a 71-year-old woman", "71-year-old male patient", "an 81 yo man"
AGE_PHRASE = re.compile(rf"\b(?P<art>an?\s+)?(?:{_AGE})\b(?P<who>(?:[\s,]+{_SEX_NOUN}\b)?(?:\s+patient\b)?)", re.I)
SEX_ADJ_PATIENT = re.compile(r"\b(?:fe)?male\s+(?=patients?\b)", re.I)
SEX_NOUN = re.compile(rf"\b{_SEX_NOUN}\b", re.I)
INITIALS = re.compile(_INITIALS)


def strip_demographics(text: str) -> str:
    """Rewrite text so no age, sex or initials remain: 'in a 67-year-old woman' -> 'in a patient'."""
    if not text:
        return text
    out = AGE_PHRASE.sub(lambda m: (m.group("art")[0] + " patient") if m.group("art")
                         else "patient" if m.group("who") else "", text)
    out = re.sub(r"\(\s*" + _INITIALS + r"\s*\)", "", out)
    out = SEX_ADJ_PATIENT.sub("", out)
    out = SEX_NOUN.sub(lambda m: "patients" if m.group(0).lower().endswith(("en", "es", "ies", "s")) else "patient",
                       out)
    out = INITIALS.sub("patient", out)
    out = re.sub(r"\bpatient(s?)\s+patient(s?)\b", r"patient\1\2", out)
    out = re.sub(r"\(\s*[,;]?\s*\)", "", out)
    out = re.sub(r"[,;]\s*(?=[,;.]|$)", "", out)
    out = re.sub(r"\s+([,.;:])", r"\1", out)
    return re.sub(r"\s{2,}", " ", out).strip()


def mask_demographics(text: str, mask: str) -> str:
    """Replace each demographic mention with `mask` (no rewording), for role-based display."""
    if not text:
        return text
    out = AGE_PHRASE.sub(lambda m: (m.group("art") or "") + mask, text)
    out = INITIALS.sub(mask, out)
    return SEX_NOUN.sub(mask, out)


def has_demographics(text: str) -> bool:
    return bool(text) and bool(AGE_PHRASE.search(text) or INITIALS.search(text) or SEX_NOUN.search(text))
