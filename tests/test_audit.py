import hashlib
import json

from conftest import make_pred
from privacy import audit

TEXT = "PRIVATE: Dr. Alan Fakename said a 71-year-old woman developed a pulmonary embolism."
SPAN = "developed a pulmonary embolism"


def _write(path, n=3):
    for i in range(n):
        p = make_pred(f"A-{i}", signal="safety", text=TEXT, aspects={"safety": (-1, "hcp", SPAN)})
        audit.append(p, TEXT + str(i), run_id="test-run", path=path)


def test_chain_verifies_and_holds_no_text(tmp_path):
    path = tmp_path / "audit.jsonl"
    _write(path)
    assert audit.verify_chain(path) == (True, 3)
    raw = path.read_text(encoding="utf-8")
    assert "Fakename" not in raw and SPAN not in raw and "71-year-old" not in raw
    recs = [json.loads(line) for line in raw.splitlines()]
    assert recs[0]["prev_hash"] == ""
    assert recs[1]["prev_hash"] == hashlib.sha256(raw.splitlines()[0].encode()).hexdigest()
    assert recs[0]["input_sha256"] == hashlib.sha256((TEXT + "0").encode()).hexdigest()
    assert set(recs[0]["aspects"]["safety"]) == {"polarity", "speaker", "start", "end"}


def _edit(path, idx, fn):
    lines = path.read_text(encoding="utf-8").splitlines()
    lines = fn(lines, idx)
    path.write_text("".join(line + "\n" for line in lines), encoding="utf-8")


def test_editing_any_line_breaks_the_chain(tmp_path):
    for idx in (0, 1, 2):                       # first, middle and LAST line (caught via the head file)
        path = tmp_path / f"audit{idx}.jsonl"
        _write(path)
        _edit(path, idx, lambda ls, i: ls[:i] + [ls[i].replace('"signal_type":"safety"',
                                                               '"signal_type":"efficacy"')] + ls[i + 1:])
        ok, n = audit.verify_chain(path)
        assert (ok, n) == (False, 3), idx


def test_deleting_a_line_breaks_the_chain(tmp_path):
    path = tmp_path / "audit.jsonl"
    _write(path)
    _edit(path, 0, lambda ls, i: ls[1:])
    assert audit.verify_chain(path)[0] is False


def test_missing_log_is_ok_and_empty(tmp_path):
    assert audit.verify_chain(tmp_path / "nope.jsonl") == (True, 0)
