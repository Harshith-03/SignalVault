import json

import pytest

from conftest import make_pred
from insights import build as build_cli
from insights.cards import CAVEAT_CASE, CAVEAT_FAERS, build_cards, confidence_band, route_owner


@pytest.mark.parametrize("signal,source,flags,owner", [
    ("safety", "pubmed", (), "pharmacovigilance"),
    ("access_pricing", "news", (), "market_access"),
    ("trial_update", "ctgov", (), "clinical_ops"),
    ("efficacy", "press_release", (), "brand"),
    ("efficacy", "pubmed", (), "medical_affairs"),
    ("competitor_move", "news", (), "brand"),
    ("expert_opinion", "transcript", (), "medical_affairs"),
    ("guideline", "news", (), "medical_affairs"),
    ("efficacy", "news", ("off_label",), "medical_affairs"),
    ("expert_opinion", "transcript", ("pv_possible_ae", "off_label"), "pharmacovigilance"),
])
def test_owner_routing(signal, source, flags, owner):
    assert route_owner(make_pred(signal=signal, source=source, flags=flags)) == owner


def test_no_card_for_signal_none():
    assert build_cards([make_pred(signal="none")]) == []


def test_demographics_never_in_headline_or_why():
    p = make_pred(signal="safety", source="pubmed",
                  title="Osimertinib-induced pneumonitis in a 67-year-old woman (J.D.): a case report",
                  why="A 71-year-old man, Mr. K., developed a pulmonary embolism on amivantamab.")
    card = build_cards([p])[0]
    for text in (card.headline, card.why_it_matters):
        for bad in ("67", "71", "woman", " man", "J.D.", "Mr. K"):
            assert bad not in text, (bad, text)
    assert "osimertinib" in card.headline.lower() and "pulmonary embolism" in card.why_it_matters
    assert "induced" not in card.headline                     # no causal claim in our own words
    assert CAVEAT_CASE in card.caveats


@pytest.mark.parametrize("sig,act,band", [(0.95, 0.85, "high"), (0.8, 0.8, "high"), (0.9, 0.79, "medium"),
                                          (0.6, 0.99, "medium"), (0.59, 0.95, "low"), (0.1, 0.1, "low")])
def test_confidence_band(sig, act, band):
    assert confidence_band(make_pred(sig_conf=sig, act_conf=act)) == band


def test_faers_caveat_and_review_action():
    card = build_cards([make_pred(signal="safety", source="fda_event", actionable="no")])[0]
    assert card.caveats[0] == CAVEAT_FAERS
    assert card.owner == "pharmacovigilance" and card.recommended_action.startswith("PV to confirm")


def test_citations_follow_offsets_and_drop_unprovable_ones():
    text = "Intro. The regimen improved survival. Rash was common."
    p = make_pred(text=text, aspects={"efficacy": (2, "company", "improved survival"),
                                      "safety": (-1, "researcher", "Rash was common")})
    card = build_cards([p], {p.item_id: text})[0]
    assert [c.aspect for c in card.citations] == ["efficacy", "safety"]
    for c in card.citations:
        assert text[c.start:c.end] == c.quote
    # offsets drifted: relocated when the text is known
    p.meta.aspects["efficacy"].start += 3
    p.meta.aspects["efficacy"].end += 3
    c = build_cards([p], {p.item_id: text})[0].citations[0]
    assert text[c.start:c.end] == c.quote
    # span not in the text at all: no citation rather than a wrong one
    p.efficacy.span = "not in the text"
    assert [c.aspect for c in build_cards([p], {p.item_id: text})[0].citations] == ["safety"]


def test_sort_actionable_first_then_newest():
    preds = [make_pred("a", actionable="no", published="2026-05-01"),
             make_pred("b", actionable="yes", published="2026-01-01"),
             make_pred("c", actionable="yes", published="2026-04-01"),
             make_pred("d", actionable="no", published=None)]
    assert [c.item_id for c in build_cards(preds)] == ["c", "b", "a", "d"]


def test_build_cli_writes_files(tmp_path):
    assert build_cli.main(["--out", str(tmp_path)]) == 0   # falls back to fixtures when outputs/ is empty
    cards = json.loads((tmp_path / "cards.json").read_text(encoding="utf-8"))
    trends = json.loads((tmp_path / "trends.json").read_text(encoding="utf-8"))
    assert cards and trends and all(c["owner"] for c in cards)
