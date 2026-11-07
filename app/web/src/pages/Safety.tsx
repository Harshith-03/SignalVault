import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, Database, Inbox, Info, Lock, LockOpen, ShieldAlert, Timer } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "../api/client";
import type { CaseStatus, SafetyCase } from "../api/types";
import { useApi } from "../api/useApi";
import { SafetyCaseCard } from "../components/safety";
import { useToast } from "../components/Toast";
import {
  Button, EmptyState, ErrorState, IconBadge, Note, PageHeader, ShowMore, SkeletonCards, Stat, Tabs, cx, useIncremental,
} from "../components/ui";
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
  const page = useIncremental(shown, 10, `${tab}|${product}`);

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

      {/* Role banner: the unlock is a calm colour + icon transition, enforced by the API. */}
      <motion.div
        key={isPv ? "pv" : "masked"}
        initial={{ opacity: 0.5, y: 2 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className={cx(
          "mb-5 flex flex-col gap-4 rounded-card border p-4 sm:mb-6 sm:flex-row sm:items-center sm:px-5",
          isPv ? "border-good/25 bg-good-soft" : "border-line bg-surface-3/60",
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3.5 sm:items-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={isPv ? "open" : "locked"} initial={{ rotate: -12, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <IconBadge size="lg" tone={isPv ? "onTintGood" : "onTint"}>
                {isPv ? <LockOpen size={19} /> : <Lock size={19} />}
              </IconBadge>
            </motion.span>
          </AnimatePresence>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-ink">
              Viewing as {ROLE_LABELS[role]} · {isPv ? "patient-level detail visible" : "patient-level detail masked"}
            </div>
            <div className="mt-0.5 text-caption text-ink-2">
              {isPv
                ? "Pharmacovigilance sees patient and reporter quotes and can change case status."
                : "The API masks patient and reporter quotes for this role before they leave the server (need-to-know). Status changes are pharmacovigilance-only."}
              {" "}Role is a demo header (<span className="font-mono">X-SV-Role</span>); production would use SSO.
            </div>
          </div>
        </div>
        <Button
          variant={isPv ? "secondary" : "primary"}
          icon={isPv ? <Lock size={14} /> : <LockOpen size={14} />}
          onClick={() => setRole(isPv ? "brand" : "pharmacovigilance")}
          className="w-full sm:w-auto"
        >
          {isPv ? "Switch to Brand" : "Switch to Pharmacovigilance"}
        </Button>
      </motion.div>

      {cases.loading && !cases.data ? <SkeletonCards n={2} /> : cases.error ? (
        <ErrorState error={cases.error} onRetry={cases.reload} />
      ) : (
        <>
          <section aria-label="Case summary" className="mb-5 grid grid-cols-2 gap-3 sm:mb-6 sm:gap-4 @4xl:grid-cols-4">
            <Stat label="Open cases" value={inView.filter(OPEN).length} icon={<ShieldAlert size={17} />} tone={inView.some(OPEN) ? "crit" : "neutral"} sub="New or in triage" />
            <Stat label="Valid case candidates" value={inView.filter((c) => c.valid_case_candidate).length} icon={<BadgeCheck size={17} />} tone="brand" sub="All four criteria present" />
            <Stat label="Due within 7 days" value={dueSoon} icon={<Timer size={17} />} tone={dueSoon ? "warn" : "neutral"} sub="Open cases only" />
            <Stat label="Already reported" value={inView.filter((c) => c.already_reported).length} icon={<Database size={17} />} tone="info" sub="FAERS: no new report needed" />
          </section>

          <div className="mb-4">
            <Tabs<Tab>
              label="Case status"
              value={tab}
              onChange={setTab}
              options={(["all", "new", "in_triage", "sent_to_pv", "not_a_case"] as Tab[]).map((t) => ({
                value: t, label: t === "all" ? "All" : STATUS_LABELS[t], count: count(t),
              }))}
            />
          </div>

          {shown.length === 0 ? (
            <EmptyState title="No cases here" icon={<Inbox size={20} />}>Nothing in this status for the current product view.</EmptyState>
          ) : (
            <>
              <div className="space-y-4 sm:space-y-5">
                {page.visible.map((c) => (
                  <SafetyCaseCard key={c.case_id} sc={c} canAct={isPv} busy={busy === c.case_id} onStatus={(s) => setStatus(c, s)} />
                ))}
              </div>
              <ShowMore {...page} noun="cases" />
            </>
          )}
        </>
      )}

      <Note className="mt-8" icon={<Info size={15} />}>
        <span><strong className="font-semibold text-ink">Triage aid only</strong> — a pharmacovigilance professional makes every reporting decision.</span>
      </Note>
    </>
  );
}
