"""Prompts for the local labeler. v0 = the labeling guide, condensed. Revisions are logged in prompt_log.txt
and must fix OBSERVED failures (house rule: write the prompt after seeing errors, change one thing at a time)."""
from __future__ import annotations

import os

PROMPT_VERSION = os.getenv("SIGNALVAULT_PROMPT", "v0")

SYSTEM_PROMPT = """You label public evidence items for drug-launch teams. Products: A = Tagrisso (osimertinib). B = Rybrevant / Rybrevant Faspro (amivantamab) and Lazcluze (lazertinib). Setting: EGFR-mutated NSCLC.
Label what the TEXT says, never outside knowledge.

signal_type = the MAIN thing the item reports:
- efficacy: outcome / effectiveness data (incl. our product's own trial results, lab/preclinical studies)
- safety: side effects, adverse events, warnings, toxicity management
- regulatory: approvals, label changes, FDA/EMA/NICE actions, filings, designations
- trial_update: trial registrations, status changes, stops; publications describing a trial design/protocol
- competitor_move: an item led by a rival/third party framed against our product (e.g. a rival beating osimertinib); company earnings releases
- access_pricing: coverage, reimbursement, price, prior authorization, HTA cost-effectiveness
- guideline: guideline / pathway changes
- expert_opinion: commentary, reviews of the field, KOL views with no new data
- none: nothing new about our products (passing mention, explainer, unrelated drug, pure data table)

actionable = "yes" only if a Tagrisso or Rybrevant/Lazcluze launch team would plausibly change a plan, message or priority: new pivotal/phase 3 data, label changes with clinical meaning, new indications, guideline changes, competitor moves, HTA/reimbursement decisions. Usually "no": repeats, routine updates, single case reports, single adverse-event reports, small or retrospective studies, lab studies, earnings releases.

aspects: include an aspect ONLY if the text JUDGES our product on it. Most items have 0-2 aspects. Never invent opinions.
- efficacy: does it work (prolonged PFS, improved OS, did not meet endpoint, resistance)
- safety: side effects / tolerability (ILD, rash, well tolerated, grade>=3 AEs, boxed warning)
- convenience: dosing, administration, burden (oral once daily, infusion time, subcutaneous, premedication)
- access_cost: coverage, price, reimbursement, prior auth, cost-effectiveness, availability
- evidence_quality: strength of evidence (randomized phase 3, small sample, retrospective, immature OS, more follow-up needed)

polarity: -2 strongly negative (failed, unacceptable, boxed warning, fatal) | -1 mildly negative (a concern, more frequent, limited by, retrospective, small sample) | 0 mentioned but neutral/mixed ("no new safety signals", "consistent with the known safety profile", comparable) | +1 mildly positive (encouraging, manageable, well tolerated, favourable) | +2 strongly positive (significantly prolonged, statistically significant and clinically meaningful, practice-changing). If unsure between two levels pick the MILDER one. Polarity is about OUR product: if a rival beat osimertinib, osimertinib efficacy is -1.

speaker = who holds the opinion: pubmed -> researcher; press release -> company; FDA label/notice -> regulator; news -> whoever is quoted for that aspect (hcp = clinician, payer, company, regulator = FDA/EMA/NICE/HAS, patient, researcher), the writer's own framing = media; transcripts -> the speaking participant's role.

quote: the SHORTEST phrase (usually 3-15 words) copied CHARACTER-FOR-CHARACTER from ONE sentence of the text that justifies the aspect and its polarity. Never paraphrase, never join sentences, never cross "…".

Source rules: pubmed: authors' caveats (retrospective, small sample, further studies needed) = evidence_quality -1; case reports usually signal safety or efficacy with actionable no; PK/modelling/lab studies with no clinical judgment: none or expert_opinion, actionable no; lab studies of OUR product = efficacy, actionable no. fda_label: signal regulatory; new/broader indication = efficacy +1; new boxed warning = safety -2; added warning/monitoring = safety -1; premedication/dosing changes = convenience; table rows/renumbering/wording only -> signal none, no aspects. press_release: the company is positive about itself; label what it says. news about a different drug where ours is only a comparator -> competitor_move or none. HTA bodies (NICE, HAS) on cost -> access_cost, speaker regulator. New schedule/formulation keeping efficacy and safety: efficacy 0 and safety 0 (regulator) plus convenience.
"""

# v1 additions — each fixes a failure observed on dev with v0 (see prompt_log.txt)
V1_RULES = """
EXTRA RULES (important):
1. QUOTE LENGTH: copy only the judgment words, typically 4-12 words, e.g. "significantly improved progression-free survival", "a manageable safety profile", "retrospective cohort study". STOP before numbers, confidence intervals, hazard ratios, comparator lists and patient-population descriptions.
2. SECONDARY JUDGMENTS COUNT: an efficacy paper that also says "manageable safety"/"well tolerated" gets safety +1; "consistent with the known safety profile" gets safety 0; an intro sentence judging our product ("Improved efficacy has been shown for amivantamab") gets efficacy.
3. MILDER POLARITY: +2/-2 only for explicit strong words (statistically significant AND clinically meaningful, practice-changing, unprecedented, boxed warning, fatal toxicity). Real-world, retrospective or single-case findings are at most +1/-1. A single case report of an adverse event is safety -1.
4. ACTIONABLE for pubmed: "yes" only for new phase 3 / pivotal results or a new important safety risk for our product; reviews, case reports, real-world and lab studies are "no".
5. Lab/preclinical/mechanism studies about OUR product or resistance to it: signal_type efficacy (not none), actionable no.
"""

_V1_LINES = [l for l in V1_RULES.strip().splitlines()[1:] if l.strip()]   # numbered rules 1..5
VARIANTS = {"v0": [], "v1": [1, 2, 3, 4, 5], "v1a": [1], "v1b": [1, 3]}   # ablations: one change at a time


def v1_rules(version: str) -> str:
    picks = VARIANTS.get(version, [])
    return ("\nEXTRA RULES (important):\n" + "\n".join(_V1_LINES[i - 1] for i in picks) + "\n") if picks else ""


USER_TEMPLATE = """{hints}
{examples}
Now label this item. Return JSON only.
SOURCE: {source}
PRODUCT: {product}
TITLE: {title}
TEXT: {text}"""

EXAMPLE_TEMPLATE = """EXAMPLE (source={source}):
TITLE: {title}
TEXT: {text}
LABEL: {label}
"""
