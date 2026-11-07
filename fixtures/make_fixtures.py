"""Generate SYNTHETIC mock data for the desk UI (no packet text, safe to commit).

    python -m fixtures.make_fixtures

Every record is validated against engine/schema.py, so the UI is built against the real contract.
"""
from __future__ import annotations

import json
import random
from datetime import date, timedelta

from engine.config import FIXTURES
from engine.schema import (ASPECTS, AspectMeta, Card, Citation, EnrichedPrediction, Meta, Metrics, PrivacyStatus,
                           DataFileHash, TrendPoint, TrendQuote, iso_week)

random.seed(7)
SYN = [  # (source, product, signal, actionable, aspect, polarity, speaker, sentence)
    ("press_release", "B", "efficacy", True, "efficacy", 2, "company",
     "The combination showed a statistically significant overall survival benefit versus the comparator."),
    ("pubmed", "A", "safety", False, "safety", -1, "researcher",
     "Interstitial lung disease occurred more frequently than expected in this cohort."),
    ("news", "B", "access_pricing", True, "access_cost", 1, "regulator",
     "The health technology body recommended the regimen for routine funding."),
    ("fda_event", "A", "safety", False, "safety", -1, "hcp", "Rash, Diarrhoea"),
    ("ctgov", "B", "trial_update", True, "efficacy", -2, "company", "terminated for insufficient efficacy"),
    ("fda_label", "B", "regulatory", True, "convenience", 1, "regulator",
     "may switch to an every 4-week dosing regimen"),
    ("pubmed", "A", "efficacy", False, "evidence_quality", -1, "researcher", "retrospective single-centre analysis"),
    ("news", "A", "competitor_move", True, "efficacy", -1, "hcp",
     "the rival regimen outperformed the current standard in progression-free survival"),
    ("transcript", "B", "expert_opinion", True, "convenience", 1, "hcp",
     "the subcutaneous option takes minutes instead of hours in our clinic"),
    ("pubmed", "B", "safety", True, "safety", -1, "researcher", "a high risk of venous thromboembolism was observed"),
    ("press_release", "A", "efficacy", True, "efficacy", 1, "company", "continues to demonstrate improved survival"),
    ("news", "both", "guideline", True, "efficacy", 1, "hcp", "clinicians may now offer either regimen first line"),
]
OWNER = {"safety": "pharmacovigilance", "access_pricing": "market_access", "trial_update": "clinical_ops",
         "regulatory": "brand", "efficacy": "brand", "competitor_move": "brand", "guideline": "medical_affairs",
         "expert_opinion": "medical_affairs"}


def main() -> None:
    start = date(2026, 5, 4)
    preds, cards, texts = [], [], {}
    for i in range(36):
        src, prod, sig, act, asp, pol, spk, sent = SYN[i % len(SYN)]
        pol = max(-2, min(2, pol + random.choice([0, 0, 0, -1, 1])))
        pub = (start + timedelta(days=5 * i)).isoformat()
        iid = f"SYN-{i:03d}"
        text = f"Synthetic example {i}. {sent} This text is mock data for UI development only."
        s = text.index(sent)
        conf = round(random.uniform(0.45, 0.95), 2)
        status = "auto" if conf >= 0.7 else "review"
        flags = (["single_report_no_causality"] if src == "fda_event" else []) + \
                (["pv_possible_ae"] if src == "transcript" and asp == "safety" else []) + \
                (["pii_redacted"] if src == "transcript" else [])
        meta = Meta(source=src, published=pub, week=iso_week(pub), product=prod, title=f"Synthetic {sig} item {i}",
                    url=f"https://example.org/item/{iid}", signal_confidence=conf, actionable_confidence=conf,
                    aspects={asp: AspectMeta(start=s, end=s + len(sent), confidence=conf, origin="llm")},
                    review_status=status, why_actionable=f"Mock: {sig} signal relevant to the launch plan.",
                    uncertainty=None if conf >= 0.7 else "mock low confidence", rule_hits=[f"source:{src}"],
                    flags=flags, model="mock", prompt_version="mock", latency_ms=random.randint(800, 6000))
        p = EnrichedPrediction(item_id=iid, signal_type=sig, actionable="yes" if act else "no",
                               **{asp: {"polarity": pol, "speaker": spk, "span": sent}}, meta=meta)
        preds.append(p)
        texts[iid] = text
        caveats = ["Single spontaneous report; causality not established."] if src == "fda_event" else []
        cards.append(Card(card_id=f"C-{iid}", item_id=iid, headline=f"Mock headline: {sig.replace('_', ' ')} signal",
                          signal_type=sig, product=prod, actionable=act, why_it_matters=meta.why_actionable,
                          owner=OWNER[sig], recommended_action="Review the cited evidence and decide on messaging.",
                          citations=[Citation(aspect=asp, quote=sent, speaker=spk, polarity=pol, url=meta.url,
                                              start=s, end=s + len(sent))],
                          confidence="high" if conf >= 0.8 else "medium" if conf >= 0.6 else "low",
                          review_status=status, caveats=caveats, published=pub, week=meta.week, source=src))

    cells: dict[tuple, list] = {}
    for p in preds:
        for a in ASPECTS:
            asp = getattr(p, a)
            if asp:
                cells.setdefault((p.meta.product, a, asp.speaker, p.meta.week), []).append((p, asp))
    trends = [TrendPoint(product=k[0], aspect=k[1], speaker=k[2], week=k[3],
                         mean_polarity=round(sum(x.polarity for _, x in v) / len(v), 2), n=len(v),
                         quotes=[TrendQuote(item_id=p.item_id, quote=x.span, polarity=x.polarity, url=p.meta.url,
                                            published=p.meta.published) for p, x in v[:3]])
              for k, v in sorted(cells.items())]

    privacy = PrivacyStatus(offline_mode=True, outbound_attempts_blocked=0, allowed_hosts=["127.0.0.1", "localhost"],
                            model="mock", model_digest="sha256:mock",
                            data_files=[DataFileHash(path="mock/test_inputs.full.jsonl", sha256="0" * 64)],
                            redaction_counts={"PERSON": 4, "AGE": 2, "DATE": 3}, audit_records=36, audit_chain_ok=True)
    metrics = [Metrics(split="dev", composite=0.64, items=60, model="rules-only (mock)", seconds_per_item=0.01,
                       cost_per_100_items_usd=0.0,
                       scores={"signal_macro_f1": 0.33, "actionable_f1": 0.0, "aspect_f1": 0.30, "polarity_qwk": 1.0,
                               "speaker_accuracy": 1.0, "span_f1": 0.86, "citation_validity": 1.0})]

    FIXTURES.mkdir(exist_ok=True)
    (FIXTURES / "enriched.sample.jsonl").write_text("".join(p.model_dump_json() + "\n" for p in preds), encoding="utf-8")
    for name, obj in [("cards", [c.model_dump() for c in cards]), ("trends", [t.model_dump() for t in trends]),
                      ("privacy", privacy.model_dump()), ("metrics", [m.model_dump() for m in metrics]),
                      ("texts", texts)]:
        (FIXTURES / f"{name}.sample.json").write_text(json.dumps(obj, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {len(preds)} preds, {len(cards)} cards, {len(trends)} trend points to {FIXTURES}")


if __name__ == "__main__":
    main()
