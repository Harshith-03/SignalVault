"""All settings in one place. Paths walk up to find the organisers' packet (kept OUTSIDE the repo)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()  # searches upward: finds Track_Signal_Dose/.env

# Windows consoles default to cp1252 and crash on "≥", "…" etc.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

REPO = Path(__file__).resolve().parents[1]


def _find_packet() -> Path:
    env = os.getenv("SIGNALVAULT_PACKET")
    if env:
        return Path(env)
    for parent in [REPO, *REPO.parents]:
        cand = parent / "SignalDose_Packet"
        if (cand / "scoring" / "score.py").exists():
            return cand
    return REPO.parent / "SignalDose_Packet"  # may not exist yet; check_setup.py reports it


PACKET = _find_packet()
DATA = PACKET / "data"
SCORER = PACKET / "scoring" / "score.py"
OUTPUTS = Path(os.getenv("SIGNALVAULT_OUTPUTS", REPO / "outputs"))
FIXTURES = REPO / "fixtures"

SPLITS = {
    "dev": DATA / "dev.full.jsonl",
    "test": DATA / "test_inputs.full.jsonl",
    "unlabeled": DATA / "unlabeled.full.jsonl",
}
GOLD_DEV = DATA / "dev.jsonl"

# ---- model (local Ollama; the scored run must work with the network off)
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
MODEL = os.getenv("SIGNALVAULT_MODEL", "qwen3.5:4b")
NUM_CTX = int(os.getenv("SIGNALVAULT_NUM_CTX", "8192"))
PROMPT_VERSION = "v0"

# ---- decision thresholds (tuned on dev, out-of-fold)
MAX_ATTEMPTS = 2          # bounded repair loop
ASPECT_MIN_CONF = 0.5     # below this an aspect is abstained (null)
REVIEW_CONF = 0.7         # below this a card goes to the review queue
FUZZY_MIN = 90            # rapidfuzz partial_ratio needed to snap a near-verbatim span

# ---- cost model for "cost per 100 items"
LAPTOP_WATTS = float(os.getenv("LAPTOP_WATTS", "150"))
USD_PER_KWH = float(os.getenv("USD_PER_KWH", "0.184"))
