# Signal Vault: design system

A visual and UX redesign of the web UI, not a feature rewrite. Every route, filter, chart, form and API call
is unchanged. The look takes its cues from warm, editorial consumer products: an ivory page, olive and sage accents,
soft rounded cards, calm large numbers and compact navigation.

## 1. Audit: what was inconsistent or hard to use

**Visual language**
- The palette was a cool blue-grey SaaS set (`#f6f7f9`, a blue focus colour, a black primary button). Nothing tied it to the product.
- Elevation was everywhere. Every tile, panel and card had a border *and* a shadow, so nothing stood out and the page felt busy.
- Radii drifted between 8, 10, 12, 16, 20 and 24 px, and padding between `p-4.5`, `p-5`, `p-6` and `p-8`, with no rule.
- Type had about 14 hand-tuned sizes (`text-[12.5px]`, `text-[13.5px]`, `text-[16.5px]`, …) and no named styles. Headings and numbers used the body face.
- The Logo hard-coded a teal (`#2fbfa2`) that appeared nowhere else.
- Product colours (A blue, B orange) clashed with the status colours (info blue, warning amber, critical red).

**Layout and hierarchy**
- Overview showed 7 equal KPI tiles in two rows of different column counts (4 + 3). Nothing led, and "Open safety cases" appeared twice (as a tile and again in the Safety Inbox call-out).
- The engine-quality strip used 7 fixed columns, which can't work below about 1100 px.
- `body { min-width: 1024px }` meant tablets and phones got a horizontally scrolling desktop with no mobile navigation.
- The Safety case card used a fixed `grid-cols-[1fr_260px]`, and long event-term chips (`whitespace-nowrap`) overflowed the page horizontally at 1440 px.
- On a full page, the sidebar background ended at the fold.
- Signals rendered all ~263 cards at once (about 460 000 px of DOM). The same happened in Safety (55 cases) and Radar.

**Interaction and states**
- Interactive tiles (Review queue, Safety) looked the same as static tiles. Hover feedback was only a shadow change.
- The focus ring was a generic blue outline. Some custom controls (the table/chart toggle, filter selects) had their own one-off styling.
- The Safety tabs were underline tabs, while the other filters were segmented controls. That gave two idioms for the same job.
- Chart chrome used gridlines in the same colour as card borders, the 0 reference line was dashed, and the tooltip type didn't match the page.

## 2. Token system (single source: `src/index.css`)

Every colour is a role token defined as a CSS variable on `:root`, redefined under `[data-theme="dark"]`, and exposed to
Tailwind through `@theme inline` (`bg-surface`, `text-ink-3`, `border-line` and so on). Components never use raw hex values.

**Colour (light → dark).** The dark theme is warm charcoal and olive-black, not blue-black.

| Role | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F5F4EE` | `#141511` | Page |
| `--surface` | `#FFFFFF` | `#1C1E18` | Cards |
| `--surface-2` | `#FAF9F5` | `#21231C` | Wells, table heads, quiet fills |
| `--surface-3` | `#EAE9DF` | `#2B2E25` | Secondary surface, selected rows, tracks |
| `--line` / `--line-strong` | `#E6E4DA` / `#D3D1C4` | `#2F3229` / `#43473A` | Hairlines / control borders |
| `--ink` / `--ink-2` / `--ink-3` | `#292D24` / `#4B5044` / `#64695D` | `#EDEEE5` / `#C8CABC` / `#A0A394` | Text: primary / secondary / muted (all AA on the page and on cards) |
| `--brand` | `#506727` | `#AFC47A` | Primary actions, active state, focus |
| `--brand-soft` / `--brand-tint` | `#DCE2AC` / `#EEF1DB` | `#2E3721` / `#252C1B` | Sage accent surfaces |
| `--accent` | `#9DAF6B` | `#9DAF6B` | Decorative olive (icons, the logo dial) |
| `--hero` / `--on-hero` | `#46592A` / `#F3F5E4` | `#323D20` / `#EEF2DC` | The one deep-olive hero card |

The starting `#777C70` muted text measured 4.2:1 on `#F5F4EE`, below AA. It is refined to `#64695D`: 5.1:1 on the page, 5.6:1 on cards and 4.6:1 on the secondary surface. Every text-on-fill pair in both themes measures at least 4.5:1, including the primary button, the hero, status chips and product chips.

**Status colours** are reserved, and always paired with an icon and a label:
- good: olive green;
- warn: ochre;
- crit: brick;
- info: muted slate.

Each has a `-soft` fill, and every text-on-soft pair is ≥ 4.9:1.

**Data colours** (validated with the dataviz validator: OKLab ΔE, Machado CVD simulation):
- **Products.** A Tagrisso is steel blue (`#16689A` light, `#3A8FCB` dark). B Rybrevant is terracotta (`#C0603A` light, `#D56F40` dark). They pass every gate: CVD ΔE 16.3 light / 19.7 dark, and normal-vision ΔE ≈ 26. B also keeps its non-colour cue: a dashed line and square markers.
  - *Why not olive for A?* Olive is the brand and interaction colour, and the positive end of the polarity scale. Reusing it for one product would make Tagrisso read as "selected" or "good".
- **Polarity (diverging).** Plum (−2) → warm grey (0) → olive (+2), always printed with a sign. The poles separate under CVD by ΔE 10.5 light / 10.8 dark, and by ΔE ≈ 20 for normal vision.
  - Terracotta was the suggested negative pole, but it is product B's colour. Plum keeps "Rybrevant" from reading as "negative".
  - Text inside fills is always the theme's ink. A light→dark ramp has a crossover where neither dark nor light text reaches AA (at best about 3.8:1). So each theme's ramp stays on one side of that crossover:
    - light theme: pastel-to-mid fills;
    - dark theme: dark-to-mid fills.

    Every step from −2 to +2 measures ≥ 4.5:1.
  - Steps: light `#C47CA2 · #E6BDD0 · #EBE9E1 · #CFDB9E · #8FA656`; dark `#84406A · #5A3449 · #36382F · #435429 · #567129`.
