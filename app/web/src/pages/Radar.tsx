/**
 * Public Evidence Radar (Surge track). Discovery happens in a SEPARATE CLI process (`python -m surge.radar`),
 * the only Signal Vault component that goes online, and it sends only allowlisted public drug/trial queries.
 * This page reads the local snapshot through the loopback API, so the vault itself never fetches anything.
 */
import { motion } from "framer-motion";
import {
  ArrowDown, ArrowRight, BadgeCheck, CalendarDays, Cpu, ExternalLink, FlaskConical, Gavel, Globe, HardDrive, Hourglass, Info,
  Layers, Radar as RadarIcon, ScanSearch, Send, Telescope, WifiOff,
} from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { RadarItem, RadarMode, RadarProvider, RadarQuery } from "../api/types";
import { useApi } from "../api/useApi";
import { ProductChip, SignalChip } from "../components/chips";
import {
  Chip, CopyButton, EmptyState, ErrorState, IconBadge, Kbd, Note, PageHeader, Panel, PanelTitle, Segmented, ShowMore, Skeleton, Stat, cx,
  useIncremental,
} from "../components/ui";
import { fmtDate, hostOf, sourceLabel } from "../lib/format";
import { matchesProduct, useApp } from "../state/app";

const PROVIDER_LABEL: Record<RadarProvider, string> = { tavily: "Tavily", exa: "Exa" };
const PROVIDER_ICON: Record<RadarProvider, ReactNode> = {
  tavily: <ScanSearch size={12} />,
  exa: <Telescope size={12} />,
};
const HOW: Record<string, string> = {
  same_url: "Both providers returned the same page",
  same_title: "Both providers returned the same headline (syndicated copies)",
  same_content: "Both providers returned identical content (mirrored copies)",
};
const DISCOVER_CMD = "python -m surge.radar discover --days 30";
const ANALYZE_CMD = "python -m surge.radar analyze";

type Filter = "all" | "corroborated" | "tavily" | "exa";

