# SPEC: behaviours that define "done"

| ID | Behaviour | How we check it |
|---|---|---|
| B1 | **Right label, right source.** Rules decide what the labeling guide fixes; the model decides only judgment calls. | Per-source dev scores; rules never overridden on ctgov, fda_event, fda_label or fda_notice |
| B2 | **Honest about the edges.** Single FAERS reports are capped at −1 and captioned "causality not established"; status-only trial records have no aspects. | Unit cases from the labeling guide |
| B2b | **Absent is not zero.** Null aspects are excluded from trends; empty weeks are absent. | Trend test with a gap week |
| B3 | **Every quote is verbatim.** Citation validity is 1.0; every UI highlight matches its offsets. | `span in text` for 100% of outputs |
| B4 | **Abstain over guess.** Low-confidence aspects become null; low-confidence actionable calls go to the review queue. | Dev composite with vs. without abstention |
| B5 | **Offline.** The full test run and the demo work with Wi-Fi off; no runtime CDN or telemetry. | Wi-Fi-off rehearsal; netguard counter |
| B6 | **Private by design.** Transcripts are redacted before storage or display; audit records hold hashes, not text. | Synthetic transcript with names, ages, an email and a phone number |
| B7 | **Useful.** Every actionable card has an owner, a why, a review action and a citation. | Card schema validation; demo walkthrough |
| B8 | **Valid submission.** 240 lines, the exact schema and enums, and all `item_id`s present. | Validator plus the official scorer on dev |
| B9 | **No leakage.** A dev item is never its own few-shot example. | Out-of-fold retrieval assert |
