import { motion } from "framer-motion";
import { BadgeCheck, Database, Info, Lock, LockOpen, ShieldAlert, Timer } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "../api/client";
import type { CaseStatus, SafetyCase } from "../api/types";
import { useApi } from "../api/useApi";
import { SafetyCaseCard } from "../components/safety";
import { useToast } from "../components/Toast";
import { Button, EmptyState, ErrorState, PageHeader, SkeletonCards, Stat, cx } from "../components/ui";
import { ROLE_LABELS, STATUS_LABELS, daysUntil } from "../lib/format";
import { matchesProduct, useApp } from "../state/app";
import { SAFETY_CHANGED } from "../state/reviews";

type Tab = "all" | CaseStatus;
const OPEN = (c: SafetyCase) => c.status === "new" || c.status === "in_triage";

export default function Safety() {
  const { role, setRole, product } = useApp();
  const toast = useToast();
  const cases = useApi(() => api.safety(), [role]);
  const [tab, setTab] = useState<Tab>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const isPv = role === "pharmacovigilance";

  const inView = (cases.data ?? []).filter((c) => matchesProduct(product, c.product));
  const shown = inView
    .filter((c) => tab === "all" || c.status === tab)
    .sort((a, b) => Number(OPEN(b)) - Number(OPEN(a)) || (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const count = (t: Tab) => (t === "all" ? inView.length : inView.filter((c) => c.status === t).length);
  const dueSoon = inView.filter((c) => OPEN(c) && c.due && daysUntil(c.due) <= 7).length;

  const setStatus = async (sc: SafetyCase, status: CaseStatus) => {
    setBusy(sc.case_id);
    try {
      await api.updateSafety(sc.case_id, status);
      cases.setData((prev) => prev?.map((c) => (c.case_id === sc.case_id ? { ...c, status } : c)));
      window.dispatchEvent(new Event(SAFETY_CHANGED));
      toast({ tone: "good", title: `${sc.case_id} → ${STATUS_LABELS[status]}`, body: "Recorded by the local API." });
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("http", String(e));
      toast(err.kind === "forbidden"
        ? { tone: "warn", title: "Not permitted (403)", body: "The API only lets Pharmacovigilance change a case's status." }
        : { tone: "warn", title: "Status not saved", body: err.kind === "offline" ? "The API is offline." : err.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Safety Inbox"
        subtitle="Possible reportable adverse-event cases found in literature, news and transcripts. Each of the four minimum criteria carries a verbatim quote."
      />

      <motion.div
        key={isPv ? "pv" : "masked"}
        initial={{ opacity: 0.4 }}
        animate={{ opacity: 1 }}
        className={cx(
          "mb-6 flex items-center gap-4 rounded-2xl border px-5 py-4",
          isPv ? "border-good/30 bg-good-soft" : "border-line bg-surface-2",
        )}
      >
        <div className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", isPv ? "bg-surface text-good" : "bg-surface text-ink-2")}>
          {isPv ? <LockOpen size={18} /> : <Lock size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-ink">
            Viewing as {ROLE_LABELS[role]} · {isPv ? "patient-level detail visible" : "patient-level detail masked"}
          </div>
          <div className="mt-0.5 text-[12.5px] leading-snug text-ink-3">
            {isPv
              ? "Pharmacovigilance sees patient and reporter quotes and can change case status."
              : "The API masks patient and reporter quotes for this role before they leave the server (need-to-know). Status changes are pharmacovigilance-only."}
            {" "}Role is a demo header (<span className="font-mono">X-SV-Role</span>); production would use SSO.
          </div>
        </div>
        <Button
          variant={isPv ? "secondary" : "primary"}
          icon={isPv ? <Lock size={14} /> : <LockOpen size={14} />}
          onClick={() => setRole(isPv ? "brand" : "pharmacovigilance")}
        >
          {isPv ? "Switch to Brand" : "Switch to Pharmacovigilance"}
        </Button>
      </motion.div>

      {cases.loading && !cases.data ? <SkeletonCards n={2} /> : cases.error ? (
        <ErrorState error={cases.error} onRetry={cases.reload} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-4 gap-4">
            <Stat label="Open cases" value={inView.filter(OPEN).length} icon={<ShieldAlert size={16} />} accent={inView.some(OPEN) ? "var(--crit)" : undefined} sub="New or in triage" />
            <Stat label="Valid case candidates" value={inView.filter((c) => c.valid_case_candidate).length} icon={<BadgeCheck size={16} />} sub="All four criteria present" />
            <Stat label="Due within 7 days" value={dueSoon} icon={<Timer size={16} />} accent={dueSoon ? "var(--warn)" : undefined} sub="Open cases only" />
            <Stat label="Already reported" value={inView.filter((c) => c.already_reported).length} icon={<Database size={16} />} sub="FAERS: no new report needed" />
          </div>

          <div role="tablist" aria-label="Case status" className="mb-5 flex items-center gap-1 border-b border-line">
            {(["all", "new", "in_triage", "sent_to_pv", "not_a_case"] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cx(
                  "relative -mb-px inline-flex h-10 items-center gap-2 px-3 text-[13px] font-medium",
                  tab === t ? "text-ink" : "text-ink-3 hover:text-ink",
                )}
              >
                {t === "all" ? "All" : STATUS_LABELS[t]}
                <span className="tnum rounded-full bg-surface-3 px-1.5 text-[11px] leading-5 text-ink-2">{count(t)}</span>
                {tab === t && <motion.span layoutId="safety-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ink" />}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <EmptyState title="No cases here">Nothing in this status for the current product view.</EmptyState>
          ) : (
            <div className="space-y-5">
              {shown.map((c) => (
                <SafetyCaseCard key={c.case_id} sc={c} canAct={isPv} busy={busy === c.case_id} onStatus={(s) => setStatus(c, s)} />
              ))}
            </div>
          )}
        </>
      )}

      <div className="mt-8 flex items-start gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-[12.5px] text-ink-2">
        <Info size={14} className="mt-0.5 shrink-0 text-ink-3" />
        <span><strong className="font-semibold text-ink">Triage aid only</strong> — a pharmacovigilance professional makes every reporting decision.</span>
      </div>
    </>
  );
}