export default function Radar() {
  const { product } = useApp();
  const r = useApi(() => api.radar(), []);
  const [filter, setFilter] = useState<Filter>("all");

  const inView = (r.data?.items ?? []).filter((i) => matchesProduct(product, i.product));
  const shown = inView.filter((i) =>
    filter === "all" ? true
      : filter === "corroborated" ? i.corroborated
        : i.providers.length === 1 && i.providers[0] === filter);
  const replay = Object.values(r.data?.modes ?? {}).includes("replay");
  const page = useIncremental(shown, 12, `${filter}|${product}`);

  return (
    <>
      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-1.5"><RadarIcon size={12} />Surge · Tavily + Exa</span>}
        title="Public Evidence Radar"
        subtitle="New public evidence on Tagrisso and Rybrevant / Lazcluze, found by two independent search providers, cross-verified, cited, and then labelled offline by the local model."
      />

      <ArchitectureStrip modes={r.data?.modes ?? {}} lastRun={r.data?.last_run ?? null} />

      {r.loading && !r.data ? (
        <div className="mt-6 space-y-4" aria-busy="true"><Skeleton className="h-32 rounded-card" /><Skeleton className="h-64 rounded-card" /></div>
      ) : r.error ? (
        <div className="mt-6"><ErrorState error={r.error} onRetry={r.reload} /></div>
      ) : r.data && !r.data.last_run ? (
        <div className="mt-6">
          <EmptyState title="No radar run yet" icon={<RadarIcon size={20} />}>
            <p>{r.data.hint}</p>
            <div className="mt-4 space-y-2 text-left">
              <CommandLine cmd={DISCOVER_CMD} label="1 · Discover (online, public queries only; add --replay for fixtures)" />
              <CommandLine cmd={ANALYZE_CMD} label="2 · Analyze (offline, local model)" />
            </div>
          </EmptyState>
        </div>
      ) : r.data && (
        <>
          {replay && (
            <Note tone="warn" icon={<Hourglass size={16} />} className="mt-6">
              <span className="font-semibold">Replay mode · synthetic sample data.</span>{" "}
              <span className="text-ink-2">
                No Tavily / Exa key is configured, so the radar served recorded fixtures and nothing was sent. Titles marked
                [SYNTHETIC] are not real articles. Add the keys to <span className="font-mono">.env</span> and run
                discover again for live results.
              </span>
            </Note>
          )}

          <section aria-label="Radar summary" className="mt-4 grid grid-cols-2 gap-3 sm:mt-6 sm:gap-4 @4xl:grid-cols-4">
            <Stat label="New public items" value={inView.length} icon={<Layers size={17} />}
              sub={`${r.data.stats.known_in_packet ?? 0} already in the packet · ${r.data.stats.off_topic ?? 0} off-topic dropped`} />
            <Stat label="Corroborated" value={inView.filter((i) => i.corroborated).length} icon={<BadgeCheck size={17} />}
              tone="good" sub="Found by both Tavily and Exa" />
            <Stat label="Analysed locally" value={inView.filter((i) => i.analysed).length} icon={<Cpu size={17} />}
              tone="brand" sub={`${inView.length - inView.filter((i) => i.analysed).length} waiting for the offline step`} />
            <Stat label="Actionable" value={inView.filter((i) => i.actionable === "yes").length} icon={<Gavel size={17} />}
              sub={`Tavily ${r.data.providers.tavily} · Exa ${r.data.providers.exa} items`} />
          </section>

          <div className="mt-4 grid items-start gap-4 sm:mt-6 sm:gap-6 @5xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <Segmented<Filter>
                  label="Provider filter"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "all", label: `All ${inView.length}` },
                    { value: "corroborated", label: <><BadgeCheck size={13} />Corroborated</> },
                    { value: "tavily", label: "Tavily only" },
                    { value: "exa", label: "Exa only" },
                  ]}
                />
                <span className="text-caption text-ink-3">Corroborated first, then newest</span>
              </div>
              {shown.length === 0 ? (
                <EmptyState title="Nothing in this view">No radar items match the provider filter and product switch.</EmptyState>
              ) : (
                <>
                  <div className="space-y-4">
                    {page.visible.map((i) => <RadarCard key={i.item_id} item={i} />)}
                  </div>
                  <ShowMore {...page} noun="items" />
                </>
              )}
            </div>
            <QueriesPanel queries={r.data.queries} total={r.data.queries_total} />
          </div>
        </>
      )}

      <Note className="mt-8" icon={<Info size={15} />}>
        <span>
          <strong className="font-semibold text-ink">Source links open in your own browser</strong>; the vault never fetches
          them. Radar items join Signals and the Safety Inbox after <span className="font-mono">python -m surge.merge</span>.
        </span>
      </Note>
    </>
  );
}

