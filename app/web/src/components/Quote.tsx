import { Link2 } from "lucide-react";
import type { ReactNode } from "react";
import { aspectColor, hostOf } from "../lib/format";
import { CopyButton } from "./ui";

/**
 * A verbatim quote. Text is rendered exactly as received (never paraphrased or trimmed).
 * Source URLs are shown as text with a copy button, not as live links: the vault never
 * navigates out to the internet on the user's behalf.
 */
export function Quote({ text, aspect, meta, url }: { text: string; aspect?: string; meta?: ReactNode; url?: string | null }) {
  const host = hostOf(url);
  return (
    <figure
      className="rounded-xl border border-line bg-surface-2/60 py-3 pl-4 pr-3"
      style={{ borderLeft: `3px solid ${aspect ? aspectColor(aspect) : "var(--line-strong)"}` }}
    >
      <blockquote className="text-[13.5px] leading-relaxed text-ink">
        <span className="select-none text-ink-3">“</span>{text}<span className="select-none text-ink-3">”</span>
      </blockquote>
      {(meta || host) && (
        <figcaption className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {meta}
          {host && url && (
            <span className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] text-ink-3" title={url}>
              <Link2 size={11} />
              {host}
              <CopyButton text={url} label="Copy source URL" />
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}
