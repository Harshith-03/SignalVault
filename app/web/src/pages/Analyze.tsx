import { motion } from "framer-motion";
import { AlertTriangle, EyeOff, FileText, Loader2, Lock, Play, ShieldCheck, Sparkles, Upload, X } from "lucide-react";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { api, ApiError } from "../api/client";
import type { AnalyzeResponse, Product, RedactionResult } from "../api/types";
import { ProductDot } from "../components/chips";
import { HighlightedText, type Span } from "../components/HighlightedText";
import { InsightCard } from "../components/InsightCard";
import { AspectTable, FlagList, LabelSummary, Provenance, aspectSpans, verifyAspects } from "../components/Prediction";
import { SafetyCaseCard } from "../components/safety";
import {
  Button, EmptyState, ErrorState, Field, PageHeader, Panel, PanelTitle, SectionTitle, Segmented, Select, Skeleton, TextInput, cx,
} from "../components/ui";
import { SAMPLE_TITLE, SAMPLE_TRANSCRIPT } from "../lib/sample";
import { ROLE_LABELS } from "../lib/format";
import { useApp } from "../state/app";

const SOURCES = ["transcript", "news", "press_release", "pubmed", "ctgov", "fda_event", "fda_label", "fda_notice"] as const;
const SOURCE_NAMES: Record<(typeof SOURCES)[number], string> = {
  transcript: "Transcript", news: "News", press_release: "Press release", pubmed: "PubMed abstract",
  ctgov: "ClinicalTrials.gov", fda_event: "FDA adverse event", fda_label: "FDA label", fda_notice: "FDA notice",
};
type ProductPick = "unknown" | Product;

