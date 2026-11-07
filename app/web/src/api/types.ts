/**
 * Friendly aliases over the generated OpenAPI types (src/api/openapi.d.ts, from engine/schema.py
 * via FastAPI). Regenerate with `npm run gen:types` whenever the contract changes, so the UI can
 * never silently drift from the Pydantic models.
 */
import type { components } from "./openapi";

type S = components["schemas"];

export type Card = S["Card"];
export type Citation = S["Citation"];
export type TrendPoint = S["TrendPoint"];
export type TrendQuote = S["TrendQuote"];
export type EnrichedPrediction = S["EnrichedPrediction"];
export type Aspect = S["Aspect"];
export type AspectMeta = S["AspectMeta"];
export type Meta = S["Meta"];
export type Metrics = S["Metrics"];
export type PrivacyStatus = S["PrivacyStatus"];
export type RedactionResult = S["RedactionResult"];
export type RedactionSpan = S["RedactionSpan"];
export type AnalyzeRequest = S["AnalyzeRequest"];
export type AnalyzeResponse = S["AnalyzeResponse"];
export type SafetyCase = S["SafetyCase"];
export type SafetyUpdate = S["SafetyUpdate"];
export type Criterion = S["Criterion"];
export type ReviewDecision = S["ReviewDecision"];

export type Product = NonNullable<Card["product"]>;
export type SignalType = Card["signal_type"];
export type Owner = Card["owner"];
export type ReviewStatus = Card["review_status"];
export type Confidence = Card["confidence"];
export type Speaker = Citation["speaker"];
export type AspectName = Citation["aspect"];
export type CaseStatus = SafetyCase["status"];
export type Flag = NonNullable<Meta["flags"]>[number];

/** Who is looking: sent as `X-SV-Role` on every request (demo-grade, no login). */
export type Role = "brand" | "medical_affairs" | "pharmacovigilance" | "market_access";

/** GET /api/items/{id} is not a named model in the schema. */
export interface ItemDetail {
  prediction: EnrichedPrediction;
  text: string;
  redacted: boolean;
}

export interface Health {
  ok: boolean;
  engine_stub: boolean;
  using_fixtures: boolean;
}

/** GET /api/radar: the Public Evidence Radar snapshot (written by the separate `surge.radar` CLI). */
export type RadarProvider = "tavily" | "exa";
export type RadarMode = "live" | "replay";
export interface RadarItem {
  item_id: string;
  title: string;
  url: string | null;
  source: string;
  product: Product | null;
  published: string | null;
  providers: RadarProvider[];
  corroborated: boolean;
  corroboration: "same_url" | "same_title" | "same_content" | null;
  query: string | null;
  queries: string[];
  retrieved_at: string;
  content_sha256: string;
  mode: RadarMode;
  analysed: boolean;
  in_app: boolean;
  signal_type?: SignalType;
  actionable?: "yes" | "no";
  review_status?: ReviewStatus;
  why_actionable?: string;
  flags?: Flag[];
}
export interface RadarQuery {
  provider: RadarProvider;
  query: string;
  kind: "news" | "research";
  mode: RadarMode;
  n_results: number;
  error: string | null;
  ts: string;
}
export interface RadarResponse {
  last_run: string | null;
  modes: Partial<Record<RadarProvider, RadarMode>>;
  providers: Record<RadarProvider, number>;
  corroborated: number;
  items: RadarItem[];
  queries: RadarQuery[];
  queries_total: number;
  stats: Partial<Record<"requests" | "new_results" | "hits" | "known_in_packet" | "off_topic" | "duplicates_merged"
    | "days" | "max_results" | "items" | "analysed" | "actionable" | "in_app" | "safety_cases", number | null>>;
  hint: string | null;
}

/** Mirrors engine.schema constants. */
export const RESTRICTED_MASK = "[restricted: pharmacovigilance only]";
export const ASPECTS: AspectName[] = ["efficacy", "safety", "convenience", "access_cost", "evidence_quality"];
export const SPEAKERS: Speaker[] = ["researcher", "hcp", "patient", "company", "regulator", "payer", "media"];
export const SIGNAL_TYPES: SignalType[] = [
  "efficacy", "safety", "regulatory", "trial_update", "competitor_move",
  "access_pricing", "guideline", "expert_opinion", "none",
];
export const OWNERS: Owner[] = ["brand", "medical_affairs", "pharmacovigilance", "market_access", "clinical_ops"];
export const ROLES: Role[] = ["brand", "medical_affairs", "pharmacovigilance", "market_access"];
