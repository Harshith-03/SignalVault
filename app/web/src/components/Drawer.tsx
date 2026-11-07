import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

export function Drawer({ open, onClose, title, subtitle, children }: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Depends on `open` only, so an inline onClose doesn't re-steal focus on every parent render.
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-[var(--scrim)]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-bg shadow-lg sm:w-[500px] sm:max-w-[92vw] sm:rounded-l-card"
            initial={{ x: 32, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 32, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6 sm:py-5">
              <div className="min-w-0">
                <div id="drawer-title" className="font-display text-[18px] font-semibold leading-snug tracking-[-0.01em] text-ink">{title}</div>
                {subtitle && <div className="mt-1 text-support text-ink-3">{subtitle}</div>}
              </div>
              <button
                ref={closeRef}
                onClick={onClose}
                aria-label="Close"
                className="press -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-surface-3 hover:text-ink"
              >
                <X size={17} />
              </button>
            </div>
            <div className="scroll-thin flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
