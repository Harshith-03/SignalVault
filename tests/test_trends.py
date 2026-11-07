from conftest import make_pred
from insights.trends import build_trends


def test_gap_week_is_absent_not_zero():
    preds = [make_pred("w10", published="2026-03-02", aspects={"safety": (-1, "hcp", "x")}),   # 2026-W10
             make_pred("w12", published="2026-03-16", aspects={"safety": (-2, "hcp", "y")})]   # 2026-W12
    weeks = [t.week for t in build_trends(preds)]
    assert weeks == ["2026-W10", "2026-W12"]
    assert all(t.n >= 1 for t in build_trends(preds))


def test_mean_uses_non_null_aspects_only():
    preds = [make_pred("a", published="2026-03-02", aspects={"efficacy": (2, "hcp", "good")}),
             make_pred("b", published="2026-03-03", aspects={"efficacy": (-1, "hcp", "bad")}),
             make_pred("c", published="2026-03-04")]                                  # no aspects at all
    pts = build_trends(preds)
    assert len(pts) == 1                                                              # null aspects add no cells
    assert pts[0].aspect == "efficacy" and pts[0].n == 2 and pts[0].mean_polarity == 0.5


def test_quotes_strongest_first_max_three_and_grouping():
    preds = [make_pred(f"i{k}", published=f"2026-03-0{k + 2}", aspects={"convenience": (pol, "patient", f"q{k}")})
             for k, pol in enumerate([1, -2, 0, 2])]
    preds.append(make_pred("other", product="B", published="2026-03-03",
                           aspects={"convenience": (1, "patient", "b")}))
    pts = build_trends(preds)
    a = next(t for t in pts if t.product == "A")
    assert a.n == 4 and [q.polarity for q in a.quotes] == [2, -2, 1]
    assert {t.product for t in pts} == {"A", "B"}


def test_items_without_week_are_skipped_and_counted():
    stats: dict = {}
    pts = build_trends([make_pred("nw", published=None, aspects={"safety": (-1, "hcp", "x")})], stats)
    assert pts == [] and stats["skipped_no_week"] == 1