export default function Analyze() {
  const { role } = useApp();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState<(typeof SOURCES)[number]>("transcript");
  const [product, setProduct] = useState<ProductPick>("unknown");
  const [published, setPublished] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const [result, setResult] = useState<{ res: AnalyzeResponse; original: string }>();
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const loadFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2_000_000) { setError(new ApiError("http", "That file is over 2 MB; paste an excerpt instead.")); return; }
    f.text().then((t) => { setText(t); if (!title) setTitle(f.name.replace(/\.[^.]+$/, "")); });
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); loadFile(e.dataTransfer.files?.[0]); };

  const run = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const res = await api.analyze({
        text, source, title, product: product === "unknown" ? null : product, published: published || null,
      });
      setResult({ res, original: text });
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("http", String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Analyze"
        subtitle="Paste or drop a transcript. It is scored by the local engine through the API on 127.0.0.1; personal data is redacted for display and the original is never written to disk by the UI."
      />

      <Panel>
        <div className="grid gap-5 @4xl:grid-cols-[minmax(0,1fr)_280px] @4xl:gap-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cx(
              "relative min-w-0 self-start rounded-panel border bg-surface-2 transition-colors focus-within:border-brand",
              dragging ? "border-brand bg-brand-tint" : "border-line-strong",
            )}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste a transcript, abstract, label excerpt or news article…  (or drop a .txt file here)"
              spellCheck={false}
              aria-label="Text to analyze"
              className="scroll-thin block h-[240px] w-full resize-y rounded-t-panel bg-transparent px-4 py-3.5 text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none sm:h-[300px]"
            />
            {dragging && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-panel text-[14px] font-semibold text-brand">
                <Upload size={18} className="mr-2" />Drop to load the file
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2.5">
              <Button size="sm" variant="subtle" icon={<Sparkles size={13} />} onClick={() => { setText(SAMPLE_TRANSCRIPT); setTitle(SAMPLE_TITLE); setSource("transcript"); setProduct("unknown"); }}>
                Load sample transcript
              </Button>
              <Button size="sm" variant="ghost" icon={<Upload size={13} />} onClick={() => fileRef.current?.click()}>Upload .txt</Button>
              <input ref={fileRef} type="file" accept=".txt,.md,text/plain" className="hidden" onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = ""; }} />
              {text && <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => { setText(""); setResult(undefined); }}>Clear</Button>}
              <span className="tnum ml-auto text-caption text-ink-3">{text.length.toLocaleString()} chars</span>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="grid gap-4 min-[520px]:grid-cols-2 @4xl:grid-cols-1">
              <Field label="Title">
                <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional" />
              </Field>
              <Select label="Source" stacked value={source} onChange={setSource} options={SOURCES.map((s) => ({ value: s, label: SOURCE_NAMES[s] }))} />
              <div>
                <div className="mb-1.5 text-caption font-medium text-ink-3">Product</div>
                <Segmented<ProductPick>
                  label="Product"
                  size="sm"
                  value={product}
                  onChange={setProduct}
                  options={[
                    { value: "unknown", label: "Auto" },
                    { value: "A", label: <><ProductDot product="A" size={7} />A</> },
                    { value: "B", label: <><ProductDot product="B" size={7} />B</> },
                    { value: "both", label: "Both" },
                  ]}
                />
              </div>
              <Field label="Published" hint="Defaults to today.">
                <TextInput type="date" value={published} onChange={(e) => setPublished(e.target.value)} />
              </Field>
            </div>
            <div className="mt-auto pt-1">
              <Button variant="primary" className="h-10 w-full" disabled={!text.trim() || busy} onClick={run}
                icon={busy ? <Loader2 size={15} className="animate-spin" /> : <Play size={14} />}>
                {busy ? "Analysing locally…" : "Analyze"}
              </Button>
              <div className="mt-2 flex items-center justify-center gap-1.5 text-micro text-ink-3">
                <Lock size={11} />Sent only to 127.0.0.1 as {ROLE_LABELS[role]}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <div ref={resultRef} className="scroll-mt-24">
        {error && <div className="mt-6"><ErrorState error={error} onRetry={run} /></div>}
        {busy && !result && (
          <div className="mt-6 grid gap-6 @5xl:grid-cols-[minmax(0,1fr)_380px]" aria-busy="true"><Skeleton className="h-80 rounded-card" /><Skeleton className="h-80 rounded-card" /></div>
        )}
        {result && <Result res={result.res} original={result.original} />}
      </div>
    </>
  );
}

/**
 * Redaction spans may be offsets into the redacted text or into the original (the contract does
 * not say). Accept either, but only when it reproduces the API's redacted text exactly.
 */
function redactionView(original: string, r: RedactionResult): { text: string; spans: Span[]; mapped: boolean } {
  const spans = [...(r.spans ?? [])].sort((a, b) => a.start - b.start);
  const mk = (start: number, end: number, kind: string, replacement: string): Span => ({
    start, end, color: "var(--info)", label: `${kind} redacted → ${replacement}`, variant: "redaction",
  });
  if (!spans.length) return { text: r.text, spans: [], mapped: true };
  if (spans.every((s) => r.text.slice(s.start, s.end) === s.replacement)) {
    return { text: r.text, spans: spans.map((s) => mk(s.start, s.end, s.kind, s.replacement)), mapped: true };
  }
  let out = "";
  let pos = 0;
  const outSpans: Span[] = [];
  for (const s of spans) {
    if (s.start < pos || s.end > original.length) return { text: r.text, spans: [], mapped: false };
    out += original.slice(pos, s.start);
    outSpans.push(mk(out.length, out.length + s.replacement.length, s.kind, s.replacement));
    out += s.replacement;
    pos = s.end;
  }
  out += original.slice(pos);
  return out === r.text ? { text: out, spans: outSpans, mapped: true } : { text: r.text, spans: [], mapped: false };
}

