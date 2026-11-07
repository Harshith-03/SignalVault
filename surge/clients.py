"""Thin Tavily and Exa wrappers: the only code in Signal Vault that opens an internet connection.

    tavily_search(query, kind, days, max_results, replay=False) -> ProviderResponse
    exa_search(query, kind, days, max_results, replay=False)    -> ProviderResponse

Why plain `requests` and not the SDKs: two POSTs do not justify two extra dependencies, and the request
body is then visible here, so a reviewer can see exactly what leaves the machine.

Parameters verified against the official REST references on 2026-11-07 (WebFetch of the pages below):
  Tavily  POST https://api.tavily.com/search  (docs.tavily.com/documentation/api-reference/endpoint/search)
    auth header `Authorization: Bearer <key>`; body `query`, `topic` in {general, news, finance},
    `search_depth` (basic = 1 credit), `max_results` 0..20, `start_date` YYYY-MM-DD,
    `include_published_date` (auto-on for news), `include_raw_content`, `include_answer`.
    There is NO `days` parameter in the current spec: we map --days to `start_date`.
    Response: {query, answer, images, results:[{title, url, content, score, raw_content?, published_date?}],
    response_time, request_id}.
  Exa     POST https://api.exa.ai/search  (docs.exa.ai/reference/search)
    auth header `x-api-key`; body `query`, `type` ("auto"), `numResults` (1..100), `category`
    (documented: company, publication, news, personal site, financial report, people; other strings are
    accepted as hints; the Python SDK reference still lists "research paper"), `startPublishedDate`
    (ISO 8601 date-time), `contents: {text: {maxCharacters}, highlights: {maxCharacters}}`.
    Contents are requested inside /search (`search_and_contents` is only an SDK convenience).
    Response: {requestId, results:[{id, url, title, publishedDate, author, text, highlights}], searchTime, ...}.
    If the server rejects the category (HTTP 400) we retry once without it.

Rules: every query passes `assert_query_allowed` BEFORE any I/O (a policy violation raises; nothing is
sent). Everything else never raises: errors come back as `[]` plus a readable string. Keys are read from
the environment (`load_dotenv()` finds Track_Signal_Dose/.env); a missing key or a `your_...` placeholder
switches that provider to replay mode, which serves recorded responses from surge/fixtures/.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Literal, Optional

import requests
from dotenv import load_dotenv

from .queries import Kind, assert_query_allowed

load_dotenv()

TAVILY_URL = "https://api.tavily.com/search"
EXA_URL = "https://api.exa.ai/search"
TIMEOUT = (5, 30)               # (connect, read) seconds
FIXTURES = Path(__file__).resolve().parent / "fixtures"
FIXTURE_FILES = {"tavily": FIXTURES / "tavily_sample.json", "exa": FIXTURES / "exa_sample.json"}
Provider = Literal["tavily", "exa"]
Mode = Literal["live", "replay"]


@dataclass
class ProviderResponse:
    provider: Provider
    query: str
    mode: Mode
    params: dict = field(default_factory=dict, metadata={"doc": "request body WITHOUT the key, for the query log"})
    results: list[dict] = field(default_factory=list)
    raw: Optional[dict] = None
    error: Optional[str] = None


def api_key(provider: Provider) -> Optional[str]:
    """The key, or None when it is missing or still the example.env placeholder."""
    k = (os.getenv("TAVILY_API_KEY" if provider == "tavily" else "EXA_API_KEY") or "").strip()
    return None if not k or k.lower().startswith("your_") else k


def mode_for(provider: Provider, force_replay: bool = False) -> Mode:
    return "replay" if force_replay or api_key(provider) is None else "live"


def _start(days: int) -> date:
    return date.today() - timedelta(days=max(int(days), 1))


def tavily_params(query: str, kind: Kind, days: int, max_results: int) -> dict:
    return {"query": query, "topic": "news" if kind == "news" else "general", "search_depth": "basic",
            "max_results": max(1, min(int(max_results), 20)), "start_date": _start(days).isoformat(),
            "include_published_date": True, "include_answer": False, "include_raw_content": False}


def exa_params(query: str, kind: Kind, days: int, max_results: int) -> dict:
    return {"query": query, "type": "auto", "numResults": max(1, min(int(max_results), 100)),
            "category": "news" if kind == "news" else "research paper",
            "startPublishedDate": f"{_start(days).isoformat()}T00:00:00.000Z",
            "contents": {"text": {"maxCharacters": 2000}, "highlights": {"maxCharacters": 600}}}


# ---------------------------------------------------------------- replay
def _load_fixture(provider: Provider) -> dict:
    p = FIXTURE_FILES[provider]
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"responses": []}


def _replay(provider: Provider, query: str, params: dict) -> ProviderResponse:
    fx = _load_fixture(provider)
    for rec in fx.get("responses", []):
        if rec.get("request", {}).get("query") == query:
            raw = rec.get("response") or {}
            return ProviderResponse(provider, query, "replay", params, list(raw.get("results") or []), raw)
    return ProviderResponse(provider, query, "replay", params,
                            error=f"{provider}: no recorded response for {query!r} in {FIXTURE_FILES[provider].name}")


def record(provider: Provider, resp: ProviderResponse) -> None:
    """Save a LIVE response as a replay fixture (public search results only)."""
    if resp.mode != "live" or resp.raw is None:
        return
    fx = _load_fixture(provider)
    if fx.get("_synthetic"):
        fx = {"responses": []}          # real recordings replace the synthetic sample entirely
    fx["_synthetic"] = False
    fx["_note"] = f"Real {provider} responses recorded by `python -m surge.radar discover --record`. Public content only."
    fx["responses"] = [r for r in fx.get("responses", []) if r.get("request", {}).get("query") != resp.query]
    fx["responses"].append({"request": resp.params, "response": resp.raw})
    FIXTURE_FILES[provider].parent.mkdir(parents=True, exist_ok=True)
    FIXTURE_FILES[provider].write_text(json.dumps(fx, indent=1, ensure_ascii=False), encoding="utf-8")


# ---------------------------------------------------------------- live
def _post(provider: Provider, url: str, headers: dict, body: dict) -> tuple[Optional[dict], Optional[str], int]:
    try:
        r = requests.post(url, headers=headers, json=body, timeout=TIMEOUT)
    except requests.RequestException as e:
        return None, f"{provider}: network error ({type(e).__name__})", 0
    if r.status_code != 200:
        hint = " (check the API key)" if r.status_code in (401, 403) else ""
        return None, f"{provider}: HTTP {r.status_code}{hint}: {r.text[:200]}", r.status_code
    try:
        return r.json(), None, 200
    except ValueError:
        return None, f"{provider}: response was not JSON", 200


def tavily_search(query: str, kind: Kind = "news", days: int = 30, max_results: int = 10,
                  replay: bool = False) -> ProviderResponse:
    assert_query_allowed(query)
    params = tavily_params(query, kind, days, max_results)
    if mode_for("tavily", replay) == "replay":
        return _replay("tavily", query, params)
    raw, err, _ = _post("tavily", TAVILY_URL, {"Authorization": f"Bearer {api_key('tavily')}"}, params)
    if err:
        return ProviderResponse("tavily", query, "live", params, error=err)
    return ProviderResponse("tavily", query, "live", params, list(raw.get("results") or []), raw)


def exa_search(query: str, kind: Kind = "news", days: int = 30, max_results: int = 10,
               replay: bool = False) -> ProviderResponse:
    assert_query_allowed(query)
    params = exa_params(query, kind, days, max_results)
    if mode_for("exa", replay) == "replay":
        return _replay("exa", query, params)
    headers = {"x-api-key": api_key("exa") or ""}
    raw, err, status = _post("exa", EXA_URL, headers, params)
    if status == 400 and "category" in params:      # category is a hint; never lose the search over it
        params = {k: v for k, v in params.items() if k != "category"}
        raw, err, status = _post("exa", EXA_URL, headers, params)
    if err:
        return ProviderResponse("exa", query, "live", params, error=err)
    return ProviderResponse("exa", query, "live", params, list(raw.get("results") or []), raw)
