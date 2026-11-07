# Build plan (HACK1984; hacking Sat 11:00 → Sun 11:00 ET; Devpost + video)

## Architecture
```
            ┌──────────── OFFLINE (scored / judged) ─────────────────────────────────────────┐
packet /    │  engine (LangGraph)                                                             │
transcript ─┼─► route_by_source ─┬─ rules (ctgov, fda_event, fda_label, fda_notice)           │
            │                    └─ llm_label (local Ollama model, JSON schema)               │
            │   ─► verify spans (exact → normalized → fuzzy snap → trim; else null)          │
            │   ─► repair ≤2 ─► confidence route (auto / review / abstain)                   │
            │   ─► outputs/enriched.jsonl + predictions_test.jsonl + audit.jsonl (hash-chain)│
            │                                                                                 │
            │  insights: cards + trends   privacy: redact, netguard, audit                    │
            │  app/api (FastAPI 127.0.0.1) ─► app/web (React, no CDN)                        │
            └─────────────────────────────────────────────────────────────────────────────────┘
            ┌──── ONLINE, optional, public data only (Surge stretch) ────┐
            │ surge/: Tavily + Exa discover NEW public items ─► snapshot ─┼─► fed into the offline engine
            └─────────────────────────────────────────────────────────────┘
```

## Work packages
| # | Package | Owner | Files owned | Depends on | Due |
|---|---|---|---|---|---|
| L1 | Contracts, stubs, fixtures, repo | Lead | `engine/schema.py`, `CONTRACTS.md` | none | Sat 13:30 ✅ |
| L2 | Rules + LLM labeler + span verifier + LangGraph + run CLI + leakage-safe eval | Lead | `engine/*` | L1 | Sat 19:00 |
| L3 | System prompt from observed failures; thresholds; test predictions v1 | Lead | `engine/prompts.py`, `prompt_log.txt` | L2 | Sat 23:00 |
| L4 | Transcript adapter (speaker turns, chunking), synthetic transcript tests | Lead | `engine/transcript.py` | L2 | Sun 02:00 |
| T1 | **Web UI**: Overview, Signal Feed (cards), Trends, Item detail with highlighted quotes, Analyze (paste a transcript), Privacy, Review queue | Teammate | `app/web/*` | L1 fixtures | v1 Sat 20:00, polish Sun 04:00 |
| T2 | App API extensions; `insights/cards.py`, `insights/trends.py` | Teammate | `app/api/*`, `insights/*` | L1 | Sat 18:00 |
| T3 | Privacy: `redact.py` (offline NER + regex), `netguard.py`, `audit.py` (hash chain) | Teammate | `privacy/*` | L1 | Sat 23:00 |
| T4 | Surge "Public Evidence Radar" (Tavily + Exa → public snapshots → engine), **only if gates pass** | Teammate | `surge/*` | L2, T1 | Sun 05:00–08:00 |
| S1 | README, model card, Devpost text, 2-min pitch, video | Shared | `README.md`, `docs/*` | all | Sun 10:00 |

## Timeline (feature freeze Sun 05:00)
| Time | Checkpoint |
|---|---|
| Sat 13:30 | Contracts and stubs pushed; teammate starts UI on fixtures |
| Sat 16:00 | Model bake-off on a 15-item dev slice; engine end-to-end on dev |
| Sat 19:00 | First leakage-safe dev composite vs the 0.64 rules baseline; cards and trends live from real outputs |
| Sat 23:00 | Real system prompt; tuned thresholds; **test predictions v1 saved** (insurance) |
| Sun 02:00 | Transcript mode; privacy layer; unlabeled 1,733-item run starts overnight |
| **Sun 05:00** | **Feature freeze.** Then only Surge (if gated in), bug fixes and polish |
| Sun 07:00 | Wi-Fi-off rehearsal of the full demo; cost per 100 measured |
| Sun 08:00–09:30 | Record video; Devpost text; README |
| Sun 10:30 | Submit (hacking ends 11:00) |

## Gates before Surge
1. The engine beats 0.64 on leakage-safe dev.
2. The 240 test predictions validate against the schema.
3. The offline run passes with Wi-Fi off.
4. The UI is demo-ready.
