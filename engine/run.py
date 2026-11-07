"""Batch runner.

    python -m engine.run --split dev [--model qwen3.5:4b] [--limit 15] [--sources pubmed,news] [--tag v0]
    python -m engine.run --split test            # writes outputs/predictions_test.jsonl (the submission)
    python -m engine.run --merge                 # builds outputs/enriched.jsonl + texts.json for the app

Results are cached per (model, prompt version, item text hash) in outputs/cache/, so re-runs are free.
Dev scoring uses the official scorer; few-shot examples are leave-one-out (an item never sees itself).
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import time
from pathlib import Path

from . import config
from .pipeline import analyze_item, default_fewshot
from .prompts import PROMPT_VERSION
from .schema import ASPECTS, EnrichedPrediction, Item


def load_items(split: str) -> list[Item]:
    with open(config.SPLITS[split], encoding="utf-8") as f:
        return [Item.model_validate(json.loads(l)) for l in f if l.strip()]


def _scorer():
    spec = importlib.util.spec_from_file_location("hack_scorer", config.SCORER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def score_dev(preds: list[EnrichedPrediction], items: list[Item]) -> dict:
    sc = _scorer()
    gold = sc.load(str(config.GOLD_DEV))
    pred = {p.item_id: p.to_submission() for p in preds}
    texts = {it.item_id: {"text": it.text} for it in items}
    out = {"all": sc.score(gold, pred, texts)}
    for src in sorted({it.source for it in items}):
        ids = {it.item_id for it in items if it.source == src}
        g = {k: v for k, v in gold.items() if k in ids}
        if g:
            s = sc.score(g, {k: v for k, v in pred.items() if k in ids}, texts)
            out[src] = {k: s[k] for k in ("n_items", "signal_accuracy", "actionable_f1", "aspect_f1", "polarity_exact",
                                          "speaker_accuracy", "span_f1", "citation_validity")}
    rev = {k: v for k, v in gold.items() if v.get("human_reviewed")}
    out["human_reviewed"] = {k: v for k, v in sc.score(rev, pred, texts).items() if k in ("composite", "n_items")}
    return out


def run(split: str, model: str, limit: int | None, sources: set[str] | None, tag: str) -> Path:
    items = load_items(split)
    if sources:
        items = [it for it in items if it.source in sources]
    if limit:
        items = items[:limit]
    cache_dir = config.OUTPUTS / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    fs = default_fewshot()
    preds, t0, llm_calls = [], time.time(), 0
    for i, it in enumerate(items, 1):
        key = hashlib.sha256(f"{model}|{PROMPT_VERSION}|{it.source}|{it.text}".encode()).hexdigest()[:24]
        cp = cache_dir / f"{it.item_id}-{key}.json"
        if cp.exists():
            p = EnrichedPrediction.model_validate_json(cp.read_text(encoding="utf-8"))
        else:
            p = analyze_item(it, model=model, fewshot=fs)
            cp.write_text(p.model_dump_json(), encoding="utf-8")
            llm_calls += p.meta.model not in ("rules",)
        preds.append(p)
        if i % 10 == 0 or i == len(items):
            print(f"  {i}/{len(items)}  {time.time() - t0:.0f}s", flush=True)
    secs = time.time() - t0
    stem = f"{split}_{tag}" if tag else split
    out = config.OUTPUTS / f"enriched_{stem}.jsonl"
    out.write_text("".join(p.model_dump_json() + "\n" for p in preds), encoding="utf-8")
    sub = config.OUTPUTS / f"predictions_{stem}.jsonl"
    sub.write_text("".join(json.dumps(p.to_submission(), ensure_ascii=False) + "\n" for p in preds), encoding="utf-8")
    spi = secs / max(len(items), 1)
    kwh = secs / 3600 * config.LAPTOP_WATTS / 1000
    metrics = {"split": split, "tag": tag, "model": model, "prompt_version": PROMPT_VERSION, "items": len(items),
               "new_llm_calls": llm_calls, "seconds": round(secs, 1), "seconds_per_item": round(spi, 2),
               "cost_per_100_items_usd": round(kwh / max(len(items), 1) * 100 * config.USD_PER_KWH, 4)}
    if split == "dev":
        metrics["scores"] = score_dev(preds, items)
    (config.OUTPUTS / f"metrics_{stem}.json").write_text(json.dumps(metrics, indent=1), encoding="utf-8")
    print(json.dumps(metrics, indent=1))
    return sub


def merge() -> None:
    """Combine enriched outputs for the app (test + unlabeled + dev) and their texts (local only)."""
    enriched, texts = {}, {}
    for split in ("unlabeled", "dev", "test"):
        p = config.OUTPUTS / f"enriched_{split}.jsonl"
        if p.exists():
            for l in p.read_text(encoding="utf-8").splitlines():
                if l.strip():
                    e = EnrichedPrediction.model_validate_json(l)
                    enriched[e.item_id] = e
            for it in load_items(split):
                texts[it.item_id] = it.text or ""
    (config.OUTPUTS / "enriched.jsonl").write_text("".join(e.model_dump_json() + "\n" for e in enriched.values()),
                                                   encoding="utf-8")
    (config.OUTPUTS / "texts.json").write_text(json.dumps({k: texts[k] for k in enriched if k in texts}),
                                               encoding="utf-8")
    print(f"merged {len(enriched)} items -> outputs/enriched.jsonl")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", choices=list(config.SPLITS))
    ap.add_argument("--model", default=config.MODEL)
    ap.add_argument("--limit", type=int)
    ap.add_argument("--sources")
    ap.add_argument("--tag", default="")
    ap.add_argument("--merge", action="store_true")
    a = ap.parse_args()
    if a.merge:
        merge()
    else:
        run(a.split, a.model, a.limit, set(a.sources.split(",")) if a.sources else None, a.tag)
