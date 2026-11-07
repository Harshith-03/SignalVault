import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setApiRole } from "../api/client";
import type { Role } from "../api/types";

/** "all" shows every card; A/B also include items tagged "both" (they concern both drugs). */
export type ProductFilter = "all" | "A" | "B";
export type Theme = "light" | "dark";

interface AppState {
  product: ProductFilter;
  setProduct: (p: ProductFilter) => void;
  role: Role;
  setRole: (r: Role) => void;
  theme: Theme;
  toggleTheme: () => void;
}

const Ctx = createContext<AppState | null>(null);

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch { /* private mode: state still works for this session */ }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [product, setProductState] = useState<ProductFilter>(() => read("sv.product", ["all", "A", "B"], "all"));
  const [role, setRoleState] = useState<Role>(() =>
    read("sv.role", ["brand", "medical_affairs", "pharmacovigilance", "market_access"], "brand"));
  const [theme, setTheme] = useState<Theme>(() => read("sv.theme", ["light", "dark"], "light"));

  // Set synchronously during render so the very first requests of child pages already carry the role.
  setApiRole(role);
  // Also synchronous: chart colours are resolved from CSS tokens during the same render.
  document.documentElement.setAttribute("data-theme", theme);

  useEffect(() => { write("sv.theme", theme); }, [theme]);

  const setProduct = useCallback((p: ProductFilter) => { setProductState(p); write("sv.product", p); }, []);
  const setRole = useCallback((r: Role) => { setApiRole(r); setRoleState(r); write("sv.role", r); }, []);
  const toggleTheme = useCallback(() => setTheme((t) => (t === "light" ? "dark" : "light")), []);

  const value = useMemo(() => ({ product, setProduct, role, setRole, theme, toggleTheme }),
    [product, setProduct, role, setRole, theme, toggleTheme]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}

/** Does a record tagged with `p` belong in the current product view? */
export function matchesProduct(filter: ProductFilter, p: string | null | undefined): boolean {
  if (filter === "all") return true;
  return p === filter || p === "both";
}
