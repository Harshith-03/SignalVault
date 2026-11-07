"""Span verifier: a quote is only ever emitted if it can be located in the item text.

    locate(quote, text) -> Located | None

Ladder: exact -> case-insensitive -> whitespace/quote-normalised -> fuzzy (rapidfuzz alignment >= FUZZY_MIN).
The returned span is always text[start:end] (the ORIGINAL characters), trimmed to word boundaries,
kept inside one sentence and never across the "…" ellipsis (labeling-guide rules).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from rapidfuzz import fuzz

from .config import FUZZY_MIN

_TRANS = str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-",
                        " ": " ", " ": " ", " ": " "})


@dataclass
class Located:
    start: int
    end: int
    span: str
    method: str          # exact | casefold | normalized | fuzzy
    score: float         # 100 for exact matches


def _norm_with_map(s: str) -> tuple[str, list[int]]:
    """Lowercase, unify quotes/dashes, collapse whitespace; keep a map back to original indices."""
    out, idx, prev_space = [], [], False
    for i, ch in enumerate(s.translate(_TRANS).lower()):
        if ch.isspace():
            if prev_space:
                continue
            ch, prev_space = " ", True
        else:
            prev_space = False
        out.append(ch); idx.append(i)
    return "".join(out), idx


def _sentence_bounds(text: str, start: int, end: int) -> tuple[int, int]:
    """Clip [start,end) to the sentence containing its start (guide: never join two sentences, never cross …)."""
    for m in re.finditer(r"(?<=[.!?])\s+(?=[A-Z(])|…|\[\.\.\.\]", text):
        if start < m.start() < end:
            end = m.start()
            break
    return start, end


def _tidy(text: str, s: int, e: int) -> tuple[int, int]:
    while s < e and text[s] in " ,;:.\"'()[]":
        s += 1
    while e > s and text[e - 1] in " ,;:\"'([":
        e -= 1
    while e > s and text[e - 1] == "." and not re.search(r"\b\w\.\w\.$", text[s:e]):  # drop trailing period
        e -= 1
    return s, e


def locate(quote: Optional[str], text: Optional[str]) -> Optional[Located]:
    if not quote or not text:
        return None
    q = quote.strip().strip('"').strip()
    if len(q) < 3:
        return None
    i = text.find(q)
    if i >= 0:
        s, e = _tidy(text, *_sentence_bounds(text, i, i + len(q)))
        return Located(s, e, text[s:e], "exact", 100.0) if e > s else None
    i = text.lower().find(q.lower())
    if i >= 0:
        s, e = _tidy(text, *_sentence_bounds(text, i, i + len(q)))
        return Located(s, e, text[s:e], "casefold", 99.0) if e > s else None
    nt, nmap = _norm_with_map(text)
    nq, _ = _norm_with_map(q)
    j = nt.find(nq)
    if j >= 0:
        s, e = nmap[j], nmap[j + len(nq) - 1] + 1
        s, e = _tidy(text, *_sentence_bounds(text, s, e))
        return Located(s, e, text[s:e], "normalized", 98.0) if e > s else None
    al = fuzz.partial_ratio_alignment(nq, nt)
    if al is None or al.score < FUZZY_MIN:
        return None
    ds, de = al.dest_start, al.dest_end
    # expand to word boundaries in normalised text
    while ds > 0 and nt[ds - 1].isalnum():
        ds -= 1
    while de < len(nt) and nt[de].isalnum():
        de += 1
    s, e = nmap[ds], nmap[min(de, len(nmap)) - 1] + 1
    s, e = _tidy(text, *_sentence_bounds(text, s, e))
    if e <= s:
        return None
    return Located(s, e, text[s:e], "fuzzy", float(al.score))
