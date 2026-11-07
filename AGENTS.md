# AGENTS.md: rules for AI coding assistants on this repo

**Project:** Signal Vault, built at HACK1984 for the Signal-to-Dose track (Within3). We also enter Privacy-First, Most Startup-able and, as a stretch, Surge.

**What it does:** it reads public evidence on Tagrisso (A) and Rybrevant/Lazcluze (B). For each item it outputs:
- the signal type;
- whether a launch team should act on it;
- a sentiment score (−2..+2), a speaker and a verbatim quote for each of 5 aspects.

Inference runs on a local Ollama model with the network off. The UI is a local web app with insight cards, trends, a review queue and a privacy proof.

**Motto: Privacy/Safety first.**

## Ownership: don't edit files you don't own
| Area | Owner |
|---|---|
| `engine/` (including `schema.py` = the contract), `CONTRACTS.md`, `check_setup.py`, git/merges | Lead |
| `app/` (api + web), `insights/`, `privacy/`, `fixtures/`, `surge/` (later) | Teammate |
| `README.md`, `docs/`, pitch | Shared, edited through PRs |

To change a contract, propose it in the PR description. Do not edit `engine/schema.py` yourself.

## Hard rules
1. **Never commit:**
   - the organisers' packet (`SignalDose_Packet/`, `data/`, any `*.jsonl` outside `fixtures/`);
   - `.env`;
   - anything in `outputs/`;
   - private transcripts;
   - model weights.

   Run `git status` before every commit. `fixtures/` holds **synthetic** text only.
2. **No data leaves the machine in the scored or offline path.**
   - Nothing under `engine/`, `insights/`, `privacy/` or `app/` may call an external host at runtime.
   - The web UI must not load CDN fonts, scripts or analytics; bundle them, for example with `@fontsource`.
   - Surge (Tavily/Exa) lives only in `surge/`, uses public sources only, and is never imported by the engine.
3. **Quotes are verbatim.** Never paraphrase a quote shown as a citation, and never show a citation whose offsets don't match the text.
4. **Missing is not zero.** A week with no data is absent, not 0. An unknown value is shown as "unknown".
5. **Safety presentation:**
   - A single adverse-event report is "1 spontaneous report; causality not established."
   - Recommended actions are review actions for humans, never medical claims.
   - Off-label mentions route to Medical Affairs.
   - Patient ages, sex and initials never appear on cards.
6. **Code style:**
   - Short modules; docstrings explain *why*.
   - Functions that touch the outside world return readable errors and never crash the UI.
   - Python 3.13 on Windows: always use `encoding="utf-8"` when opening files.
   - Use type hints and Pydantic models from `engine/schema.py`.
7. **Do not invent API behaviour.** If unsure about a library parameter, write a 3-line check and run it.

## Run
```powershell
# from Track_Signal_Dose\  (the venv lives one level above the repo)
.venv\Scripts\Activate.ps1
cd SignalVault
python check_setup.py
python -m fixtures.make_fixtures                                   # synthetic mock data
uvicorn app.api.main:app --host 127.0.0.1 --port 8000 --reload    # API on fixtures
cd app\web; npm install; npm run dev                              # UI on http://localhost:5173
```

## Git
- Branch `feat/<name>-<package>`; commit small and often; rebase on `main` before pushing; open a PR to `main`.
- The lead merges. Don't force-push `main`.
