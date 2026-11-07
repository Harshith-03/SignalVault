import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle, ArchiveX, BadgeCheck, CalendarClock, CheckCircle2, CircleDashed, Database, Lock,
  Pill, Send, Siren, Stethoscope, Timer, User, XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { CaseStatus, Criterion, SafetyCase } from "../api/types";
import { RESTRICTED_MASK } from "../api/types";
import { STATUS_LABELS, daysUntil, fmtDate, fmtPct, sourceLabel } from "../lib/format";
import { ProductChip } from "./chips";
import { Button, Chip, cx } from "./ui";

export function CountdownBadge({ due }: { due: string }) {
  const d = daysUntil(due);
  const tone = d <= 3 ? "bg-crit-soft text-crit" : d <= 7 ? "bg-warn-soft text-warn" : "bg-info-soft text-info";
  const label = d < 0 ? `Overdue by ${-d}d` : d === 0 ? "Due today" : `${d} day${d === 1 ? "" : "s"} left`;
  return (
    <span className={cx("tnum inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold", tone)} title={`Due ${fmtDate(due)}`}>
      <Timer size={12} />{label}
    </span>
  );
}

const STATUS_STYLE: Record<CaseStatus, string> = {
  new: "border-transparent bg-crit-soft text-crit",
  in_triage: "border-transparent bg-warn-soft text-warn",
  sent_to_pv: "border-transparent bg-good-soft text-good",
  not_a_case: "border-line bg-surface-2 text-ink-3",
};
const STATUS_ICON: Record<CaseStatus, ReactNode> = {
  new: <Siren size={12} />,
  in_triage: <CircleDashed size={12} />,
  sent_to_pv: <Send size={12} />,
  not_a_case: <ArchiveX size={12} />,
};
export function CaseStatusChip({ status }: { status: CaseStatus }) {
  return <Chip className={STATUS_STYLE[status]} icon={STATUS_ICON[status]}>{STATUS_LABELS[status]}</Chip>;
}

export function LockBadge() {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line-strong bg-surface-2 px-2.5 py-1.5 text-[12.5px] font-medium text-ink-2"
      title={RESTRICTED_MASK}
    >
      <Lock size={13} className="text-ink-3" />
      Restricted · pharmacovigilance only
    </motion.span>
  );
}

const CRITERIA: { key: "patient" | "reporter" | "suspect_drug" | "adverse_event"; label: string; hint: string; icon: ReactNode }[] = [
  { key: "patient", label: "Patient", hint: "An identifiable patient", icon: <User size={14} /> },
  { key: "reporter", label: "Reporter", hint: "An identifiable reporter", icon: <Stethoscope size={14} /> },
  { key: "suspect_drug", label: "Suspect drug", hint: "A named suspect product", icon: <Pill size={14} /> },
  { key: "adverse_event", label: "Adverse event", hint: "An adverse event or outcome", icon: <AlertTriangle size={14} /> },
];

