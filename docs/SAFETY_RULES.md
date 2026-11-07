# Safety Inbox: regulatory rules (verified 2026-11-07)

Drugs: osimertinib, amivantamab, lazertinib. Regions: EU and US. Quotes are verbatim; source details are at the bottom.

## 1. Minimum criteria for a valid ICSR
- A valid ICSR needs four elements: an identifiable reporter, an identifiable patient, a suspect product and a suspected reaction. "Four minimum criteria are required for ICSRs validation" ([GVP6 VI.B.2][gvp6]; same list in [E2D 2.2][e2d]).
- One descriptor makes a patient identifiable. "age (or age category, e.g., adolescent, adult, elderly), gestational age, sex, initials, date of birth, name, patient identification number" ([E2D 6.1][e2d]). GVP adds "medical record number" ([GVP6 VI.B.2][gvp6]).
- A count alone is not a case. "\"Twenty patients experienced...\" or \"a few patients experienced\" should be followed up" ([E2D 6.1][e2d])

## 2. Literature monitoring
- EU: search the literature at least weekly. "no less frequently than once a week" ([GVP6 VI.B.1.1.2][gvp6])
- An article that names only the substance counts as the MAH's own product. "ownership of the medicinal product should be assumed for articles about an active substance" ([GVP6 VI.App.2.6][gvp6])
- EMA's MLM service covers only "medicines with many marketing authorisations and multiple marketing authorisation holders" ([MLM][mlm]).
  - Osimertinib, amivantamab and lazertinib are not on the current list ([xlsx, "valid 1 June 2020"][mlmx]), so each MAH submits these literature cases itself.
- US: 15-day reports based on literature must include a copy of the article. "A 15-day Alert report based on information in the scientific literature must be accompanied by a copy of the published article." ([21 CFR 314.80(d)][cfr314]; same in [600.80(d)][cfr600])
  - The CFR sets no search frequency (none found).

## 3. Timelines and day 0
- EU day 0 is when any staff member or contractor first has the minimum criteria. Deadlines count calendar days. "This date should be considered as day zero." "The timelines for submission are based on calendar days." ([GVP6 VI.B.7][gvp6])
- EU serious cases are due in 15 days. "serious valid ICSRs shall be submitted … within 15 days from the date of receipt" ([GVP6 VI.C.3][gvp6])
- EU non-serious cases are due in 90 days, and only cases from inside the EEA are submitted. "within 90 days from the date of receipt"; "Non-serious non-EEA ICSRs should not be submitted to EV." ([GVP6 VI.C.3, VI.App.1][gvp6])
- For a literature abstract, day 0 is the date of the weekly search. "day zero … present in an abstract is taken to be the date on which the search was conducted" ([GVP6 VI.App.2.7][gvp6])
- US serious and unexpected cases are due in 15 calendar days. "both serious and unexpected … no later than 15 calendar days from initial receipt of the information" ([314.80(c)(1)(i)][cfr314])
- All other US cases go into periodic reports, but literature cases are excluded from them. "at quarterly intervals, for 3 years … then at annual intervals"; "does not apply to … reports in the scientific literature" ([314.80(c)(2)][cfr314])

## 4. Market research, PSPs, advisory boards, news
- EU: reports from market research and patient support programmes are solicited reports. "Safety reports originating from those programmes should be considered as solicited reports." ([GVP6 VI.C.2.2.11][gvp6])
- ICH: the MAH screens all market-research data and assesses causality. "managed as a solicited report which includes an appropriate causality assessment" ([E2D 4.6][e2d])
- EPHMRA: agencies forward every AE, serious or not, to the MAH within one business day. "within one business day of the MRA or its subcontractors becoming aware of the event" ([EPHMRA 2026 §4.2.3][eph])
  - A "24-hour" rule was not found: **UNVERIFIED**.
- The Insights Association sets no timeline of its own. "generally refers members to EPHMRA's 2025 Adverse Event Reporting Guidelines" ([IA][ia])
- Advisory boards are not named in any source: **UNVERIFIED**. We treat them like market research.
- News reports are handled as spontaneous reports. "it should be managed as a spontaneous report" ([GVP6 VI.B.1.1.3][gvp6])

