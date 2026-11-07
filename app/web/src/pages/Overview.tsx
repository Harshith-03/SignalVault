import { motion } from "framer-motion";
import {
  ArrowRight, Clock3, Coins, FileSearch, Gauge, ListChecks, ShieldAlert, ShieldCheck, Target,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Card, Metrics, SafetyCase, TrendPoint } from "../api/types";
import { ASPECTS } from "../api/types";
import { useApi } from "../api/useApi";
import { ConfidenceBand, OwnerChip, PolarityChip, ProductDot, SignalChip } from "../components/chips";
import { CountdownBadge } from "../components/safety";
import {
  ButtonLink, EmptyState, ErrorState, IconBadge, PageHeader, Panel, PanelTitle, Skeleton, Stat, TextLink,
} from "../components/ui";
import {
  ASPECT_LABELS, PRODUCT_NAMES, dateToIsoWeek, fmtPolarity, polarityFill, polarityInk, weekLabel,
} from "../lib/format";
import { matchesProduct, useApp } from "../state/app";
import { useDecisions } from "../state/reviews";

const SCORE_LABELS: Record<string, string> = {
  signal_macro_f1: "Signal macro-F1",
  actionable_f1: "Actionable F1",
  aspect_f1: "Aspect F1",
  polarity_qwk: "Polarity QWK",
  speaker_accuracy: "Speaker accuracy",
  span_f1: "Span F1",
  citation_validity: "Citation validity",
};

