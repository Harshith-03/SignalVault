# Demo video script (target 2:30, hard max 3:00)

**Setup before recording:**
- Ollama is running.
- The API is up (`uvicorn app.api.main:app --host 127.0.0.1 --port 8000`).
- The UI was built and previewed (`npm run build; npm run preview`, then http://127.0.0.1:4173), with light theme, role = Brand and product = Both.
- Close every other app. Turn on screen recording at 1080p.
- **Turn Wi-Fi OFF before the first shot.** Keep the Windows network icon visible in the taskbar.

| # | Time | Screen | Voice-over (natural, unhurried) |
|---|---|---|---|
| 1 | 0:00–0:15 | Title card, then the Overview page. Zoom on the "Offline · Nothing leaves the vault" pill and the Wi-Fi-off taskbar icon | "Launch teams for cancer drugs face hundreds of new papers, trial updates and FDA notices every week, and they often can't use cloud AI on confidential material. This is Signal Vault, running on this laptop, with Wi-Fi off." |
| 2 | 0:15–0:40 | **Signals** page: filter to Actionable, open one card (e.g. a rival's survival result). Hover the citation, then click through to Item detail with the highlighted quote | "Every item is labeled: what kind of signal, whether to act, and which team owns it. Every claim carries a quote. Click it and you land on the exact words in the source. Quotes are verified character for character; if the model can't be quoted, it doesn't get to say it." |
| 3 | 0:40–1:00 | **Trends**: product B, aspect Convenience. Show the heatmap, click a cell to open the quote drawer, and point at a hatched "no data" cell | "Here's how doctors, payers and media judge Rybrevant's convenience, week by week, with the quotes behind each score. Gaps mean no data. We never show missing data as neutral." |
| 4 | 1:00–1:35 | **Analyze**: Load sample transcript, then Analyze. Show names turning into [HCP-1] etc. and the PV flag banner. Click through to **Safety Inbox**: the case shows locked patient details as Brand. Switch the role to **Pharmacovigilance**: the details unlock, with the 4 criteria quoted and the due date | "Now a private advisory-board transcript. Names become roles before anyone sees them. One doctor mentions a patient who developed a pulmonary embolism. Signal Vault flags it as a possible reportable case: all four regulatory criteria quoted, 15-day clock running. As Brand I can't see the patient details. Switch to Pharmacovigilance, and only then do they appear." |
| 5 | 1:35–1:55 | **Privacy** page: Offline, 0 outbound attempts, the model digest, the audit chain verified | "What leaves the device? Nothing. The model runs locally, the API blocks any outbound connection, and the audit log stores hashes, not text. And the Wi-Fi is off." |
| 6 | 1:55–2:10 | **Radar** page (if keys were used): the architecture strip, the exact public queries, corroborated badges | "When we do go online, it's a separate process that sends only public drug names to Tavily and Exa, cross-checks both, and brings results back into the vault for local analysis." |
| 7 | 2:10–2:30 | The README results table (or the Overview KPI tiles) | "On the sponsor's dev set we score 0.82, up from 0.64 with rules alone, with 100% verbatim citations, at about two-tenths of a cent per hundred items on a laptop GPU. Signal Vault: launch intelligence where nothing leaves the vault." |

**Backup:** record a second take of shots 4–5 alone. That's the moment judges remember.
