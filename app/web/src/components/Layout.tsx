import { AnimatePresence, motion } from "framer-motion";
import {
  Check, ChevronDown, FileSearch, Gauge, Inbox, LineChart, ListChecks, Lock, LockOpen, Moon,
  Rows3, ShieldCheck, Sun, UserRound,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api/client";
import type { Role } from "../api/types";
import { ROLES } from "../api/types";
import { useApi } from "../api/useApi";
import { ROLE_LABELS } from "../lib/format";
import { useApp, type ProductFilter } from "../state/app";
import { SAFETY_CHANGED, useDecisions } from "../state/reviews";
import { ProductDot } from "./chips";
import { Wordmark } from "./Logo";
import { useToast } from "./Toast";
import { cx } from "./ui";

export function Layout() {
  const { pathname } = useLocation();
  const { role } = useApp();
  const decisions = useDecisions();

  const health = useApi(() => api.health(), []);
  const reviewCards = useApi(() => api.cards({ status: "review" }), []);
  const safety = useApi(() => api.safety(), [role]);

  // Re-poll health so the sidebar notices the API coming back (or going away) during a demo.
  useEffect(() => {
    const t = setInterval(health.reload, 15000);
    return () => clearInterval(t);
  }, [health.reload]);
  useEffect(() => {
    const onChange = () => safety.reload();
    window.addEventListener(SAFETY_CHANGED, onChange);
    return () => window.removeEventListener(SAFETY_CHANGED, onChange);
  }, [safety.reload]);
  const online = !!health.data && !health.error;
  useEffect(() => {
    if (online) { reviewCards.reload(); safety.reload(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  const reviewCount = reviewCards.data?.filter((c) => !decisions[c.card_id]).length;
  const openCases = safety.data?.filter((c) => c.status === "new" || c.status === "in_triage").length;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-[244px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="px-5 pb-5 pt-5"><Wordmark /></div>
        <nav className="flex-1 space-y-0.5 px-3" aria-label="Main">
          <NavSection>Insights</NavSection>
          <NavItem to="/" icon={<Gauge size={16} />} end>Overview</NavItem>
          <NavItem to="/signals" icon={<Rows3 size={16} />}>Signals</NavItem>
          <NavItem to="/trends" icon={<LineChart size={16} />}>Trends</NavItem>
          <NavSection>Workflows</NavSection>
          <NavItem to="/analyze" icon={<FileSearch size={16} />}>Analyze</NavItem>
          <NavItem to="/review" icon={<ListChecks size={16} />} count={reviewCount}>Review queue</NavItem>
          <NavItem to="/safety" icon={<Inbox size={16} />} count={openCases} urgent>Safety Inbox</NavItem>
          <NavSection>Trust</NavSection>
          <NavItem to="/privacy" icon={<ShieldCheck size={16} />}>Privacy</NavItem>
        </nav>
        <div className="m-3 rounded-xl border border-line bg-surface-2 p-3 text-[12px]">
          <div className="flex items-center gap-2 font-medium text-ink">
            <span className={cx("h-2 w-2 rounded-full", health.data && !health.error ? "live-dot bg-good" : "bg-warn")} />
            {health.data && !health.error ? "Local API connected" : health.loading && !health.error ? "Connecting…" : "API offline"}
          </div>
          <div className="mt-1 font-mono text-[11px] text-ink-3">127.0.0.1 · loopback only</div>
          {health.data && !health.error && (health.data.using_fixtures || health.data.engine_stub) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {health.data.using_fixtures && <span className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] text-ink-2 ring-1 ring-line">Synthetic fixtures</span>}
              {health.data.engine_stub && <span className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] text-ink-2 ring-1 ring-line">Engine stub</span>}
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-8 pb-16 pt-8">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}

function NavSection({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{children}</div>;
}

function NavItem({ to, icon, children, count, urgent, end }: {
  to: string; icon: ReactNode; children: ReactNode; count?: number; urgent?: boolean; end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cx(
        "group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
        isActive ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2/70 hover:text-ink",
      )}
    >
      {({ isActive }) => (
        <>
          <span className={isActive ? "text-ink" : "text-ink-3 group-hover:text-ink-2"}>{icon}</span>
          <span className="flex-1">{children}</span>
          {count !== undefined && count > 0 && (
            <span className={cx(
              "tnum min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5",
              urgent ? "bg-crit text-white" : "bg-surface-3 text-ink-2",
            )}>{count}</span>
          )}
        </>
      )}
    </NavLink>
  );
}

// ---------------------------------------------------------------- top bar
function TopBar() {
  const { product, setProduct, theme, toggleTheme } = useApp();
  const opts: { value: ProductFilter; label: string; dot: "A" | "B" | "both" }[] = [
    { value: "all", label: "Both", dot: "both" },
    { value: "A", label: "Tagrisso", dot: "A" },
    { value: "B", label: "Rybrevant", dot: "B" },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-15 max-w-[1280px] items-center gap-4 px-8">
        <div role="radiogroup" aria-label="Product" className="inline-flex rounded-xl border border-line bg-surface-2 p-0.5">
          {opts.map((o) => {
            const active = product === o.value;
            return (
              <button
                key={o.value}
                role="radio"
                aria-checked={active}
                onClick={() => setProduct(o.value)}
                title={o.value === "all" ? "Tagrisso (A) and Rybrevant / Lazcluze (B)" : o.value === "A" ? "A · Tagrisso (osimertinib)" : "B · Rybrevant / Lazcluze (amivantamab, lazertinib)"}
                className={cx(
                  "relative inline-flex h-8 items-center gap-2 rounded-[10px] px-3 text-[13px] font-medium transition-colors",
                  active ? "text-ink" : "text-ink-3 hover:text-ink",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="prod-pill"
                    className="absolute inset-0 rounded-[10px] bg-surface shadow-sm"
                    style={o.value !== "all" ? { boxShadow: `inset 0 -2px 0 var(--prod-${o.value.toLowerCase()}), var(--shadow-sm)` } : undefined}
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative inline-flex items-center gap-2">
                  <ProductDot product={o.dot} size={8} />
                  {o.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          <RoleSwitcher />
          <div
            className="hidden items-center gap-2 rounded-full border border-line bg-good-soft px-3 py-1.5 text-[12.5px] font-medium text-ink xl:inline-flex"
            title="Inference runs on this machine. The API only talks to 127.0.0.1."
          >
            <span className="relative flex h-2 w-2">
              <span className="live-dot absolute inline-flex h-full w-full rounded-full bg-good opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-good" />
            </span>
            <span className="font-semibold text-good">Offline</span>
            <span className="text-ink-3">·</span>
            <span className="text-ink-2">Nothing leaves the vault</span>
          </div>
          <div
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-good-soft px-2.5 py-1.5 text-[12.5px] font-semibold text-good xl:hidden"
            title="Offline · Nothing leaves the vault"
          >
            <span className="h-2 w-2 rounded-full bg-good" />Offline
          </div>
          <button
            onClick={toggleTheme}
            aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
            title={theme === "light" ? "Dark theme" : "Light theme"}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
          </button>
        </div>
      </div>
    </header>
  );
}

const ROLE_HINT: Record<Role, string> = {
  brand: "Launch messaging, competitive moves",
  medical_affairs: "Scientific exchange, off-label questions",
  pharmacovigilance: "Sees patient-level safety detail",
  market_access: "Payers, pricing, reimbursement",
};

function RoleSwitcher() {
  const { role, setRole } = useApp();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const choose = (r: Role) => {
    setOpen(false);
    if (r === role) return;
    setRole(r);
    toast(r === "pharmacovigilance"
      ? { tone: "good", title: "Viewing as Pharmacovigilance", body: "Patient and reporter details are now visible, enforced by the API." }
      : { tone: "info", title: `Viewing as ${ROLE_LABELS[r]}`, body: "Patient-level safety details are masked by the API for this role." });
  };

  const isPv = role === "pharmacovigilance";
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface pl-2.5 pr-2 text-[13px] hover:bg-surface-2"
      >
        <UserRound size={15} className="text-ink-3" />
        <span className="text-ink-3">Viewing as</span>
        <span className="font-semibold text-ink">{ROLE_LABELS[role]}</span>
        {isPv ? <LockOpen size={13} className="text-good" /> : <Lock size={13} className="text-ink-3" />}
        <ChevronDown size={14} className="text-ink-3" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-11 z-50 w-[300px] rounded-xl border border-line bg-surface p-1.5 shadow-lg"
          >
            {ROLES.map((r) => (
              <button
                key={r}
                role="option"
                aria-selected={r === role}
                onClick={() => choose(r)}
                className={cx("flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-surface-2", r === role && "bg-surface-2")}
              >
                <span className="mt-0.5 text-ink-3">{r === "pharmacovigilance" ? <LockOpen size={14} /> : <Lock size={14} />}</span>
                <span className="flex-1">
                  <span className="block text-[13px] font-semibold text-ink">{ROLE_LABELS[r]}</span>
                  <span className="block text-[12px] text-ink-3">{ROLE_HINT[r]}</span>
                </span>
                {r === role && <Check size={14} className="mt-0.5 text-ink" />}
              </button>
            ))}
            <div className="mt-1 border-t border-line px-3 pb-1.5 pt-2.5 text-[11.5px] leading-snug text-ink-3">
              Demo-grade role header (<span className="font-mono">X-SV-Role</span>), enforced server-side. A real deployment uses SSO.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
