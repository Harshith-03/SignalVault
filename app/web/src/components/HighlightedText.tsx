import type { ReactNode } from "react";

export interface Span {
  start: number;
  end: number;
  color: string;
  label: string;
  /** "mark" tints the text; "redaction" renders a solid token. */
  variant?: "mark" | "redaction";
  key?: string;
}

/**
 * Renders `text` with spans highlighted by character offset. Overlaps are clipped, never reordered,
 * so the visible text is always exactly the source text.
 */
export function HighlightedText({ text, spans, active }: { text: string; spans: Span[]; active?: string | null }) {
  const sorted = [...spans].filter((s) => s.end > s.start && s.start >= 0 && s.end <= text.length).sort((a, b) => a.start - b.start);
  const out: ReactNode[] = [];
  let pos = 0;
  sorted.forEach((s, i) => {
    const start = Math.max(s.start, pos);
    if (start >= s.end) return;
    if (start > pos) out.push(text.slice(pos, start));
    const dim = active && s.key && s.key !== active;
    if (s.variant === "redaction") {
      out.push(
        <mark
          key={i}
          title={s.label}
          className="rounded-[5px] px-1 py-px font-mono text-[0.86em] font-semibold"
          style={{ background: `color-mix(in srgb, ${s.color} 18%, transparent)`, color: s.color, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${s.color} 45%, transparent)` }}
        >
          {text.slice(start, s.end)}
        </mark>,
      );
    } else {
      out.push(
        <mark
          key={i}
          title={s.label}
          data-key={s.key}
          className="rounded-[3px] px-0.5 text-ink transition-opacity"
          style={{
            background: `color-mix(in srgb, ${s.color} 20%, transparent)`,
            boxShadow: `inset 0 -2px 0 ${s.color}`,
            opacity: dim ? 0.35 : 1,
          }}
        >
          {text.slice(start, s.end)}
        </mark>,
      );
    }
    pos = s.end;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return <div className="whitespace-pre-wrap break-words text-[14.5px] leading-[1.85] text-ink-2">{out}</div>;
}
