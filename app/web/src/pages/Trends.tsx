import { ArrowUpRight, Info, Table2, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "../api/client";
import type { AspectName, Speaker, TrendPoint, TrendQuote } from "../api/types";
import { ASPECTS, SPEAKERS } from "../api/types";
import { useApi } from "../api/useApi";
import { PolarityChip, ProductDot } from "../components/chips";
import { Drawer } from "../components/Drawer";
import { Quote } from "../components/Quote";
import { EmptyState, ErrorState, PageHeader, Panel, PanelTitle, Segmented, Select, Skeleton, cx } from "../components/ui";
import {
  ASPECT_LABELS, PRODUCT_NAMES, SPEAKER_LABELS, fmtDate, fmtPolarity, polarityFill, polarityInk, polarityWord,
  shortWeek, weekLabel, weekRange,
} from "../lib/format";
import { useThemeColors } from "../lib/useThemeColors";
import { useApp } from "../state/app";

type HeatProduct = "all" | "A" | "B" | "both";
type Range = "all" | "12" | "8" | "4";

interface Agg { mean: number; n: number; points: TrendPoint[] }
function aggregate(points: TrendPoint[]): Agg | null {
  if (!points.length) return null;
  const n = points.reduce((s, p) => s + p.n, 0);
  const mean = points.reduce((s, p) => s + p.mean_polarity * p.n, 0) / n;
  return { mean, n, points };
}

interface DrawerState { title: string; subtitle: string; points: TrendPoint[] }

export default function Trends() {
  const { product: globalProduct } = useApp();
  const trends = useApi(() => api.trends(), []);
  const [heatProduct, setHeatProduct] = useState<HeatProduct>(globalProduct);
  const [range, setRange] = useState<Range>("all");
  const [aspect, setAspect] = useState<AspectName>("efficacy");
  const [speaker, setSpeaker] = useState<Speaker | "all">("all");
  const [showTable, setShowTable] = useState(false);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);

  const all = trends.data ?? [];
  const allWeeks = useMemo(() => {
    const ws = [...new Set(all.map((t) => t.week))].sort();
    return ws.length ? weekRange(ws[0], ws[ws.length - 1]) : [];
  }, [all]);
  const weeks = range === "all" ? allWeeks : allWeeks.slice(-Number(range));
  const inRange = useMemo(() => new Set(weeks), [weeks]);
  const ranged = all.filter((t) => inRange.has(t.week));

  // ---------------------------------------------------------------- heatmap
  const heatPoints = ranged.filter((t) => heatProduct === "all" || t.product === heatProduct);
  const grid = useMemo(() => {
    const g: Record<string, Agg | null> = {};
    for (const a of ASPECTS) for (const s of SPEAKERS) {
      g[`${a}|${s}`] = aggregate(heatPoints.filter((t) => t.aspect === a && t.speaker === s));
    }
    return g;
  }, [heatPoints]);
  // Every speaker column is always shown: an empty column is information ("nobody said this"), not noise.
  const speakersToShow = SPEAKERS;

  // ---------------------------------------------------------------- A vs B lines
  const linePoints = ranged.filter((t) => t.aspect === aspect && (speaker === "all" || t.speaker === speaker));
  const bothExcluded = linePoints.filter((t) => t.product === "both").reduce((s, t) => s + t.n, 0);
  const series = useMemo(() => weeks.map((w) => {
    const a = aggregate(linePoints.filter((t) => t.week === w && t.product === "A"));
    const b = aggregate(linePoints.filter((t) => t.week === w && t.product === "B"));
    return { week: w, A: a ? round2(a.mean) : null, An: a?.n ?? 0, B: b ? round2(b.mean) : null, Bn: b?.n ?? 0 };
  }), [weeks, linePoints]);
  const hasLineData = series.some((r) => r.A !== null || r.B !== null);

  const colors = useThemeColors(["prod-a", "prod-b", "line", "ink-3", "surface", "line-strong"] as const);

  const openWeek = (prod: "A" | "B", week: string) => {
    const pts = linePoints.filter((t) => t.week === week && t.product === prod);
    if (!pts.length) return;
    const agg = aggregate(pts)!;
    setDrawer({
      title: `${PRODUCT_NAMES[prod]} · ${ASPECT_LABELS[aspect]}`,
      subtitle: `${weekLabel(week)} · ${speaker === "all" ? "all speakers" : SPEAKER_LABELS[speaker]} · mean ${fmtPolarity(agg.mean, 2)} · n=${agg.n}`,
      points: pts,
    });
  };

  return (
    <>
      <PageHeader
        title="Trends"
        subtitle={<>Mean sentiment on a −2..+2 scale by aspect × speaker × ISO week. <strong className="font-semibold text-ink-2">Weeks with no data are gaps, never zero</strong>, and every mean shows its n.</>}
        actions={
          <Segmented<Range>
            label="Week range"
            value={range}
            onChange={setRange}
            options={[{ value: "all", label: "All weeks" }, { value: "12", label: "12 wk" }, { value: "8", label: "8 wk" }, { value: "4", label: "4 wk" }]}
          />
        }
      />

      {trends.loading && !trends.data ? (
        <div className="space-y-6"><Skeleton className="h-[380px] rounded-2xl" /><Skeleton className="h-[420px] rounded-2xl" /></div>
      ) : trends.error ? (
        <ErrorState error={trends.error} onRetry={trends.reload} />
      ) : all.length === 0 ? (
        <EmptyState title="No trend data yet">Trend points appear once the engine has scored dated items.</EmptyState>
      ) : (
        <div className="space-y-6">
          <Panel>
            <PanelTitle
              hint={`Weighted mean across ${weeks.length ? `${shortWeek(weeks[0])}–${shortWeek(weeks[weeks.length - 1])}` : "all weeks"} · click a cell for the quotes behind it`}
              right={
                <Segmented<HeatProduct>
                  label="Heatmap product"
                  size="sm"
                  value={heatProduct}
                  onChange={setHeatProduct}
                  options={[
                    { value: "A", label: <><ProductDot product="A" size={7} />Tagrisso</> },
                    { value: "B", label: <><ProductDot product="B" size={7} />Rybrevant</> },
                    { value: "both", label: <><ProductDot product="both" size={7} />Tagged both</>, title: "Items that discuss both products" },
                    { value: "all", label: "Pooled" },
                  ]}
                />
              }
            >
              Aspect × speaker heatmap
            </PanelTitle>

            <div className="overflow-x-auto">
              <div className="grid min-w-[760px] gap-1.5" style={{ gridTemplateColumns: `150px repeat(${speakersToShow.length}, minmax(84px, 1fr))` }}>
                <div />
                {speakersToShow.map((s) => (
                  <div key={s} className="pb-1 text-center text-[12px] font-medium text-ink-3">{SPEAKER_LABELS[s]}</div>
                ))}
                {ASPECTS.map((a) => (
                  <HeatRow key={a} aspect={a} speakers={speakersToShow} grid={grid} onOpen={(s, agg) => setDrawer({
                    title: `${ASPECT_LABELS[a]} · ${SPEAKER_LABELS[s]}`,
                    subtitle: `${heatProduct === "all" ? "All products pooled" : heatProduct === "both" ? "Items tagged both products" : PRODUCT_NAMES[heatProduct]} · mean ${fmtPolarity(agg.mean, 2)} · n=${agg.n}`,
                    points: agg.points,
                  })} />
                ))}
              </div>
            </div>
            <PolarityLegend />
          </Panel>

          <Panel>
            <PanelTitle
              hint="Weekly mean polarity, Tagrisso vs Rybrevant · gaps are weeks with no observations · click a point for its quotes"
              right={
                <div className="flex items-center gap-3">
                  <Select<Speaker | "all">
                    label="Speaker"
                    value={speaker}
                    onChange={setSpeaker}
                    options={[{ value: "all", label: "All speakers" }, ...SPEAKERS.map((s) => ({ value: s, label: SPEAKER_LABELS[s] }))]}
                  />
                  <button
                    onClick={() => setShowTable((v) => !v)}
                    className={cx("inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium",
                      showTable ? "border-ink bg-ink text-ink-inverse" : "border-line text-ink-2 hover:bg-surface-2")}
                    aria-pressed={showTable}
                  >
                    {showTable ? <TrendingUp size={13} /> : <Table2 size={13} />}{showTable ? "Chart" : "Table"}
                  </button>
                </div>
              }
            >
              {ASPECT_LABELS[aspect]} over time
            </PanelTitle>

            <div className="mb-4 flex items-center justify-between gap-4">
              <Segmented<AspectName>
                label="Aspect"
                value={aspect}
                onChange={setAspect}
                options={ASPECTS.map((a) => ({ value: a, label: ASPECT_LABELS[a] }))}
              />
              <div className="flex items-center gap-4 text-[12.5px] font-medium text-ink-2">
                <span className="inline-flex items-center gap-2"><LegendSwatch color={colors["prod-a"]} />Tagrisso (A)</span>
                <span className="inline-flex items-center gap-2"><LegendSwatch color={colors["prod-b"]} dashed />Rybrevant (B)</span>
              </div>
            </div>

            {!hasLineData ? (
              <EmptyState title={`No ${ASPECT_LABELS[aspect].toLowerCase()} observations in this range`}>
                Try another aspect, speaker or a wider week range. An empty week is shown as a gap, not as neutral.
              </EmptyState>
            ) : showTable ? (
              <WeekTable rows={series} onOpen={openWeek} />
            ) : (
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 10, right: 16, bottom: 4, left: -8 }}>
                    <CartesianGrid vertical={false} stroke={colors.line} />
                    <XAxis
                      dataKey="week"
                      tickFormatter={shortWeek}
                      tick={{ fontSize: 11.5, fill: colors["ink-3"] }}
                      tickLine={false}
                      axisLine={{ stroke: colors["line-strong"] }}
                      interval="preserveStartEnd"
                      minTickGap={16}
                    />
                    <YAxis
                      domain={[-2.3, 2.3]}
                      ticks={[-2, -1, 0, 1, 2]}
                      tickFormatter={(v: number) => fmtPolarity(v, 0)}
                      tick={{ fontSize: 11.5, fill: colors["ink-3"] }}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                    />
                    <ReferenceLine y={0} stroke={colors["line-strong"]} strokeDasharray="4 4" />
                    <Tooltip content={<LineTip />} cursor={{ stroke: colors["line-strong"], strokeWidth: 1 }} />
                    {(["A", "B"] as const).map((p) => (
                      <Line
                        key={p}
                        type="monotone"
                        dataKey={p}
                        name={p === "A" ? "Tagrisso" : "Rybrevant"}
                        stroke={p === "A" ? colors["prod-a"] : colors["prod-b"]}
                        strokeWidth={2}
                        strokeDasharray={p === "B" ? "6 3" : undefined}
                        connectNulls={false}
                        isAnimationActive={false}
                        dot={(props: DotProps) => (
                          <ClickDot key={`${p}-${props.index}`} {...props} color={p === "A" ? colors["prod-a"] : colors["prod-b"]}
                            ring={colors.surface} square={p === "B"} onClick={() => openWeek(p, props.payload.week)} />
                        )}
                        activeDot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-3 flex items-start gap-2 text-[12px] text-ink-3">
              <Info size={13} className="mt-0.5 shrink-0" />
              <span>
                Means are weighted by n across speakers.{" "}
                {bothExcluded > 0 && <>Items tagged as both products ({bothExcluded} observation{bothExcluded === 1 ? "" : "s"}) are excluded from the A-vs-B lines; see “Tagged both” in the heatmap.</>}
              </span>
            </div>
          </Panel>
        </div>
      )}

      <Drawer open={!!drawer} onClose={() => setDrawer(null)} title={drawer?.title} subtitle={drawer?.subtitle}>
        {drawer && <QuoteList points={drawer.points} />}
      </Drawer>
    </>
  );
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function HeatRow({ aspect, speakers, grid, onOpen }: {
  aspect: AspectName; speakers: Speaker[]; grid: Record<string, Agg | null>; onOpen: (s: Speaker, agg: Agg) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2 pr-2 text-[13px] font-medium text-ink">
        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: `var(--asp-${aspect})` }} />
        {ASPECT_LABELS[aspect]}
      </div>
      {speakers.map((s) => {
        const agg = grid[`${aspect}|${s}`];
        if (!agg) {
          return (
            <div
              key={s}
              className="hatch flex h-16 items-center justify-center rounded-xl border border-line text-[11.5px] text-ink-3"
              title={`${ASPECT_LABELS[aspect]} · ${SPEAKER_LABELS[s]}: no data (not neutral)`}
            >
              no data
            </div>
          );
        }
        return (
          <button
            key={s}
            onClick={() => onOpen(s, agg)}
            title={`${ASPECT_LABELS[aspect]} · ${SPEAKER_LABELS[s]}: ${fmtPolarity(agg.mean, 2)} (${polarityWord(agg.mean)}), n=${agg.n} across ${agg.points.length} week${agg.points.length === 1 ? "" : "s"}`}
            className="group relative flex h-16 flex-col items-center justify-center rounded-xl transition-transform hover:scale-[1.03] hover:shadow-md focus-visible:scale-[1.03]"
            style={{ background: polarityFill(agg.mean), color: polarityInk(agg.mean) }}
          >
            <span className="tnum text-[17px] font-semibold leading-none">{fmtPolarity(agg.mean)}</span>
            <span className="tnum mt-1 text-[11px] font-medium opacity-80">n={agg.n}</span>
          </button>
        );
      })}
    </>
  );
}

function PolarityLegend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-[12px] text-ink-3">
      <span className="font-medium text-ink-2">Polarity</span>
      <div className="flex items-center gap-1">
        {[-2, -1, 0, 1, 2].map((v) => (
          <span key={v} className="tnum flex h-6 w-10 items-center justify-center rounded-md text-[11.5px] font-semibold"
            style={{ background: polarityFill(v), color: polarityInk(v) }}>{fmtPolarity(v, 0)}</span>
        ))}
      </div>
      <span>strongly negative → neutral → strongly positive</span>
      <span className="inline-flex items-center gap-1.5"><span className="hatch h-4 w-6 rounded border border-line" />no data (not zero)</span>
    </div>
  );
}

function LegendSwatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width="26" height="10" aria-hidden>
      <line x1="1" y1="5" x2="25" y2="5" stroke={color} strokeWidth="2" strokeDasharray={dashed ? "6 3" : undefined} />
      {dashed ? <rect x="9.5" y="1.5" width="7" height="7" fill={color} /> : <circle cx="13" cy="5" r="3.5" fill={color} />}
    </svg>
  );
}

interface Row { week: string; A: number | null; An: number; B: number | null; Bn: number }
interface DotProps { cx?: number | null; cy?: number | null; index?: number; value?: number | null; payload: Row }

/** Bigger hit target than the visible mark; B uses squares so product identity isn't colour-only. */
function ClickDot({ cx: x, cy: y, value, color, ring, square, onClick }: DotProps & { color: string; ring: string; square?: boolean; onClick: () => void }) {
  if (value === null || value === undefined || x == null || y == null) return <g />;
  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      <circle cx={x} cy={y} r={12} fill="transparent" />
      {square
        ? <rect x={x - 4.5} y={y - 4.5} width={9} height={9} rx={1.5} fill={color} stroke={ring} strokeWidth={2} />
        : <circle cx={x} cy={y} r={5} fill={color} stroke={ring} strokeWidth={2} />}
    </g>
  );
}

