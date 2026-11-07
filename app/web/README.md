# Signal Vault: web UI (`app/web`)

Vite + React 19 + TypeScript + Tailwind v4, with Recharts, framer-motion and lucide-react.
Inter and JetBrains Mono are bundled through `@fontsource`. Nothing is loaded from a CDN, and there is no analytics or telemetry.
**The UI only ever calls `/api/*` on its own origin.** The dev/preview server proxies those calls to the local API on 127.0.0.1.

## Run

```powershell
# 1) API (from the repo root, venv one level up)
..\.venv\Scripts\python.exe -m fixtures.make_fixtures
..\.venv\Scripts\python.exe -m uvicorn app.api.main:app --host 127.0.0.1 --port 8000

# 2) UI
cd app\web
npm install          # once; needs Node 20+
npm run dev          # http://127.0.0.1:5173
```

Another API port (for example, when :8000 is busy):

```powershell
$env:VITE_API_TARGET = "http://127.0.0.1:8010"; npm run dev
```

You can also put `VITE_API_TARGET=...` in `app/web/.env.local`.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on 127.0.0.1:5173. `/api` is proxied to `VITE_API_TARGET` (default `http://127.0.0.1:8000`). |
| `npm run build` | Type-checks (`tsc -b`), then builds into `dist/`. The build is gitignored. |
| `npm run preview` | Serves `dist/` on 127.0.0.1:4173 with the same `/api` proxy. Use it for the demo. |
| `npm run gen:types` | Regenerates `src/api/openapi.d.ts` from the running API's `/api/openapi.json`. Run it after any contract change. |

If the API is down, every page shows "API offline" with the command to start it. Nothing crashes.

## Pages

| Route | Page |
|---|---|
| `/` | **Overview.** Shows KPI tiles: items, actionable signals, review queue, open safety cases, composite score, seconds per item and cost per 100 items. Also shows the top signals, a safety call-out and an A-vs-B sentiment snapshot. |
| `/signals` | **Signals.** The insight-card feed. You can filter by product, signal type, owner, review status and actionable, or search. The filters are kept in the URL. |
| `/trends` | **Trends.** An aspect × speaker heatmap with n in each cell, plus a weekly A-vs-B line chart per aspect. Empty weeks are gaps, not 0. Click a cell or point to open a drawer with the quotes, or switch to a table view. |
| `/items/:id` | **Item detail.** The full text, with quotes highlighted by verified offsets and coloured by aspect. Also shows the labels, confidences, flags, rule hits, model, prompt version and latency. |
| `/analyze` | **Analyze.** Paste text, upload a `.txt`, or click "Load sample transcript" to embed `fixtures/transcripts/synthetic_advisory_board_01.txt` at build time. The result shows the redacted text, prediction, flags, safety case and cards. |
| `/review` | **Review queue.** Cards with `review_status == "review"`, each with Accept or Reject and a note (`POST /api/review/{card_id}`). |
| `/safety` | **Safety Inbox.** Cases with the four-criteria checklist and verbatim quotes, seriousness, day 0, due date, countdown, caveats and the FAERS badge. Pharmacovigilance users also get status actions. |
| `/privacy` | **Privacy.** Shows the offline status, blocked-attempt counter, allowed hosts, model and digest, file hashes, audit chain and redactions. A live list shows the hosts this browser tab has contacted. A plain-English explainer states the scope of each proof. |

## Global controls (top bar)
- **Product switch.** Both / Tagrisso (A, blue) / Rybrevant (B, orange). Items tagged `both` appear under A and under B.
- **Role switcher.** Brand / Medical Affairs / Pharmacovigilance / Market Access. The role is sent as `X-SV-Role` on every request. The server masks patient and reporter quotes for non-PV roles, and the UI shows those as a lock badge.
- **Theme.** Light by default. The dark theme is stored in `localStorage`.

## Conventions
- **Polarity.** Diverging red (−2) → grey (0) → teal (+2). Values are always printed with a sign, so colour never carries the meaning alone.
- **Product B.** Also drawn with a dashed line and square markers.
- **Quotes.** Rendered verbatim. A highlight is drawn only when `text.slice(start, end) === span`. On redacted transcripts the quote is re-matched verbatim and labelled as such. Otherwise it is marked "Not shown · offset mismatch".
- **Source URLs.** Shown as host text with a copy button, never as live links, so the vault never navigates out on its own.

## Offline check
After `npm run build`, list every absolute URL in the bundle:

```powershell
Select-String -Path dist\assets\*.js, dist\assets\*.css, dist\index.html -Pattern 'https?://[^"''\s)]+' -AllMatches |
  ForEach-Object { $_.Matches.Value } | Sort-Object -Unique
```

The result contains only library constants, never URLs that get fetched: React's error-decoder link, SVG/XHTML namespace URIs and similar. With Wi-Fi off, DevTools → Network shows only `127.0.0.1` requests. The Privacy page also lists these hosts live.
