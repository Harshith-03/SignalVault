"""Signal Vault API (teammate-owned; lead wires the engine). Localhost only.

    uvicorn app.api.main:app --host 127.0.0.1 --port 8000 --reload

Reads outputs/ when the engine has produced files, otherwise fixtures/ (synthetic mock data),
so the web UI can be built before the engine exists. Response shapes = engine/schema.py.

Endpoints (frozen; see CONTRACTS.md §6):
    GET  /api/health
    GET  /api/cards?product=&signal=&owner=&status=&actionable=   (header X-SV-Role, optional)
    GET  /api/trends?product=&aspect=&speaker=
    GET  /api/items/{item_id}          -> {"prediction": EnrichedPrediction, "text": str, "redacted": bool, ...}
    GET  /api/privacy                  -> PrivacyStatus
    GET  /api/metrics                  -> list[Metrics]
    POST /api/analyze  AnalyzeRequest  -> AnalyzeResponse
    POST /api/review/{card_id}  {"decision": "accept|reject", "note": str}
    GET  /api/safety?status=           -> list[SafetyCase]   (header X-SV-Role; non-PV roles get masked patient data)
    POST /api/safety/{case_id}  SafetyUpdate                 (PV role only, else 403)
    GET  /api/privacy/details          -> netguard detail (last blocked hosts), audit head, NER model (added)

Privacy wiring: netguard is installed at startup (loopback only); transcripts are redacted before
display; /api/cards masks patient demographics in citation quotes for every role except
pharmacovigilance when the card comes from a case report or a transcript.
"""
from __future__ import annotations

import json
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from engine import config, pipeline
from engine.schema import (RESTRICTED_MASK, AnalyzeRequest, AnalyzeResponse, Card, Criterion, DataFileHash,
                           EnrichedPrediction, Item, Metrics, PrivacyStatus, SafetyCase, SafetyUpdate, TrendPoint)
from insights.cards import CAVEAT_CASE, build_cards
from insights.trends import LAST_STATS, build_trends
from privacy import audit, hashes, netguard, redact
from privacy.demographics import mask_demographics

LOOPBACK = ("127.0.0.1", "localhost", "::1")
RUN_ID = "api-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    netguard.install(LOOPBACK)   # from here on this process can reach nothing but loopback (Ollama)
    yield


app = FastAPI(title="Signal Vault API", docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan)
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


_CACHE: dict = {}


def _preds_path() -> Path:
    p = config.OUTPUTS / "enriched.jsonl"
    return p if p.exists() else config.FIXTURES / "enriched.sample.jsonl"


def _cached(key: str, path: Path, build):
    """Rebuild only when the source file changes (cards/trends/hashes are derived)."""
    stamp = (str(path), path.stat().st_mtime_ns if path.exists() else 0)
    hit = _CACHE.get(key)
    if hit and hit[0] == stamp:
        return hit[1]
    val = build()
    _CACHE[key] = (stamp, val)
    return val


def _load_preds() -> list[EnrichedPrediction]:
    p = _preds_path()
    return _cached("preds", p, lambda: [EnrichedPrediction.model_validate_json(l)
                                        for l in p.read_text(encoding="utf-8").splitlines() if l.strip()])


def _texts() -> dict:
    return _load_json("texts.json") or {}


def _all_cards() -> list[Card]:
    try:
        return _cached("cards", _preds_path(), lambda: build_cards(_load_preds(), _texts()))
    except Exception:  # never crash the UI: fall back to written / fixture cards
        return [Card.model_validate(c) for c in _load_json("cards.json")]


def _all_trends() -> list[TrendPoint]:
    try:
        return _cached("trends", _preds_path(), lambda: build_trends(_load_preds()))
    except Exception:
        return [TrendPoint.model_validate(t) for t in _load_json("trends.json")]


@app.get("/api/health")
def health():
    return {"ok": True, "engine_stub": pipeline.STUB, "using_fixtures": not (config.OUTPUTS / "enriched.jsonl").exists()}


def _mask_card(card: Card, role: str) -> Card:
    """Need-to-know: patient demographics in quotes from case reports / transcripts are PV-only."""
    if role == "pharmacovigilance" or not (card.source == "transcript" or CAVEAT_CASE in card.caveats):
        return card
    c = card.model_copy(deep=True)
    for cit in c.citations:
        cit.quote = mask_demographics(cit.quote, RESTRICTED_MASK)
    return c


@app.get("/api/cards", response_model=list[Card])
def cards(product: Optional[str] = None, signal: Optional[str] = None, owner: Optional[str] = None,
          status: Optional[str] = None, actionable: Optional[bool] = None, x_sv_role: Optional[str] = Header(None)):
    role = _role(x_sv_role)
    out = [_mask_card(c, role) for c in _all_cards()]
    return [c for c in out if (product is None or c.product == product) and (signal is None or c.signal_type == signal)
            and (owner is None or c.owner == owner) and (status is None or c.review_status == status)
            and (actionable is None or c.actionable == actionable)]


