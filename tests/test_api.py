import json

import pytest
from fastapi.testclient import TestClient

from conftest import TRANSCRIPTS, make_pred
from engine import config
from engine.schema import RESTRICTED_MASK, Card, PrivacyStatus, SafetyCase, TrendPoint
from privacy import hashes, netguard

TX = (TRANSCRIPTS / "synthetic_advisory_board_01.txt").read_text(encoding="utf-8")
AE_SPAN = "a 71-year-old woman, developed a pulmonary embolism"


@pytest.fixture
def client(tmp_path, monkeypatch):
    """API on an empty, temporary outputs/ dir (so it uses fixtures) with netguard installed at startup."""
    from app.api import main
    monkeypatch.setattr(config, "OUTPUTS", tmp_path)
    monkeypatch.setattr(hashes, "model_digest", lambda model, *a, **k: "sha256:test")
    # Hermetic: never call the local LLM from API tests (main's engine is real, not a stub, after merge).
    monkeypatch.setattr(main.pipeline, "analyze_text", lambda req: make_pred(
        "TX-API", signal="expert_opinion", source=req.source, product=req.product, text=req.text,
        aspects={"convenience": (2, "hcp", "It takes minutes instead of hours")}
        if "It takes minutes instead of hours" in req.text else {}))
    main._CACHE.clear()
    with TestClient(main.app) as c:
        yield c
    main._CACHE.clear()
    netguard.uninstall()


def _write_transcript_outputs(tmp_path):
    p = make_pred("TX-1", signal="safety", source="transcript", product="B", text=TX,
                  title="Advisory board (synthetic)", flags=["pv_possible_ae"],
                  aspects={"safety": (-2, "hcp", AE_SPAN), "convenience": (2, "hcp", "It takes minutes instead of hours")})
    (tmp_path / "enriched.jsonl").write_text(p.model_dump_json() + "\n", encoding="utf-8")
    (tmp_path / "texts.json").write_text(json.dumps({"TX-1": TX}), encoding="utf-8")


def test_health_metrics_and_trends(client):
    h = client.get("/api/health").json()
    assert h["ok"] and h["using_fixtures"]
    assert client.get("/api/metrics").status_code == 200
    trends = [TrendPoint.model_validate(t) for t in client.get("/api/trends").json()]
    assert trends and all(t.n >= 1 for t in trends)
    assert all(t.product == "B" for t in [TrendPoint.model_validate(t) for t in
                                          client.get("/api/trends?product=B").json()])


def test_cards_and_filters(client):
    cards = [Card.model_validate(c) for c in client.get("/api/cards").json()]
    assert cards and cards[0].actionable
    pv = client.get("/api/cards?owner=pharmacovigilance").json()
    assert pv and all(c["owner"] == "pharmacovigilance" for c in pv)
    assert all(not c["actionable"] for c in client.get("/api/cards?actionable=false").json())


def test_items(client):
    r = client.get("/api/items/SYN-000").json()
    assert r["redacted"] is False and r["prediction"]["item_id"] == "SYN-000"
    r = client.get("/api/items/SYN-008").json()              # a synthetic transcript item
    assert r["redacted"] is True and "highlights" in r
    assert client.get("/api/items/NOPE").status_code == 404


def test_transcript_item_is_redacted_and_highlights_reanchored(client, tmp_path):
    _write_transcript_outputs(tmp_path)
    r = client.get("/api/items/TX-1").json()
    assert r["redacted"] and "Fakename" not in r["text"] and "kim.example" not in r["text"]
    conv = next(h for h in r["highlights"] if h["aspect"] == "convenience")
    assert r["text"][conv["start"]:conv["end"]] == "It takes minutes instead of hours"


def test_privacy_is_real(client):
    client.post("/api/analyze", json={"text": TX, "source": "transcript", "product": "B"})
    p = PrivacyStatus.model_validate(client.get("/api/privacy").json())
    assert p.offline_mode and p.outbound_attempts_blocked == 0 and "127.0.0.1" in p.allowed_hosts
    assert p.model_digest == "sha256:test"
    assert p.data_files and all(len(f.sha256) == 64 for f in p.data_files)
    assert p.redaction_counts.get("PERSON", 0) >= 5
    assert p.audit_records == 1 and p.audit_chain_ok is True
    d = client.get("/api/privacy/details").json()
    assert d["netguard"]["installed"] and d["audit_head_sha256"]


def test_analyze_redacts_and_audits_without_text(client, tmp_path):
    r = client.post("/api/analyze", json={"text": TX, "source": "transcript", "product": "B"})
    assert r.status_code == 200
    body = r.json()
    assert "Fakename" not in body["redaction"]["text"] and "osimertinib" in body["redaction"]["text"]
    assert isinstance(body["cards"], list)
    log = (tmp_path / "audit.jsonl").read_text(encoding="utf-8")
    assert "Fakename" not in log and "osimertinib" not in log


def test_review(client):
    assert client.post("/api/review/C-SYN-000", json={"decision": "accept"}).json() == {"ok": True,
                                                                                        "card_id": "C-SYN-000"}


def test_safety_masking_brand_vs_pv(client):
    brand = [SafetyCase.model_validate(c) for c in client.get("/api/safety").json()]
    pv = [SafetyCase.model_validate(c) for c in
          client.get("/api/safety", headers={"X-SV-Role": "pharmacovigilance"}).json()]
    b1, p1 = (next(c for c in cases if c.case_id == "SC-TX-001") for cases in (brand, pv))
    assert b1.patient.quote == RESTRICTED_MASK and b1.reporter.quote == RESTRICTED_MASK
    assert p1.patient.quote == "a 71-year-old woman" and p1.reporter.quote == "DR. PRIYA MADEUP"
    assert client.post("/api/safety/SC-TX-001", json={"status": "in_triage"}).status_code == 403
    ok = client.post("/api/safety/SC-TX-001", json={"status": "in_triage"},
                     headers={"X-SV-Role": "pharmacovigilance"})
    assert ok.status_code == 200
    assert next(c for c in client.get("/api/safety?status=in_triage").json())["case_id"] == "SC-TX-001"


def test_card_quotes_masked_for_non_pv_roles(client, tmp_path):
    _write_transcript_outputs(tmp_path)

    def safety_quote(role=None):
        headers = {"X-SV-Role": role} if role else {}
        card = client.get("/api/cards", headers=headers).json()[0]
        return next(c["quote"] for c in card["citations"] if c["aspect"] == "safety"), card

    for role in (None, "brand", "medical_affairs", "market_access"):
        quote, card = safety_quote(role)
        assert RESTRICTED_MASK in quote and "71-year-old" not in quote and "woman" not in quote
        assert "71" not in card["headline"] + card["why_it_matters"]
    quote, _ = safety_quote("pharmacovigilance")
    assert quote == AE_SPAN
