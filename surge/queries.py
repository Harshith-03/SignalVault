"""What is allowed to leave the machine: search queries built ONLY from public drug, trial and topic words.

Why an allowlist and not a blocklist: a blocklist can never enumerate every piece of private text (a
transcript line, a patient detail, a label we produced). An allowlist makes the outgoing surface finite and
reviewable: every word that can ever reach Tavily or Exa is in QUERY_ALLOWLIST below. The clients call
`assert_query_allowed` immediately before every request, so even a future caller that bypasses
`build_query` cannot send anything else.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

# Public names only: INNs, brand names, public trial acronyms, regulators, and generic topic words.
DRUG_TERMS = {"osimertinib", "tagrisso", "amivantamab", "rybrevant", "faspro", "lazertinib", "lazcluze"}
TRIAL_TERMS = {"flaura", "flaura2", "mariposa", "mariposa-2", "papillon", "paloma-3", "adaura", "laura", "cocoon"}
TOPIC_TERMS = {"egfr", "nsclc", "lung", "cancer", "fda", "ema", "nccn", "nice", "approval", "approved",
               "subcutaneous", "overall", "survival", "safety", "label", "update", "guideline", "guidelines",
               "pricing", "reimbursement", "phase", "trial", "results", "data", "news", "and", "vs"}
QUERY_ALLOWLIST: frozenset[str] = frozenset(DRUG_TERMS | TRIAL_TERMS | TOPIC_TERMS)
MAX_QUERY_CHARS = 120
_TOKEN = re.compile(r"\S+")


class QueryNotAllowed(ValueError):
    """Raised when a query contains anything outside QUERY_ALLOWLIST. Nothing is sent."""


def assert_query_allowed(query: str) -> str:
    """Return the query unchanged if every word is on the allowlist; raise QueryNotAllowed otherwise."""
    if not isinstance(query, str) or not query.strip():
        raise QueryNotAllowed("empty query")
    if len(query) > MAX_QUERY_CHARS:
        raise QueryNotAllowed(f"query longer than {MAX_QUERY_CHARS} chars")
    bad = [t for t in _TOKEN.findall(query) if t.lower() not in QUERY_ALLOWLIST]
    if bad:
        raise QueryNotAllowed(f"query contains non-allowlisted terms: {bad!r}")
    return query


def build_query(*terms: str) -> str:
    """Join allowlisted terms into a query (raises on anything else)."""
    return assert_query_allowed(" ".join(t.strip() for t in terms if t.strip()))


Kind = Literal["news", "research"]


@dataclass(frozen=True)
class QueryTemplate:
    """One templated search. `kind` picks Tavily topic / Exa category; `product` is a hint for the UI only."""
    qid: str
    terms: tuple[str, ...]
    kind: Kind
    product: Literal["A", "B", "both"]

    @property
    def query(self) -> str:
        return build_query(*self.terms)


TEMPLATES: tuple[QueryTemplate, ...] = (
    QueryTemplate("q1", ("amivantamab", "subcutaneous", "FDA", "approval"), "news", "B"),
    QueryTemplate("q2", ("amivantamab", "lazertinib", "MARIPOSA", "overall", "survival"), "research", "B"),
    QueryTemplate("q3", ("osimertinib", "FLAURA2", "overall", "survival"), "research", "A"),
    QueryTemplate("q4", ("Tagrisso", "osimertinib", "label", "update"), "news", "A"),
    QueryTemplate("q5", ("osimertinib", "amivantamab", "EGFR", "NSCLC", "guideline"), "news", "both"),
    QueryTemplate("q6", ("Rybrevant", "Lazcluze", "safety"), "news", "B"),
)
