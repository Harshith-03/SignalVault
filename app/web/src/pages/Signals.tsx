import { AnimatePresence } from "framer-motion";
import { Search, X } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Owner, ReviewStatus, SignalType } from "../api/types";
import { OWNERS, SIGNAL_TYPES } from "../api/types";
import { useApi } from "../api/useApi";
import { ProductDot } from "../components/chips";
import { InsightCard } from "../components/InsightCard";
import { Button, EmptyState, ErrorState, PageHeader, Segmented, Select, SkeletonCards } from "../components/ui";
import { OWNER_LABELS, SIGNAL_LABELS } from "../lib/format";
import { matchesProduct, useApp, type ProductFilter } from "../state/app";

type Act = "any" | "yes" | "no";

export default function Signals() {
  const { product, setProduct } = useApp();
  const [params, setParams] = useSearchParams();
  const signal = (params.get("signal") ?? "any") as SignalType | "any";
  const owner = (params.get("owner") ?? "any") as Owner | "any";
  const status = (params.get("status") ?? "any") as ReviewStatus | "any";
  const actionable = (params.get("actionable") ?? "any") as Act;
  const q = params.get("q") ?? "";

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (!v || v === "any") next.delete(k); else next.set(k, v);
    setParams(next, { replace: true });
  };

  const cards = useApi(() => api.cards(), []);
  const all = cards.data ?? [];
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((c) => matchesProduct(product, c.product))
      .filter((c) => signal === "any" || c.signal_type === signal)
      .filter((c) => owner === "any" || c.owner === owner)
      .filter((c) => status === "any" || c.review_status === status)
      .filter((c) => actionable === "any" || c.actionable === (actionable === "yes"))
      .filter((c) => !needle || [c.headline, c.why_it_matters, ...c.citations.map((x) => x.quote)].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
  }, [all, product, signal, owner, status, actionable, q]);

  const filtered = signal !== "any" || owner !== "any" || status !== "any" || actionable !== "any" || q !== "";

  return (
    <>
      <PageHeader
        title="Signals"
        subtitle="Every insight card links back to verbatim, offset-verified quotes. Recommended actions are review steps for a human, never medical conclusions."
      />

      <div className="sticky top-15 z-20 -mx-2 mb-6 rounded-2xl border border-line bg-surface/90 px-4 py-3 shadow-sm backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <Segmented<ProductFilter>
            label="Product"
            value={product}
            onChange={setProduct}
            options={[
              { value: "all", label: <><ProductDot product="both" size={7} />Both</> },
              { value: "A", label: <><ProductDot product="A" size={7} />Tagrisso</> },
              { value: "B", label: <><ProductDot product="B" size={7} />Rybrevant</> },
            ]}
          />
          <Select label="Signal" value={signal} onChange={(v) => set("signal", v)}
            options={[{ value: "any", label: "All types" }, ...SIGNAL_TYPES.map((s) => ({ value: s, label: SIGNAL_LABELS[s] }))]} />
          <Select label="Owner" value={owner} onChange={(v) => set("owner", v)}
            options={[{ value: "any", label: "All teams" }, ...OWNERS.map((o) => ({ value: o, label: OWNER_LABELS[o] }))]} />
          <Select label="Review" value={status} onChange={(v) => set("status", v)}
            options={[{ value: "any", label: "Any status" }, { value: "auto", label: "Auto-approved" }, { value: "review", label: "Needs review" }, { value: "abstained", label: "Abstained" }]} />
          <Segmented<Act>
            label="Actionable"
            value={actionable}
            onChange={(v) => set("actionable", v)}
            options={[{ value: "any", label: "All" }, { value: "yes", label: "Actionable" }, { value: "no", label: "Awareness" }]}
          />
          <label className="relative ml-auto flex items-center">
            <Search size={14} className="pointer-events-none absolute left-2.5 text-ink-3" />
            <input
              value={q}
              onChange={(e) => set("q", e.target.value)}
              placeholder="Search headlines and quotes"
              aria-label="Search"
              className="h-8 w-[220px] rounded-lg border border-line bg-surface pl-8 pr-2 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-focus"
            />
          </label>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between text-[13px] text-ink-3">
        <span className="tnum">{cards.data ? `Showing ${shown.length} of ${all.length} cards` : " "}</span>
        {filtered && <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => setParams({}, { replace: true })}>Clear filters</Button>}
      </div>

      {cards.loading && !cards.data ? <SkeletonCards n={3} /> : cards.error ? (
        <ErrorState error={cards.error} onRetry={cards.reload} />
      ) : shown.length === 0 ? (
        <EmptyState title="No cards match these filters">Try widening the product, signal type or owner.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <AnimatePresence initial={false}>
            {shown.map((c) => <InsightCard key={c.card_id} card={c} />)}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}
