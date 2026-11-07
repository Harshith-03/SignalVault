"""Transcript adapter: speaker turns -> roles, so speaker/reporter come from WHO SAID the quoted words.

    parse_turns(text) -> list[Turn]          supports "NAME (desc): ...", "NAME: ...", "Q:/A:" and unlabeled notes
    role_at(turns, offset, default) -> str | None      None = moderator/interviewer (holds no opinion)

Deterministic on purpose: small models mislabel speakers in multi-party text; the turn structure doesn't lie.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

TURN = re.compile(r"^[ \t]*(?P<label>(?:[A-Z][A-Za-z.'\-]*\.?[ \t]+){0,5}[A-Z][A-Za-z.'\-]*|Q|A|Interviewer|Respondent)"
                  r"[ \t]*(?P<desc>\([^)\n]{0,80}\))?[ \t]*:[ \t]+", re.M)

ROLE_RULES = [  # (pattern on label+desc, role); first match wins
    (r"moderator|interviewer|facilitator|^q$", None),
    (r"payer|pbm|insurer|formulary|plan medical director|health plan|market access", "payer"),
    (r"patient|advocate|caregiver|survivor|respondent", "patient"),
    (r"nurse|np\b|pharmacist|dr\.?\b|md\b|oncologist|physician|clinician|pulmonologist|doctor|hcp|^a$", "hcp"),
    (r"astrazeneca|janssen|johnson|company|sponsor|msl|medical science liaison", "company"),
    (r"researcher|investigator|scientist|professor", "researcher"),
    (r"fda|ema|nice|regulator", "regulator"),
]


@dataclass
class Turn:
    start: int          # offset of the label
    body_start: int     # offset where the spoken text starts
    end: int
    label: str          # verbatim label (+desc) as it appears in the text
    role: Optional[str]


def _role(label: str, header: str) -> Optional[str]:
    s = label.lower().strip()
    for pat, role in ROLE_RULES:
        if re.search(pat, s):
            if s == "a" and header:      # Q/A format: interviewee role from the header line
                for p2, r2 in ROLE_RULES[1:]:
                    if re.search(p2, header.lower()):
                        return r2
            return role
    return "hcp" if s else None


def parse_turns(text: str) -> list[Turn]:
    ms = [m for m in TURN.finditer(text) if len(m.group("label")) <= 60]
    header = text[: ms[0].start()] if ms else text[:300]
    turns = []
    for i, m in enumerate(ms):
        end = ms[i + 1].start() if i + 1 < len(ms) else len(text)
        label = (m.group("label") + (" " + m.group("desc") if m.group("desc") else "")).strip()
        turns.append(Turn(m.start(), m.end(), end, label, _role(label, header)))
    return turns


def turn_at(turns: list[Turn], offset: int) -> Optional[Turn]:
    for t in turns:
        if t.body_start <= offset < t.end:
            return t
    return None


def role_at(turns: list[Turn], offset: int, default: Optional[str] = "hcp") -> Optional[str]:
    t = turn_at(turns, offset)
    return t.role if t else default
