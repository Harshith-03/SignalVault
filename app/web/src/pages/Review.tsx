import { AnimatePresence, motion } from "framer-motion";
import { Check, CheckCircle2, RotateCcw, X, XCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Card } from "../api/types";
import { useApi } from "../api/useApi";
import { ProductDot } from "../components/chips";
import { InsightCard } from "../components/InsightCard";
import { useToast } from "../components/Toast";
import { Button, EmptyState, ErrorState, PageHeader, Panel, PanelTitle, SkeletonCards } from "../components/ui";
import { matchesProduct, useApp } from "../state/app";
import { clearDecisions, recordDecision, useDecisions } from "../state/reviews";

export default function Review() {
  const { product } = useApp();
  const decisions = useDecisions();
  const cards = useApi(() => api.cards({ status: "review" }), []);
  const toast = useToast();

  const inView = (cards.data ?? []).filter((c) => matchesProduct(product, c.product));
  const pending = inView
    .filter((c) => !decisions[c.card_id])
    .sort((a, b) => Number(b.actionable) - Number(a.actionable) || (b.published ?? "").localeCompare(a.published ?? ""));
  const decided = inView.filter((c) => decisions[c.card_id]);

  const decide = async (card: Card, decision: "accept" | "reject", note: string) => {
    try {
      await api.review(card.card_id, decision, note);
      recordDecision(card.card_id, { decision, note, ts: new Date().toISOString() });
      toast({ tone: "good", title: decision === "accept" ? "Card accepted" : "Card rejected", body: card.headline });
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("http", String(e));
      toast({ tone: "warn", title: "Decision not saved", body: err.kind === "offline" ? "The API is offline. Start it and try again." : err.message });
    }
  };

  return (
    <>
      <PageHeader
        title="Review queue"
        subtitle="Low-confidence cards wait here for a human. Accepting or rejecting is recorded by the local API; nothing is published automatically."
      />

      {cards.loading && !cards.data ? <SkeletonCards n={2} /> : cards.error ? (
        <ErrorState error={cards.error} onRetry={cards.reload} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-6">
          <div>
            <div className="tnum mb-4 text-[13px] text-ink-3">{pending.length} waiting · {decided.length} decided</div>
            {pending.length === 0 ? (
              <EmptyState title="Queue clear" icon={<CheckCircle2 size={18} />}>
                Every low-confidence card in this view has a human decision. <Link to="/signals" className="font-medium text-ink underline">Back to Signals</Link>
              </EmptyState>
            ) : (
              <div className="space-y-4">
                <AnimatePresence initial={false}>
                  {pending.map((c) => <ReviewItem key={c.card_id} card={c} onDecide={decide} />)}
                </AnimatePresence>
              </div>
            )}
          </div>

          <aside>
            <Panel className="sticky top-24">
              <PanelTitle
                hint="Kept in this browser so the queue stays consistent"
                right={decided.length > 0 && <Button size="sm" variant="ghost" icon={<RotateCcw size={12} />} onClick={clearDecisions} title="Forget local decisions (the API log is unchanged)">Reset</Button>}
              >
                Decided
              </PanelTitle>
              {decided.length === 0 ? <div className="text-[13px] text-ink-3">No decisions yet.</div> : (
                <ul className="space-y-2.5">
                  {decided.map((c) => {
                    const d = decisions[c.card_id];
                    return (
                      <motion.li key={c.card_id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start gap-2.5 text-[12.5px]">
                        {d.decision === "accept" ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-good" /> : <XCircle size={15} className="mt-0.5 shrink-0 text-crit" />}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-ink"><ProductDot product={c.product} size={6} /><span className="truncate">{c.headline}</span></div>
                          <div className="text-ink-3">{d.decision === "accept" ? "Accepted" : "Rejected"}{d.note && <> · “{d.note}”</>}</div>
                        </div>
                      </motion.li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </aside>
        </div>
      )}
    </>
  );
}

function ReviewItem({ card, onDecide }: { card: Card; onDecide: (c: Card, d: "accept" | "reject", note: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async (d: "accept" | "reject") => { setBusy(true); await onDecide(card, d, note); setBusy(false); };
  return (
    <motion.div layout exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}>
      <InsightCard card={card} actions={
      <div className="flex items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note for the audit trail"
          aria-label="Review note"
          className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-focus"
        />
        <Button size="sm" variant="danger" disabled={busy} icon={<X size={13} />} onClick={() => go("reject")}>Reject</Button>
        <Button size="sm" variant="primary" disabled={busy} icon={<Check size={13} />} onClick={() => go("accept")}>Accept</Button>
      </div>
      } />
    </motion.div>
  );
}
