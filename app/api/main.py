"""Signal Vault API (teammate-owned; lead wires the engine). Localhost only.

    uvicorn app.api.main:app --host 127.0.0.1 --port 8000 --reload

Reads outputs/ when the engine has produced files, otherwise fixtures/ (synthetic mock data),
so the web UI can be built before the engine exists. Response shapes = engine/schema.py.

Endpoints (frozen; see CONTRACTS.md §6):
    GET  /api/health
    GET  /api/cards?product=&signal=&owner=&status=&actionable=
    GET  /api/trends?product=&aspect=&speaker=
    GET  /api/items/{item_id}          -> {"prediction": EnrichedPrediction, "text": str, "redacted": bool}
    GET  /api/privacy                  -> PrivacyStatus
    GET  /api/metrics                  -> list[Metrics]
    POST /api/analyze  AnalyzeRequest  -> AnalyzeResponse
    POST /api/review/{card_id}  {"decision": "accept|reject", "note": str}
    GET  /api/safety?status=           -> list[SafetyCase]   (header X-SV-Role; non-PV roles get masked patient data)
    POST /api/safety/{case_id}  SafetyUpdate                 (PV role only, else 403)
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from engine import config, pipeline
from engine.schema import (RESTRICTED_MASK, AnalyzeRequest, AnalyzeResponse, Card, Criterion, EnrichedPrediction,
                           Metrics, PrivacyStatus, SafetyCase, SafetyUpdate, TrendPoint)
from privacy import audit, netguard, redact

app = FastAPI(title="Signal Vault API", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])
# NOTE: role is a demo-grade header (no login). It shows need-to-know enforced server-side; real auth = SSO.


def _src(name: str) -> Path:
    """Prefer real engine output; fall back to synthetic fixtures."""
    real = config.OUTPUTS / name
    return real if real.exists() else config.FIXTURES / name.replace(".json", ".sample.json")


def _load_json(name: str):
    p = _src(name)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else []


def _load_preds() -> list[EnrichedPrediction]:
    p = config.OUTPUTS / "enriched.jsonl"
    if not p.exists():
        p = config.FIXTURES / "enriched.sample.jsonl"
    return [EnrichedPrediction.model_validate_json(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]


@app.get("/api/health")
def health():
    return {"ok": True, "engine_stub": pipeline.STUB, "using_fixtures": not (config.OUTPUTS / "enriched.jsonl").exists()}


@app.get("/api/cards", response_model=list[Card])
def cards(product: Optional[str] = None, signal: Optional[str] = None, owner: Optional[str] = None,
          status: Optional[str] = None, actionable: Optional[bool] = None):
    out = [Card.model_validate(c) for c in _load_json("cards.json")]
    return [c for c in out if (product is None or c.product == product) and (signal is None or c.signal_type == signal)
            and (owner is None or c.owner == owner) and (status is None or c.review_status == status)
            and (actionable is None or c.actionable == actionable)]


@app.get("/api/trends", response_model=list[TrendPoint])
def trends(product: Optional[str] = None, aspect: Optional[str] = None, speaker: Optional[str] = None):
    out = [TrendPoint.model_validate(t) for t in _load_json("trends.json")]
    return [t for t in out if (product is None or t.product == product) and (aspect is None or t.aspect == aspect)
            and (speaker is None or t.speaker == speaker)]


@app.get("/api/items/{item_id}")
def item(item_id: str):
    for p in _load_preds():
        if p.item_id == item_id:
            texts = _load_json("texts.json") or {}
            text = texts.get(item_id, "")
            if p.meta.source == "transcript":
                return {"prediction": p, "text": redact.redact(text).text, "redacted": True}
            return {"prediction": p, "text": text, "redacted": False}
    raise HTTPException(404, f"no item {item_id}")


@app.get("/api/privacy", response_model=PrivacyStatus)
def privacy():
    fixture = _load_json("privacy.json")
    if fixture and not (config.OUTPUTS / "privacy.json").exists() and pipeline.STUB:
        return PrivacyStatus.model_validate(fixture)
    ok, n = audit.verify_chain()
    ng = netguard.status()
    return PrivacyStatus(offline_mode=ng["installed"], outbound_attempts_blocked=ng["blocked"],
                         allowed_hosts=ng["allowed_hosts"], model=config.MODEL, audit_records=n, audit_chain_ok=ok)


@app.get("/api/metrics", response_model=list[Metrics])
def metrics():
    return [Metrics.model_validate(m) for m in _load_json("metrics.json")]


@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    red = redact.redact(req.text, req.source)
    pred = pipeline.analyze_text(req)          # engine sees the ORIGINAL text (spans must be verbatim)
    try:
        from insights.cards import build_cards
        cards_ = build_cards([pred])
    except NotImplementedError:
        cards_ = []
    return AnalyzeResponse(redaction=red, prediction=pred, cards=cards_)


def _role(x_sv_role: Optional[str]) -> str:
    return x_sv_role if x_sv_role in ("brand", "medical_affairs", "pharmacovigilance", "market_access") else "brand"


def _mask(case: SafetyCase, role: str) -> SafetyCase:
    """Server-side need-to-know: only pharmacovigilance sees patient-level detail."""
    if role == "pharmacovigilance" or not case.restricted:
        return case
    c = case.model_copy(deep=True)
    c.patient = Criterion(present=c.patient.present, quote=RESTRICTED_MASK if c.patient.quote else None)
    c.reporter = Criterion(present=c.reporter.present, quote=RESTRICTED_MASK if c.reporter.quote else None)
    return c


@app.get("/api/safety", response_model=list[SafetyCase])
def safety(status: Optional[str] = None, x_sv_role: Optional[str] = Header(None)):
    role = _role(x_sv_role)
    updates = _load_json("safety_updates.json") or {}
    out = []
    for raw in _load_json("safety.json"):
        c = SafetyCase.model_validate(raw)
        if c.case_id in updates:
            c.status = updates[c.case_id]["status"]
        if status is None or c.status == status:
            out.append(_mask(c, role))
    return out


@app.post("/api/safety/{case_id}")
def safety_update(case_id: str, body: SafetyUpdate, x_sv_role: Optional[str] = Header(None)):
    if _role(x_sv_role) != "pharmacovigilance":
        raise HTTPException(403, "Only pharmacovigilance can change a case's status.")
    path = config.OUTPUTS / "safety_updates.json"
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    data[case_id] = {**body.model_dump(), "ts": datetime.now(timezone.utc).isoformat()}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1), encoding="utf-8")
    return {"ok": True, "case_id": case_id}


class ReviewDecision(BaseModel):
    decision: Literal["accept", "reject"]
    note: str = ""


@app.post("/api/review/{card_id}")
def review(card_id: str, body: ReviewDecision):
    path = config.OUTPUTS / "reviews.json"
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    data[card_id] = {**body.model_dump(), "ts": datetime.now(timezone.utc).isoformat()}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1), encoding="utf-8")
    return {"ok": True, "card_id": card_id}
