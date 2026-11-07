import re

import pytest

from privacy import netguard
from privacy import redact as R

# Every identifier planted in the 5 synthetic transcripts. Names are checked token by token.
IDENTIFIERS = {
    "synthetic_advisory_board_01.txt": {
        "names": ["Jane Placeholder", "Alan Fakename", "Priya Madeup", "Kim Example", "Rob Sample"],
        "strings": ["71-year-old", "kim.example@example.org", "555-010-2299", "14 October 2026",
                    "Springfield General"]},
    "synthetic_payer_call_02.txt": {
        "names": ["Gary Invented", "Linda Fauxname", "Omar Pretendson"],
        "strings": ["448812906", "linda.fauxname@northwind-example.org", "(555) 013-4470", "02 November 2026"]},
    "synthetic_patient_focus_group_03.txt": {
        "names": ["Chris Imaginary", "Teresa", "Marcus", "Denise Notarealname"],
        "strings": ["28 October 2026", "Maple Hollow", "Fairview", "Lakeside Cancer Institute"],
        "ages": ["63", "58"]},
    "synthetic_kol_interview_04.txt": {
        "names": ["Wendy Notreal"],
        "strings": ["58-year-old", "555-019-8823", "21 October 2026", "Brookfield University Hospital"]},
    "synthetic_messy_note_05.txt": {
        "names": ["Hollis Fakerton", "Jorge Samplez", "Patty Mockley"],
        "strings": ["04/17/1958", "00731942", "pmockley@riverbend-example.com", "555.017.2264", "Cedar Falls",
                    "11/03/2026", "Riverbend Oncology Associates"]},
}
DRUGS = ["osimertinib", "amivantamab", "lazertinib", "tagrisso", "rybrevant", "lazcluze"]


@pytest.mark.parametrize("name", sorted(IDENTIFIERS))
def test_every_identifier_is_caught(name, transcripts):
    original, spec = transcripts[name], IDENTIFIERS[name]
    red = R.redact(original).text
    for full in spec["names"]:
        for tok in full.split():
            assert tok not in red and tok.upper() not in red, f"{tok!r} leaked in {name}"
    for s in spec["strings"]:
        assert s in original, f"fixture drifted: {s!r}"
        assert s not in red, f"{s!r} leaked in {name}"
    for age in spec.get("ages", []):
        assert not re.search(rf"\b{age}\b", red), f"age {age} leaked in {name}"


@pytest.mark.parametrize("name", sorted(IDENTIFIERS))
def test_drug_names_survive(name, transcripts):
    original = transcripts[name]
    red = R.redact(original).text
    for d in DRUGS:
        assert red.lower().count(d) == original.lower().count(d), d
    assert sum(red.lower().count(d) for d in DRUGS) > 0


def test_spans_use_original_offsets_and_rebuild_the_text(transcripts):
    original = transcripts["synthetic_advisory_board_01.txt"]
    r = R.redact(original)
    rebuilt, pos = [], 0
    for s in r.spans:
        assert 0 <= s.start < s.end <= len(original) and s.start >= pos
        rebuilt += [original[pos:s.start], s.replacement]
        pos = s.end
    assert "".join(rebuilt + [original[pos:]]) == r.text
    assert sum(r.counts.values()) == len(r.spans)


def test_role_tags_are_consistent(transcripts):
    t1 = R.redact(transcripts["synthetic_advisory_board_01.txt"]).text
    # Alan: prose mention + 2 speaker labels; Priya: 2 speaker labels (with and without the parenthetical)
    assert "[MODERATOR]" in t1 and t1.count("[HCP-1]") == 3 and t1.count("[HCP-2]") == 2
    assert "[AGE 70-79]" in t1 and "[DATE 2026-W42]" in t1
    t2 = R.redact(transcripts["synthetic_payer_call_02.txt"]).text
    assert "[PAYER-1]" in t2 and "[PAYER-2]" in t2
    t3 = R.redact(transcripts["synthetic_patient_focus_group_03.txt"]).text
    assert t3.count("[PATIENT-1]") == 3 and "[CAREGIVER-1]" in t3
    t5 = R.redact(transcripts["synthetic_messy_note_05.txt"]).text
    assert "[DOB]" in t5 and "[PATIENT-1]" in t5


def test_public_prose_is_not_over_redacted():
    text = ("In MARIPOSA, amivantamab plus lazertinib cut progression risk versus osimertinib (NCT04487080). "
            "The FDA approved Rybrevant in the U.S. and Europe; patients aged 65 or older were included.")
    assert R.redact(text, "news").text == text


def test_redaction_runs_offline():
    """The NER model loads from the local wheel: with every outbound socket blocked, nothing is attempted."""
    R._nlp.cache_clear()
    netguard.reset()
    netguard.install()
    try:
        r = R.redact("Dr. Wendy Notreal saw the patient in Cedar Falls.")
        assert R.ner_available()
        assert netguard.status()["blocked"] == 0
        assert "Notreal" not in r.text
    finally:
        netguard.uninstall()
