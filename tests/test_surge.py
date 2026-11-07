"""Public Evidence Radar (surge/): replay only, fully offline. Any attempt to reach the network fails the test."""
import json
import re
import subprocess
import sys

import pytest
import requests
from fastapi.testclient import TestClient

from conftest import REPO, make_pred
from engine import config
from engine.schema import Item
from privacy import hashes, netguard
from surge import clients, merge, radar
from surge.normalize import build_items, norm_url, normalize_hit, parse_date, product_for, source_for
from surge.queries import QUERY_ALLOWLIST, TEMPLATES, QueryNotAllowed, assert_query_allowed, build_query


@pytest.fixture(autouse=True)
def offline(monkeypatch, tmp_path):
    """No keys (-> replay), no network, a temp outputs/ dir and a temp packet."""
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    monkeypatch.setenv("EXA_API_KEY", "your_exa_api_key_here")      # the example.env placeholder counts as missing

    def no_network(*a, **k):
        raise AssertionError("surge tests must not touch the network")
    monkeypatch.setattr(requests, "post", no_network)
    monkeypatch.setattr(config, "OUTPUTS", tmp_path / "outputs")
    packet = tmp_path / "packet.jsonl"
    packet.write_text(json.dumps({"item_id": "PM-1", "url": "https://pubmed.ncbi.nlm.nih.gov/synthetic-0001"}) + "\n",
                      encoding="utf-8")
    monkeypatch.setattr(config, "SPLITS", {"dev": packet, "test": tmp_path / "missing.jsonl"})
    yield


def _replay_hits() -> list[dict]:
    hits = []
    for t in TEMPLATES:
        for name, search in radar.PROVIDERS:
            r = search(t.query, t.kind, 30, 10)
            hits += [normalize_hit(name, r.query, x, "2026-11-07T00:00:00+00:00", r.mode, t.qid) for x in r.results]
    return hits


# ---------------------------------------------------------------- query allowlist (what may leave the machine)
def test_templates_are_allowlisted_public_terms():
    for t in TEMPLATES:
        assert assert_query_allowed(t.query) == t.query
        assert all(w.lower() in QUERY_ALLOWLIST for w in t.query.split())


@pytest.mark.parametrize("bad", [
    "amivantamab a 71-year-old woman developed a pulmonary embolism",   # packet / transcript text
    "osimertinib Dr Smith",                                              # a name
    "Rybrevant safety; DROP TABLE",                                      # anything off-list
    "", "   ", "osimertinib " * 20,                                       # empty / too long
])
def test_non_allowlisted_query_raises(bad):
    with pytest.raises(QueryNotAllowed):
        assert_query_allowed(bad)


def test_clients_enforce_allowlist_before_any_io(monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "tvly-live-looking-key")      # live mode: the guard must still fire first
    monkeypatch.setenv("EXA_API_KEY", "exa-live-looking-key")
    for search in (clients.tavily_search, clients.exa_search):
        with pytest.raises(QueryNotAllowed):
            search("osimertinib patient transcript excerpt")
    with pytest.raises(QueryNotAllowed):
        build_query("amivantamab", "confidential")


# ---------------------------------------------------------------- clients: replay, never raise, keys never logged
def test_replay_mode_without_keys():
    assert clients.mode_for("tavily") == "replay" and clients.mode_for("exa") == "replay"
    r = clients.tavily_search(TEMPLATES[0].query, TEMPLATES[0].kind)
    assert r.mode == "replay" and r.results and r.error is None
    miss = clients.exa_search("osimertinib news")                      # allowlisted but never recorded
    assert miss.results == [] and "no recorded response" in miss.error


def test_live_errors_become_strings(monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "tvly-secret")
    monkeypatch.setenv("EXA_API_KEY", "exa-secret")

    class Resp:
        status_code, text = 401, "unauthorized"

    monkeypatch.setattr(requests, "post", lambda *a, **k: Resp())
    r = clients.tavily_search(TEMPLATES[0].query)
    assert r.results == [] and "HTTP 401" in r.error and "secret" not in json.dumps(r.params)

    def boom(*a, **k):
        raise requests.ConnectionError("down")
    monkeypatch.setattr(requests, "post", boom)
    r = clients.exa_search(TEMPLATES[0].query)
    assert r.results == [] and "network error" in r.error and "secret" not in json.dumps(r.params)


