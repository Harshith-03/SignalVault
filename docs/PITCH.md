# Pitch kit

## One-liner
Signal Vault turns the weekly flood of drug-launch evidence into cited, routed decisions, on a laptop, with nothing leaving the vault.

## 2-minute pitch (problem → demo → how → impact → next)
**[0:00 Problem]**
A launch team for a lung-cancer drug faces hundreds of new papers, trial updates, FDA notices and news items every week. One person often reviews all of it by hand. Within3's own survey of medical-affairs leaders found that 69% struggle to organise and analyse their data. And the AI that could help is often banned, because confidential material can't go to a cloud model.

**[0:20 Demo: Signals]**
This is Signal Vault, running on this laptop with Wi-Fi off. Every item is labeled with the signal type, whether to act, and who owns it. Every claim has a quote; click it and you land on the exact words in the source. Nothing is paraphrased, and quotes are verified character for character.

**[0:45 Demo: Trends]**
Here's how doctors, payers and the media feel about Rybrevant's convenience, week by week. Click a cell to see the quotes behind it. Gaps mean no data. We never show missing data as neutral.

**[1:05 Demo: Transcript + Safety Inbox]**
Now a private advisory-board transcript. The names disappear into roles. One doctor mentions a patient who developed a pulmonary embolism. Signal Vault flags it as a possible reportable case, with all four regulatory criteria quoted and a 15-day clock. I'm logged in as Brand, so the patient details are locked. Switch to Pharmacovigilance, and only then do they appear.

**[1:30 How]**
The labeling guide's rules handle what's fixed. A 4-billion-parameter local model makes the judgment calls, and a verifier rejects any quote it can't find. On the dev set we score 0.82, up from 0.64 with rules alone, and our citations are 100% verbatim. The cost is about two-tenths of a cent per hundred items.

**[1:50 Impact / next]**
It's a triage aid with a human in the loop, built for teams who can't use cloud AI. Next steps: pilot it with a Medical Affairs team, add SSO roles, and connect the Public Evidence Radar so new evidence lands in the vault daily.

## Likely judge questions
| Question | Answer |
|---|---|
| How do you know quotes aren't hallucinated? | Every quote is located in the source (exact, then normalized, then fuzzy-snapped back to the original characters). If it can't be found, the aspect is dropped. Citation validity is 1.00 on dev and verified on all 240 test items (`engine/validate.py`). |
| Why not a bigger model? | It has to run on a laptop with the network off. We measured 2B/4B candidates. The rules + verifier design gets most of the value: 0.64 from rules alone, 0.82 with a 4B model. |
| Did you overfit the 60 dev items? | Few-shot examples are leave-one-out, and the rules come from the labeling guide. Each prompt change was ablated one at a time. One "obvious" improvement (shorter quotes) made things worse, so we didn't ship it. Dev is optimistic; the test set is the honest number. |
| What leaves the device? | In the vault, nothing: local model, socket guard on the API, hashes-only audit log. Radar is a separate process that sends only public drug-name queries. We prove offline operation with Wi-Fi off on stage. |
| Is the Safety Inbox compliant? | It's a triage aid. The four criteria, the 15/90-day clocks and the market-research forwarding rule come from GVP Module VI, ICH E2D(R1), 21 CFR 314.80 and EPHMRA 2026 (`docs/SAFETY_RULES.md`). PV makes every decision; the tool submits nothing. |
| Who pays? | Launch-intelligence, Medical Affairs and PV-operations leads at oncology biotechs and pharma companies that can't send data to cloud AI. The model is an on-prem licence. (Pricing and willingness to pay are untested hypotheses.) |
| What about the private transcripts? | We handle speaker turns, Q/A interviews and unlabeled notes. Redaction and the Safety Inbox were tested on 5 synthetic transcript styles. |