function CriterionRow({ label, hint, icon, c }: { label: string; hint: string; icon: ReactNode; c: Criterion }) {
  const restricted = c.quote === RESTRICTED_MASK;
  return (
    <li className="flex gap-3 py-3">
      <span className={cx("mt-0.5 shrink-0", c.present ? "text-good" : "text-ink-3")} aria-label={c.present ? "present" : "not found"}>
        {c.present ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-ink-3">{icon}</span>
          <span className="text-[13.5px] font-semibold text-ink">{label}</span>
          <span className="text-[12px] text-ink-3">· {c.present ? hint : "not found in source"}</span>
        </div>
        <div className="mt-1.5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={restricted ? "locked" : c.quote ?? (c.present ? "noquote" : "absent")}
              initial={{ opacity: 0, filter: "blur(4px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(4px)" }}
              transition={{ duration: 0.22 }}
            >
              {restricted ? <LockBadge /> : c.quote ? (
                <blockquote className="rounded-lg border-l-[3px] border-line-strong bg-surface-2/70 py-1.5 pl-3 pr-2 text-[13px] text-ink">
                  <span className="text-ink-3">“</span>{c.quote}<span className="text-ink-3">”</span>
                  {c.start != null && c.end != null && (
                    <span className="ml-2 font-mono text-[10.5px] text-ink-3" title="Character offsets in the source text">@{c.start}–{c.end}</span>
                  )}
                </blockquote>
              ) : c.present ? (
                <span className="text-[12.5px] text-ink-3">Present in a structured field; no verbatim quote.</span>
              ) : (
                <span className="text-[12.5px] text-ink-3">No evidence for this criterion in the text.</span>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </li>
  );
}

export function SafetyCaseCard({ sc, canAct, busy, onStatus }: {
  sc: SafetyCase; canAct: boolean; busy?: boolean; onStatus?: (s: CaseStatus) => void;
}) {
  const met = CRITERIA.filter((k) => sc[k.key].present).length;
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cx("rounded-2xl border bg-surface shadow-sm", sc.status === "new" && sc.valid_case_candidate ? "border-crit/35" : "border-line")}
    >
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-5 py-3.5">
        <CaseStatusChip status={sc.status} />
        {sc.valid_case_candidate ? (
          <Chip className="border-transparent bg-ink text-ink-inverse" icon={<BadgeCheck size={12} />}>Valid case candidate</Chip>
        ) : (
          <Chip icon={<CircleDashed size={12} className="text-ink-3" />}>Incomplete · {met} of 4 criteria</Chip>
        )}
        {sc.already_reported && (
          <Chip className="border-transparent bg-info-soft text-info" icon={<Database size={12} />}>Already reported (FAERS)</Chip>
        )}
        <ProductChip product={sc.product} />
        <Chip>{sourceLabel(sc.source)}</Chip>
        <span className="ml-auto font-mono text-[11.5px] text-ink-3">{sc.case_id}</span>
      </div>

      <div className="grid grid-cols-[1fr_260px] gap-6 px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-[15.5px] font-semibold leading-snug tracking-[-0.01em] text-ink">{sc.title || "Untitled case"}</h3>
          <div className="mt-1 flex items-center gap-2 text-[12px] text-ink-3">
            Item <Link className="font-mono text-ink-2 hover:underline" to={`/items/${encodeURIComponent(sc.item_id)}`}>{sc.item_id}</Link>
            <span>·</span> Detector confidence {fmtPct(sc.confidence)}
          </div>
          <ul className="mt-2 divide-y divide-line">
            {CRITERIA.map((k) => <CriterionRow key={k.key} label={k.label} hint={k.hint} icon={k.icon} c={sc[k.key]} />)}
          </ul>
        </div>

        <aside className="space-y-4 rounded-xl bg-surface-2/70 p-4 text-[12.5px]">
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 font-medium text-ink-3"><CalendarClock size={13} />Reporting clock</div>
            <dl className="grid grid-cols-[64px_1fr] gap-y-1.5">
              <dt className="text-ink-3">Day 0</dt><dd className="tnum font-medium text-ink">{fmtDate(sc.day0)}</dd>
              <dt className="text-ink-3">Due</dt>
              <dd className="tnum font-medium text-ink">{sc.due ? fmtDate(sc.due) : <span className="text-ink-3">No clock</span>}</dd>
            </dl>
            <div className="mt-2.5">
              {sc.due && sc.status !== "not_a_case" && sc.status !== "sent_to_pv" ? <CountdownBadge due={sc.due} /> : (
                <span className="text-[12px] text-ink-3">
                  {sc.already_reported ? "Already in a regulator database." : sc.status === "sent_to_pv" ? "Handed to PV." : sc.status === "not_a_case" ? "Closed as not a case." : "Clock starts once criteria are met."}
                </span>
              )}
            </div>
            <div className="mt-2 text-[11px] leading-snug text-ink-3">Policy: 15 days serious / 90 non-serious from day 0 (pending verification).</div>
          </div>
          <div className="border-t border-line pt-3.5">
            <div className="mb-1 font-medium text-ink-3">Seriousness</div>
            <div className={cx("text-[13px] font-semibold capitalize", sc.serious === "yes" ? "text-crit" : "text-ink")}>
              {sc.serious === "unknown" ? "Unknown, PV to confirm" : sc.serious}
            </div>
            {sc.seriousness_quote && <div className="mt-1 text-ink-2">“{sc.seriousness_quote}”</div>}
          </div>
          {(sc.events ?? []).length > 0 && (
            <div className="border-t border-line pt-3.5">
              <div className="mb-1.5 font-medium text-ink-3">Event terms (verbatim)</div>
              <div className="flex flex-wrap gap-1">{sc.events!.map((e) => <Chip key={e}>{e}</Chip>)}</div>
            </div>
          )}
        </aside>
      </div>

      {(sc.caveats ?? []).length > 0 && (
        <ul className="space-y-1.5 px-5 pb-4">
          {sc.caveats!.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-[12.5px] text-ink-2">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" />{c}
            </li>
          ))}
        </ul>
      )}

      {onStatus && (
        <div className="flex items-center gap-2 border-t border-line px-5 py-3">
          {canAct ? (
            <>
              <span className="mr-1 text-[12px] font-medium text-ink-3">Set status</span>
              <Button size="sm" disabled={busy || sc.status === "in_triage"} onClick={() => onStatus("in_triage")} icon={<CircleDashed size={13} />}>In triage</Button>
              <Button size="sm" variant="good" disabled={busy || sc.status === "sent_to_pv"} onClick={() => onStatus("sent_to_pv")} icon={<Send size={13} />}>Sent to PV</Button>
              <Button size="sm" variant="ghost" disabled={busy || sc.status === "not_a_case"} onClick={() => onStatus("not_a_case")} icon={<ArchiveX size={13} />}>Not a case</Button>
            </>
          ) : (
            <span className="inline-flex items-center gap-2 text-[12.5px] text-ink-3">
              <Lock size={13} />Only Pharmacovigilance can change a case's status. Switch role in the top bar.
            </span>
          )}
        </div>
      )}
    </motion.article>
  );
}
