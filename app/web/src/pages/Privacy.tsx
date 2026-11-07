import { motion } from "framer-motion";
import {
  Ban, CheckCircle2, CircleHelp, Cpu, FileLock2, Fingerprint, Globe2, HardDrive, Link2, Lock, MonitorSmartphone,
  ScrollText, ServerOff, ShieldCheck, UserCheck, WifiOff, XCircle,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { CopyButton, ErrorState, PageHeader, Panel, PanelTitle, Skeleton, cx } from "../components/ui";

/** Hosts this browser tab has actually requested, from the Resource Timing API: a live, local proof. */
function useBrowserHosts() {
  const [hosts, setHosts] = useState<{ host: string; n: number }[]>([]);
  useEffect(() => {
    const read = () => {
      const counts = new Map<string, number>();
      const add = (url: string) => {
        try {
          const h = new URL(url, location.href).host;
          counts.set(h, (counts.get(h) ?? 0) + 1);
        } catch { /* ignore */ }
      };
      add(location.href);
      for (const e of performance.getEntriesByType("resource")) add(e.name);
      setHosts([...counts.entries()].map(([host, n]) => ({ host, n })).sort((a, b) => b.n - a.n));
    };
    read();
    const t = setInterval(read, 3000);
    return () => clearInterval(t);
  }, []);
  return hosts;
}
const isLocal = (host: string) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);