## 5. Duplicates (FAERS, literature)
- US: cases that FDA forwarded are not resubmitted, but follow-up information still is. "not required to resubmit to FDA adverse drug experience reports forwarded to the applicant by FDA" ([314.80(b)][cfr314]; similar in [E2D 4.7][e2d])
- EU: the MAH submits a case even if it may already be reported elsewhere. "the valid report should still be submitted as ICSR" ([GVP6 VI.B.2][gvp6])
- EU: literature that analyses a non-EU database such as FAERS stays reportable. "the submission requirements remain for … a competent authority database outside the EU" ([GVP6 VI.C.2.2.3.2][gvp6])

## Implications for Signal Vault
```
EU_SERIOUS_DUE_DAYS = 15        # calendar days from day 0
EU_NONSERIOUS_DUE_DAYS = 90     # EEA-origin only
US_ALERT_DUE_DAYS = 15          # serious AND unexpected; expectedness = PV decision
LIT_SCREEN_MAX_INTERVAL_DAYS = 7
MR_VENDOR_FORWARD = "1 business day"
PATIENT_IDS = [age, age_group, sex, initials, dob, name, mrn/patient_id, gestational_age]
```
- **Valid** means all four criteria are present.
  - A count alone, a social-media handle alone, or an author who excludes causality does not qualify.
  - A substance name (INN) with no brand counts as our product.
- **Day 0:**
  - Abstract: the search date.
  - Full text and other sources: the date the criteria were first available.
- **Source type:**
  - News and literature are spontaneous.
  - Market research and advisory boards are solicited. Always flag them; PV assesses causality.
- **FAERS:** never flag a case for resubmission to FDA unless there is new information. For the EU, flag individually described cases.

**UI disclaimer:** "Signal Vault flags *possible* adverse-event reports for pharmacovigilance review. It does not decide validity, seriousness, expectedness or causality, and it submits nothing. Due dates are estimates; your PV function must confirm them."

Note: we apply 600.80 to amivantamab as a biologic, and 314.80 to the other two. **UNVERIFIED**: this split was not checked against Drugs@FDA.

[gvp6]: https://www.ema.europa.eu/en/documents/regulatory-procedural-guideline/guideline-good-pharmacovigilance-practices-gvp-module-vi-collection-management-submission-reports_en.pdf "EMA GVP Module VI Rev 2, effective 22 Nov 2017, current per EMA 2026-11-07"
[e2d]: https://www.ema.europa.eu/en/documents/scientific-guideline/ich-e2dr1-guideline-post-approval-safety-data-definitions-standards-management-reporting-individual-case-safety-reports_en.pdf "ICH E2D(R1), Step 4 15 Sep 2025, EU effective 18 Mar 2026; FDA final Mar 2026"
[mlm]: https://www.ema.europa.eu/en/human-regulatory-overview/post-authorisation/pharmacovigilance-post-authorisation/medical-literature-monitoring "EMA MLM page, accessed 2026-11-07"
[mlmx]: https://www.ema.europa.eu/en/documents/other/medical-literature-monitoring-substance-groups-1-309-and-herbal-substance-groups-1-100-valid-1-june-2020_en.xlsx "EMA MLM list, valid 1 June 2020"
[cfr314]: https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-314/subpart-B/section-314.80 "eCFR, current to 2026-11-05"
[cfr600]: https://www.ecfr.gov/current/title-21/chapter-I/subchapter-F/part-600/subpart-D/section-600.80 "eCFR, current to 2026-11-05"
[eph]: https://www.ephmra.org/sites/default/files/2026-07/2026%20EPHMRA%20AER%20Guidelines.pdf "EPHMRA AER Guidelines, July 2026"
[ia]: https://www.insightsassociation.org/News-Updates/Articles/ArticleID/1822/Adverse-Event-Reporting-in-Health-Care-Market-Research "Insights Association, 8 Oct 2025"
