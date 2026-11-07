# Model card: Signal Vault labeler

| | |
|---|---|
| **Model** | `qwen3:4b-instruct-2507` (Q4_K_M, 2.5 GB, Apache-2.0) via Ollama 0.40.15, run locally; temperature 0, fixed seed |
| **Not trained by us** | No fine-tuning. Pretrained weights, plus labeling-guide rules, 3 nearest gold examples (leave-one-out) and JSON-schema constrained decoding |
| **Prompt** | v0, the condensed labeling guide (`engine/prompts.py`). Every revision is logged in `prompt_log.txt` |
| **Intended use** | Triage of public evidence and internal transcripts for drug-launch teams: which items matter, why, and who should review them. **Human review is required** |
| **Not for** | Causality assessment, regulatory submission decisions, medical advice, or promotional claims |

## Performance (dev, 60 gold items; official scorer)
| Metric | Score |
|---|---|
| Composite | 0.822 (human-reviewed subset 0.817) |
| Signal macro-F1 | 0.76 |
| Actionable F1 | 0.78 |
| Aspect F1 | 0.76 |
| Polarity QWK | 0.90 |
| Speaker accuracy | 1.00 |
| Span F1 | 0.56 |
| Citation validity | 1.00 |

Few-shot examples are leave-one-out. Rules and prompt changes were chosen on dev, so dev is optimistic. The test set is the honest number.

## Known failure modes
- **Quotes are longer than the gold quotes** (median 13 vs 9 words). That lowers span F1, but every quote is still verbatim.
- **Secondary judgments get missed** (e.g. "manageable safety" inside an efficacy paper). Small rare classes (guideline, expert_opinion, access_pricing) have 1–2 dev examples each, so their scores are noisy.
- **Transcripts:** speakers come from turn labels. Unlabeled notes fall back to the model's guess.
- **Safety Inbox:** the patient criterion needs an explicit identifier (age, sex, initials…). Narrative cases without one are reported as "n of 4 criteria", not as valid candidates.

## Safety and privacy
- **Quotes:** any quote that can't be found verbatim is dropped. It is never paraphrased.
- **FAERS:** single reports are capped at −1 and captioned "causality not established".
- **Transcripts:** names, ages, contacts and dates are redacted before display. The engine scores the original text locally.
- **Access:** patient-level detail is visible only to the Pharmacovigilance role.
- **Logs:** the audit log holds hashes and offsets, never text.

## Cost
2.77 s per item on an RTX 4070 Laptop GPU. That's about $0.002 per 100 items in electricity (assuming 150 W and $0.184/kWh). There is no API cost.