def test_fixtures_are_marked_synthetic_and_documented_shape():
    for p in clients.FIXTURE_FILES.values():
        fx = json.loads(p.read_text(encoding="utf-8"))
        assert fx["_synthetic"] is True and "SYNTHETIC" in fx["_note"]
        assert {r["request"]["query"] for r in fx["responses"]} == {t.query for t in TEMPLATES}
    tav = json.loads(clients.FIXTURE_FILES["tavily"].read_text(encoding="utf-8"))["responses"][0]["response"]
    assert {"query", "results", "images", "response_time", "answer"} <= tav.keys()
    assert {"title", "url", "content", "score"} <= tav["results"][0].keys()
    exa = json.loads(clients.FIXTURE_FILES["exa"].read_text(encoding="utf-8"))["responses"][0]["response"]
    assert {"requestId", "results"} <= exa.keys()
    assert {"id", "url", "title", "publishedDate", "text", "highlights"} <= exa["results"][0].keys()


# ---------------------------------------------------------------- normalisation
def test_source_product_url_and_date_normalisation():
    assert source_for("https://pubmed.ncbi.nlm.nih.gov/123/") == "pubmed"
    assert source_for("https://www.jnj.com/media-center/press-releases/x") == "press_release"
    assert source_for("https://www.investor.jnj.com/news/x") == "press_release"
    assert source_for("https://www.astrazeneca.com/media-centre/press-releases/2026/x.html") == "press_release"
    assert source_for("https://notjnj.com/x") == "news" and source_for("https://www.onclive.com/x") == "news"
    assert product_for("Tagrisso data") == "A" and product_for("lazertinib + Rybrevant") == "B"
    assert product_for("osimertinib vs amivantamab") == "both" and product_for("lung screening") is None
    assert norm_url("https://WWW.Example.org/a/?utm_source=x&id=2#top") == norm_url("http://example.org/a?id=2")
    assert parse_date("Tue, 03 Nov 2026 14:00:00 GMT") == "2026-11-03"
    assert parse_date("2026-11-03T14:00:00.000Z") == "2026-11-03" and parse_date(None) is None


def test_hits_normalise_to_contract_items():
    tav = {"title": "Osimertinib update", "url": "https://x.org/a", "content": "Body about Tagrisso.",
           "score": 0.9, "published_date": "Mon, 02 Nov 2026 10:00:00 GMT"}
    exa = {"id": "u", "url": "https://y.org/b", "title": "Rybrevant note", "publishedDate": "2026-11-01T00:00:00Z",
           "text": "", "highlights": ["Rybrevant highlight."]}
    t = normalize_hit("tavily", "q", tav, "2026-11-07T00:00:00+00:00")
    e = normalize_hit("exa", "q", exa, "2026-11-07T00:00:00+00:00")
    assert t["text"] == "Osimertinib update. Body about Tagrisso." and t["published"] == "2026-11-02"
    assert e["text"] == "Rybrevant note. Rybrevant highlight." and e["published"] == "2026-11-01"
    assert normalize_hit("exa", "q", {"title": "no url"}, "now") is None
    items, prov, _ = build_items([t, e])
    for row in items:
        it = Item.model_validate(row)
        assert re.fullmatch(r"RD-[0-9a-f]{8}", it.item_id) and it.source == "news"
    assert {r["product"] for r in items} == {"A", "B"}
    assert all("text" not in p for p in prov)                       # provenance never stores text


# ---------------------------------------------------------------- dedupe + cross-verification
def test_dedupe_and_corroboration_on_replay_fixtures():
    items, prov, stats = build_items(_replay_hits())
    assert stats["items"] == 8 and stats["corroborated"] == 4 and stats["off_topic"] == 1
    how = {r["corroboration"] for r in items if r["corroborated"]}
    assert how == {"same_url", "same_title", "same_content"}
    for r in items:
        assert r["corroborated"] == (r["providers"] == ["exa", "tavily"])
    jnj = next(r for r in items if "jnj.com" in r["url"])
    assert jnj["source"] == "press_release" and len(jnj["queries"]) == 2      # found by 2 queries, merged once
    assert len({norm_url(r["url"]) for r in items}) == len(items)
    assert {p["status"] for p in prov} == {"kept", "off_topic"}
    assert all({"provider", "query", "url", "title", "published", "retrieved_at", "content_sha256"} <= p.keys()
               for p in prov)