// ---------------------------------------------------------------- architecture
function ArchitectureStrip({ modes, lastRun }: { modes: Partial<Record<RadarProvider, RadarMode>>; lastRun: string | null }) {
  const live = Object.values(modes).includes("live");
  const steps: { icon: ReactNode; title: string; tag: string; body: ReactNode; tone: "online" | "local" }[] = [
    {
      icon: <Globe size={17} />, title: "Discovery", tag: live ? "Online · public queries only" : "Public queries only",
      tone: "online",
      body: <>A separate CLI process asks Tavily and Exa allowlisted drug and trial names. No packet text, transcripts or labels.</>,
    },
    {
      icon: <HardDrive size={17} />, title: "Snapshot", tag: "Local files",
      tone: "local",
      body: <>Each result is saved with its provider, query, URL, published date, retrieval time and SHA-256. Deduped and cross-verified.</>,
    },
    {
      icon: <WifiOff size={17} />, title: "Analysis", tag: "Offline · local model",
      tone: "local",
      body: <>The engine labels each item on Ollama at 127.0.0.1, with the network guard on. Quotes are verbatim.</>,
    },
  ];
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-card border border-line bg-surface p-[var(--pad-card)] shadow-xs"
      aria-label="Radar architecture"
    >
      <ol className="grid items-stretch gap-2 @2xl:grid-cols-[1fr_auto_1fr_auto_1fr] @2xl:gap-2.5">
        {steps.map((s, idx) => (
          <Fragment key={s.title}>
            <li className={cx("rounded-panel p-4", s.tone === "online" ? "bg-surface-3/60" : "bg-good-soft")}>
              <div className="flex items-center gap-3">
                <IconBadge tone={s.tone === "online" ? "onTint" : "onTintGood"}><span className={s.tone === "online" ? "text-info" : undefined}>{s.icon}</span></IconBadge>
                <div>
                  <div className="font-display text-heading font-semibold text-ink">{s.title}</div>
                  <div className={cx("text-caption font-semibold", s.tone === "online" ? "text-info" : "text-good")}>{s.tag}</div>
                </div>
              </div>
              <p className="mt-2.5 text-[12.5px] leading-snug text-ink-2">{s.body}</p>
            </li>
            {idx < steps.length - 1 && (
              <li className="flex items-center justify-center text-ink-3" aria-hidden>
                <ArrowDown size={16} className="@2xl:hidden" />
                <ArrowRight size={16} className="hidden @2xl:block" />
              </li>
            )}
          </Fragment>
        ))}
      </ol>
      <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-ink-3">
        <span className="inline-flex items-start gap-1.5"><Cpu size={12} className="mt-0.5 shrink-0" />This page reads the snapshot over the loopback API; the API process never connects out.</span>
        {lastRun && <span className="inline-flex items-center gap-1.5"><CalendarDays size={12} />Last discovery {fmtDateTime(lastRun)}</span>}
        {(Object.entries(modes) as [RadarProvider, RadarMode][]).map(([p, m]) => (
          <span key={p} className="font-mono text-[11.5px]">{p}: {m}</span>
        ))}
      </div>
    </motion.section>
  );
}

// ---------------------------------------------------------------- item card
function ProviderBadge({ provider }: { provider: RadarProvider }) {
  return (
    <Chip title={`Found by ${PROVIDER_LABEL[provider]}`} className="border-line bg-surface text-ink"
      icon={<span className="text-ink-3">{PROVIDER_ICON[provider]}</span>}>
      {PROVIDER_LABEL[provider]}
    </Chip>
  );
}

