# Signal Vault: Devpost submission text

**Tagline:** Launch intelligence that never leaves your laptop. Cited, routed, safety-aware.

## Inspiration
Pharma launch teams drown in evidence: papers, trial updates, FDA notices, news. The insights that matter (a rival's survival data, a new safety warning, a payer decision) hide among hundreds of routine items. The obvious fix, an LLM, is often banned: confidential advisory-board transcripts can't go to a cloud model, and a hallucinated quote in medicine is a liability.

## What it does
Signal Vault reads each item about Tagrisso and Rybrevant/Lazcluze. For each one it decides:
- the signal type;
- whether a launch team should act;
- who should own it;
- how the item rates the drug on efficacy, safety, convenience, access/cost and evidence quality, each with a sentiment score, a speaker and a **verbatim, verified quote**.

The app shows:
- **insight cards** routed to Brand, Medical Affairs, Pharmacovigilance, Market Access or Clinical Ops;
- a **trend report** of sentiment by aspect × speaker × week, with the quotes behind every score;
- a **review queue** for uncertain calls;
- a **Safety Inbox** that flags possible reportable adverse-event cases with the four regulatory minimum criteria quoted, a reporting clock, and patient detail visible only to the PV role;
- a **transcript mode** that redacts names before display;
- a **Privacy page** proving what (doesn't) leave the device.

A separate **Public Evidence Radar** uses Tavily and Exa to find new public evidence. Only public drug-name queries go out, and the analysis runs locally.

## How we built it
- **Engine:** a LangGraph workflow:
  1. rules from the labeling guide;
  2. the nearest gold examples (leave-one-out);
  3. a local `qwen3:4b-instruct` via Ollama with JSON-schema constrained output;
  4. a span verifier (exact → normalized → fuzzy snap; unverifiable ⇒ dropped);
  5. confidence routing.
- **Safety:** a four-criteria case extractor, with rules verified against GVP Module VI, ICH E2D(R1), 21 CFR and EPHMRA 2026.
- **Privacy:** offline redaction (regex + rules + spaCy), a socket-level network guard, a hash-chained audit log and role-masked APIs.
- **App:** FastAPI on 127.0.0.1 and React + Tailwind with every asset bundled (no CDN). 56+ offline tests.

## Results
- **Dev composite 0.822** on the official scorer, up from 0.643 for rules only and 0.004 for the sample submission.
- **Citation validity 1.00.**
- **Cost:** 2.77 s per item, about $0.002 per 100 items, on a laptop GPU.

## Challenges
Small local models paraphrase quotes and mislabel speakers. We fixed that structurally: a verifier for quotes, and speaker roles from transcript turns. Some "obvious" prompt fixes made scores worse, so we measured every change one at a time.

## What's next
- A pilot with a Medical Affairs team.
- SSO-backed roles.
- A daily Radar feed.
- Calibrated confidence from human review decisions.

## Built with
Python, LangGraph, Ollama, Qwen3-4B, Pydantic, FastAPI, spaCy, RapidFuzz, React, TypeScript, Tailwind, Recharts, Tavily, Exa, Claude Code.
