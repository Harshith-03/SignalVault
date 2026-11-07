import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, Copy, Inbox, PlugZap, RefreshCw } from "lucide-react";
import type { ApiError } from "../api/client";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- layout
export function PageHeader({ title, subtitle, actions, eyebrow }: {
  title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-7 flex items-end justify-between gap-6">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-ink-3">{eyebrow}</div>}
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-3xl text-[14px] leading-relaxed text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx("rounded-2xl border border-line bg-surface shadow-sm", padded && "p-5", className)}>
      {children}
    </section>
  );
}

export function PanelTitle({ children, hint, right }: { children: ReactNode; hint?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-[14px] font-semibold tracking-[-0.005em] text-ink">{children}</h2>
        {hint && <p className="mt-0.5 text-[12.5px] text-ink-3">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

// ---------------------------------------------------------------- chips
export function Chip({ children, className, title, icon }: {
  children: ReactNode; className?: string; title?: string; icon?: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[12px] font-medium leading-none",
        className ?? "border-line bg-surface-2 text-ink-2",
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <code className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-ink-2">{children}</code>;
}

// ---------------------------------------------------------------- controls
export function Button({ children, onClick, variant = "secondary", size = "md", disabled, icon, type = "button", title, className }: {
  children?: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "ghost" | "danger" | "good";
  size?: "sm" | "md"; disabled?: boolean; icon?: ReactNode; type?: "button" | "submit"; title?: string; className?: string;
}) {
  const v = {
    primary: "bg-ink text-ink-inverse border-transparent hover:opacity-90",
    secondary: "bg-surface text-ink border-line hover:bg-surface-2",
    ghost: "bg-transparent text-ink-2 border-transparent hover:bg-surface-2 hover:text-ink",
    danger: "bg-surface text-crit border-line hover:bg-crit-soft",
    good: "bg-surface text-good border-line hover:bg-good-soft",
  }[variant];
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-[background,opacity,color] disabled:opacity-45",
        size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-9 px-3.5 text-[13.5px]",
        v, className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export interface SegOption<T extends string> { value: T; label: ReactNode; title?: string }
export function Segmented<T extends string>({ value, onChange, options, size = "md", label }: {
  value: T; onChange: (v: T) => void; options: SegOption<T>[]; size?: "sm" | "md"; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors",
              size === "sm" ? "h-6 px-2 text-[12px]" : "h-7 px-2.5 text-[12.5px]",
              active ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Select<T extends string>({ value, onChange, options, label, stacked }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; stacked?: boolean;
}) {
  return (
    <label className={cx("text-[12.5px] text-ink-3", stacked ? "block" : "inline-flex items-center gap-2")}>
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={cx(
          "rounded-lg border border-line bg-surface px-2 pr-7 text-[13px] font-medium text-ink outline-none hover:border-line-strong focus:border-focus",
          stacked ? "mt-1 block h-9 w-full" : "h-8",
        )}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); }, () => {});
      }}
      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
    >
      {done ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

// ---------------------------------------------------------------- states
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

export function SkeletonCards({ n = 3 }: { n?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: n }).map((_, i) => (
        <Panel key={i}>
          <div className="flex gap-2"><Skeleton className="h-6 w-20 rounded-full" /><Skeleton className="h-6 w-28 rounded-full" /></div>
          <Skeleton className="mt-4 h-5 w-2/3" />
          <Skeleton className="mt-2.5 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-5/6" />
          <Skeleton className="mt-5 h-16 w-full rounded-xl" />
        </Panel>
      ))}
    </div>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink-3">
        {icon ?? <Inbox size={18} />}
      </div>
      <div className="text-[14px] font-semibold text-ink">{title}</div>
      {children && <div className="mt-1 max-w-md text-[13px] leading-relaxed text-ink-3">{children}</div>}
    </div>
  );
}

const START_CMD = "python -m uvicorn app.api.main:app --host 127.0.0.1 --port 8000";

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  if (error.kind === "offline") {
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warn-soft text-warn">
            <PlugZap size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-ink">API offline</div>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-3">
              The local Signal Vault API isn't answering. Start it from the repo root (it only listens on 127.0.0.1):
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-surface-2 py-2 pl-3 pr-1.5">
              <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-2">{START_CMD}</code>
              <CopyButton text={START_CMD} label="Copy command" />
            </div>
            {onRetry && (
              <div className="mt-4"><Button onClick={onRetry} icon={<RefreshCw size={14} />}>Retry</Button></div>
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-crit-soft text-crit"><AlertTriangle size={17} /></div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-ink">
          {error.kind === "not_found" ? "Not found" : error.kind === "forbidden" ? "Not permitted for this role" : "Something went wrong"}
        </div>
        <p className="mt-0.5 break-words text-[13px] text-ink-3">{error.message}</p>
        {onRetry && <div className="mt-3"><Button size="sm" onClick={onRetry} icon={<RefreshCw size={13} />}>Retry</Button></div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- metrics
export function Stat({ label, value, sub, icon, accent }: {
  label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; accent?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-4.5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-[12.5px] font-medium text-ink-3">{label}</div>
        {icon && <div className="text-ink-3" style={accent ? { color: accent } : undefined}>{icon}</div>}
      </div>
      <div className="tnum mt-2.5 text-[28px] font-semibold leading-none tracking-[-0.02em] text-ink">{value}</div>
      {sub && <div className="mt-2 text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}