@app.get("/api/trends", response_model=list[TrendPoint])
def trends(product: Optional[str] = None, aspect: Optional[str] = None, speaker: Optional[str] = None):
    out = _all_trends()
    return [t for t in out if (product is None or t.product == product) and (aspect is None or t.aspect == aspect)
            and (speaker is None or t.speaker == speaker)]


@app.get("/api/items/{item_id}")
def item(item_id: str):
    for p in _load_preds():
        if p.item_id == item_id:
            text = _texts().get(item_id, "")
            if p.meta.source == "transcript":
                red = redact.redact(text, p.meta.source)
                # citation offsets point into the ORIGINAL text; re-anchor them on the redacted text
                hl = [{"aspect": a, "start": redact.map_offset(red.spans, m.start),
                       "end": redact.map_offset(red.spans, m.end)} for a, m in p.meta.aspects.items()]
                return {"prediction": p, "text": red.text, "redacted": True, "highlights": hl,
                        "redaction_counts": red.counts}
            return {"prediction": p, "text": text, "redacted": False}
    raise HTTPException(404, f"no item {item_id}")


def _data_files() -> list[DataFileHash]:
    """sha256 of the engine's JSONL outputs; of the synthetic fixtures if the engine has not run yet."""
    skip = {audit.default_path().name}     # the audit log grows constantly; it has its own chain check
    files = sorted(f for f in config.OUTPUTS.glob("*.jsonl") if f.name not in skip) \
        or sorted(config.FIXTURES.glob("*.jsonl"))
    out = []
    for f in files:
        rel = f.relative_to(config.REPO).as_posix() if f.is_relative_to(config.REPO) else f.name
        out.append(DataFileHash(path=rel, sha256=_cached(f"sha:{f}", f, lambda f=f: hashes.file_sha256(f))))
    return out


def _model_digest() -> Optional[str]:
    hit = _CACHE.get("digest")
    if hit and time.monotonic() - hit[0] < 30:
        return hit[1]
    d = hashes.model_digest(config.MODEL)   # loopback only; None if Ollama is down
    _CACHE["digest"] = (time.monotonic(), d)
    return d


@app.get("/api/privacy", response_model=PrivacyStatus)
def privacy():
    ok, n = audit.verify_chain()
    ng = netguard.status()
    return PrivacyStatus(offline_mode=ng["installed"], outbound_attempts_blocked=ng["blocked"],
                         allowed_hosts=ng["allowed_hosts"], model=config.MODEL, model_digest=_model_digest(),
                         data_files=_data_files(), redaction_counts=redact.totals(), audit_records=n,
                         audit_chain_ok=ok)


@app.get("/api/privacy/details")
def privacy_details():
    return {"netguard": netguard.status(), "audit_head_sha256": audit.head_hash(),
            "ner_model": "en_core_web_sm (local)" if redact.ner_available() else None,
            "data_source": "outputs" if (config.OUTPUTS / "enriched.jsonl").exists() else "fixtures",
            "trend_stats": dict(LAST_STATS), "run_id": RUN_ID}


@app.get("/api/metrics", response_model=list[Metrics])
def metrics():
    return [Metrics.model_validate(m) for m in _load_json("metrics.json")]


@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest, x_sv_role: Optional[str] = Header(None)):
    red = redact.redact(req.text, req.source)
    pred = pipeline.analyze_text(req)          # engine sees the ORIGINAL text (spans must be verbatim)
    cards_ = build_cards([pred], {pred.item_id: req.text})
    try:
        audit.append(pred, req.text, RUN_ID)   # stores the hash of the input only, never the text
    except OSError:
        pass                                   # an unwritable log must not break the analysis
    case = None
    try:
        from engine.safety import detect_case
        item = Item(item_id=pred.item_id, source=req.source, title=req.title or "Pasted text", product=req.product,
                    published=pred.meta.published, text=req.text)
        case = detect_case(item, pred)
        if case:
            _store_case(case)                  # local only (gitignored outputs/); patient detail stays restricted
    except Exception:                          # safety triage must never break the main analysis
        case = None
    return AnalyzeResponse(redaction=red, prediction=pred, cards=[_mask_card(c, _role(x_sv_role)) for c in cards_],
                           safety_case=_mask(case, _role(x_sv_role)) if case else None)


def _store_case(case: SafetyCase) -> None:
    path = config.OUTPUTS / "safety.json"
    existing = json.loads(path.read_text(encoding="utf-8")) if path.exists() else \
        _load_json("safety.json")              # first live case: start from whatever the inbox shows now
    existing = [c for c in existing if c.get("case_id") != case.case_id] + [case.model_dump()]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(existing, indent=1, ensure_ascii=False), encoding="utf-8")


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
