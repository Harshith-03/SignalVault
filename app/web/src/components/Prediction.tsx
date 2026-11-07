import { AlertTriangle, CheckCircle2, CircleSlash, Cpu, EyeOff, Flag as FlagIcon, ShieldAlert, Stethoscope } from "lucide-react";
import type { ReactNode } from "react";
import type { AspectName, EnrichedPrediction, Flag } from "../api/types";
import { ASPECTS } from "../api/types";
import { ASPECT_LABELS, SIGNAL_LABELS, aspectColor, fmtPct } from "../lib/format";
import { PolarityChip, SpeakerChip } from "./chips";
import type { Span } from "./HighlightedText";
import { Chip, cx } from "./ui";

export type Verification = "verified" | "relocated" | "missing";
export interface AspectRow {
  aspect: AspectName;
  polarity: number;
  speaker: NonNullable<EnrichedPrediction["efficacy"]>["speaker"];
  span: string;
  confidence?: number;
  origin?: string;
  status: Verification;
  start?: number;
  end?: number;
}

/**
 * Check every aspect span against the text actually displayed. Offsets must match exactly
 * ("verified"). Only when the shown text was redacted (offsets shifted) do we accept an exact
 * verbatim re-match ("relocated"). Anything else is not highlighted.
 */
export function verifyAspects(pred: EnrichedPrediction, text: string, redacted: boolean): AspectRow[] {
  const rows: AspectRow[] = [];
  for (const a of ASPECTS) {
    const asp = pred[a];
    if (!asp) continue;
    const m = pred.meta.aspects?.[a];
    let status: Verification = "missing";
    let start: number | undefined;
    let end: number | undefined;
    if (m && text.slice(m.start, m.end) === asp.span) {
      status = "verified"; start = m.start; end = m.end;
    } else if (redacted) {
      const i = text.indexOf(asp.span);
      if (i >= 0) { status = "relocated"; start = i; end = i + asp.span.length; }
    }
    rows.push({ aspect: a, polarity: asp.polarity, speaker: asp.speaker, span: asp.span, confidence: m?.confidence, origin: m?.origin, status, start, end });
  }
  return rows;
}

export function aspectSpans(rows: AspectRow[]): Span[] {
  return rows.filter((r) => r.start !== undefined).map((r) => ({
    start: r.start!, end: r.end!, color: aspectColor(r.aspect), label: `${ASPECT_LABELS[r.aspect]} · ${r.speaker} · polarity ${r.polarity}`, key: r.aspect,
  }));
}

