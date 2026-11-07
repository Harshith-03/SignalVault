import type { AspectName, CaseStatus, Owner, Product, Role, SignalType, Speaker } from "../api/types";

export const PRODUCT_NAMES: Record<Product, string> = {
  A: "Tagrisso",
  B: "Rybrevant / Lazcluze",
  both: "Tagrisso + Rybrevant",
};
export const PRODUCT_SHORT: Record<Product, string> = { A: "Tagrisso", B: "Rybrevant", both: "Both" };

export const SIGNAL_LABELS: Record<SignalType, string> = {
  efficacy: "Efficacy",
  safety: "Safety",
  regulatory: "Regulatory",
  trial_update: "Trial update",
  competitor_move: "Competitor move",
  access_pricing: "Access & pricing",
  guideline: "Guideline",
  expert_opinion: "Expert opinion",
  none: "No signal",
};

export const OWNER_LABELS: Record<Owner, string> = {
  brand: "Brand",
  medical_affairs: "Medical Affairs",
  pharmacovigilance: "Pharmacovigilance",
  market_access: "Market Access",
  clinical_ops: "Clinical Ops",
};

export const ROLE_LABELS: Record<Role, string> = {
  brand: "Brand",
  medical_affairs: "Medical Affairs",
  pharmacovigilance: "Pharmacovigilance",
  market_access: "Market Access",
};

export const SPEAKER_LABELS: Record<Speaker, string> = {
  researcher: "Researcher",
  hcp: "HCP",
  patient: "Patient",
  company: "Company",
  regulator: "Regulator",
  payer: "Payer",
  media: "Media",
};

export const ASPECT_LABELS: Record<AspectName, string> = {
  efficacy: "Efficacy",
  safety: "Safety",
  convenience: "Convenience",
  access_cost: "Access & cost",
  evidence_quality: "Evidence quality",
};

export const SOURCE_LABELS: Record<string, string> = {
  pubmed: "PubMed",
  ctgov: "ClinicalTrials.gov",
  fda_event: "FDA FAERS",
  fda_label: "FDA label",
  fda_notice: "FDA notice",
  press_release: "Press release",
  news: "News",
  transcript: "Transcript",
};
export const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s.replace(/_/g, " ");

export const STATUS_LABELS: Record<CaseStatus, string> = {
  new: "New",
  in_triage: "In triage",
  sent_to_pv: "Sent to PV",
  not_a_case: "Not a case",
};

export const aspectColor = (a: string) => `var(--asp-${a})`;

/** Always signed so polarity never relies on colour alone: "+1.5", "−0.7", "0.0". */
export function fmtPolarity(v: number, digits = 1): string {
  const s = Math.abs(v).toFixed(digits);
  if (Number(s) === 0) return (0).toFixed(digits);
  return (v > 0 ? "+" : "−") + s;
}

/** Diverging plum (−2) → warm grey (0) → olive (+2), mixed in OKLab from theme tokens. */
export function polarityFill(v: number): string {
  const x = Math.max(-2, Math.min(2, v));
  const a = Math.abs(x);
  const [near, far] = x >= 0 ? ["--pol-p1", "--pol-p2"] : ["--pol-n1", "--pol-n2"];
  if (a <= 1) return `color-mix(in oklab, var(${near}) ${Math.round(a * 100)}%, var(--pol-0))`;
  return `color-mix(in oklab, var(${far}) ${Math.round((a - 1) * 100)}%, var(${near}))`;
}
/**
 * Each theme's ramp is tuned so the theme's ink clears 4.5:1 on every step (see DESIGN.md), which
 * avoids the unreadable crossover a light→dark ramp has where neither ink nor inverse ink works.
 */
export const polarityInk = (_v: number) => "var(--ink)";

export function polarityWord(v: number): string {
  if (v >= 1.5) return "strongly positive";
  if (v >= 0.5) return "positive";
  if (v > -0.5) return "neutral";
  if (v > -1.5) return "negative";
  return "strongly negative";
}

export const fmtPct = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? "unknown" : `${(v * 100).toFixed(digits)}%`;

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Whole calendar days from today (local) to `iso`; negative when overdue. */
export function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

// ---------------------------------------------------------------- ISO weeks
/** "2026-W14" → Monday of that ISO week (local date). */
export function isoWeekToDate(week: string): Date | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) return null;
  const year = Number(m[1]);
  const wk = Number(m[2]);
  const jan4 = new Date(year, 0, 4);
  const dow = (jan4.getDay() + 6) % 7; // Mon=0
  const monday = new Date(year, 0, 4 - dow + (wk - 1) * 7);
  return monday;
}

export function dateToIsoWeek(d: Date): string {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (t.getDay() + 6) % 7;
  t.setDate(t.getDate() - dow + 3); // Thursday decides the year
  const year = t.getFullYear();
  const firstThu = new Date(year, 0, 4);
  const week = 1 + Math.round(((t.getTime() - firstThu.getTime()) / 86_400_000 - 3 + ((firstThu.getDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Every ISO week from `from` to `to` inclusive, so missing weeks can be drawn as gaps. */
export function weekRange(from: string, to: string): string[] {
  const start = isoWeekToDate(from);
  const end = isoWeekToDate(to);
  if (!start || !end) return [from, to].filter(Boolean);
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 520; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
    out.push(dateToIsoWeek(d));
  }
  return out;
}

export const shortWeek = (w: string) => w.replace(/^\d{4}-/, "");

export function weekLabel(w: string): string {
  const d = isoWeekToDate(w);
  if (!d) return w;
  return `${shortWeek(w)} · ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
