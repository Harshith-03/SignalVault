import { AnimatePresence, motion } from "framer-motion";
import {
  Check, ChevronDown, FileSearch, Gauge, Inbox, LineChart, ListChecks, Lock, LockOpen, Menu, Moon,
  Radar, Rows3, ShieldCheck, Sun, UserRound, X,
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
import { LogoMark, Wordmark } from "./Logo";
import { useToast } from "./Toast";
import { cx } from "./ui";

interface Counts { reviewCount?: number; openCases?: number }
interface Health { online: boolean; connecting: boolean; fixtures: boolean; stub: boolean }

export function Layout() {
  const { pathname } = useLocation();
  const { role } = useApp();
  const decisions = useDecisions();
  const [menuOpen, setMenuOpen] = useState(false);

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
  useEffect(() => { window.scrollTo(0, 0); setMenuOpen(false); }, [pathname]);

  const counts: Counts = {
    reviewCount: reviewCards.data?.filter((c) => !decisions[c.card_id]).length,
    openCases: safety.data?.filter((c) => c.status === "new" || c.status === "in_triage").length,
  };
  const h: Health = {
    online,
    connecting: health.loading && !health.error,
    fixtures: !!health.data?.using_fixtures,
    stub: !!health.data?.engine_stub,
  };

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[70] focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:text-body focus:font-medium focus:text-ink focus:shadow-lg">
        Skip to content
      </a>

      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col px-4 pb-4 pt-5 lg:flex" aria-label="Sidebar">
        <div className="px-2 pb-6"><Wordmark /></div>
        <NavContent counts={counts} />
        <ApiStatus h={h} />
      </aside>

      {/* mobile + tablet drawer */}
      <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} counts={counts} h={h} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setMenuOpen(true)} />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-20 pt-6 outline-none sm:px-6 lg:px-8 lg:pt-8">
          <motion.div
            key={pathname}
            className="@container"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- navigation
function NavContent({ counts, onNavigate }: { counts: Counts; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto" aria-label="Main">
      <NavSection>Insights</NavSection>
      <NavItem to="/" icon={<Gauge size={17} />} end onNavigate={onNavigate}>Overview</NavItem>
      <NavItem to="/signals" icon={<Rows3 size={17} />} onNavigate={onNavigate}>Signals</NavItem>
      <NavItem to="/trends" icon={<LineChart size={17} />} onNavigate={onNavigate}>Trends</NavItem>
      <NavItem to="/radar" icon={<Radar size={17} />} onNavigate={onNavigate}>Radar</NavItem>
      <NavSection>Workflows</NavSection>
      <NavItem to="/analyze" icon={<FileSearch size={17} />} onNavigate={onNavigate}>Analyze</NavItem>
      <NavItem to="/review" icon={<ListChecks size={17} />} count={counts.reviewCount} onNavigate={onNavigate}>Review queue</NavItem>
      <NavItem to="/safety" icon={<Inbox size={17} />} count={counts.openCases} urgent onNavigate={onNavigate}>Safety Inbox</NavItem>
      <NavSection>Trust</NavSection>
      <NavItem to="/privacy" icon={<ShieldCheck size={17} />} onNavigate={onNavigate}>Privacy</NavItem>
    </nav>
  );
}

function NavSection({ children }: { children: ReactNode }) {
  return <div className="px-3 pb-1.5 pt-5 text-micro font-semibold uppercase tracking-[0.08em] text-ink-3 first:pt-0">{children}</div>;
}

