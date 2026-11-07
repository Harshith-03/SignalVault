# Contracts (frozen at kickoff, Sat 2026-11-07)

`engine/schema.py` is the source of truth; this page explains it. To change a contract, open a PR comment and have the lead approve it. Never change a contract silently.

## 1. Item: the input
```json
{"item_id": "PM-0004", "source": "pubmed", "source_id": "…", "url": "https://…", "published": "2026-03-14",
 "product": "A", "title": "…", "text": "…"}
```
- `source` is one of `pubmed | ctgov | fda_event | fda_label | fda_notice | press_release | news | transcript`. Unknown values are allowed and go down the LLM path.
- `product` is `A` (Tagrisso), `B` (Rybrevant/Lazcluze) or `both`.

## 2. Prediction: the scorer's shape, which goes in the submission file
```json
{"item_id": "NW-0008", "signal_type": "efficacy", "actionable": "yes",
 "efficacy": {"polarity": 2, "speaker": "company", "span": "statistically significant and clinically meaningful OS improvement"},
 "safety": null, "convenience": null, "access_cost": null, "evidence_quality": null}
```
- `signal_type` is one of efficacy, safety, regulatory, trial_update, competitor_move, access_pricing, guideline, expert_opinion, none.
- `speaker` is one of researcher, hcp, patient, company, regulator, payer, media.
- `polarity` is an int from −2 to 2.
- `span` must be an exact substring of `text`. The engine verifies this before output.

## 3. EnrichedPrediction: the engine's output for the desk
A Prediction plus `meta`:
```json
"meta": {"source": "pubmed", "published": "2026-03-14", "week": "2026-W11", "product": "A", "title": "…", "url": "…",
  "signal_confidence": 0.82, "actionable_confidence": 0.64,
  "aspects": {"efficacy": {"start": 120, "end": 171, "confidence": 0.8, "origin": "llm"}},
  "review_status": "auto|review|abstained", "why_actionable": "…", "uncertainty": null,
  "rule_hits": ["source:pubmed"], "flags": ["pv_possible_ae"], "model": "qwen3.5:4b", "prompt_version": "v1",
  "latency_ms": 4200}
```
- `flags` can contain: `pv_possible_ae`, `off_label`, `single_report_no_causality`, `case_report_demographics`, `pii_redacted`, `competitor`.
- Files:
  - `outputs/enriched.jsonl`: all splits the desk shows.
  - `outputs/predictions_test.jsonl`: the submission.
  - `outputs/texts.json`: `{item_id: text}`. This file is local only and stays gitignored.

## 4. Card, built by `insights.cards.build_cards(list[EnrichedPrediction]) -> list[Card]`
```json
{"card_id": "C-PM-0004", "item_id": "PM-0004", "headline": "…", "signal_type": "safety", "product": "B",
 "actionable": true, "why_it_matters": "…", "owner": "pharmacovigilance",
 "recommended_action": "Route to PV for literature-case assessment.",
 "citations": [{"aspect": "safety", "quote": "…", "speaker": "researcher", "polarity": -1, "url": "…", "start": 0, "end": 40}],
 "confidence": "high|medium|low", "review_status": "auto|review|abstained",
 "caveats": ["Single spontaneous report; causality not established."],
 "published": "2026-03-14", "week": "2026-W11", "source": "pubmed"}
```
- `owner` is one of brand, medical_affairs, pharmacovigilance, market_access, clinical_ops.
- `recommended_action` is always a review action for a human. It is never a medical or causal conclusion.
- Patient demographics never appear in a headline or in `why_it_matters`.

## 5. TrendPoint, built by `insights.trends.build_trends(list[EnrichedPrediction]) -> list[TrendPoint]`
```json
{"product": "B", "aspect": "safety", "speaker": "hcp", "week": "2026-W11", "mean_polarity": -0.67, "n": 3,
 "quotes": [{"item_id": "…", "quote": "…", "polarity": -1, "url": "…", "published": "2026-03-12"}]}
```
- The mean covers non-null aspects only.
- **A week with no observations is absent.** It is never shown as 0 (neutral).
- The UI must show `n` next to every mean.

## 6. Desk API (FastAPI, `127.0.0.1:8000`, see `desk/api/main.py`)
| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | `{ok, engine_stub, using_fixtures}` |
| GET | `/api/cards?product=&signal=&owner=&status=&actionable=` | `Card[]` |
| GET | `/api/trends?product=&aspect=&speaker=` | `TrendPoint[]` |
| GET | `/api/items/{item_id}` | `{prediction: EnrichedPrediction, text, redacted}` |
| GET | `/api/privacy` | `PrivacyStatus` |
| GET | `/api/metrics` | `Metrics[]` |
| POST | `/api/analyze` with body `AnalyzeRequest` | `AnalyzeResponse {redaction, prediction, cards}` |
| POST | `/api/review/{card_id}` with body `{decision: accept|reject, note}` | `{ok}` |

Interactive docs are at `http://127.0.0.1:8000/api/docs`.

## 7. Privacy functions
- `privacy.redact.redact(text, source) -> RedactionResult`. Redacts text for display and storage only; the engine always scores the original text.
- `privacy.netguard.install(allow_hosts)` and `status()`. A socket-level guard for the Python process.
- `privacy.audit.append(pred, item_text, run_id) -> AuditRecord` and `verify_chain() -> (ok, n)`. A hash-chained JSONL log that never stores raw text.

## 8. Engine functions (lead)
- `engine.pipeline.analyze_item(Item) -> EnrichedPrediction`
- `engine.pipeline.analyze_text(AnalyzeRequest) -> EnrichedPrediction`
- `python -m engine.run --split dev|test|unlabeled` writes `outputs/`.
