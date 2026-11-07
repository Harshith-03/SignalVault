import { ArrowLeft, EyeOff, FileQuestion, Link2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { ActionableChip, ProductChip, ReviewChip, SignalChip } from "../components/chips";
import { HighlightedText } from "../components/HighlightedText";
import { InsightCard } from "../components/InsightCard";
import { AspectTable, FlagList, LabelSummary, Provenance, aspectSpans, verifyAspects } from "../components/Prediction";
import { Button, CopyButton, EmptyState, ErrorState, PageHeader, Panel, PanelTitle, SectionTitle, Skeleton } from "../components/ui";
import { ASPECT_LABELS, aspectColor, fmtDate, hostOf, sourceLabel } from "../lib/format";

export default function ItemDetail() {
  const { itemId = "" } = useParams();
  const navigate = useNavigate();
  const item = useApi(() => api.item(itemId), [itemId]);
  const cards = useApi(() => api.cards(), []);
  const [hover, setHover] = useState<string | null>(null);

  const rows = useMemo(
    () => (item.data ? verifyAspects(item.data.prediction, item.data.text, item.data.redacted) : []),
    [item.data],
  );
  const related = (cards.data ?? []).filter((c) => c.item_id === itemId);

  const back = (
    <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} className="-ml-2" onClick={() => (history.length > 1 ? navigate(-1) : navigate("/signals"))}>
      Back
    </Button>
  );

  if (item.loading && !item.data) {
    return (
      <div aria-busy="true">
        <div className="mb-4">{back}</div>
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="mt-3 h-4 w-1/3" />
        <div className="mt-8 grid gap-6 @5xl:grid-cols-[minmax(0,1fr)_380px]"><Skeleton className="h-96 rounded-card" /><Skeleton className="h-96 rounded-card" /></div>
      </div>
    );
  }
  if (item.error) {
    return (
      <>
        <div className="mb-4">{back}</div>
        {item.error.kind === "not_found" ? (
          <EmptyState title={`No item ${itemId}`} icon={<FileQuestion size={20} />}>
            This item isn't in the analysed set. Items from the Analyze page and transcript-only safety cases are not stored as items.
            {" "}<Link to="/signals" className="font-medium text-brand underline underline-offset-2">Browse signals</Link>
          </EmptyState>
        ) : <ErrorState error={item.error} onRetry={item.reload} />}
      </>
    );
  }
  const { prediction: pred, text, redacted } = item.data!;
  const m = pred.meta;
  const host = hostOf(m.url);

  return (
    <>
      <div className="mb-3">{back}</div>
      <PageHeader
        eyebrow={<span className="inline-flex flex-wrap items-center gap-x-2">{sourceLabel(m.source)} · {fmtDate(m.published)}{m.week && <> · {m.week}</>} · <span className="font-mono normal-case tracking-normal">{pred.item_id}</span></span>}
        title={m.title || pred.item_id}
        subtitle={
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <ProductChip product={m.product} full />
            <SignalChip signal={pred.signal_type} />
            <ActionableChip actionable={pred.actionable === "yes"} />
            <ReviewChip status={m.review_status} />
            {host && m.url && (
              <span className="ml-1 inline-flex min-w-0 items-center gap-1 font-mono text-[11.5px] text-ink-3" title={m.url}>
                <Link2 size={12} className="shrink-0" /><span className="truncate">{host}</span><CopyButton text={m.url} label="Copy source URL" />
              </span>
            )}
          </span>
        }
      />

      {(m.flags ?? []).length > 0 && <div className="mb-6"><FlagList flags={m.flags!} large /></div>}

      <div className="grid items-start gap-4 sm:gap-6 @5xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <PanelTitle
            hint={redacted ? "Transcript text is shown redacted. The engine scored the original; quotes are re-matched verbatim." : "Quotes are highlighted by their verified character offsets."}
            right={redacted ? <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-info-soft px-2.5 py-1 text-caption font-medium text-info"><EyeOff size={12} />Redacted view</span> : undefined}
          >
            Full text
          </PanelTitle>
          {text ? (
            <div>
              <HighlightedText text={text} spans={aspectSpans(rows)} active={hover} />
            </div>
          ) : (
            <div className="text-[13px] text-ink-3">The source text for this item is not available on this machine (texts.json is local only).</div>
          )}
          {rows.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-4 text-caption text-ink-3" aria-label="Highlight colours">
              {rows.map((r) => (
                <span key={r.aspect} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: aspectColor(r.aspect) }} />{ASPECT_LABELS[r.aspect]}
                </span>
              ))}
            </div>
          )}
        </Panel>

        <div className="scroll-thin space-y-4 sm:space-y-6 @5xl:sticky @5xl:top-[84px] @5xl:-m-1 @5xl:max-h-[calc(100vh-100px)] @5xl:overflow-y-auto @5xl:p-1">
          <Panel>
            <PanelTitle>Labels</PanelTitle>
            <LabelSummary pred={pred} />
          </Panel>
          <Panel>
            <PanelTitle hint="Hover an aspect to find it in the text">Aspects</PanelTitle>
            <AspectTable rows={rows} onHover={setHover} />
          </Panel>
          <Panel>
            <PanelTitle>Provenance</PanelTitle>
            <Provenance pred={pred} />
          </Panel>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-8 sm:mt-10">
          <SectionTitle>Insight cards from this item</SectionTitle>
          <div className="grid grid-cols-1 gap-4 @5xl:grid-cols-2">
            {related.map((c) => <InsightCard key={c.card_id} card={c} />)}
          </div>
        </section>
      )}
    </>
  );
}
