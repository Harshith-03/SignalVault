"""Fold analysed radar items into the app's outputs, without touching engine/.

    python -m engine.run --merge     # rebuilds outputs/enriched.jsonl, texts.json, safety.json from the splits
    python -m surge.merge            # then upserts RD-* records into the same three files

Idempotent: records are keyed by item_id / case_id, so running it twice changes nothing. `engine.run --merge`
rewrites enriched.jsonl from the splits only, so run this AFTER it. Fully offline: reads local files only.
"""
from __future__ import annotations

import json

from engine import config
from engine.schema import EnrichedPrediction

from .radar import radar_dir, read_jsonl


def merge(quiet: bool = False) -> dict:
    out = config.OUTPUTS
    radar_preds = [EnrichedPrediction.model_validate(r) for r in read_jsonl(out / "enriched_radar.jsonl")]
    texts_radar = {r["item_id"]: r.get("text") or "" for r in read_jsonl(radar_dir() / "items.jsonl")}

    enriched_path = out / "enriched.jsonl"
    existed = enriched_path.exists()
    current: dict[str, str] = {}
    if existed:
        for line in enriched_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                current[json.loads(line)["item_id"]] = line
    before = len(current)
    for p in radar_preds:
        current[p.item_id] = p.model_dump_json()
    enriched_path.parent.mkdir(parents=True, exist_ok=True)
    enriched_path.write_text("".join(l + "\n" for l in current.values()), encoding="utf-8")

    texts_path = out / "texts.json"
    texts = json.loads(texts_path.read_text(encoding="utf-8")) if texts_path.exists() else {}
    texts.update({p.item_id: texts_radar[p.item_id] for p in radar_preds if p.item_id in texts_radar})
    texts_path.write_text(json.dumps(texts), encoding="utf-8")

    safety_path, radar_safety = out / "safety.json", out / "safety_radar.json"
    cases = {c["case_id"]: c for c in (json.loads(safety_path.read_text(encoding="utf-8")) if safety_path.exists() else [])}
    radar_cases = json.loads(radar_safety.read_text(encoding="utf-8")) if radar_safety.exists() else []
    cases.update({c["case_id"]: c for c in radar_cases})
    safety_path.write_text(json.dumps(list(cases.values()), indent=1, ensure_ascii=False), encoding="utf-8")

    s = {"radar_records": len(radar_preds), "enriched_before": before, "enriched_after": len(current),
         "safety_cases_radar": len(radar_cases), "created_enriched": not existed}
    if not quiet:
        print(f"merged {len(radar_preds)} radar records -> {enriched_path} ({before} -> {len(current)} items); "
              f"{len(radar_cases)} radar safety cases -> {safety_path}")
        if not existed:
            print("  note: outputs/enriched.jsonl did not exist; the API now shows outputs instead of fixtures. "
                  "Run `python -m engine.run --merge` first, then this.")
    return s


if __name__ == "__main__":
    merge()
