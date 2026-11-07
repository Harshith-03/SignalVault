"""Build cards.json and trends.json from the engine's enriched output.

    python -m insights.build [--in outputs/enriched.jsonl] [--out outputs/]

Default input is outputs/enriched.jsonl, falling back to the synthetic fixtures so the command
always works. If a texts file sits next to the input (outputs/texts.json or
fixtures/texts.sample.json), every citation offset is checked against the item text.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from engine import config
from engine.schema import EnrichedPrediction
from insights.cards import build_cards
from insights.trends import build_trends


def load_preds(path: Path) -> list[EnrichedPrediction]:
    lines = path.read_text(encoding="utf-8").splitlines()
    return [EnrichedPrediction.model_validate_json(line) for line in lines if line.strip()]


def default_input() -> Path:
    real = config.OUTPUTS / "enriched.jsonl"
    return real if real.exists() else config.FIXTURES / "enriched.sample.jsonl"


def texts_for(inp: Path) -> dict[str, str]:
    for cand in (inp.parent / "texts.json", inp.parent / "texts.sample.json"):
        if cand.exists():
            return json.loads(cand.read_text(encoding="utf-8"))
    return {}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--in", dest="inp", type=Path, default=None, help="enriched JSONL (default: outputs/, else fixtures/)")
    ap.add_argument("--out", type=Path, default=config.OUTPUTS, help="output directory (default: outputs/)")
    args = ap.parse_args(argv)

    inp = args.inp or default_input()
    if not inp.exists():
        print(f"input not found: {inp}")
        return 1
    preds = load_preds(inp)
    cards = build_cards(preds, texts_for(inp))
    stats: dict = {}
    trends = build_trends(preds, stats)

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "cards.json").write_text(json.dumps([c.model_dump() for c in cards], indent=1, ensure_ascii=False),
                                         encoding="utf-8")
    (args.out / "trends.json").write_text(json.dumps([t.model_dump() for t in trends], indent=1, ensure_ascii=False),
                                          encoding="utf-8")
    act = sum(c.actionable for c in cards)
    print(f"{inp.name}: {len(preds)} items -> {len(cards)} cards ({act} actionable), {len(trends)} trend points "
          f"(skipped: {stats['skipped_no_week']} no week, {stats['skipped_no_product']} no product) -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