export default function Overview() {
  const { product, role } = useApp();
  const decisions = useDecisions();
  const cards = useApi(() => api.cards(), []);
  const metrics = useApi(() => api.metrics(), []);
  const trends = useApi(() => api.trends(), []);
  const safety = useApi(() => api.safety(), [role]);
  const health = useApi(() => api.health(), []);

  const view = useMemo(() => (cards.data ?? []).filter((c) => matchesProduct(product, c.product)), [cards.data, product]);
  // all analysed items (incl. signal "none", which produce no card); fall back to items with a card
  const byProduct = health.data?.items_by_product;
  const items = byProduct
    ? Object.entries(byProduct).reduce((n, [k, v]) => n + (matchesProduct(product, k as Card["product"]) ? v : 0), 0)
    : new Set(view.map((c) => c.item_id)).size;
  const actionable = view.filter((c) => c.actionable).length;
  const reviewQ = view.filter((c) => c.review_status === "review" && !decisions[c.card_id]).length;
  const cases = (safety.data ?? []).filter((c) => matchesProduct(product, c.product));
  const openCases = cases.filter((c) => c.status === "new" || c.status === "in_triage");
  const dev = metrics.data?.find((m) => m.split === "dev") ?? metrics.data?.[0];

  const top = useMemo(() => topSignals(view), [view]);
  const thisWeek = dateToIsoWeek(new Date());
  const loadingTiles = cards.loading && !cards.data;
  const loadingMetrics = metrics.loading && !metrics.data;

  if (cards.error?.kind === "offline") {
    return (
      <>
        <PageHeader title="Overview" subtitle="Launch intelligence for Tagrisso and Rybrevant / Lazcluze, computed on this machine." />
        <ErrorState error={cards.error} onRetry={() => { cards.reload(); metrics.reload(); trends.reload(); safety.reload(); }} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={<>This week · {weekLabel(thisWeek)}</>}
        title={product === "all" ? "Overview" : PRODUCT_NAMES[product]}
        subtitle={product === "all"
          ? "Launch intelligence for Tagrisso (A) and Rybrevant / Lazcluze (B): every number below was computed on this machine."
          : `Signals for ${PRODUCT_NAMES[product]}, including items that concern both products.`}
        actions={
          <>
            <ButtonLink to="/analyze" variant="primary" icon={<FileSearch size={15} />}>Analyze a transcript</ButtonLink>
            <ButtonLink to="/review" icon={<ListChecks size={15} />}>Review queue</ButtonLink>
          </>
        }
      />

      {/* ------------------------------------------------ headline metrics (bento) */}
      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 sm:gap-4 @3xl:grid-cols-4 @5xl:grid-cols-12">
        <div className="col-span-2 @3xl:col-span-4 @5xl:col-span-6 @5xl:row-span-2">
          {loadingTiles ? <Skeleton className="h-full min-h-[280px] rounded-card" /> : (
            <HeroActionable actionable={actionable} cards={view.length} items={items} />
          )}
        </div>

        <div className="@5xl:col-span-3">
          {loadingTiles ? <Skeleton className="h-[150px] rounded-card" /> : (
            <Stat
              variant="sage"
              to="/review"
              label="Review queue"
              value={reviewQ}
              icon={<ListChecks size={17} />}
              sub="Human check before use"
            />
          )}
        </div>

        <div className="@5xl:col-span-3">
          {loadingTiles ? <Skeleton className="h-[150px] rounded-card" /> : (
            <SafetyTile cases={cases} open={openCases} loading={safety.loading && !safety.data} failed={!!safety.error} />
          )}
        </div>

        <div className="@5xl:col-span-3">
          {loadingMetrics ? <Skeleton className="h-[150px] rounded-card" /> : (
            <Stat
              label="Seconds per item"
              value={dev?.seconds_per_item != null ? dev.seconds_per_item.toFixed(2) : "unknown"}
              icon={<Clock3 size={17} />}
              sub="Wall clock on this laptop"
            />
          )}
        </div>

        <div className="@5xl:col-span-3">
          {loadingMetrics ? <Skeleton className="h-[150px] rounded-card" /> : (
            <Stat
              label="Cost per 100 items"
              value={dev?.cost_per_100_items_usd != null ? `$${dev.cost_per_100_items_usd.toFixed(3)}` : "unknown"}
              icon={<Coins size={17} />}
              tone="good"
              sub="Electricity only · no API fees"
            />
          )}
        </div>
      </section>

      {/* ------------------------------------------------ supporting insight */}
      <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 @5xl:grid-cols-12 @5xl:items-start">
        <Panel padded={false} className="@5xl:col-span-7">
          <div className="px-[var(--pad-card)] pt-[var(--pad-card)]">
            <PanelTitle hint={top.label} right={<TextLink to="/signals">All signals</TextLink>}>
              Top signals this week
            </PanelTitle>
          </div>
          {cards.loading && !cards.data ? (
            <div className="space-y-2 px-[var(--pad-card)] pb-[var(--pad-card)]">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-panel" />)}</div>
          ) : cards.error ? (
            <div className="px-[var(--pad-card)] pb-[var(--pad-card)]"><ErrorState error={cards.error} onRetry={cards.reload} /></div>
          ) : top.cards.length === 0 ? (
            <div className="px-[var(--pad-card)] pb-[var(--pad-card)]"><EmptyState title="No actionable signals yet">Run the engine or load fixtures to populate the feed.</EmptyState></div>
          ) : (
            <ul className="px-2 pb-2 sm:px-3 sm:pb-3">
              {top.cards.map((c, i) => (
                <motion.li key={c.card_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                  className="border-t border-line first:border-t-0">
                  <Link
                    to={`/items/${encodeURIComponent(c.item_id)}`}
                    className="group my-1 flex items-start gap-3 rounded-panel px-2.5 py-3 transition-colors hover:bg-surface-2 sm:px-3"
                  >
                    <span className="mt-[7px]"><ProductDot product={c.product} size={9} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-[14px] font-medium leading-snug text-ink group-hover:text-ink">{c.headline}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <SignalChip signal={c.signal_type} />
                        <OwnerChip owner={c.owner} />
                        <span className="ml-1"><ConfidenceBand level={c.confidence} /></span>
                      </div>
                    </div>
                    {c.citations[0] && <span className="mt-0.5"><PolarityChip value={c.citations[0].polarity} /></span>}
                    <ArrowRight size={15} className="mt-1 hidden shrink-0 text-brand opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
                  </Link>
                </motion.li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-4 sm:gap-6 @5xl:col-span-5">
          <SentimentSnapshot trends={trends.data} loading={trends.loading && !trends.data} />
          {/* secondary detail: engine quality sits last in reading order */}
          <EngineQuality dev={dev} loading={loadingMetrics} />
        </div>
      </div>
    </>
  );
}

/** The one hero card: what a launch team should act on, with the scale it was drawn from. */
function HeroActionable({ actionable, cards, items }: { actionable: number; cards: number; items: number }) {
  const pct = cards ? Math.round((actionable / cards) * 100) : null;
  return (
    <Panel tone="hero" className="@container relative h-full min-h-[280px] overflow-hidden p-6 sm:p-7">
      <div className="grid h-full gap-6 @xl:grid-cols-[minmax(0,1fr)_minmax(220px,0.75fr)] @xl:gap-10">
      <div className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-[18px] font-semibold text-on-hero">Actionable signals</h2>
            <p className="mt-1 max-w-[34ch] text-support text-on-hero-2">Insight cards marked actionable, each routed to an owner team.</p>
          </div>
          <IconBadge tone="hero" size="lg" className="@xl:hidden"><Target size={22} /></IconBadge>
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-x-5 gap-y-2 @xl:mt-auto @xl:pt-6">
          <div className="font-display text-[64px] leading-[0.9] font-semibold tracking-[-0.04em] text-on-hero sm:text-[84px]">{actionable}</div>
          <div className="pb-2 text-support text-on-hero-2">
            {pct === null ? "no cards yet" : <><span className="font-semibold text-on-hero">{pct}%</span> of cards</>}
          </div>
        </div>
      </div>

      <div className="flex flex-col @xl:justify-between">
        <span className="hidden self-end @xl:block"><IconBadge tone="hero" size="lg"><Target size={22} /></IconBadge></span>
        <div className="mt-auto">
        <dl className="grid grid-cols-2 gap-4 border-t border-on-hero/15 pt-4">
          <div>
            <dt className="text-caption text-on-hero-2">Items analysed</dt>
            <dd className="mt-1 font-display text-[22px] font-semibold text-on-hero">{items}</dd>
          </div>
          <div>
            <dt className="text-caption text-on-hero-2">Insight cards</dt>
            <dd className="mt-1 font-display text-[22px] font-semibold text-on-hero">{cards}</dd>
          </div>
        </dl>
        <Link
          to="/signals?actionable=yes"
          className="press group mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-on-hero px-4 text-body font-semibold text-hero hover:bg-on-hero/90"
        >
          Browse actionable signals
          <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </Link>
        </div>
      </div>
      </div>
    </Panel>
  );
}

/** Open cases + the nearest reporting clock. Replaces the separate "Safety Inbox" call-out. */
function SafetyTile({ cases, open, loading, failed }: { cases: SafetyCase[]; open: SafetyCase[]; loading: boolean; failed: boolean }) {
  const next = open.filter((c) => c.due).sort((a, b) => (a.due! < b.due! ? -1 : 1))[0];
  const valid = cases.filter((c) => c.valid_case_candidate).length;
  return (
    <Stat
      to="/safety"
      label="Open safety cases"
      value={failed ? "—" : loading ? "…" : open.length}
      icon={open.length ? <ShieldAlert size={17} /> : <ShieldCheck size={17} />}
      tone={open.length ? "crit" : "good"}
      sub={loading || failed ? "Safety Inbox" : open.length === 0 ? "No open cases for this view." : `${valid} valid case candidates`}
    >
      {next?.due && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-caption text-ink-3">
          Next due <CountdownBadge due={next.due} />
        </div>
      )}
    </Stat>
  );
}

/** "This week" if it has actionable signals; otherwise the most recent weeks that do, labelled honestly. */
function topSignals(cards: Card[]): { cards: Card[]; label: string } {
  const act = cards.filter((c) => c.actionable && c.week);
  const thisWeek = dateToIsoWeek(new Date());
  const rank = (a: Card, b: Card) =>
    ({ high: 0, medium: 1, low: 2 }[a.confidence] - { high: 0, medium: 1, low: 2 }[b.confidence]) ||
    (b.published ?? "").localeCompare(a.published ?? "");
  const current = act.filter((c) => c.week === thisWeek).sort(rank);
  if (current.length) return { cards: current.slice(0, 6), label: `Actionable cards from ${thisWeek}, highest confidence first` };
  const weeks = [...new Set(act.map((c) => c.week!))].sort().reverse();
  const picked: Card[] = [];
  const used: string[] = [];
  for (const w of weeks) {
    if (picked.length >= 5) break;
    picked.push(...act.filter((c) => c.week === w).sort(rank));
    used.push(w);
  }
  if (!used.length) return { cards: [], label: "No actionable signals" };
  const span = used.length === 1 ? used[0] : `${used[used.length - 1]} – ${used[0]}`;
  return { cards: picked.slice(0, 6), label: `No new evidence in ${thisWeek} yet · showing the latest weeks with data (${span})` };
}

function SentimentSnapshot({ trends, loading }: { trends?: TrendPoint[]; loading: boolean }) {
  const rows = useMemo(() => {
    const acc: Record<string, { s: number; n: number }> = {};
    for (const t of trends ?? []) {
      if (t.product === "both") continue;
      const k = `${t.product}|${t.aspect}`;
      acc[k] = acc[k] ?? { s: 0, n: 0 };
      acc[k].s += t.mean_polarity * t.n;
      acc[k].n += t.n;
    }
    return ASPECTS.map((a) => ({
      aspect: a,
      A: acc[`A|${a}`] ? { m: acc[`A|${a}`].s / acc[`A|${a}`].n, n: acc[`A|${a}`].n } : null,
      B: acc[`B|${a}`] ? { m: acc[`B|${a}`].s / acc[`B|${a}`].n, n: acc[`B|${a}`].n } : null,
    }));
  }, [trends]);

  return (
    <Panel className="h-full">
      <PanelTitle
        hint="Mean polarity, all weeks · n = quotes"
        right={<TextLink to="/trends">Trends</TextLink>}
      >
        Sentiment snapshot
      </PanelTitle>
      {loading ? <Skeleton className="h-[236px] rounded-panel" /> : (
        <table className="w-full table-fixed border-separate border-spacing-x-1.5 border-spacing-y-1.5 text-caption">
          <caption className="sr-only">Mean sentiment polarity per aspect for Tagrisso and Rybrevant, on a −2 to +2 scale, with the number of quotes</caption>
          <thead>
            <tr className="text-ink-3">
              <th scope="col" className="w-[36%] pb-1 text-left font-medium">Aspect</th>
              <th scope="col" className="pb-1 text-center font-medium"><span className="inline-flex items-center gap-1.5"><ProductDot product="A" />Tagrisso</span></th>
              <th scope="col" className="pb-1 text-center font-medium"><span className="inline-flex items-center gap-1.5"><ProductDot product="B" />Rybrevant</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.aspect}>
                <th scope="row" className="truncate pr-1 text-left text-[13px] font-medium text-ink-2">{ASPECT_LABELS[r.aspect]}</th>
                {(["A", "B"] as const).map((p) => {
                  const v = r[p];
                  return (
                    <td key={p}>
                      {v ? (
                        <div
                          className="tnum flex h-10 items-center justify-center gap-1.5 rounded-control text-[13px] font-semibold"
                          style={{ background: polarityFill(v.m), color: polarityInk(v.m) }}
                          title={`${fmtPolarity(v.m, 2)} from ${v.n} quote${v.n === 1 ? "" : "s"}`}
                        >
                          {fmtPolarity(v.m)}<span className="text-micro font-medium opacity-80">n={v.n}</span>
                        </div>
                      ) : (
                        <div className="hatch flex h-10 items-center justify-center rounded-control border border-line text-micro text-ink-3" title="No data: not the same as neutral">no data</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function EngineQuality({ dev, loading }: { dev?: Metrics; loading: boolean }) {
  const scores = Object.entries(dev?.scores ?? {});
  return (
    <Panel className="@container" aria-label="Engine quality">
      {loading ? <Skeleton className="h-[140px] rounded-panel" /> : (
        <div className="grid gap-5 @xl:grid-cols-[minmax(190px,230px)_minmax(0,1fr)] @xl:gap-8">
          <div className="flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="pt-1 text-support font-medium text-ink-2">Composite score · {dev?.split ?? "dev"} split</div>
              <IconBadge tone="brand"><Gauge size={17} /></IconBadge>
            </div>
            <div className="mt-3 font-display text-[40px] leading-none font-semibold tracking-[-0.03em] text-ink">
              {dev?.composite != null ? dev.composite.toFixed(2) : "unknown"}
            </div>
            <div className="mt-2 break-words text-caption text-ink-3">
              {dev ? `${dev.items} labelled items · ${dev.model || "model unknown"}` : "No metrics yet"}
            </div>
          </div>

          {scores.length > 0 && (
            <div className="min-w-0 border-t border-line pt-5 @xl:border-l @xl:border-t-0 @xl:pl-8 @xl:pt-0">
              <div className="mb-4">
                <h2 className="font-display text-heading font-semibold text-ink">Engine quality ({dev!.split} split)</h2>
                <p className="mt-1 text-caption text-ink-3">
                  Scored against the organisers' labels · {dev!.measured_at ? `measured ${dev!.measured_at}` : "measurement time not recorded"}
                </p>
              </div>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3.5 @xs:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4">
                {scores.map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="truncate text-caption text-ink-3">{SCORE_LABELS[k] ?? k}</dt>
                    <dd className="mt-1 flex items-center gap-3">
                      <span className="tnum w-10 text-[16px] font-semibold text-ink">{v == null ? "unknown" : v.toFixed(2)}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                        {v != null && <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(2, Math.min(1, v) * 100)}%` }} />}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