export default function Privacy() {
  const p = useApi(() => api.privacy(), []);
  const hosts = useBrowserHosts();
  const browserLocal = hosts.every((h) => isLocal(h.host));
  const requests = hosts.reduce((s, h) => s + h.n, 0);

  return (
    <>
      <PageHeader
        title="Privacy"
        subtitle="What leaves this device, who can read it, and how we prove it. Each proof below states exactly what it covers."
      />

      {p.loading && !p.data ? (
        <div className="space-y-6"><Skeleton className="h-48 rounded-2xl" /><div className="grid grid-cols-3 gap-6"><Skeleton className="h-48 rounded-2xl" /><Skeleton className="h-48 rounded-2xl" /><Skeleton className="h-48 rounded-2xl" /></div></div>
      ) : p.error ? (
        <ErrorState error={p.error} onRetry={p.reload} />
      ) : p.data && (
        <>
          {/* ---------------------------------------------------------------- hero */}
          <motion.section
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-3xl border border-line bg-surface p-8 shadow-md"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-60 blur-3xl"
              style={{ background: p.data.offline_mode ? "color-mix(in srgb, var(--good) 22%, transparent)" : "color-mix(in srgb, var(--warn) 22%, transparent)" }}
            />
            <div className="relative grid grid-cols-[1.3fr_1fr_1fr] items-center gap-8">
              <div className="flex items-center gap-5">
                <div className={cx("flex h-16 w-16 items-center justify-center rounded-2xl", p.data.offline_mode ? "bg-good-soft text-good" : "bg-warn-soft text-warn")}>
                  {p.data.offline_mode ? <WifiOff size={30} /> : <Globe2 size={30} />}
                </div>
                <div>
                  <div className="text-[13px] font-medium text-ink-3">Network status</div>
                  <div className={cx("text-[44px] font-semibold leading-none tracking-[-0.03em]", p.data.offline_mode ? "text-good" : "text-warn")}>
                    {p.data.offline_mode ? "Offline" : "Guard off"}
                  </div>
                  <div className="mt-2 text-[13px] text-ink-2">
                    {p.data.offline_mode ? "Network guard installed · nothing leaves the vault" : "The network guard is not installed in the API process"}
                  </div>
                </div>
              </div>
              <HeroStat
                icon={<Ban size={16} />}
                label="Outbound attempts blocked"
                value={p.data.outbound_attempts_blocked.toLocaleString()}
                sub="Non-loopback connections refused by the Python guard"
              />
              <HeroStat
                icon={<ScrollText size={16} />}
                label="Audit chain"
                value={p.data.audit_chain_ok === true ? "Intact" : p.data.audit_chain_ok === false ? "Broken" : "Unknown"}
                tone={p.data.audit_chain_ok === true ? "good" : p.data.audit_chain_ok === false ? "crit" : undefined}
                sub={`${p.data.audit_records.toLocaleString()} hash-chained records · no raw text`}
              />
            </div>
          </motion.section>

          {/* ---------------------------------------------------------------- facts */}
          <div className="mt-6 grid grid-cols-3 gap-6">
            <Panel>
              <PanelTitle hint="The only hosts the API process may connect to">Allowed hosts</PanelTitle>
              <div className="flex flex-wrap gap-1.5">
                {p.data.allowed_hosts.length ? p.data.allowed_hosts.map((h) => (
                  <span key={h} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1 font-mono text-[12px] text-ink">
                    <Lock size={11} className="text-good" />{h}
                  </span>
                )) : <span className="text-[13px] text-ink-3">None listed</span>}
              </div>
            </Panel>

            <Panel>
              <PanelTitle hint="Runs locally through Ollama">Model</PanelTitle>
              <div className="flex items-center gap-2 font-mono text-[14px] font-semibold text-ink"><Cpu size={15} className="text-ink-3" />{p.data.model || "unknown"}</div>
              <div className="mt-3 text-[12px] text-ink-3">Weights digest</div>
              <div className="mt-1 flex items-center gap-1">
                <code className="min-w-0 truncate font-mono text-[12px] text-ink-2" title={p.data.model_digest ?? undefined}>{p.data.model_digest ?? "unknown"}</code>
                {p.data.model_digest && <CopyButton text={p.data.model_digest} label="Copy digest" />}
              </div>
            </Panel>

            <Panel>
              <PanelTitle hint="Identifiers replaced before display or storage">Redactions</PanelTitle>
              <RedactionBars counts={p.data.redaction_counts ?? {}} />
            </Panel>
          </div>

          <div className="mt-6 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6">
            <Panel>
              <PanelTitle hint="SHA-256 of every input file the engine scored, so a run can be reproduced and checked">Data-file hashes</PanelTitle>
              {(p.data.data_files ?? []).length === 0 ? <div className="text-[13px] text-ink-3">No data files recorded yet.</div> : (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {p.data.data_files!.map((f) => (
                    <li key={f.path} className="flex items-center gap-3 px-3.5 py-2.5">
                      <HardDrive size={14} className="shrink-0 text-ink-3" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[12.5px] text-ink">{f.path}</div>
                        <div className="truncate font-mono text-[11px] text-ink-3" title={f.sha256}>sha256 {f.sha256}</div>
                      </div>
                      <CopyButton text={f.sha256} label="Copy hash" />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel>
              <PanelTitle hint="Read live from this tab's Resource Timing; refreshes every 3 s">This browser tab</PanelTitle>
              <div className="flex items-center gap-3">
                <div className={cx("flex h-10 w-10 items-center justify-center rounded-xl", browserLocal ? "bg-good-soft text-good" : "bg-crit-soft text-crit")}>
                  <MonitorSmartphone size={18} />
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-ink">{browserLocal ? "Local requests only" : "External request detected"}</div>
                  <div className="tnum text-[12.5px] text-ink-3">{requests} requests to {hosts.length} host{hosts.length === 1 ? "" : "s"}</div>
                </div>
              </div>
              <ul className="mt-4 space-y-1.5">
                {hosts.map((h) => (
                  <li key={h.host} className="flex items-center gap-2 text-[12.5px]">
                    {isLocal(h.host) ? <CheckCircle2 size={13} className="text-good" /> : <XCircle size={13} className="text-crit" />}
                    <span className="font-mono text-ink">{h.host}</span>
                    <span className="tnum ml-auto text-ink-3">{h.n}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 text-[11.5px] leading-snug text-ink-3">Fonts, icons and scripts are bundled. No CDN, analytics or telemetry.</div>
            </Panel>
          </div>

          <Explainer />
        </>
      )}
    </>
  );
}

function HeroStat({ icon, label, value, sub, tone }: { icon: ReactNode; label: string; value: ReactNode; sub: string; tone?: "good" | "crit" }) {
  return (
    <div className="border-l border-line pl-8">
      <div className="flex items-center gap-2 text-[13px] font-medium text-ink-3">{icon}{label}</div>
      <div className={cx("tnum mt-2 text-[36px] font-semibold leading-none tracking-[-0.02em]", tone === "good" ? "text-good" : tone === "crit" ? "text-crit" : "text-ink")}>{value}</div>
      <div className="mt-2 text-[12.5px] text-ink-3">{sub}</div>
    </div>
  );
}

function RedactionBars({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <div className="text-[13px] text-ink-3">No redactions recorded yet.</div>;
  const max = Math.max(...entries.map(([, n]) => n));
  return (
    <ul className="space-y-2">
      {entries.map(([k, n]) => (
        <li key={k} className="grid grid-cols-[80px_1fr_32px] items-center gap-3 text-[12.5px]">
          <span className="font-mono text-ink-2">{k}</span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-3">
            <motion.span
              className="block h-full rounded-full bg-info"
              initial={{ width: 0 }}
              animate={{ width: `${(n / max) * 100}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </span>
          <span className="tnum text-right font-semibold text-ink">{n}</span>
        </li>
      ))}
    </ul>
  );
}

const PROOFS: { icon: ReactNode; title: string; body: string; scope: string }[] = [
  {
    icon: <Cpu size={16} />, title: "Local inference",
    body: "Every label, score and quote is produced by an open-weights model running in Ollama on this laptop (127.0.0.1:11434). There is no cloud LLM and no API key in the scored path.",
    scope: "Covers: the engine. The model digest above identifies the exact weights.",
  },
  {
    icon: <ServerOff size={16} />, title: "Network guard",
    body: "The API and engine install a socket-level guard that refuses and counts any connection to a host that isn't loopback. The counter above is that guard's live tally.",
    scope: "Covers: the Python process only. It cannot see the browser, the OS or other apps.",
  },
  {
    icon: <WifiOff size={16} />, title: "Wi-Fi off in the demo",
    body: "For the demo we also disconnect Wi-Fi, so the whole machine is physically offline while it works.",
    scope: "Covers: the entire machine, for the duration of the demo.",
  },
  {
    icon: <MonitorSmartphone size={16} />, title: "Self-contained UI",
    body: "This web app bundles its fonts, icons and code. It only calls /api on its own origin, which is proxied to 127.0.0.1. Source links are shown as text, never auto-opened.",
    scope: "Covers: this browser tab. The live host list above is read from the browser itself.",
  },
  {
    icon: <FileLock2 size={16} />, title: "Redaction",
    body: "Names, ages, emails, phone numbers, dates and IDs are replaced with stable tags (e.g. [HCP-1], [AGE 70-79]) before text is shown or stored. The engine scores the original in memory so quotes stay verbatim.",
    scope: "Covers: display and storage. It is pattern- and NER-based, so a human still reviews outputs.",
  },
  {
    icon: <Fingerprint size={16} />, title: "Hash-chained audit log",
    body: "Each analysed item appends a record holding a SHA-256 of the input, never the text. Every record hashes the previous one, so editing any line breaks the chain.",
    scope: "Covers: tamper evidence for what was analysed and how. It is not encryption.",
  },
  {
    icon: <UserCheck size={16} />, title: "Need-to-know access",
    body: "Patient and reporter details in the Safety Inbox are masked by the server for every role except Pharmacovigilance, and only Pharmacovigilance can change a case's status.",
    scope: "Covers: what the API returns. The role is a demo header; production would use SSO.",
  },
];

function Explainer() {
  return (
    <section className="mt-10">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">What leaves this device: nothing</h2>
          <p className="mt-1 text-[13.5px] text-ink-3">In plain English, with the honest limits of each guarantee.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-good"><ShieldCheck size={15} />Nothing leaves the vault</span>
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        {PROOFS.map((p) => (
          <div key={p.title} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-ink-2">{p.icon}</span>
              <h3 className="text-[14px] font-semibold text-ink">{p.title}</h3>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{p.body}</p>
            <p className="mt-3 flex items-start gap-1.5 border-t border-line pt-3 text-[12px] leading-snug text-ink-3">
              <Link2 size={12} className="mt-0.5 shrink-0" />{p.scope}
            </p>
          </div>
        ))}
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface-2/50 p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-ink-3"><CircleHelp size={16} /></span>
            <h3 className="text-[14px] font-semibold text-ink">What this does not claim</h3>
          </div>
          <ul className="mt-3 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-ink-2">
            <li>It is not a formal certification (HIPAA, GDPR, GxP).</li>
            <li>It does not make the AI's judgements correct; humans review every card and case.</li>
            <li>It cannot police other software running on the same machine.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