- **Aspects** (identity colours for quote highlights): violet, brick, green, ochre and rose. Each is shown with a label and a swatch, never by colour alone.

**Typography.** Two bundled faces. **DM Sans** (display: page titles, card titles, big numbers) and **Inter** (UI and body). JetBrains Mono is used for ids and hashes.

| Style | Spec |
|---|---|
| `display` | DM Sans, 44–56 / 1.0, 600, −0.03em (hero numbers) |
| `title` (h1) | DM Sans, 28 / 1.15, 600, −0.02em |
| `heading` (card h2) | DM Sans, 16 / 1.3, 600 |
| `metric` | DM Sans, 30–34 / 1.0, 600 |
| `body` | Inter, 14 / 1.55, 400 |
| `support` | Inter, 12.5 / 1.45, 400, `ink-3` |
| `label` | Inter, 12, 500 |
| `eyebrow` | Inter, 11.5, 600, uppercase, +0.06em |

Weights are limited to 400, 500 and 600. Columns and axis ticks use tabular numerals (`.tnum`). Large standalone numbers keep proportional figures.

**Spacing.** A 4 px base. Card padding is `--pad-card` (20 px, or 16 px on mobile). Grid gaps are 16 px inside a section and 24 px between sections.
**Radii.** `--radius-sm` 8 (chips inside cards, code), `--radius-md` 12 (controls, inner wells), `--radius-lg` 16 (nested panels), `--radius-xl` 20 (cards). Pills use full rounding.
**Elevation.** Three steps:
- `--shadow-xs`: cards at rest, a hairline plus a 1 px soft drop;
- `--shadow-sm`: hovered interactive cards and selected pills;
- `--shadow-lg`: popovers, drawers and toasts.

Borders are hairlines. Cards rely on tonal contrast (white on ivory) more than on shadow.
**Interaction states.**
- Hover is a tonal step, `surface → surface-2`.
- An interactive card lifts by 2 px and gains `--shadow-sm`.
- Pressed controls scale to 0.98.
- Focus is a 2 px brand ring with a 2 px offset (`--focus`).
- Disabled controls drop to 45 % opacity and show a not-allowed cursor.
- Selected items get a brand tint or a white pill.
- All motion is 120–200 ms ease-out, and is switched off under `prefers-reduced-motion`.

## 3. Component inventory

| Component | Decision | Notes |
|---|---|---|
| `PageHeader` | **Refine** | Eyebrow, DM Sans title, support text and an actions slot that wraps on mobile. |
| `Panel` → `Card` | **Refine** | One radius, padding and border. `Panel` stays as an alias so pages don't churn. Tones: `default`, `muted`, `sage`, `hero`. Has an `interactive` variant with a lift. |
| `PanelTitle` | **Refine** | DM Sans heading plus a hint and a right slot that wraps. |
| `Stat` | **Refine** | A label and an icon badge at the top right, a big calm number, and a supporting line. A `to` prop makes the tile a link with a visible affordance (arrow plus lift). |
| `Button` | **Refine** | Variants `primary` (olive), `secondary` (white + hairline), `subtle` (tinted), `ghost`, `danger` and `good`. Sizes `sm` and `md`. Has a pressed state. `ButtonLink` was added for navigation. |
| `Segmented` | **Refine** | Lightweight pill track, used for filters and toggles. |
| `Tabs` | **Create** | Pill tabs with counts (Safety status). Replaces the underline tabs. |
| `Select`, `TextInput`, `SearchInput`, `Field` | **Create/refine** | One input height (36 px, or 40 px on mobile), border, radius and focus treatment. |
| `Chip` family (`chips.tsx`) | **Refine** | Softer pills on the new tokens, and long text can wrap (fixes the Safety overflow). |
| `Note` | **Create** | Inline callout (info, warn, good, neutral) for caveats, footers and replay banners. |
| `IconBadge` | **Create** | A soft circle or rounded square behind a lucide icon (tiles, empty states). |
| `ShowMore` + `useIncremental` | **Create** | Progressive rendering for long feeds (Signals, Safety, Radar). Keeps every item reachable and cuts first-render cost. |
| `Skeleton`, `SkeletonCards`, `EmptyState`, `ErrorState` | **Refine** | Same shapes as the real content, to minimise layout shift. |
| `Layout` | **Rebuild (same contents)** | A sidebar on the page tone with soft nav rows and a brand-tinted active row. Below 1024 px, the sidebar becomes a slide-in drawer with a menu button. The compact top bar keeps the product switch, role switcher, "Offline · Nothing leaves the vault" and the theme toggle. |
| `Drawer`, `Toast` | **Refine** | Full width on mobile, with new tokens and focus handling. |
| `InsightCard`, `Quote`, `HighlightedText`, `Prediction`, `safety` | **Restyle only** | Highlight and offset-verification logic is untouched. |
| `Logo` | **Refine** | The mark uses brand tokens (olive vault, sage dial) instead of a hard-coded teal. |
| Charts (Trends, Overview snapshot) | **Restyle** | Product and polarity tokens, solid hairline gridlines, a solid zero baseline, a type-matched tooltip, a legend with line and marker swatches, and `role="img"` with a description. The table view is kept. |
