"""Public Evidence Radar CLI. Its own process, so the API and the engine never hold a network client.

    python -m surge.radar discover [--days 30] [--max 10] [--replay] [--record] [--fresh]   # ONLINE (public queries)
    python -m surge.radar analyze  [--limit N] [--model M]                                  # OFFLINE (netguard on)
    python -m surge.radar status
    python -m surge.merge                                                                   # into the app's outputs

discover: every templated query (surge.queries) goes to BOTH Tavily and Exa. Results are snapshotted
locally with provenance, normalised to engine.schema.Item, deduped (URL, content hash, headline, and the
packet's own URLs) and cross-verified (found by both providers -> corroborated).
analyze: installs the netguard (loopback only) FIRST, then labels new radar items with the local engine.

Files (all under outputs/radar/, gitignored):
    snapshots.jsonl   every fetched public result, with text and provenance (the local snapshot)
    items.jsonl       deduped Items + radar fields (providers, corroborated, queries, retrieved_at, ...)
    provenance.jsonl  one row per fetched result, no text: provider, query, url, title, published,
                      retrieved_at, content_sha256, item_id, status (kept | known_in_packet | off_topic)
    queries.jsonl     append-only log of every query that left (or, in replay, would have left) the device
    runs.jsonl        one summary row per discover / analyze run
and outputs/enriched_radar.jsonl, outputs/safety_radar.json (mirroring engine.run's split outputs).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from engine import config

from . import clients
from .normalize import build_items, norm_url, normalize_hit
from .queries import TEMPLATES

PROVIDERS = (("tavily", clients.tavily_search), ("exa", clients.exa_search))


def radar_dir() -> Path:
    return config.OUTPUTS / "radar"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")


def append_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.writelines(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)


def packet_urls() -> set[str]:
    """Normalised URLs already in the organisers' packet, so the radar only surfaces NEW evidence.
    Only the url field is read; packet text never goes anywhere."""
    out = set()
    for p in config.SPLITS.values():
        try:
            with open(p, encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        u = json.loads(line).get("url")
                        if u:
                            out.add(norm_url(u))
        except OSError:
            continue
    return out


# ---------------------------------------------------------------- discover (online)
def discover(days: int = 30, max_results: int = 10, replay: bool = False, record: bool = False,
             fresh: bool = False, quiet: bool = False) -> dict:
    run_id = "radar-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    modes = {name: clients.mode_for(name, replay) for name, _ in PROVIDERS}
    log, new_hits, errors = [], [], []
    for t in TEMPLATES:
        for name, search in PROVIDERS:
            resp = search(t.query, t.kind, days, max_results, replay=replay)
            ts = _now()
            log.append({"run_id": run_id, "ts": ts, "provider": name, "qid": t.qid, "query": resp.query,
                        "kind": t.kind, "mode": resp.mode, "params": resp.params, "n_results": len(resp.results),
                        "error": resp.error})
            if resp.error:
                errors.append(resp.error)
            if record:
                clients.record(name, resp)
            for raw in resp.results:
                h = normalize_hit(name, resp.query, raw, ts, resp.mode, t.qid)
                if h:
                    new_hits.append(h)

    d = radar_dir()
    old = [] if fresh else read_jsonl(d / "snapshots.jsonl")
    old = [h for h in old if h.get("mode") == modes.get(h.get("provider"))]   # never mix synthetic with live
    snap: dict[tuple, dict] = {}
    for h in old + new_hits:                                                  # newest copy of a page wins
        snap[(h["provider"], h["query"], h["norm_url"], h["content_sha256"])] = h
    hits = list(snap.values())
    items, prov, stats = build_items(hits, packet_urls())

    write_jsonl(d / "snapshots.jsonl", hits)
    write_jsonl(d / "items.jsonl", items)
    write_jsonl(d / "provenance.jsonl", prov)
    append_jsonl(d / "queries.jsonl", log)
    by_provider = {name: sum(name in r["providers"] for r in items) for name, _ in PROVIDERS}
    summary = {"run_id": run_id, "kind": "discover", "ts": _now(), "modes": modes, "days": days,
               "max_results": max_results, "queries": len(TEMPLATES), "requests": len(log),
               "new_results": len(new_hits), **stats, "by_provider": by_provider, "errors": errors}
    append_jsonl(d / "runs.jsonl", [summary])
    if not quiet:
        print(f"discover {run_id}  modes={modes}  requests={len(log)}  results={len(new_hits)}")
        print(f"  items={stats['items']}  corroborated={stats['corroborated']}  by_provider={by_provider}  "
              f"known_in_packet={stats['known_in_packet']}  off_topic={stats['off_topic']}  "
              f"duplicates_merged={stats['duplicates_merged']}")
        for e in errors:
            print(f"  ! {e}")
        print(f"  -> {d / 'items.jsonl'}")
    return summary


# ---------------------------------------------------------------- analyze (offline)
def analyze(limit: int | None = None, model: str | None = None, quiet: bool = False,
            ids: set[str] | None = None) -> dict:
    """Label radar items with the LOCAL engine. The netguard goes on first: from here, loopback only."""
    from privacy import netguard
    netguard.install(("127.0.0.1", "localhost", "::1"))
    from engine.pipeline import analyze_item, default_fewshot     # imported after the guard, on purpose
    from engine.safety import detect_case, is_candidate
    from engine.schema import EnrichedPrediction, Item

    model = model or config.MODEL
    rows = read_jsonl(radar_dir() / "items.jsonl")
    out_path = config.OUTPUTS / "enriched_radar.jsonl"
    done = {e["item_id"]: e for e in read_jsonl(out_path)}
    todo = [r for r in rows if r["item_id"] not in done and (not ids or r["item_id"] in ids)][: limit or None]
    safety_path = config.OUTPUTS / "safety_radar.json"
    cases = {c["case_id"]: c for c in (json.loads(safety_path.read_text(encoding="utf-8"))
                                       if safety_path.exists() else [])}
    fs, t0, failed = default_fewshot(), time.time(), []
    for i, row in enumerate(todo, 1):
        it = Item.model_validate(row)
        try:
            p = analyze_item(it, model=model, fewshot=fs)
            if is_candidate(it, p):                   # mirrors engine/run.py
                c = detect_case(it, p, model=model)
                if c:
                    cases[c.case_id] = c.model_dump()
                    if "reportable_case_candidate" not in p.meta.flags and c.valid_case_candidate:
                        p.meta.flags.append("reportable_case_candidate")
            done[p.item_id] = json.loads(p.model_dump_json())
        except Exception as e:                         # one bad item must not lose the batch
            failed.append(f"{it.item_id}: {type(e).__name__}: {e}")
        if not quiet:
            print(f"  {i}/{len(todo)}  {it.item_id}  {time.time() - t0:.0f}s", flush=True)
    order = [r["item_id"] for r in rows if r["item_id"] in done] + [k for k in done if k not in {r["item_id"] for r in rows}]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("".join(EnrichedPrediction.model_validate(done[k]).model_dump_json() + "\n" for k in order),
                        encoding="utf-8")
    safety_path.write_text(json.dumps(list(cases.values()), indent=1, ensure_ascii=False), encoding="utf-8")
    ng = netguard.status()
    summary = {"run_id": "radar-analyze-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"),
               "kind": "analyze", "ts": _now(), "model": model, "analysed_now": len(todo) - len(failed),
               "analysed_total": len(done), "pending": len([r for r in rows if r["item_id"] not in done]),
               "safety_cases": len(cases), "failed": failed, "seconds": round(time.time() - t0, 1),
               "netguard_blocked": ng["blocked"]}
    append_jsonl(radar_dir() / "runs.jsonl", [summary])
    if not quiet:
        print(json.dumps(summary, indent=1))
    return summary


# ---------------------------------------------------------------- status
def status() -> dict:
    d = radar_dir()
    items = read_jsonl(d / "items.jsonl")
    analysed = {e["item_id"]: e for e in read_jsonl(config.OUTPUTS / "enriched_radar.jsonl")}
    merged = {json.loads(l)["item_id"] for l in (config.OUTPUTS / "enriched.jsonl").read_text(encoding="utf-8").splitlines()
              if l.strip()} if (config.OUTPUTS / "enriched.jsonl").exists() else set()
    runs = read_jsonl(d / "runs.jsonl")
    last = next((r for r in reversed(runs) if r.get("kind") == "discover"), None)
    s = {"last_discover": last and last["ts"], "modes": last and last["modes"],
         "snapshots": len(read_jsonl(d / "snapshots.jsonl")), "items": len(items),
         "by_provider": {p: sum(p in r["providers"] for r in items) for p, _ in PROVIDERS},
         "corroborated": sum(r["corroborated"] for r in items),
         "by_source": {s: sum(r["source"] == s for r in items) for s in sorted({r["source"] for r in items})},
         "analysed": sum(r["item_id"] in analysed for r in items),
         "actionable": sum(analysed[r["item_id"]]["actionable"] == "yes" for r in items if r["item_id"] in analysed),
         "merged_into_app": sum(r["item_id"] in merged for r in items),
         "queries_logged": len(read_jsonl(d / "queries.jsonl"))}
    print(json.dumps(s, indent=1))
    return s


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m surge.radar", description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("discover", help="ONLINE: public queries to Tavily + Exa, snapshot + dedupe + verify")
    d.add_argument("--days", type=int, default=30)
    d.add_argument("--max", type=int, default=10, help="results per provider per query")
    d.add_argument("--replay", action="store_true", help="serve recorded fixtures; no network")
    d.add_argument("--record", action="store_true", help="save live responses as replay fixtures")
    d.add_argument("--fresh", action="store_true", help="discard earlier snapshots")
    a = sub.add_parser("analyze", help="OFFLINE: label new radar items with the local engine")
    a.add_argument("--limit", type=int)
    a.add_argument("--model")
    a.add_argument("--ids", help="comma-separated RD-* ids to analyse (default: all new items)")
    sub.add_parser("status", help="print counts")
    args = ap.parse_args(argv)
    if args.cmd == "discover":
        discover(args.days, args.max, args.replay, args.record, args.fresh)
    elif args.cmd == "analyze":
        analyze(args.limit, args.model, ids=set(args.ids.split(",")) if args.ids else None)
    else:
        status()
    return 0


if __name__ == "__main__":
    sys.exit(main())
