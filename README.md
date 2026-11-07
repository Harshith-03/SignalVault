# Signal Vault

**Nothing leaves the vault.**

Every week, pharma launch teams are buried under hundreds of new studies, trial updates, FDA notices and news stories about their drug and its rivals. The AI tools that could help are often off-limits, because sensitive data can't leave the company.

**Signal Vault** is a launch-intelligence assistant that runs entirely on your own laptop. It reads every piece of evidence about Tagrisso and Rybrevant and tells you three things:
- what kind of signal it is;
- whether your team should act on it;
- who should own it.

It also tracks how doctors, patients, payers and the media feel about efficacy, safety, convenience, cost and evidence quality over time.

How it stays trustworthy:
- Every claim is backed by a word-for-word quote checked against the source.
- Uncertain calls go to a human review queue instead of being guessed.
- Private material like advisory-board transcripts is scrubbed of names before anyone sees it.
- A **Safety Inbox** flags possible reportable adverse-event cases for the drug-safety team, under need-to-know access.

Built at **HACK1984** (Boston, Nov 7–8 2026) for the **Signal-to-Dose** track (Within3). Also entered in **Privacy-First**, **Most Startup-able** and **Surge**.

---

## What it does
| Capability | What a launch team sees |
|---|---|
| **Signal labeling** | Each item gets one of 9 signal types, actionable yes/no, and up to 5 aspects (efficacy, safety, convenience, access/cost, evidence quality). Each aspect has a −2..+2 score, a speaker and a **verbatim quote** |
| **Insight cards** | A headline, why it matters, the **owning team** (Brand / Medical Affairs / Pharmacovigilance / Market Access / Clinical Ops), a review action, citations, a confidence band and caveats |
| **Trend report** | Sentiment by product × aspect × speaker × week, with the quotes behind every cell. Empty weeks are **gaps, never zero** |
| **Safety Inbox** | Possible reportable cases with the four minimum criteria (patient, reporter, suspect drug, adverse event), each quoted verbatim, plus seriousness and a reporting-clock due date. Patient-level detail is visible **only to the Pharmacovigilance role** (enforced on the server) |
| **Transcript mode** | Paste an advisory-board transcript. Names, ages, contacts and dates are redacted before display. Speakers come from the transcript turns, and possible AEs are flagged for PV |
| **Privacy proof** | An in-process network guard, model and data hashes, a hash-chained audit log (hashes only, never text) and an honest scope statement |
| **Public Evidence Radar** *(Surge)* | A separate online process that sends **only public drug-name queries** to Tavily + Exa, cross-verifies the results, snapshots them, and has the **local** engine analyse them |

## Architecture
```
            ┌──────────────── OFFLINE: the vault ───────────────────────────────────────────┐
 packet /   │ engine (LangGraph)                                                              │
 transcript ┼─► rules (labeling guide) ─┬─ complete (trials, FAERS) ───────────────┐         │
            │                           └─ few-shot ─► local LLM (Ollama, JSON) ─► verify ─►│ finalize
            │ verify: exact → normalized → fuzzy snap; unverifiable quote ⇒ aspect dropped    │
            │ safety: four-criteria case triage ─► Safety Inbox (PV-only detail)              │
            │ insights: cards + trends   privacy: redact · netguard · hash-chained audit      │
            │ FastAPI (127.0.0.1, netguard on) ─► React UI (no CDN, fonts bundled)            │
            └─────────────────────────────────────────────────────────────────────────────────┘
            ┌── ONLINE, separate process, public queries only (Surge) ──┐
            │ surge.radar: Tavily + Exa → corroborate → snapshot ───────┼─► analysed by the offline engine
            └───────────────────────────────────────────────────────────┘
```