def test_packet_urls_are_not_resurfaced():
    items, _, stats = build_items(_replay_hits(), radar.packet_urls())
    assert stats["known_in_packet"] == 1 and stats["items"] == 7
    assert not any("pubmed" in r["url"] for r in items)


# ---------------------------------------------------------------- CLI: discover / analyze / merge
def test_discover_writes_snapshot_with_provenance_and_query_log():
    s = radar.discover(replay=True, quiet=True)
    d = config.OUTPUTS / "radar"
    assert s["modes"] == {"tavily": "replay", "exa": "replay"} and s["items"] == 7 and s["known_in_packet"] == 1
    assert len(radar.read_jsonl(d / "items.jsonl")) == 7
    log = radar.read_jsonl(d / "queries.jsonl")
    assert len(log) == 2 * len(TEMPLATES) and all(assert_query_allowed(q["query"]) for q in log)
    assert all("key" not in json.dumps(q["params"]).lower() for q in log)
    radar.discover(replay=True, quiet=True)                                   # re-run: no duplicate items
    assert len(radar.read_jsonl(d / "items.jsonl")) == 7


def test_analyze_runs_offline_and_merge_is_idempotent(monkeypatch):
    import engine.pipeline as pipeline
    import engine.safety as safety
    radar.discover(replay=True, quiet=True)
    monkeypatch.setattr(pipeline, "default_fewshot", lambda: None)
    monkeypatch.setattr(pipeline, "analyze_item", lambda it, model=None, fewshot=None: make_pred(
        it.item_id, signal="regulatory", source=it.source, product=it.product, published=it.published))
    monkeypatch.setattr(safety, "detect_case", lambda *a, **k: None)
    try:
        s = radar.analyze(limit=2, quiet=True)
        assert netguard.status()["installed"]                                # analysis ran behind the guard
    finally:
        netguard.uninstall()
    assert s["analysed_now"] == 2 and s["pending"] == 5
    (config.OUTPUTS / "enriched.jsonl").write_text(make_pred("PM-9").model_dump_json() + "\n", encoding="utf-8")
    first = merge.merge(quiet=True)
    second = merge.merge(quiet=True)
    assert first["enriched_after"] == second["enriched_after"] == 3
    texts = json.loads((config.OUTPUTS / "texts.json").read_text(encoding="utf-8"))
    assert sum(k.startswith("RD-") for k in texts) == 2


# ---------------------------------------------------------------- GET /api/radar
@pytest.fixture
def client(monkeypatch):
    from app.api import main
    monkeypatch.setattr(hashes, "model_digest", lambda model, *a, **k: "sha256:test")
    main._CACHE.clear()
    with TestClient(main.app) as c:
        yield c
    main._CACHE.clear()
    netguard.uninstall()


def test_api_radar_empty_then_populated(client):
    empty = client.get("/api/radar").json()
    assert empty["items"] == [] and empty["last_run"] is None and "surge.radar discover" in empty["hint"]
    radar.discover(replay=True, quiet=True)
    rid = radar.read_jsonl(config.OUTPUTS / "radar" / "items.jsonl")[0]["item_id"]
    (config.OUTPUTS / "enriched_radar.jsonl").write_text(
        make_pred(rid, signal="regulatory", actionable="yes").model_dump_json() + "\n", encoding="utf-8")
    r = client.get("/api/radar").json()
    assert r["providers"] == {"tavily": 6, "exa": 4} and r["corroborated"] == 3 and len(r["items"]) == 7
    assert len(r["queries"]) == 12 and {q["mode"] for q in r["queries"]} == {"replay"}
    it = next(i for i in r["items"] if i["item_id"] == rid)
    assert it["analysed"] and it["signal_type"] == "regulatory" and it["actionable"] == "yes" and not it["in_app"]
    assert all({"item_id", "title", "url", "source", "product", "published", "providers", "corroborated", "query",
                "retrieved_at", "analysed"} <= i.keys() for i in r["items"])
    assert sum(i["analysed"] for i in r["items"]) == 1


def test_api_process_never_loads_network_clients():
    code = "import sys, app.api.main; print(sorted(m for m in sys.modules if m.startswith('surge')))"
    out = subprocess.run([sys.executable, "-c", code], cwd=REPO, capture_output=True, text=True, timeout=120)
    assert out.returncode == 0, out.stderr
    assert out.stdout.strip() == "[]"