function Result({ res, original }: { res: AnalyzeResponse; original: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const view = useMemo(() => redactionView(original, res.redaction), [original, res.redaction]);
  const rows = useMemo(() => verifyAspects(res.prediction, view.text, true), [res.prediction, view.text]);
  const flags = res.prediction.meta.flags ?? [];
  const counts = Object.entries(res.redaction.counts ?? {}).filter(([, n]) => n > 0);
  const nSpans = (res.redaction.spans ?? []).length;
  const unchanged = res.redaction.text === original;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-8 space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-display text-[20px] font-semibold tracking-[-0.01em] text-ink">Result</h2>
        <span className="font-mono text-caption text-ink-3">{res.prediction.item_id}</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-good-soft px-2.5 py-1 text-caption font-medium text-good"><ShieldCheck size={13} />Processed on this device</span>
      </div>

      {flags.length > 0 && (
        <Panel className="border-warn/40 bg-warn-soft/40">
          <PanelTitle hint="Routed for human review. These are triage prompts, not conclusions.">Flags</PanelTitle>
          <FlagList flags={flags} large />
        </Panel>
      )}

      {res.safety_case && (
        <div>
          <h3 className="mb-3 font-display text-heading font-semibold text-ink">Possible reportable case</h3>
          <SafetyCaseCard sc={res.safety_case} canAct={false} />
        </div>
      )}

      <div className="grid items-start gap-4 sm:gap-6 @5xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <PanelTitle
            hint={nSpans ? `${nSpans} identifier${nSpans === 1 ? "" : "s"} replaced. Highlighted tokens are redactions.` : "Redacted for display and storage only; the engine scored the original."}
            right={<span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-info-soft px-2.5 py-1 text-caption font-medium text-info"><EyeOff size={12} />Redacted view</span>}
          >
            Redacted text
          </PanelTitle>
          {nSpans === 0 && unchanged && (
            <div className="mb-4 flex items-start gap-2 rounded-control bg-warn-soft px-3 py-2.5 text-caption text-ink">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
              The redactor returned no spans and the text is unchanged. If this text contains names, ages, emails or phone numbers, the redaction module may not be wired yet.
            </div>
          )}
          {!view.mapped && (
            <div className="mb-4 flex items-start gap-2 rounded-control bg-surface-3/60 px-3 py-2.5 text-caption text-ink-3">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />Redaction offsets could not be mapped onto the text, so the redacted text is shown without highlights.
            </div>
          )}
          <div className="scroll-thin max-h-[520px] overflow-y-auto pr-2">
            <HighlightedText text={view.text} spans={[...view.spans, ...aspectSpans(rows)]} active={hover} />
          </div>
          {counts.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-4">
              {counts.map(([k, n]) => (
                <span key={k} className="tnum inline-flex items-center gap-1.5 rounded-full bg-info-soft px-2.5 py-1 font-mono text-micro font-semibold text-info">{k} × {n}</span>
              ))}
            </div>
          )}
        </Panel>

        <div className="space-y-4 sm:space-y-6">
          <Panel><PanelTitle>Prediction</PanelTitle><LabelSummary pred={res.prediction} /></Panel>
          <Panel>
            <PanelTitle hint="Quotes are matched verbatim against the redacted text; a quote containing a redacted name is not highlighted.">Aspects</PanelTitle>
            <AspectTable rows={rows} onHover={setHover} />
          </Panel>
          <Panel><PanelTitle>Provenance</PanelTitle><Provenance pred={res.prediction} /></Panel>
        </div>
      </div>

      <div>
        <SectionTitle>Insight cards</SectionTitle>
        {res.cards.length ? (
          <div className="grid grid-cols-1 items-start gap-4 @5xl:grid-cols-2">
            {res.cards.map((c) => <InsightCard key={c.card_id} card={c} hideItemLink />)}
          </div>
        ) : (
          <EmptyState title="No insight cards for this text" icon={<FileText size={18} />}>
            The API returned no cards. Either nothing actionable was found, or the card builder is not wired yet.
          </EmptyState>
        )}
      </div>
    </motion.div>
  );
}
