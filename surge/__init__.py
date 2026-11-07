"""Surge: the Public Evidence Radar (Tavily + Exa). The ONLY package in Signal Vault that may reach the internet.

It runs as its own CLI process (`python -m surge.radar ...`), never inside the API or the engine:

    discover (online)  ->  snapshot (local files with provenance)  ->  analyze (offline, local Ollama)

What leaves the machine is only a search query built from a fixed allowlist of public drug and trial
names (see surge.queries). Packet text, transcripts, labels and user data are never sent.

Do not import surge.clients from engine/, insights/, privacy/ or app/.
"""
