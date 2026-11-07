import {
  Activity, BadgeCheck, Building2, CircleHelp, Eye, FlaskConical, Gavel, Landmark, Megaphone,
  Microscope, Newspaper, ShieldAlert, Stethoscope, User, Users, Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Confidence, Owner, Product, ReviewStatus, SignalType, Speaker } from "../api/types";
import {
  ASPECT_LABELS, OWNER_LABELS, PRODUCT_NAMES, PRODUCT_SHORT, SIGNAL_LABELS, SPEAKER_LABELS,
  aspectColor, fmtPolarity, polarityFill, polarityInk, polarityWord,
} from "../lib/format";
import { Chip, cx } from "./ui";

export function ProductDot({ product, size = 8 }: { product: Product | null | undefined; size?: number }) {
  if (product === "both") {
    return (
      <span
        aria-hidden
        className="inline-block shrink-0 rounded-full"
        style={{ width: size, height: size, background: "linear-gradient(90deg, var(--prod-a) 50%, var(--prod-b) 50%)" }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: product ? `var(--prod-${product.toLowerCase()})` : "var(--ink-3)" }}
    />
  );
}

export function ProductChip({ product, full }: { product: Product | null | undefined; full?: boolean }) {
  if (!product) return <Chip>Product unknown</Chip>;
  return (
    <span
      title={PRODUCT_NAMES[product]}
      className="inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold text-ink"
      style={{ background: `var(--prod-${product.toLowerCase()}-soft)` }}
    >
      <ProductDot product={product} size={7} />
      {full ? PRODUCT_NAMES[product] : PRODUCT_SHORT[product]}
    </span>
  );
}

export function PolarityChip({ value, digits = 0, n }: { value: number; digits?: number; n?: number }) {
  return (
    <span
      title={`Polarity ${fmtPolarity(value, digits)} (${polarityWord(value)}) on a −2..+2 scale`}
      className="tnum inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-semibold"
      style={{ background: polarityFill(value), color: polarityInk(value) }}
    >
      {fmtPolarity(value, digits)}
      {n !== undefined && <span className="font-medium opacity-75">· n={n}</span>}
    </span>
  );
}

const SPEAKER_ICONS: Record<Speaker, ReactNode> = {
  researcher: <Microscope size={12} />,
  hcp: <Stethoscope size={12} />,
  patient: <User size={12} />,
  company: <Building2 size={12} />,
  regulator: <Landmark size={12} />,
  payer: <Wallet size={12} />,
  media: <Newspaper size={12} />,
};
export function SpeakerChip({ speaker }: { speaker: Speaker }) {
  return <Chip icon={<span className="text-ink-3">{SPEAKER_ICONS[speaker]}</span>}>{SPEAKER_LABELS[speaker]}</Chip>;
}

const OWNER_ICONS: Record<Owner, ReactNode> = {
  brand: <Megaphone size={12} />,
  medical_affairs: <Stethoscope size={12} />,
  pharmacovigilance: <ShieldAlert size={12} />,
  market_access: <Wallet size={12} />,
  clinical_ops: <FlaskConical size={12} />,
};
export function OwnerChip({ owner }: { owner: Owner }) {
  return (
    <Chip title={`Owner team: ${OWNER_LABELS[owner]}`} className="border-line bg-surface text-ink" icon={<span className="text-ink-3">{OWNER_ICONS[owner]}</span>}>
      {OWNER_LABELS[owner]}
    </Chip>
  );
}

export function SignalChip({ signal }: { signal: SignalType }) {
  return <Chip icon={<Activity size={12} className="text-ink-3" />}>{SIGNAL_LABELS[signal]}</Chip>;
}

export function AspectChip({ aspect }: { aspect: string }) {
  return (
    <Chip icon={<span className="h-2 w-2 rounded-[3px]" style={{ background: aspectColor(aspect) }} />}>
      {ASPECT_LABELS[aspect as keyof typeof ASPECT_LABELS] ?? aspect}
    </Chip>
  );
}

/** Three-segment meter + word, so confidence never relies on colour alone. */
export function ConfidenceBand({ level }: { level: Confidence }) {
  const filled = level === "high" ? 3 : level === "medium" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-2 text-[12px] font-medium text-ink-2" title={`Confidence: ${level}`}>
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={cx("h-3 w-1.5 rounded-sm", i < filled ? "bg-ink-2" : "bg-surface-3")} />
        ))}
      </span>
      <span><span className="capitalize">{level}</span> confidence</span>
    </span>
  );
}

export function ReviewChip({ status }: { status: ReviewStatus }) {
  if (status === "auto") return <Chip className="border-transparent bg-good-soft text-good" icon={<BadgeCheck size={12} />}>Auto-approved</Chip>;
  if (status === "review") return <Chip className="border-transparent bg-warn-soft text-warn" icon={<Eye size={12} />}>Needs review</Chip>;
  return <Chip className="border-transparent bg-surface-3 text-ink-2" icon={<CircleHelp size={12} />}>Abstained</Chip>;
}

export function ActionableChip({ actionable }: { actionable: boolean }) {
  return actionable
    ? <Chip className="border-transparent bg-ink text-ink-inverse" icon={<Gavel size={12} />}>Actionable</Chip>
    : <Chip icon={<Users size={12} className="text-ink-3" />}>For awareness</Chip>;
}