function LineTip({ active, payload, label }: { active?: boolean; payload?: { payload: Row }[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  const r = payload[0].payload;
  return (
    <div className="min-w-[200px] rounded-xl border border-line bg-surface px-3.5 py-3 text-[12.5px] shadow-lg">
      <div className="mb-2 font-semibold text-ink">{weekLabel(label)}</div>
      {(["A", "B"] as const).map((p) => {
        const v = r[p];
        const n = p === "A" ? r.An : r.Bn;
        return (
          <div key={p} className="flex items-center justify-between gap-4 py-0.5">
            <span className="inline-flex items-center gap-2 text-ink-2"><ProductDot product={p} />{p === "A" ? "Tagrisso" : "Rybrevant"}</span>
            {v === null ? <span className="text-ink-3">no data</span> : (
              <span className="tnum font-semibold text-ink">{fmtPolarity(v, 2)} <span className="font-normal text-ink-3">n={n}</span></span>
            )}
          </div>
        );
      })}
      {(r.A !== null || r.B !== null) && <div className="mt-2 border-t border-line pt-2 text-[11.5px] text-ink-3">Click the point to read the quotes</div>}
    </div>
  );
}

function WeekTable({ rows, onOpen }: { rows: Row[]; onOpen: (p: "A" | "B", w: string) => void }) {
  return (
    <div className="scroll-thin max-h-[320px] overflow-y-auto rounded-xl border border-line">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 bg-surface-2 text-left text-[12px] text-ink-3">
          <tr><th className="px-4 py-2 font-medium">ISO week</th><th className="px-4 py-2 font-medium">Tagrisso (A)</th><th className="px-4 py-2 font-medium">Rybrevant (B)</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.week}>
              <td className="tnum px-4 py-2 text-ink-2">{weekLabel(r.week)}</td>
              {(["A", "B"] as const).map((p) => {
                const v = r[p];
                return (
                  <td key={p} className="px-4 py-1.5">
                    {v === null ? <span className="text-ink-3">no data</span> : (
                      <button onClick={() => onOpen(p, r.week)} className="rounded-full hover:ring-2 hover:ring-line-strong">
                        <PolarityChip value={v} digits={2} n={p === "A" ? r.An : r.Bn} />
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuoteList({ points }: { points: TrendPoint[] }) {
  const sorted = [...points].sort((a, b) => b.week.localeCompare(a.week));
  const shown = sorted.reduce((s, p) => s + p.quotes.length, 0);
  const total = sorted.reduce((s, p) => s + p.n, 0);
  return (
    <div className="space-y-6">
      {shown < total && (
        <div className="rounded-lg bg-surface-2 px-3 py-2 text-[12px] text-ink-3">
          Showing {shown} of {total} observations: up to 3 quotes are kept per cell, strongest polarity first.
        </div>
      )}
      {sorted.map((p) => (
        <section key={`${p.product}-${p.aspect}-${p.speaker}-${p.week}`}>
          <div className="mb-2.5 flex items-center gap-2 text-[12.5px]">
            <ProductDot product={p.product} />
            <span className="font-semibold text-ink">{weekLabel(p.week)}</span>
            <span className="text-ink-3">· {SPEAKER_LABELS[p.speaker]}</span>
            <span className="ml-auto"><PolarityChip value={p.mean_polarity} digits={2} n={p.n} /></span>
          </div>
          <div className="space-y-2.5">
            {p.quotes.map((q: TrendQuote, i) => (
              <Quote
                key={i}
                text={q.quote}
                aspect={p.aspect}
                url={q.url}
                meta={
                  <>
                    <PolarityChip value={q.polarity} />
                    <span className="text-[12px] text-ink-3">{fmtDate(q.published)}</span>
                    <Link to={`/items/${encodeURIComponent(q.item_id)}`} className="inline-flex items-center gap-0.5 font-mono text-[11.5px] text-ink-2 hover:underline">
                      {q.item_id}<ArrowUpRight size={11} />
                    </Link>
                  </>
                }
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