function RadarCard({ item }: { item: RadarItem }) {
  const host = hostOf(item.url);
  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-card border border-line bg-surface p-[var(--pad-card)] shadow-xs transition-shadow duration-200 hover:shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {item.providers.map((p) => <ProviderBadge key={p} provider={p} />)}
        {item.corroborated && (
          <Chip className="border-transparent bg-good-soft text-good" icon={<BadgeCheck size={12} />}
            title={item.corroboration ? HOW[item.corroboration] : "Found by both providers"}>
            Corroborated
          </Chip>
        )}
        <ProductChip product={item.product} />
        <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
          {item.analysed && item.signal_type ? (
            <>
              <SignalChip signal={item.signal_type} />
              {item.actionable === "yes"
                ? <Chip className="border-transparent bg-hero text-on-hero" icon={<Gavel size={12} />}>Actionable</Chip>
                : <Chip>For awareness</Chip>}
            </>
          ) : (
            <Chip title={`Run: ${ANALYZE_CMD}`} icon={<Hourglass size={12} className="text-ink-3" />}>Not analysed yet</Chip>
          )}
        </div>
      </div>

      <h3 className="mt-3.5 font-display text-[16px] font-semibold leading-snug tracking-[-0.01em] text-ink">
        {item.url ? (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="group inline decoration-brand/40 underline-offset-4 hover:text-brand hover:underline">
            {item.title || host}
            <ExternalLink size={13} className="ml-1.5 inline -translate-y-px text-ink-3 group-hover:text-brand" aria-label="(opens in a new tab)" />
          </a>
        ) : item.title}
      </h3>
      {item.why_actionable && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{item.why_actionable}</p>}

      {item.flags?.includes("reportable_case_candidate") && (
        <div className="mt-3 flex items-center gap-2 rounded-panel bg-crit-soft px-3.5 py-2.5 text-[12.5px] text-ink">
          <FlaskConical size={14} className="shrink-0 text-crit" />
          Possible reportable case: routed to the Safety Inbox for pharmacovigilance triage after merge.
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 rounded-control border border-line bg-surface-2 py-1.5 pl-3 pr-1.5">
        <Send size={12} className="shrink-0 text-ink-3" />
        <span className="text-micro text-ink-3">Query</span>
        <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-2" title={item.queries.join("\n")}>
          {item.query}{item.queries.length > 1 ? `  +${item.queries.length - 1}` : ""}
        </code>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3 text-caption text-ink-3">
        <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} />{fmtDate(item.published)}</span>
        <span aria-hidden>·</span>
        <span>{sourceLabel(item.source)}</span>
        {host && <span className="max-w-full truncate font-mono text-[11.5px]">{host}</span>}
        <span title={`Retrieved ${item.retrieved_at}\nsha256 ${item.content_sha256}`} className="font-mono text-micro">
          sha256 {item.content_sha256.slice(0, 10)}…
        </span>
        <span className="font-mono text-micro">{item.item_id}</span>
        {item.in_app && (
          <Link
            to={`/items/${encodeURIComponent(item.item_id)}`}
            className="group ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-medium text-brand hover:bg-brand-tint"
          >
            Item detail <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
          </Link>
        )}
      </div>
    </motion.article>
  );
}

// ---------------------------------------------------------------- outgoing queries
function QueriesPanel({ queries, total }: { queries: RadarQuery[]; total: number }) {
  const replay = queries.some((q) => q.mode === "replay");
  return (
    <Panel className="@5xl:sticky @5xl:top-[88px]">
      <PanelTitle
        hint={replay
          ? "Last run, in replay: these are the exact queries that would leave the device. Nothing was sent."
          : "Last run: the exact text sent to each provider. Nothing else leaves the device."}
      >
        Queries that left this device
      </PanelTitle>
      {queries.length === 0 ? <div className="text-[13px] text-ink-3">No queries logged.</div> : (
        <ul className="scroll-thin max-h-[64vh] divide-y divide-line overflow-y-auto rounded-panel border border-line">
          {queries.map((q, i) => (
            <li key={i} className="flex items-center gap-2.5 px-3 py-2.5">
              <span className="text-ink-3" title={PROVIDER_LABEL[q.provider]}>{PROVIDER_ICON[q.provider]}</span>
              <div className="min-w-0 flex-1">
                <code className="block truncate font-mono text-[12px] text-ink" title={q.query}>{q.query}</code>
                <div className="text-micro text-ink-3">
                  {PROVIDER_LABEL[q.provider]} · {q.kind} · {q.mode}
                  {q.error && <span className="text-warn" title={q.error}> · error</span>}
                </div>
              </div>
              <span className="tnum rounded-full bg-surface-3 px-2 text-micro leading-5 text-ink-2" title="results">{q.n_results}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 space-y-1.5 text-caption text-ink-3">
        <p>
          Every query is built from a fixed allowlist of public drug, trial and topic words
          (<Kbd>surge/queries.py</Kbd>) and checked again just before sending. Anything else is refused in code.
        </p>
        <p className="tnum">{total} queries logged across all runs.</p>
      </div>
    </Panel>
  );
}

function CommandLine({ cmd, label }: { cmd: string; label: string }) {
  return (
    <div>
      <div className="mb-1 text-caption text-ink-3">{label}</div>
      <div className="flex items-center gap-2 rounded-control border border-line bg-surface-2 py-1.5 pl-3 pr-1.5">
        <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-2">{cmd}</code>
        <CopyButton text={cmd} label="Copy command" />
      </div>
    </div>
  );
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
