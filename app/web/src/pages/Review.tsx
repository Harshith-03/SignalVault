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
import { Button, EmptyState, ErrorState, PageHeader, Panel, PanelTitle, SkeletonCards, TextInput } from "../components/ui";
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
        <div className="grid items-start gap-4 sm:gap-6 @5xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <div className="mb-4 flex items-center gap-2 text-support text-ink-3" aria-live="polite">
              <span className="tnum inline-flex h-7 items-center rounded-full bg-warn-soft px-3 font-semibold text-warn">{pending.length} waiting</span>
              <span className="tnum inline-flex h-7 items-center rounded-full bg-surface-3 px-3 font-medium text-ink-2">{decided.length} decided</span>
            </div>
            {pending.length === 0 ? (
              <EmptyState title="Queue clear" icon={<CheckCircle2 size={20} />}>
                Every low-confidence card in this view has a human decision. <Link to="/signals" className="font-medium text-brand underline underline-offset-2">Back to Signals</Link>
              </EmptyState>
            ) : (
              <div className="space-y-4">
                <AnimatePresence initial={false}>
                  {pending.map((c) => <ReviewItem key={c.card_id} card={c} onDecide={decide} />)}
                </AnimatePresence>
              </div>
            )}
          </div>

          <aside className="@5xl:sticky @5xl:top-[88px]">
            <Panel>
              <PanelTitle
                hint="Kept in this browser so the queue stays consistent"
                right={decided.length > 0 && <Button size="sm" variant="ghost" icon={<RotateCcw size={12} />} onClick={clearDecisions} title="Forget local decisions (the API log is unchanged)">Reset</Button>}
              >
                Decided
              </PanelTitle>
              {decided.length === 0 ? <div className="rounded-panel bg-surface-3/50 px-3 py-4 text-center text-support text-ink-3">No decisions yet.</div> : (
                <ul className="scroll-thin max-h-[60vh] space-y-1 overflow-y-auto">
                  {decided.map((c) => {
                    const d = decisions[c.card_id];
                    return (
                      <motion.li key={c.card_id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start gap-2.5 rounded-control px-2 py-2 text-[12.5px] hover:bg-surface-2">
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
    <motion.div layout="position" exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}>
      <InsightCard card={card} actions={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for the audit trail"
            aria-label="Review note"
            className="h-9 min-w-0 flex-1"
          />
          <div className="flex gap-2">
            <Button variant="danger" disabled={busy} icon={<X size={14} />} onClick={() => go("reject")} className="flex-1 sm:flex-none">Reject</Button>
            <Button variant="primary" disabled={busy} icon={<Check size={14} />} onClick={() => go("accept")} className="flex-1 sm:flex-none">Accept</Button>
          </div>
        </div>
      } />
    </motion.div>
  );
}