function NavItem({ to, icon, children, count, urgent, end, onNavigate }: {
  to: string; icon: ReactNode; children: ReactNode; count?: number; urgent?: boolean; end?: boolean; onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) => cx(
        "press group flex h-10 items-center gap-3 rounded-control px-3 text-body transition-colors",
        isActive ? "bg-surface font-semibold text-ink shadow-xs" : "font-medium text-ink-2 hover:bg-surface-3/70 hover:text-ink",
      )}
    >
      {({ isActive }) => (
        <>
          <span className={cx("transition-colors", isActive ? "text-brand" : "text-ink-3 group-hover:text-ink-2")}>{icon}</span>
          <span className="flex-1 truncate">{children}</span>
          {count !== undefined && count > 0 && (
            <span
              className={cx(
                "tnum min-w-6 rounded-full px-1.5 text-center text-micro font-semibold leading-5",
                urgent ? "bg-crit-soft text-crit" : "bg-surface-3 text-ink-2",
              )}
              aria-label={`${count} ${urgent ? "open" : "waiting"}`}
            >
              {count}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function ApiStatus({ h }: { h: Health }) {
  return (
    <div className="mt-4 rounded-panel bg-surface-3/60 p-3.5 text-caption">
      <div className="flex items-center gap-2 font-medium text-ink">
        <span className={cx("h-2 w-2 rounded-full", h.online ? "live-dot bg-good" : "bg-warn")} />
        {h.online ? "Local API connected" : h.connecting ? "Connecting…" : "API offline"}
      </div>
      <div className="mt-1 font-mono text-micro text-ink-3">127.0.0.1 · loopback only</div>
      {h.online && (h.fixtures || h.stub) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {h.fixtures && <span className="rounded-md bg-surface px-1.5 py-0.5 text-micro text-ink-2">Synthetic fixtures</span>}
          {h.stub && <span className="rounded-md bg-surface px-1.5 py-0.5 text-micro text-ink-2">Engine stub</span>}
        </div>
      )}
    </div>
  );
}

function MobileNav({ open, onClose, counts, h }: { open: boolean; onClose: () => void; counts: Counts; h: Health }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("a,button")?.focus());
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="lg:hidden">
          <motion.div
            className="fixed inset-0 z-50 bg-[var(--scrim)]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="fixed inset-y-0 left-0 z-50 flex w-[288px] max-w-[86vw] flex-col bg-bg px-4 pb-4 pt-4 shadow-lg"
            initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -24, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="mb-5 flex items-center justify-between pl-2">
              <Wordmark />
              <button onClick={onClose} aria-label="Close navigation" className="press flex h-10 w-10 items-center justify-center rounded-control text-ink-2 hover:bg-surface-3">
                <X size={18} />
              </button>
            </div>
            <NavContent counts={counts} onNavigate={onClose} />
            <ApiStatus h={h} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------- top bar
const PRODUCT_OPTS: { value: ProductFilter; label: string; dot: "A" | "B" | "both"; title: string }[] = [
  { value: "all", label: "Both", dot: "both", title: "Tagrisso (A) and Rybrevant / Lazcluze (B)" },
  { value: "A", label: "Tagrisso", dot: "A", title: "A · Tagrisso (osimertinib)" },
  { value: "B", label: "Rybrevant", dot: "B", title: "B · Rybrevant / Lazcluze (amivantamab, lazertinib)" },
];

function ProductSwitch({ className, id }: { className?: string; id: string }) {
  const { product, setProduct } = useApp();
  return (
    // Display (flex/hidden) comes from the caller so responsive visibility isn't fighting a base class.
    <div role="radiogroup" aria-label="Product" className={cx("rounded-full bg-surface-3/80 p-[3px]", className)}>
      {PRODUCT_OPTS.map((o) => {
        const active = product === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setProduct(o.value)}
            title={o.title}
            className={cx(
              "press relative inline-flex h-8 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium",
              active ? "text-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId={`prod-pill-${id}`}
                className="absolute inset-0 rounded-full bg-surface shadow-xs"
                transition={{ type: "spring", stiffness: 520, damping: 42 }}
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
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { theme, toggleTheme } = useApp();
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-2 px-4 sm:h-16 sm:gap-3 sm:px-6 lg:px-8">
        <button
          onClick={onMenu}
          aria-label="Open navigation"
          className="press -ml-1 flex h-10 w-10 items-center justify-center rounded-control text-ink-2 hover:bg-surface-3 lg:hidden"
        >
          <Menu size={19} />
        </button>
        <span className="sm:hidden"><LogoMark size={26} /></span>
        <ProductSwitch id="top" className="hidden sm:inline-flex" />

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <RoleSwitcher />
          <OfflinePill />
          <button
            onClick={toggleTheme}
            aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
            title={theme === "light" ? "Dark theme" : "Light theme"}
            className="press flex h-9 w-9 items-center justify-center rounded-full text-ink-2 hover:bg-surface-3 hover:text-ink"
          >
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
      </div>
      <div className="px-4 pb-2.5 sm:hidden">
        <ProductSwitch id="mobile" className="flex w-full" />
      </div>
    </header>
  );
}

function OfflinePill() {
  return (
    <div
      className="inline-flex h-9 items-center gap-2 rounded-full bg-good-soft px-3 text-[13px] font-medium"
      title="Offline · Nothing leaves the vault. Inference runs on this machine; the API only talks to 127.0.0.1."
    >
      <span className="relative flex h-2 w-2">
        <span className="live-dot absolute inline-flex h-full w-full rounded-full bg-good opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-good" />
      </span>
      <span className="font-semibold text-good">Offline</span>
      <span className="hidden text-ink-3 xl:inline">·</span>
      <span className="hidden text-ink-2 xl:inline">Nothing leaves the vault</span>
    </div>
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
        aria-label={`Viewing as ${ROLE_LABELS[role]}. Change role`}
        className={cx(
          "press inline-flex h-9 items-center gap-2 rounded-full border bg-surface px-2.5 text-[13px] hover:bg-surface-2 sm:pl-3",
          open ? "border-line-strong" : "border-line",
        )}
      >
        <UserRound size={15} className="text-ink-3" />
        <span className="hidden text-ink-3 xl:inline">Viewing as</span>
        <span className="hidden font-semibold text-ink md:inline">{ROLE_LABELS[role]}</span>
        {isPv ? <LockOpen size={13} className="text-good" /> : <Lock size={13} className="text-ink-3" />}
        <ChevronDown size={14} className={cx("hidden text-ink-3 transition-transform sm:block", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            aria-label="Role"
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-11 z-50 w-[min(310px,calc(100vw-2rem))] rounded-panel border border-line bg-surface p-1.5 shadow-lg"
          >
            {ROLES.map((r) => (
              <button
                key={r}
                role="option"
                aria-selected={r === role}
                onClick={() => choose(r)}
                className={cx(
                  "flex w-full items-start gap-3 rounded-control px-3 py-2.5 text-left transition-colors hover:bg-surface-2",
                  r === role && "bg-brand-tint hover:bg-brand-tint",
                )}
              >
                <span className={cx("mt-0.5", r === "pharmacovigilance" ? "text-good" : "text-ink-3")}>
                  {r === "pharmacovigilance" ? <LockOpen size={14} /> : <Lock size={14} />}
                </span>
                <span className="flex-1">
                  <span className="block text-[13px] font-semibold text-ink">{ROLE_LABELS[r]}</span>
                  <span className="block text-caption text-ink-3">{ROLE_HINT[r]}</span>
                </span>
                {r === role && <Check size={15} className="mt-0.5 text-brand" />}
              </button>
            ))}
            <div className="mt-1 border-t border-line px-3 pb-1.5 pt-2.5 text-caption text-ink-3">
              Demo-grade role header (<span className="font-mono">X-SV-Role</span>), enforced server-side. A real deployment uses SSO.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
