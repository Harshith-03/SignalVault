"""Setup check: python check_setup.py   (prints ok / MISSING for everything the project needs)."""
from __future__ import annotations

import importlib
import json
import os
import urllib.request

from engine import config

ok = True


def report(label: str, good: bool, hint: str = "") -> None:
    global ok
    ok &= good
    print(f"{'ok     ' if good else 'MISSING'} {label}{'' if good else '  -> ' + hint}")


for mod in ["langgraph", "langchain", "langchain_ollama", "pydantic", "dotenv", "rapidfuzz", "fastapi", "uvicorn"]:
    try:
        importlib.import_module(mod)
        report(f"package {mod}", True)
    except ImportError:
        report(f"package {mod}", False, "pip install -r requirements.txt")

report(f"packet at {config.PACKET}", config.SCORER.exists(), "get SignalDose_Packet from the organisers; set SIGNAL_DOSE_PACKET")
for name, path in config.SPLITS.items():
    report(f"split {name}: {path.name}", path.exists(), "run: python tools/rehydrate.py data/*.jsonl (needs internet once)")

try:
    with urllib.request.urlopen(config.OLLAMA_URL + "/api/tags", timeout=3) as r:
        names = [m["name"] for m in json.load(r)["models"]]
    report("ollama running", True)
    report(f"model {config.MODEL} pulled", config.MODEL in names, f"ollama pull {config.MODEL}")
except OSError:
    report("ollama running", False, "start the Ollama app")

for key in ["ANTHROPIC_API_KEY", "TAVILY_API_KEY", "EXA_API_KEY"]:
    v = os.getenv(key, "")
    print(f"{'ok     ' if v and not v.startswith('your_') else 'optional'} {key} (dev/Surge only; not needed offline)")

print("\nALL REQUIRED OK" if ok else "\nfix the MISSING lines above")