export function AspectTable({ rows, onHover }: { rows: AspectRow[]; onHover?: (a: string | null) => void }) {
  if (!rows.length) return <div className="text-[13px] text-ink-3">No aspects were extracted (all abstained).</div>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li
          key={r.aspect}
          onMouseEnter={() => onHover?.(r.aspect)}
          onMouseLeave={() => onHover?.(null)}
          className="relative rounded-panel border border-line bg-surface py-3 pl-4.5 pr-3 transition-colors hover:border-line-strong hover:bg-surface-2"
        >
          <span aria-hidden className="absolute bottom-3 left-1.5 top-3 w-[3px] rounded-full" style={{ background: aspectColor(r.aspect) }} />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[13px] font-semibold text-ink">{ASPECT_LABELS[r.aspect]}</span>
            <PolarityChip value={r.polarity} />
            <SpeakerChip speaker={r.speaker} />
            <span className="ml-auto"><VerifyBadge status={r.status} /></span>
          </div>
          <div className="mt-2 break-words text-[13px] leading-relaxed text-ink-2">“{r.span}”</div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-micro text-ink-3">
            {r.origin && <span>origin: {r.origin}</span>}
            {r.confidence !== undefined && <span>conf: {r.confidence.toFixed(2)}</span>}
            {r.start !== undefined && <span>@{r.start}–{r.end}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function VerifyBadge({ status }: { status: Verification }) {
  if (status === "verified") return <Chip className="border-transparent bg-good-soft text-good" icon={<CheckCircle2 size={12} />}>Offsets verified</Chip>;
  if (status === "relocated") return <Chip className="border-transparent bg-info-soft text-info" icon={<EyeOff size={12} />} title="Text is redacted, so offsets shifted; the quote was re-matched verbatim">Verbatim · redacted text</Chip>;
  return <Chip className="border-transparent bg-warn-soft text-warn" icon={<CircleSlash size={12} />} title="The span did not match the displayed text, so it is not highlighted">Not shown · offset mismatch</Chip>;
}

const FLAG_META: Record<Flag, { label: string; icon: ReactNode; tone: string }> = {
  pv_possible_ae: { label: "Possible adverse event → PV", icon: <ShieldAlert size={13} />, tone: "bg-crit-soft text-crit" },
  reportable_case_candidate: { label: "Reportable case candidate", icon: <ShieldAlert size={13} />, tone: "bg-crit-soft text-crit" },
  off_label: { label: "Off-label mention → Medical Affairs", icon: <Stethoscope size={13} />, tone: "bg-warn-soft text-warn" },
  single_report_no_causality: { label: "1 spontaneous report; causality not established", icon: <AlertTriangle size={13} />, tone: "bg-warn-soft text-warn" },
  case_report_demographics: { label: "Case-report demographics withheld", icon: <EyeOff size={13} />, tone: "bg-surface-3 text-ink-2" },
  pii_redacted: { label: "Personal data redacted", icon: <EyeOff size={13} />, tone: "bg-info-soft text-info" },
  competitor: { label: "Competitor mention", icon: <FlagIcon size={13} />, tone: "bg-surface-3 text-ink-2" },
};

export function FlagList({ flags, large }: { flags: Flag[]; large?: boolean }) {
  if (!flags.length) return <span className="text-[13px] text-ink-3">No flags.</span>;
  return (
    <div className={cx("flex flex-wrap", large ? "gap-2" : "gap-1.5")}>
      {flags.map((f) => {
        const m = FLAG_META[f] ?? { label: f, icon: <FlagIcon size={13} />, tone: "bg-surface-3 text-ink-2" };
        return (
          <span key={f} className={cx("inline-flex items-center gap-1.5 rounded-full font-medium", m.tone, large ? "px-3.5 py-2 text-[13px]" : "px-2.5 py-1 text-caption")}>
            {m.icon}{m.label}
          </span>
        );
      })}
    </div>
  );
}

export function LabelSummary({ pred }: { pred: EnrichedPrediction }) {
  const m = pred.meta;
  return (
    <dl className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
      <div className="rounded-panel bg-surface-3/60 p-3.5">
        <dt className="text-caption text-ink-3">Signal type</dt>
        <dd className="mt-1 font-display text-[15px] font-semibold text-ink">{SIGNAL_LABELS[pred.signal_type]}</dd>
        <dd className="tnum mt-0.5 text-caption text-ink-3">confidence {fmtPct(m.signal_confidence)}</dd>
      </div>
      <div className="rounded-panel bg-surface-3/60 p-3.5">
        <dt className="text-caption text-ink-3">Actionable</dt>
        <dd className="mt-1 font-display text-[15px] font-semibold capitalize text-ink">{pred.actionable}</dd>
        <dd className="tnum mt-0.5 text-caption text-ink-3">confidence {fmtPct(m.actionable_confidence)}</dd>
      </div>
      {m.why_actionable && (
        <div className="text-[13px] leading-relaxed text-ink-2 min-[420px]:col-span-2"><span className="font-medium text-ink">Why: </span>{m.why_actionable}</div>
      )}
      {m.uncertainty && (
        <div className="flex items-start gap-2 rounded-control bg-warn-soft px-3 py-2 text-caption text-ink min-[420px]:col-span-2">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" />Uncertainty: {m.uncertainty}
        </div>
      )}
    </dl>
  );
}

export function Provenance({ pred }: { pred: EnrichedPrediction }) {
  const m = pred.meta;
  return (
    <div className="space-y-3 text-caption">
      <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-y-2">
        <span className="text-ink-3">Model</span><span className="inline-flex min-w-0 items-center gap-1.5 break-all font-mono text-ink"><Cpu size={12} className="text-ink-3" />{m.model || "unknown"}</span>
        <span className="text-ink-3">Prompt version</span><span className="font-mono text-ink">{m.prompt_version || "unknown"}</span>
        <span className="text-ink-3">Latency</span><span className="tnum font-mono text-ink">{m.latency_ms ? `${(m.latency_ms / 1000).toFixed(2)} s` : "unknown"}</span>
        <span className="text-ink-3">Review status</span><span className="capitalize text-ink">{m.review_status}</span>
      </div>
      <div>
        <div className="mb-1.5 text-ink-3">Rule hits</div>
        {(m.rule_hits ?? []).length ? (
          <div className="flex flex-wrap gap-1">
            {m.rule_hits!.map((r) => <code key={r} className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2">{r}</code>)}
          </div>
        ) : <span className="text-ink-3">None (LLM path only)</span>}
      </div>
    </div>
  );
}
