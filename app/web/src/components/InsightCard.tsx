import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, CalendarDays, ClipboardCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Card } from "../api/types";
import { fmtDate, sourceLabel } from "../lib/format";
import {
  ActionableChip, AspectChip, ConfidenceBand, OwnerChip, PolarityChip, ProductChip, ReviewChip, SignalChip, SpeakerChip,
} from "./chips";
import { Quote } from "./Quote";

export function InsightCard({ card, footer, compact, hideItemLink }: {
  card: Card; footer?: ReactNode; compact?: boolean; hideItemLink?: boolean;
}) {
  const caveats = card.caveats ?? [];
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="rounded-2xl border border-line bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <ProductChip product={card.product} />
        <SignalChip signal={card.signal_type} />
        <ActionableChip actionable={card.actionable} />
        <div className="ml-auto"><ReviewChip status={card.review_status} /></div>
      </div>

      <h3 className="mt-3.5 text-[16.5px] font-semibold leading-snug tracking-[-0.01em] text-ink">{card.headline}</h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{card.why_it_matters}</p>

      <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-ink-3">Owner</span>
          <OwnerChip owner={card.owner} />
        </div>
        <ConfidenceBand level={card.confidence} />
      </div>

      {!compact && card.recommended_action && (
        <div className="mt-3.5 flex items-start gap-2.5 rounded-xl bg-info-soft px-3.5 py-2.5 text-[13px] text-ink">
          <ClipboardCheck size={15} className="mt-0.5 shrink-0 text-info" />
          <div><span className="font-semibold">Review action · </span>{card.recommended_action}</div>
        </div>
      )}

      {card.citations.length > 0 && (
        <div className="mt-4 space-y-2.5">
          {card.citations.map((c, i) => (
            <Quote
              key={i}
              text={c.quote}
              aspect={c.aspect}
              url={c.url}
              meta={<><AspectChip aspect={c.aspect} /><SpeakerChip speaker={c.speaker} /><PolarityChip value={c.polarity} /></>}
            />
          ))}
        </div>
      )}

      {caveats.length > 0 && (
        <ul className="mt-3.5 space-y-1.5">
          {caveats.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-[12.5px] text-warn">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span className="text-ink-2">{c}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center gap-3 border-t border-line pt-3.5 text-[12px] text-ink-3">
        <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} />{fmtDate(card.published)}</span>
        {card.week && <span className="tnum">{card.week}</span>}
        <span>·</span>
        <span>{sourceLabel(card.source)}</span>
        <span className="font-mono text-[11px]">{card.item_id}</span>
        <div className="ml-auto flex items-center gap-2">
          {footer}
          {!hideItemLink && <Link
            to={`/items/${encodeURIComponent(card.item_id)}`}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            Item detail <ArrowRight size={13} />
          </Link>}
        </div>
      </div>
    </motion.article>
  );
}
