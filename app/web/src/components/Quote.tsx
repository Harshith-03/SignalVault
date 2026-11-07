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
    <figure className="relative rounded-panel border border-line bg-surface-2 py-3 pl-4.5 pr-3">
      <span
        aria-hidden
        className="absolute bottom-3 left-1.5 top-3 w-[3px] rounded-full"
        style={{ background: aspect ? aspectColor(aspect) : "var(--line-strong)" }}
      />
      <blockquote className="break-words text-[13.5px] leading-relaxed text-ink">
        <span className="select-none text-ink-3">“</span>{text}<span className="select-none text-ink-3">”</span>
      </blockquote>
      {(meta || host) && (
        <figcaption className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {meta}
          {host && url && (
            <span className="ml-auto inline-flex min-w-0 items-center gap-1 font-mono text-micro text-ink-3" title={url}>
              <Link2 size={11} className="shrink-0" />
              <span className="truncate">{host}</span>
              <CopyButton text={url} label="Copy source URL" />
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}
