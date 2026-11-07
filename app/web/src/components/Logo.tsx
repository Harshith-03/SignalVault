/** The Signal Vault mark: a shield with a vault dial. Inline SVG, so no asset request. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-ink" />
      <path
        d="M16 5.5 25 9v6.6c0 5.6-3.8 9.6-9 11-5.2-1.4-9-5.4-9-11V9l9-3.5Z"
        className="stroke-ink-inverse"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="15.5" r="4" stroke="#2fbfa2" strokeWidth="1.8" />
      <path d="M16 11.5v-1.6M16 21.1v-1.6M12 15.5h-1.6M21.6 15.5H20" stroke="#2fbfa2" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="15.5" r="1.1" fill="#2fbfa2" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-none">
        <div className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Signal Vault</div>
        <div className="mt-1 text-[11px] font-medium text-ink-3">Launch intelligence</div>
      </div>
    </div>
  );
}
