"""Turn raw Tavily / Exa results into contract `Item`s, then dedupe and cross-verify them. Pure functions, no I/O.

    normalize_hit(provider, query, raw, retrieved_at, mode) -> hit dict | None
    build_items(hits, known_urls=()) -> (items, provenance, stats)

Why cross-verification matters: one search engine can surface a stale, syndicated or mis-dated page.
When the two independent providers return the same URL, the same content, or the same headline, the item
is `corroborated` and we record which providers found it. That is the "verify" in research-verify-cite.
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime
from email.utils import parsedate_to_datetime
from typing import Optional
from urllib.parse import parse_qsl, urlencode, urlsplit

from rapidfuzz import fuzz

from engine.schema import Item

A_RE = re.compile(r"osimertinib|tagrisso", re.I)
B_RE = re.compile(r"amivantamab|rybrevant|lazertinib|lazcluze", re.I)
TRACKING = re.compile(r"^(utm_.*|fbclid|gclid|mc_cid|mc_eid|ref|cmpid|src)$", re.I)
TITLE_MATCH = 92            # rapidfuzz ratio on normalised headlines
TITLE_MIN_LEN = 25          # shorter headlines are too generic to corroborate on
WS = re.compile(r"\s+")


# ---------------------------------------------------------------- field helpers
def norm_url(url: str) -> str:
    """Scheme-less, www-less, no tracking params, no fragment, no trailing slash: one key per page."""
    try:
        u = urlsplit((url or "").strip())
    except ValueError:
        return (url or "").strip().lower()
    host = (u.hostname or "").lower()
    for pre in ("www.", "m."):
        if host.startswith(pre):
            host = host[len(pre):]
    q = sorted((k, v) for k, v in parse_qsl(u.query, keep_blank_values=True) if not TRACKING.match(k))
    path = u.path.rstrip("/")
    return f"{host}{path}" + (f"?{urlencode(q)}" if q else "")


def source_for(url: str) -> str:
    """pubmed for PubMed; press_release for AstraZeneca / J&J sites (as the packet labels them); else news."""
    host = (urlsplit(url or "").hostname or "").lower()
    if host == "pubmed.ncbi.nlm.nih.gov":
        return "pubmed"
    if host == "astrazeneca.com" or host.endswith(".astrazeneca.com") or host == "jnj.com" or host.endswith(".jnj.com"):
        return "press_release"
    return "news"


def product_for(text: str) -> Optional[str]:
    a, b = bool(A_RE.search(text or "")), bool(B_RE.search(text or ""))
    return "both" if a and b else "A" if a else "B" if b else None


def parse_date(value) -> Optional[str]:
    """Tavily sends RFC 2822 ('Mon, 03 Nov 2026 14:00:00 GMT'); Exa sends ISO 8601. -> 'YYYY-MM-DD' or None."""
    if not value or not isinstance(value, str):
        return None
    v = value.strip()
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        pass
    try:
        return parsedate_to_datetime(v).date().isoformat()
    except (TypeError, ValueError, IndexError):
        pass
    m = re.search(r"\d{4}-\d{2}-\d{2}", v)
    return m.group(0) if m else None


def clean(text) -> str:
    return WS.sub(" ", text or "").strip()


def sha256(text: str) -> str:
    return hashlib.sha256(clean(text).encode("utf-8")).hexdigest()


def title_key(title: str) -> str:
    """Lowercase alphanumerics, with a trailing ' - Site' / ' | Site' suffix removed."""
    t = re.split(r"\s+[|\-–—]\s+(?=[^|\-–—]{1,40}$)", title or "")[0]
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


def item_id_for(nurl: str) -> str:
    return "RD-" + hashlib.sha256(nurl.encode("utf-8")).hexdigest()[:8]


# ---------------------------------------------------------------- one result -> one hit
def normalize_hit(provider: str, query: str, raw: dict, retrieved_at: str, mode: str = "live",
                  qid: str = "") -> Optional[dict]:
    url = (raw or {}).get("url")
    if not url:
        return None
    title = clean(raw.get("title"))
    if provider == "tavily":
        body = clean(raw.get("content") or raw.get("raw_content"))
        published = parse_date(raw.get("published_date"))
    else:
        body = clean(raw.get("text")) or clean(" ".join(raw.get("highlights") or []))
        published = parse_date(raw.get("publishedDate"))
    if body and title and not body.lower().startswith(title.lower()):
        text = f"{title}. {body}"           # the packet's news items read "Title. Body"; mirror it
    else:
        text = body or title
    return {"provider": provider, "query": query, "qid": qid, "url": url, "norm_url": norm_url(url),
            "title": title, "published": published, "text": text, "content_sha256": sha256(body or title),
            "retrieved_at": retrieved_at, "mode": mode}


# ---------------------------------------------------------------- dedupe + corroborate
class _DSU:
    def __init__(self, n: int):
        self.p = list(range(n))

    def find(self, i: int) -> int:
        while self.p[i] != i:
            self.p[i] = self.p[self.p[i]]
            i = self.p[i]
        return i

    def union(self, a: int, b: int) -> None:
        self.p[self.find(a)] = self.find(b)


def _titles_match(a: dict, b: dict) -> bool:
    ka, kb = title_key(a["title"]), title_key(b["title"])
    if len(ka) < TITLE_MIN_LEN or len(kb) < TITLE_MIN_LEN:
        return False
    return ka == kb or fuzz.ratio(ka, kb) >= TITLE_MATCH


def cluster(hits: list[dict]) -> list[list[dict]]:
    """Group hits that are the same page: same normalised URL, same content hash, or same headline."""
    d = _DSU(len(hits))
    first: dict[tuple, int] = {}
    for i, h in enumerate(hits):
        for key in (("u", h["norm_url"]), ("c", h["content_sha256"])):
            if key in first:
                d.union(i, first[key])
            else:
                first[key] = i
    for i in range(len(hits)):
        for j in range(i + 1, len(hits)):
            if d.find(i) != d.find(j) and _titles_match(hits[i], hits[j]):
                d.union(i, j)
    groups: dict[int, list[dict]] = {}
    for i, h in enumerate(hits):
        groups.setdefault(d.find(i), []).append(h)
    return list(groups.values())


def _how(group: list[dict]) -> Optional[str]:
    """How the providers agree: same_url beats same_content beats same_title."""
    by = {}
    for h in group:
        by.setdefault(h["provider"], []).append(h)
    if len(by) < 2:
        return None
    sets = [{h["norm_url"] for h in hs} for hs in by.values()]
    if set.intersection(*sets):
        return "same_url"
    if set.intersection(*[{h["content_sha256"] for h in hs} for hs in by.values()]):
        return "same_content"
    return "same_title"


def build_items(hits: list[dict], known_urls=()) -> tuple[list[dict], list[dict], dict]:
    """-> (items: Item fields + radar extras, provenance: one row per hit (no text), stats)."""
    known = set(known_urls)
    items, prov = [], []
    stats = {"hits": len(hits), "items": 0, "corroborated": 0, "known_in_packet": 0, "off_topic": 0,
             "duplicates_merged": 0}
    for group in cluster(hits):
        nurls = sorted({h["norm_url"] for h in group})
        canon = max(group, key=lambda h: (len(h["text"]), h["provider"] == "tavily"))
        product = product_for(" ".join(f"{h['title']} {h['text']}" for h in group))
        status = "kept"
        if known & set(nurls):
            status = "known_in_packet"
        elif product is None:
            status = "off_topic"          # neither drug named: not evidence about A or B
        iid = item_id_for(nurls[0])
        for h in group:
            prov.append({"item_id": iid if status == "kept" else None, "status": status,
                         **{k: h[k] for k in ("provider", "query", "url", "title", "published", "retrieved_at",
                                              "content_sha256", "mode")}})
        if status != "kept":
            stats[status] += 1
            continue
        stats["duplicates_merged"] += len(group) - 1
        providers = sorted({h["provider"] for h in group})
        how = _how(group)
        row = Item(item_id=iid, source=source_for(canon["url"]), source_id=canon["norm_url"], url=canon["url"],
                   published=canon["published"] or next((h["published"] for h in group if h["published"]), None),
                   product=product, title=canon["title"], text=canon["text"]).model_dump()
        row.update({"providers": providers, "corroborated": how is not None, "corroboration": how,
                    "queries": sorted({h["query"] for h in group}), "urls": sorted({h["url"] for h in group}),
                    "retrieved_at": min(h["retrieved_at"] for h in group),
                    "content_sha256": canon["content_sha256"], "mode": canon["mode"]})
        items.append(row)
    items.sort(key=lambda r: (r["published"] or "", r["item_id"]), reverse=True)   # newest first...
    items.sort(key=lambda r: not r["corroborated"])                                 # ...corroborated on top
    stats["items"] = len(items)
    stats["corroborated"] = sum(r["corroborated"] for r in items)
    return items, prov, stats
