"""Local model client (Ollama HTTP on 127.0.0.1 only) + retrieval of few-shot examples.

    label(item, rules, examples) -> (dict, latency_ms)        raises LLMError after MAX_ATTEMPTS
    FewShot(dev_items, gold).pick(item, k) -> list[(Item, gold_row)]   never returns the item itself
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import time
from collections import Counter

import requests

from . import config
from .prompts import EXAMPLE_TEMPLATE, PROMPT_VERSION, SYSTEM_PROMPT, USER_TEMPLATE, v1_rules
from .schema import ASPECTS, SIGNAL_TYPES, SPEAKERS, Item

MAX_TEXT_CHARS = 7000
EXAMPLE_TEXT_CHARS = 900


class LLMError(RuntimeError):
    pass


def output_schema(allowed_signals=None, fixed_speaker=None) -> dict:
    """JSON schema handed to Ollama's `format` (constrained decoding). Kept flat: arrays + enums only."""
    return {
        "type": "object",
        "properties": {
            "signal_type": {"type": "string", "enum": list(allowed_signals or SIGNAL_TYPES)},
            "why": {"type": "string"},
            "actionable": {"type": "string", "enum": ["yes", "no"]},
            "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
            "aspects": {"type": "array", "maxItems": 5, "items": {
                "type": "object",
                "properties": {
                    "aspect": {"type": "string", "enum": list(ASPECTS)},
                    "polarity": {"type": "integer", "enum": [-2, -1, 0, 1, 2]},
                    "speaker": {"type": "string", "enum": [fixed_speaker] if fixed_speaker else list(SPEAKERS)},
                    "quote": {"type": "string"},
                },
                "required": ["aspect", "polarity", "speaker", "quote"]}},
        },
        "required": ["signal_type", "why", "actionable", "confidence", "aspects"],
    }


def gold_to_label(g: dict) -> str:
    asp = [{"aspect": a, "polarity": g[a]["polarity"], "speaker": g[a]["speaker"], "quote": g[a]["span"]}
           for a in ASPECTS if g.get(a)]
    return json.dumps({"signal_type": g["signal_type"], "actionable": g["actionable"], "aspects": asp},
                      ensure_ascii=False)


_TOK = re.compile(r"[a-z][a-z0-9\-]+")


def _vec(text: str) -> Counter:
    return Counter(t for t in _TOK.findall(text.lower()) if len(t) > 2)


def _cos(a: Counter, b: Counter) -> float:
    num = sum(a[t] * b[t] for t in a.keys() & b.keys())
    den = math.sqrt(sum(v * v for v in a.values())) * math.sqrt(sum(v * v for v in b.values()))
    return num / den if den else 0.0


class FewShot:
    """Bag-of-words nearest neighbours over the gold dev items, same source preferred. Leakage-safe:
    an item is never its own example (and exact-duplicate texts are skipped)."""

    def __init__(self, items: list[Item], gold: dict[str, dict]):
        self.pool = [(it, gold[it.item_id], _vec(f"{it.title} {(it.text or '')[:2000]}"))
                     for it in items if it.item_id in gold and it.text]

    def pick(self, item: Item, k: int = 3) -> list[tuple[Item, dict]]:
        v = _vec(f"{item.title} {(item.text or '')[:2000]}")
        cands = [(it, g, _cos(v, vv) + (0.5 if it.source == item.source else 0.0)) for it, g, vv in self.pool
                 if it.item_id != item.item_id and it.text != item.text]
        cands.sort(key=lambda x: -x[2])
        return [(it, g) for it, g, _ in cands[:k]]


def _hints(item: Item, rules) -> str:
    h = []
    if rules.speaker:
        h.append(f"For this source the speaker is always '{rules.speaker}'.")
    if rules.allowed_signals:
        h.append(f"Allowed signal_type values for this source: {', '.join(rules.allowed_signals)}.")
    return " ".join(h)


def build_messages(item: Item, rules, examples) -> list[dict]:
    ex = "".join(EXAMPLE_TEMPLATE.format(source=it.source, title=it.title,
                                         text=(it.text or "")[:EXAMPLE_TEXT_CHARS], label=gold_to_label(g))
                 for it, g in examples)
    user = USER_TEMPLATE.format(hints=_hints(item, rules), examples=ex, source=item.source,
                                product={"A": "A (Tagrisso)", "B": "B (Rybrevant/Lazcluze)", "both": "both A and B"}
                                .get(item.product or "", "unknown"),
                                title=item.title, text=(item.text or "")[:MAX_TEXT_CHARS])
    system = SYSTEM_PROMPT + v1_rules(PROMPT_VERSION)
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def label(item: Item, rules, examples, model: str | None = None) -> tuple[dict, int]:
    body = {"model": model or config.MODEL, "messages": build_messages(item, rules, examples), "stream": False,
            "think": False, "keep_alive": "30m",
            "format": output_schema(rules.allowed_signals, rules.speaker),
            "options": {"temperature": 0, "seed": 7, "num_ctx": config.NUM_CTX, "num_predict": 700}}
    return chat_json(body, required="signal_type")


def chat_json(body: dict, required: str) -> tuple[dict, int]:
    """POST to local Ollama with JSON-schema output; raw responses cached by exact request hash
    (so post-processing/rule changes always re-run, while model calls are free on re-runs)."""
    key = hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:32]
    cache = config.OUTPUTS / "cache" / "llm" / f"{key}.json"
    if cache.exists():
        hit = json.loads(cache.read_text(encoding="utf-8"))
        return hit["data"], hit["ms"]
    last = None
    for attempt in range(config.MAX_ATTEMPTS):
        t0 = time.time()
        try:
            r = requests.post(f"{config.OLLAMA_URL}/api/chat", json=body, timeout=300)
            r.raise_for_status()
            content = r.json()["message"]["content"]
            data = json.loads(content)
            if not isinstance(data, dict) or required not in data:
                raise ValueError("schema not followed")
            ms = int((time.time() - t0) * 1000)
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps({"data": data, "ms": ms}, ensure_ascii=False), encoding="utf-8")
            return data, ms
        except (requests.RequestException, ValueError, KeyError, TypeError) as e:   # ValueError covers JSONDecodeError
            last = e
            body["options"]["seed"] = 7 + attempt + 1
    raise LLMError(f"local model failed after {config.MAX_ATTEMPTS} attempts: {last}")
