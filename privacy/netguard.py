"""In-process network guard (teammate-owned). STUB with the final signature.

    install(allow_hosts=("127.0.0.1", "localhost", "::1")) -> None
    status() -> dict  {"installed": bool, "blocked": int, "allowed_hosts": [...], "last_blocked": [host,...]}

Implementation idea: wrap socket.socket.connect / connect_ex and socket.create_connection; refuse any
non-loopback address (raise OSError) and count it. Honest scope: this proves THIS Python process made
no outbound calls. The demo also disconnects Wi-Fi so every component (Ollama, browser) is offline.
"""
from __future__ import annotations

_STATE = {"installed": False, "blocked": 0, "allowed_hosts": [], "last_blocked": []}


def install(allow_hosts=("127.0.0.1", "localhost", "::1")) -> None:
    _STATE.update(installed=False, allowed_hosts=list(allow_hosts))  # STUB


def status() -> dict:
    return dict(_STATE)
