/**
 * The only place the UI talks to the network. Every call is a same-origin `/api/...` request
 * (proxied to 127.0.0.1 by Vite), so the browser never contacts another host.
 * Failures become a typed ApiError instead of a crash, so pages can show friendly states.
 */
import type {
  AnalyzeRequest, AnalyzeResponse, Card, CaseStatus, Health, ItemDetail, Metrics,
  PrivacyStatus, RadarResponse, Role, SafetyCase, TrendPoint,
} from "./types";

export type ApiErrorKind = "offline" | "forbidden" | "not_found" | "http";

export class ApiError extends Error {
  kind: ApiErrorKind;
  status?: number;
  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

let currentRole: Role = "brand";
/** The role switcher updates this; every request carries it as X-SV-Role. */
export function setApiRole(role: Role) {
  currentRole = role;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        Accept: "application/json",
        "X-SV-Role": currentRole,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError("offline", "The Signal Vault API is not reachable.");
  }

  const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
  if (!res.ok) {
    // The Vite proxy answers 5xx with a non-JSON body when nothing listens on the API port.
    if (!isJson && res.status >= 500) throw new ApiError("offline", "The Signal Vault API is not reachable.", res.status);
    let detail = res.statusText;
    if (isJson) {
      try {
        const body = await res.json();
        detail = typeof body?.detail === "string" ? body.detail : JSON.stringify(body?.detail ?? body);
      } catch { /* keep statusText */ }
    }
    const kind: ApiErrorKind = res.status === 403 ? "forbidden" : res.status === 404 ? "not_found" : "http";
    throw new ApiError(kind, detail || `HTTP ${res.status}`, res.status);
  }
  if (!isJson) throw new ApiError("offline", "The API answered with something other than JSON.", res.status);
  return (await res.json()) as T;
}

function qs(params: Record<string, string | boolean | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const api = {
  health: () => request<Health>("/api/health"),
  cards: (f: { product?: string; signal?: string; owner?: string; status?: string; actionable?: boolean } = {}) =>
    request<Card[]>(`/api/cards${qs(f)}`),
  trends: (f: { product?: string; aspect?: string; speaker?: string } = {}) =>
    request<TrendPoint[]>(`/api/trends${qs(f)}`),
  item: (id: string) => request<ItemDetail>(`/api/items/${encodeURIComponent(id)}`),
  privacy: () => request<PrivacyStatus>("/api/privacy"),
  metrics: () => request<Metrics[]>("/api/metrics"),
  analyze: (body: AnalyzeRequest) =>
    request<AnalyzeResponse>("/api/analyze", { method: "POST", body: JSON.stringify(body) }),
  review: (cardId: string, decision: "accept" | "reject", note = "") =>
    request<{ ok: boolean }>(`/api/review/${encodeURIComponent(cardId)}`, {
      method: "POST", body: JSON.stringify({ decision, note }),
    }),
  /** Read-only: local snapshot files only. The radar's online step is a separate CLI process. */
  radar: () => request<RadarResponse>("/api/radar"),
  safety: (status?: CaseStatus) => request<SafetyCase[]>(`/api/safety${qs({ status })}`),
  updateSafety: (caseId: string, status: CaseStatus, note = "") =>
    request<{ ok: boolean }>(`/api/safety/${encodeURIComponent(caseId)}`, {
      method: "POST", body: JSON.stringify({ status, note }),
    }),
};
