"""Submission validator (acceptance test B8): python -m engine.validate [outputs/predictions_test.jsonl]

Checks: one line per test item and no extras; exact keys; enums; polarity range; every span is a verbatim
substring of its item text; JSON parses. Exits non-zero on any failure.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from . import config
from .schema import ASPECTS, SIGNAL_TYPES, SPEAKERS

KEYS = {"item_id", "signal_type", "actionable", *ASPECTS}


def validate(path: Path) -> list[str]:
    items = {json.loads(l)["item_id"]: json.loads(l) for l in open(config.SPLITS["test"], encoding="utf-8") if l.strip()}
    errs, seen = [], set()
    for n, line in enumerate(open(path, encoding="utf-8"), 1):
        if not line.strip():
            continue
        try:
            r = json.loads(line)
        except ValueError:
            errs.append(f"line {n}: not JSON"); continue
        iid = r.get("item_id")
        if iid not in items:
            errs.append(f"line {n}: unknown item_id {iid}"); continue
        if iid in seen:
            errs.append(f"line {n}: duplicate {iid}")
        seen.add(iid)
        if set(r) != KEYS:
            errs.append(f"{iid}: keys {sorted(set(r) ^ KEYS)}")
        if r.get("signal_type") not in SIGNAL_TYPES:
            errs.append(f"{iid}: bad signal_type {r.get('signal_type')}")
        if r.get("actionable") not in ("yes", "no"):
            errs.append(f"{iid}: bad actionable {r.get('actionable')}")
        text = items[iid].get("text") or ""
        for a in ASPECTS:
            v = r.get(a)
            if v is None:
                continue
            if not isinstance(v.get("polarity"), int) or not -2 <= v["polarity"] <= 2:
                errs.append(f"{iid}.{a}: bad polarity {v.get('polarity')}")
            if v.get("speaker") not in SPEAKERS:
                errs.append(f"{iid}.{a}: bad speaker {v.get('speaker')}")
            if not v.get("span") or v["span"] not in text:
                errs.append(f"{iid}.{a}: span not verbatim in text")
    missing = set(items) - seen
    if missing:
        errs.append(f"missing {len(missing)} items, e.g. {sorted(missing)[:3]}")
    return errs


if __name__ == "__main__":
    p = Path(sys.argv[1]) if len(sys.argv) > 1 else config.OUTPUTS / "predictions_test.jsonl"
    e = validate(p)
    print("\n".join(e) if e else f"VALID: {p.name} covers all test items; every span verbatim.")
    sys.exit(1 if e else 0)
