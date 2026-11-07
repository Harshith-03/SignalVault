"""Regenerate the SYNTHETIC replay fixtures: python -m surge.fixtures.make_samples

Why synthetic: no Tavily / Exa key was available at build time. These files are shaped exactly like each
API's documented response (see surge/clients.py), so replay exercises the same parsing code as a live run.
The scenarios are chosen to cover every path: corroboration by same URL (with tracking params / trailing
slash), by same headline (syndicated copy) and by same content (mirror); an off-topic hit that names neither
drug; single-provider hits; and a case-report-like news item that should reach the Safety Inbox.
Real recordings replace these via `python -m surge.radar discover --record` once keys exist.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from surge.clients import exa_params, tavily_params
from surge.queries import TEMPLATES

OUT = Path(__file__).resolve().parent
NOTE = ("SYNTHETIC replay fixture: invented text shaped exactly like the documented API response, for offline tests and "
        "demos when no API key is configured. Not real articles: every title starts with [SYNTHETIC] and every text says "
        "so. Replace with real recordings via `python -m surge.radar discover --record` (public content only).")
S = "SYNTHETIC SAMPLE (not a real article). "

# key: (title, url, body, published)
A = {
    "jnj": ("[SYNTHETIC] Johnson & Johnson sample release: subcutaneous amivantamab label update",
            "https://www.jnj.com/media-center/press-releases/synthetic-radar-sample-amivantamab-subcutaneous",
            S + "The subcutaneous formulation of amivantamab (Rybrevant Faspro) received an updated US label in this "
                "sample. The company said administration takes minutes instead of hours and infusion-related "
                "reactions were less frequent than with the intravenous form.", "2026-11-03"),
    "irr": ("[SYNTHETIC] Oncologists weigh infusion time savings with subcutaneous amivantamab",
            "https://news.example.org/oncology/synthetic-amivantamab-sc-infusion-time",
            S + "Community oncologists in this sample said subcutaneous Rybrevant could free chair time, while payers "
                "asked whether the price matches the intravenous version.", "2026-10-29"),
    "irr_syn": ("[SYNTHETIC] Oncologists weigh infusion time savings with subcutaneous amivantamab - Wire Example",
                "https://wire.example.com/health/2026/10/29/synthetic-amivantamab-sc",
                S + "Syndicated copy: community oncologists said subcutaneous Rybrevant could free chair time.",
                "2026-10-29"),
    "screening": ("[SYNTHETIC] Lung cancer screening uptake rises in sample survey",
                  "https://news.example.org/screening/synthetic-uptake",
                  S + "Low-dose CT screening uptake rose in this invented survey; no specific therapy is discussed.",
                  "2026-10-20"),
    "mariposa": ("[SYNTHETIC] Overall survival with amivantamab plus lazertinib: a sample MARIPOSA analysis",
                 "https://pubmed.ncbi.nlm.nih.gov/synthetic-0001/",
                 S + "In this invented abstract, amivantamab plus lazertinib was associated with longer overall "
                     "survival than osimertinib in first-line EGFR-mutant NSCLC; the authors call for longer follow-up.",
                 "2026-10-25"),
    "flaura2": ("[SYNTHETIC] FLAURA2 sample update: osimertinib plus chemotherapy overall survival",
                "https://news.example.org/oncology/synthetic-flaura2-os",
                S + "Investigators in this sample reported an overall survival benefit for osimertinib (Tagrisso) plus "
                    "chemotherapy, with more haematological toxicity than monotherapy.", "2026-10-31"),
    "flaura2_bio": ("[SYNTHETIC] Biomarker sub-study of osimertinib in FLAURA2 (sample preprint)",
                    "https://journal.example.org/articles/synthetic-flaura2-ctdna",
                    S + "This invented preprint reports that ctDNA clearance on osimertinib tracked with "
                        "progression-free survival; evidence is exploratory and not peer reviewed.", "2026-10-18"),
    "az": ("[SYNTHETIC] AstraZeneca sample release: Tagrisso label update",
           "https://www.astrazeneca.com/media-centre/press-releases/2026/synthetic-radar-sample-tagrisso-label.html",
           S + "AstraZeneca announced in this sample that the Tagrisso (osimertinib) prescribing information was "
               "updated with longer-term survival data.", "2026-11-02"),
    "guide": ("[SYNTHETIC] Sample guideline note: first-line options for EGFR-mutant NSCLC",
              "https://news.example.org/guidelines/synthetic-egfr-first-line",
              S + "A sample guideline note lists osimertinib and amivantamab plus lazertinib among preferred "
                  "first-line options and asks clinicians to weigh toxicity and administration burden.", "2026-10-27"),
    "vte": ("[SYNTHETIC] Clinician describes clot on amivantamab plus lazertinib (sample)",
            "https://news.example.org/safety/synthetic-vte-report",
            S + "A thoracic oncologist interviewed for this sample said a 64-year-old man developed a pulmonary "
                "embolism two months after starting amivantamab plus lazertinib (Rybrevant plus Lazcluze) and was "
                "hospitalised.", "2026-11-01"),
}
# a mirror with the SAME body as `guide` but a different URL and headline -> corroborated by content hash
A["guide_mirror"] = ("[SYNTHETIC] Roundup mirror copy", "https://mirror.example.net/synthetic-roundup-copy",
                     A["guide"][2], "2026-10-27")


def _tavily(key: str, score: float) -> dict:
    t, u, body, d = A[key]
    return {"title": t, "url": u, "content": body, "score": score,
            "published_date": date.fromisoformat(d).strftime("%a, %d %b %Y") + " 14:00:00 GMT"}


def _exa(key: str, url: str | None = None) -> dict:
    t, u, body, d = A[key]
    return {"id": url or u, "url": url or u, "title": t, "publishedDate": f"{d}T14:00:00.000Z",
            "author": "Synthetic Sample", "text": body, "highlights": [body[len(S):len(S) + 160]]}


TAVILY = {"q1": [_tavily("jnj", 0.91), _tavily("irr", 0.84), _tavily("screening", 0.31)],
          "q2": [_tavily("mariposa", 0.88)], "q3": [_tavily("flaura2", 0.86)], "q4": [_tavily("az", 0.9)],
          "q5": [_tavily("guide", 0.8)], "q6": [_tavily("vte", 0.77), _tavily("jnj", 0.52)]}
EXA = {"q1": [_exa("jnj", A["jnj"][1] + "?utm_source=synthetic&utm_medium=replay"), _exa("irr_syn")],
       "q2": [_exa("mariposa", A["mariposa"][1].rstrip("/"))], "q3": [_exa("flaura2_bio")], "q4": [],
       "q5": [_exa("guide_mirror")], "q6": []}


def main() -> None:
    tav = {"_synthetic": True, "_note": NOTE, "_shape": "POST https://api.tavily.com/search response", "responses": []}
    exa = {"_synthetic": True, "_note": NOTE, "_shape": "POST https://api.exa.ai/search response", "responses": []}
    for i, t in enumerate(TEMPLATES, 1):
        tp = {**tavily_params(t.query, t.kind, 30, 10), "start_date": "2026-10-08"}
        tav["responses"].append({"request": tp, "response": {
            "query": t.query, "follow_up_questions": None, "answer": None, "images": [], "results": TAVILY[t.qid],
            "response_time": round(0.9 + i / 10, 2), "request_id": f"synthetic-tavily-{t.qid}"}})
        ep = {**exa_params(t.query, t.kind, 30, 10), "startPublishedDate": "2026-10-08T00:00:00.000Z"}
        exa["responses"].append({"request": ep, "response": {
            "requestId": f"synthetic-exa-{t.qid}", "results": EXA[t.qid], "searchTime": 700 + 25 * i,
            "costDollars": {"total": 0.0}}})
    for name, data in (("tavily_sample.json", tav), ("exa_sample.json", exa)):
        (OUT / name).write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT / 'tavily_sample.json'} and {OUT / 'exa_sample.json'} (synthetic)")


if __name__ == "__main__":
    main()
