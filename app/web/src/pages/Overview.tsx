import { motion } from "framer-motion";
import {
  ArrowRight, Clock3, Coins, FileStack, Gauge, Inbox, ListChecks, ShieldAlert, Target,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Card, TrendPoint } from "../api/types";
import { ASPECTS } from "../api/types";
import { useApi } from "../api/useApi";
import { ConfidenceBand, OwnerChip, PolarityChip, ProductDot, SignalChip } from "../components/chips";
import { CountdownBadge } from "../components/safety";
import { EmptyState, ErrorState, PageHeader, Panel, PanelTitle, Skeleton, Stat } from "../components/ui";
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

  const view = useMemo(() => (cards.data ?? []).filter((c) => matchesProduct(product, c.product)), [cards.data, product]);
  const items = new Set(view.map((c) => c.item_id)).size;
  const actionable = view.filter((c) => c.actionable).length;
  const reviewQ = view.filter((c) => c.review_status === "review" && !decisions[c.card_id]).length;
  const cases = (safety.data ?? []).filter((c) => matchesProduct(product, c.product));
  const openCases = cases.filter((c) => c.status === "new" || c.status === "in_triage");
  const dev = metrics.data?.find((m) => m.split === "dev") ?? metrics.data?.[0];

  const top = useMemo(() => topSignals(view), [view]);
  const thisWeek = dateToIsoWeek(new Date());
  const loadingTiles = cards.loading && !cards.data;

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
      />

      <div className="grid grid-cols-4 gap-4">
        {loadingTiles ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[118px] rounded-2xl" />) : (
          <>
            <Stat label="Items analysed" value={items} icon={<FileStack size={16} />} sub={`${view.length} insight cards`} />
            <Stat label="Actionable signals" value={actionable} icon={<Target size={16} />}
              sub={view.length ? `${Math.round((actionable / view.length) * 100)}% of cards` : "no cards yet"} />
            <Link to="/review" className="block rounded-2xl outline-offset-2">
              <Stat label="Review queue" value={reviewQ} icon={<ListChecks size={16} />} sub={<span className="inline-flex items-center gap-1">Human check before use <ArrowRight size={12} /></span>} />
            </Link>
            <Link to="/safety" className="block rounded-2xl">
              <Stat
                label="Open safety cases"
                value={safety.error ? "—" : safety.loading && !safety.data ? "…" : openCases.length}
                icon={<ShieldAlert size={16} />}
                tone={openCases.length ? "crit" : "neutral"}
                sub={<span className="inline-flex items-center gap-1">{cases.filter((c) => c.valid_case_candidate).length} valid case candidates <ArrowRight size={12} /></span>}
              />
            </Link>
          </>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        {metrics.loading && !metrics.data ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[118px] rounded-2xl" />) : (
          <>
            <Stat
              label={`Composite score · ${dev?.split ?? "dev"} split`}
              value={dev?.composite != null ? dev.composite.toFixed(2) : "unknown"}
              icon={<Gauge size={16} />}
              sub={dev ? `${dev.items} labelled items · ${dev.model || "model unknown"}` : "No metrics yet"}
            />
            <Stat
              label="Seconds per item"
              value={dev?.seconds_per_item != null ? dev.seconds_per_item.toFixed(2) : "unknown"}
              icon={<Clock3 size={16} />}
              sub="Wall clock on this laptop"
            />
            <Stat
              label="Cost per 100 items"
              value={dev?.cost_per_100_items_usd != null ? `$${dev.cost_per_100_items_usd.toFixed(3)}` : "unknown"}
              icon={<Coins size={16} />}
              sub="Electricity only · no API fees"
            />
          </>
        )}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <Panel padded={false}>
            <div className="px-5 pt-5">
              <PanelTitle
                hint={top.label}
                right={<Link to="/signals" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-2 hover:text-ink">All signals <ArrowRight size={13} /></Link>}
              >
                Top signals this week
              </PanelTitle>
            </div>
            {cards.loading && !cards.data ? (
              <div className="space-y-3 px-5 pb-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
            ) : cards.error ? (
              <div className="px-5 pb-5"><ErrorState error={cards.error} onRetry={cards.reload} /></div>
            ) : top.cards.length === 0 ? (
              <div className="px-5 pb-5"><EmptyState title="No actionable signals yet">Run the engine or load fixtures to populate the feed.</EmptyState></div>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {top.cards.map((c, i) => (
                  <motion.li key={c.card_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                    <Link to={`/items/${encodeURIComponent(c.item_id)}`} className="group flex items-center gap-4 px-5 py-3.5 hover:bg-surface-2/60">
                      <ProductDot product={c.product} size={9} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium text-ink">{c.headline}</div>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <SignalChip signal={c.signal_type} />
                          <OwnerChip owner={c.owner} />
                        </div>
                      </div>
                      {c.citations[0] && <PolarityChip value={c.citations[0].polarity} />}
                      <div className="w-[150px] shrink-0"><ConfidenceBand level={c.confidence} /></div>
                      <ArrowRight size={15} className="shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </motion.li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <SafetyCallout loading={safety.loading && !safety.data} open={openCases} />
          <SentimentSnapshot trends={trends.data} loading={trends.loading && !trends.data} />
        </div>
      </div>

      {dev && Object.keys(dev.scores ?? {}).length > 0 && (
        <Panel className="mt-6">
          <PanelTitle hint={`Scored against the organisers' labels · ${dev.measured_at ? `measured ${dev.measured_at}` : "measurement time not recorded"}`}>
            Engine quality ({dev.split} split)
          </PanelTitle>
          <div className="grid grid-cols-7 gap-4">
            {Object.entries(dev.scores ?? {}).map(([k, v]) => (
              <div key={k}>
                <div className="text-[12px] text-ink-3">{SCORE_LABELS[k] ?? k}</div>
                <div className="tnum mt-1 text-[18px] font-semibold text-ink">{v == null ? "unknown" : v.toFixed(2)}</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  {v != null && <div className="h-full rounded-full bg-ink-2" style={{ width: `${Math.max(2, Math.min(1, v) * 100)}%` }} />}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
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

function SafetyCallout({ open, loading }: { open: { case_id: string; due?: string | null; valid_case_candidate: boolean }[]; loading: boolean }) {
  const next = open.filter((c) => c.due).sort((a, b) => (a.due! < b.due! ? -1 : 1))[0];
  return (
    <Panel>
      <PanelTitle hint="Possible reportable adverse-event cases">Safety Inbox</PanelTitle>
      {loading ? <Skeleton className="h-16" /> : open.length === 0 ? (
        <div className="flex items-center gap-3 text-[13px] text-ink-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-good-soft text-good"><Inbox size={16} /></div>
          No open cases for this view.
        </div>
      ) : (
        <div>
          <div className="flex items-baseline gap-2">
            <span className="tnum text-[32px] font-semibold leading-none text-ink">{open.length}</span>
            <span className="text-[13px] text-ink-3">open {open.length === 1 ? "case" : "cases"}</span>
          </div>
          {next?.due && (
            <div className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-3">
              Next due <CountdownBadge due={next.due} />
            </div>
          )}
          <Link to="/safety" className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-ink hover:underline">
            Open Safety Inbox <ArrowRight size={13} />
          </Link>
        </div>
      )}
    </Panel>
  );
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
    <Panel>
      <PanelTitle
        hint="Mean polarity, all weeks · n = quotes"
        right={<Link to="/trends" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-2 hover:text-ink">Trends <ArrowRight size={13} /></Link>}
      >
        Sentiment snapshot
      </PanelTitle>
      {loading ? <Skeleton className="h-40" /> : (
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-ink-3">
              <th className="pb-2 text-left font-medium">Aspect</th>
              <th className="pb-2 text-center font-medium"><span className="inline-flex items-center gap-1.5"><ProductDot product="A" />Tagrisso</span></th>
              <th className="pb-2 text-center font-medium"><span className="inline-flex items-center gap-1.5"><ProductDot product="B" />Rybrevant</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.aspect}>
                <td className="py-1 pr-2 text-ink-2">{ASPECT_LABELS[r.aspect]}</td>
                {(["A", "B"] as const).map((p) => {
                  const v = r[p];
                  return (
                    <td key={p} className="px-1 py-1">
                      {v ? (
                        <div
                          className="tnum flex h-8 items-center justify-center gap-1 rounded-lg font-semibold"
                          style={{ background: polarityFill(v.m), color: polarityInk(v.m) }}
                          title={`${fmtPolarity(v.m, 2)} from ${v.n} quote${v.n === 1 ? "" : "s"}`}
                        >
                          {fmtPolarity(v.m)}<span className="text-[11px] font-medium opacity-75">n={v.n}</span>
                        </div>
                      ) : (
                        <div className="hatch flex h-8 items-center justify-center rounded-lg text-[11.5px] text-ink-3" title="No data: not the same as neutral">no data</div>
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