## Results (dev set, 60 gold items, official scorer, leave-one-out few-shot)
| System | Composite | Signal F1 | Actionable F1 | Aspect F1 | Polarity QWK | Speaker | Span F1 | Citation validity |
|---|---|---|---|---|---|---|---|---|
| Sample submission (all `none`) | 0.004 | 0.02 | 0.00 | 0.00 | none | none | none | none |
| Labeling-guide rules only | 0.643 | 0.33 | 0.00 | 0.30 | 1.00* | 1.00* | 0.86* | 1.00 |
| + local LLM (`qwen3:4b-instruct-2507`) | 0.794 | 0.64 | 0.77 | 0.71 | 0.89 | 1.00 | 0.54 | 1.00 |
| **+ measured guide rules (shipped)** | **0.822** | 0.76 | 0.78 | 0.76 | 0.90 | 1.00 | 0.56 | **1.00** |

\* Rules-only predicts few aspects, so these metrics cover only 10 matched aspects.

Notes on the numbers:
- The human-reviewed subset (15 items) scores 0.817.
- The model bake-off and every prompt ablation are logged in [`prompt_log.txt`](prompt_log.txt).
- One finding from the ablations: telling the 4B model to quote shorter made it drop aspects. That cost more than the shorter quotes gained, so we didn't ship it.
- Dev has only 60 items, so treat differences under about 0.01 as noise.

**Full run:** 2,114 items analysed (1,733 unlabeled + 240 test + 60 dev + 81 live Radar items) with 0 model fallbacks. The trend report spans 97 weeks (2025-W01 to 2026-W45). The Safety Inbox holds 55 possible cases from published case reports; 43 meet all four minimum criteria. The dev re-run reproduces 0.8218 exactly (deterministic decoding + request cache).

**Cost (measured, full 240-item test run on an RTX 4070 Laptop GPU):** 2.77 s per item, and about **$0.002 per 100 items** in electricity (assuming 150 W and $0.184/kWh). There is no API spend.

## Run it
```powershell
# one-time, from Track_Signal_Dose\ (packet at Track_Signal_Dose\SignalDose_Packet, rehydrated)
uv venv .venv --python 3.13; .venv\Scripts\Activate.ps1
uv pip install -r SignalVault\requirements.txt
ollama pull qwen3:4b-instruct-2507-q4_K_M
cd SignalVault; python check_setup.py

# label (works with Wi-Fi OFF)
python -m engine.run --split dev        # scores against gold with the official scorer
python -m engine.run --split test       # -> outputs/predictions_test.jsonl (the submission)
python -m engine.validate               # schema + verbatim-quote check
python -m engine.run --split unlabeled; python -m engine.run --merge

# Public Evidence Radar (Surge; the ONLY online step, a separate process, public drug-name queries only)
python -m surge.radar discover        # Tavily + Exa (replay mode without keys)
python -m surge.radar analyze         # local model, network guard on
python -m surge.merge                 # run AFTER engine.run --merge

# app
uvicorn app.api.main:app --host 127.0.0.1 --port 8000
cd app\web; npm install; npm run build; npm run preview     # http://127.0.0.1:4173
```

## Privacy and safety design
- **Local model only:** inference runs on Ollama at 127.0.0.1. The API process installs a socket guard that blocks and counts any non-loopback connection, DNS lookups included.
- **Need-to-know:** patient-level detail in the Safety Inbox, and patient demographics in case-report or transcript citations, are masked server-side for every role except Pharmacovigilance.
- **Minimum retention:** the audit log stores input hashes, labels and offsets, never text. Transcripts are redacted before display.
- **Honest caveats:** a single FAERS report is shown as "causality not established". Off-label mentions route to Medical Affairs. Seriousness that isn't stated gets the conservative 15-day clock. The Safety Inbox is a triage aid; PV makes every decision ([`docs/SAFETY_RULES.md`](docs/SAFETY_RULES.md) cites GVP Module VI, ICH E2D(R1), 21 CFR 314.80/600.80 and EPHMRA 2026).
- **Scope of proof:** the guard covers the Python process. The demo also disconnects Wi-Fi, so every component (Ollama, browser) is offline.

## Data
The organisers' packet is **not** in this repo (it isn't redistributable). Place it at `../SignalDose_Packet` and run its `tools/rehydrate.py` once. `fixtures/` holds only **synthetic** data.

## Team
Built at HACK1984 by Harshith (with Claude Code).
