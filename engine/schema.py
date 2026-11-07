"""THE CONTRACT. Every part of the project talks through these models.

Owner: lead. Teammates: do not edit; propose changes in a PR comment or issue.
Mirrors CONTRACTS.md. If the two disagree, this file wins.

Flow:
    Item ──engine.analyze_item──► EnrichedPrediction ──► Prediction (scorer JSONL)
                                         │
                     insights.build_cards / build_trends ──► Card, TrendPoint ──► app API ──► web UI
                                         │
                                 privacy.audit ──► AuditRecord (no raw text)
"""
from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field

# ---------------------------------------------------------------- enums
ASPECTS = ("efficacy", "safety", "convenience", "access_cost", "evidence_quality")
SIGNAL_TYPES = ("efficacy", "safety", "regulatory", "trial_update", "competitor_move",
                "access_pricing", "guideline", "expert_opinion", "none")
SPEAKERS = ("researcher", "hcp", "patient", "company", "regulator", "payer", "media")

SignalType = Literal["efficacy", "safety", "regulatory", "trial_update", "competitor_move",
                     "access_pricing", "guideline", "expert_opinion", "none"]
Speaker = Literal["researcher", "hcp", "patient", "company", "regulator", "payer", "media"]
AspectName = Literal["efficacy", "safety", "convenience", "access_cost", "evidence_quality"]
Product = Literal["A", "B", "both"]          # A = Tagrisso, B = Rybrevant/Lazcluze
PRODUCT_NAMES = {"A": "Tagrisso", "B": "Rybrevant / Lazcluze", "both": "Tagrisso + Rybrevant"}
Owner = Literal["brand", "medical_affairs", "pharmacovigilance", "market_access", "clinical_ops"]
ReviewStatus = Literal["auto", "review", "abstained"]
Flag = Literal["pv_possible_ae", "off_label", "single_report_no_causality",
               "case_report_demographics", "pii_redacted", "competitor", "reportable_case_candidate"]
# Who is looking. The API enforces this server-side (header X-SV-Role): only pharmacovigilance
# sees patient-level details in the Safety Inbox; everyone else gets them masked.
Role = Literal["brand", "medical_affairs", "pharmacovigilance", "market_access"]
CaseStatus = Literal["new", "in_triage", "sent_to_pv", "not_a_case"]
RESTRICTED_MASK = "[restricted: pharmacovigilance only]"


# ---------------------------------------------------------------- input
class Item(BaseModel):
    """One evidence item. Packet rows load straight into this. Transcripts use source='transcript'."""
    item_id: str
    source: str = Field(description="pubmed|ctgov|fda_event|fda_label|fda_notice|press_release|news|transcript (unknown allowed)")
    source_id: Optional[str] = None
    url: Optional[str] = None
    published: Optional[str] = Field(None, description="YYYY-MM-DD")
    product: Optional[Product] = None
    title: str = ""
    text: Optional[str] = None


# ---------------------------------------------------------------- scorer shape (exact)
class Aspect(BaseModel):
    polarity: int = Field(ge=-2, le=2)
    speaker: Speaker
    span: str = Field(description="Shortest phrase copied VERBATIM from Item.text; verified before output.")


class Prediction(BaseModel):
    """Exactly what scoring/score.py reads. Nothing else goes in the submission file."""
    item_id: str
    signal_type: SignalType = "none"
    actionable: Literal["yes", "no"] = "no"
    efficacy: Optional[Aspect] = None
    safety: Optional[Aspect] = None
    convenience: Optional[Aspect] = None
    access_cost: Optional[Aspect] = None
    evidence_quality: Optional[Aspect] = None

    def to_submission(self) -> dict:
        return self.model_dump(include={"item_id", "signal_type", "actionable", *ASPECTS})


# ---------------------------------------------------------------- engine output for the app
class AspectMeta(BaseModel):
    start: int = Field(description="char offset of span in Item.text")
    end: int
    confidence: float = Field(ge=0, le=1)
    origin: Literal["rule", "llm"]


class Meta(BaseModel):
    source: str
    published: Optional[str] = None
    week: Optional[str] = Field(None, description="ISO week, e.g. '2026-W14', derived from published")
    product: Optional[Product] = None
    title: str = ""
    url: Optional[str] = None
    signal_confidence: float = Field(0.0, ge=0, le=1)
    actionable_confidence: float = Field(0.0, ge=0, le=1)
    aspects: dict[str, AspectMeta] = Field(default_factory=dict, description="keyed by aspect name; only non-null aspects")
    review_status: ReviewStatus = "auto"
    why_actionable: str = Field("", description="one sentence, for the UI; never sent to the scorer")
    uncertainty: Optional[str] = Field(None, description="why confidence is low, if it is")
    rule_hits: list[str] = Field(default_factory=list)
    flags: list[Flag] = Field(default_factory=list)
    model: str = ""
    prompt_version: str = ""
    latency_ms: int = 0


class EnrichedPrediction(Prediction):
    meta: Meta


# ---------------------------------------------------------------- insights (built from EnrichedPrediction)
class Citation(BaseModel):
    aspect: AspectName
    quote: str
    speaker: Speaker
    polarity: int
    url: Optional[str] = None
    start: int
    end: int


class Card(BaseModel):
    card_id: str
    item_id: str
    headline: str
    signal_type: SignalType
    product: Optional[Product] = None
    actionable: bool
    why_it_matters: str
    owner: Owner
    recommended_action: str = Field(description="a REVIEW action for a human, never a medical conclusion")
    citations: list[Citation]
    confidence: Literal["high", "medium", "low"]
    review_status: ReviewStatus
    caveats: list[str] = Field(default_factory=list, description="e.g. 'single spontaneous report; causality not established'")
    published: Optional[str] = None
    week: Optional[str] = None
    source: str


class TrendQuote(BaseModel):
    item_id: str
    quote: str
    polarity: int
    url: Optional[str] = None
    published: Optional[str] = None


class TrendPoint(BaseModel):
    """One cell: product × aspect × speaker × week. Weeks with no observations are ABSENT (not zero)."""
    product: Product
    aspect: AspectName
    speaker: Speaker
    week: str
    mean_polarity: float
    n: int = Field(ge=1)
    quotes: list[TrendQuote] = Field(description="up to 3, strongest |polarity| first")


# ---------------------------------------------------------------- safety inbox (pharmacovigilance case triage)
class Criterion(BaseModel):
    """One of the four minimum criteria of a reportable individual case. Quote is verbatim or None."""
    present: bool
    quote: Optional[str] = None
    start: Optional[int] = None
    end: Optional[int] = None


class SafetyCase(BaseModel):
    """A POSSIBLE reportable adverse-event case found in literature, news or a transcript.

    Triage aid only: a human in pharmacovigilance decides. The four criteria (identifiable patient,
    identifiable reporter, suspect drug, adverse event) each carry a verified quote.
    `restricted=True` means patient-level fields are masked for every role except pharmacovigilance.
    """
    case_id: str
    item_id: str
    source: str
    product: Optional[Product] = None
    title: str = ""
    url: Optional[str] = None
    patient: Criterion
    reporter: Criterion
    suspect_drug: Criterion
    adverse_event: Criterion
    events: list[str] = Field(default_factory=list, description="verbatim event terms")
    serious: Literal["yes", "no", "unknown"] = "unknown"
    seriousness_quote: Optional[str] = None
    valid_case_candidate: bool = Field(description="True only if all four criteria are present")
    already_reported: bool = Field(False, description="e.g. an FDA FAERS record: already in a regulator database")
    day0: str = Field(description="YYYY-MM-DD the system became aware (ingest date) — the clock start")
    due: Optional[str] = Field(None, description="YYYY-MM-DD reporting due date under the configured policy")
    status: CaseStatus = "new"
    restricted: bool = True
    confidence: float = Field(0.0, ge=0, le=1)
    caveats: list[str] = Field(default_factory=list)


class SafetyUpdate(BaseModel):
    status: CaseStatus
    note: str = ""


# ---------------------------------------------------------------- privacy
class RedactionSpan(BaseModel):
    start: int
    end: int
    kind: str = Field(description="PERSON|AGE|DATE|EMAIL|PHONE|LOCATION|ID|...")
    replacement: str = Field(description="e.g. '[HCP-1]', '[AGE 60-69]', '[DATE 2026-W14]'")


class RedactionResult(BaseModel):
    text: str = Field(description="redacted text, for display/storage only")
    spans: list[RedactionSpan] = Field(default_factory=list)
    counts: dict[str, int] = Field(default_factory=dict)


class AuditRecord(BaseModel):
    """Appended per item. NO raw text, NO quotes from private transcripts."""
    ts: str
    run_id: str
    item_id: str
    input_sha256: str
    source: str
    model: str
    prompt_version: str
    rule_hits: list[str] = Field(default_factory=list)
    signal_type: SignalType
    actionable: Literal["yes", "no"]
    aspects: dict[str, dict] = Field(default_factory=dict, description="{aspect: {polarity, speaker, start, end}}")
    review_status: ReviewStatus
    prev_hash: str = Field("", description="hash chain: sha256 of previous record line")


class DataFileHash(BaseModel):
    path: str
    sha256: str


class PrivacyStatus(BaseModel):
    offline_mode: bool
    outbound_attempts_blocked: int
    allowed_hosts: list[str]
    model: str
    model_digest: Optional[str] = None
    data_files: list[DataFileHash] = Field(default_factory=list)
    redaction_counts: dict[str, int] = Field(default_factory=dict)
    audit_records: int = 0
    audit_chain_ok: Optional[bool] = None


# ---------------------------------------------------------------- API payloads
class AnalyzeRequest(BaseModel):
    text: str
    source: str = "transcript"
    title: str = ""
    product: Optional[Product] = None
    published: Optional[str] = Field(None, description="YYYY-MM-DD; defaults to today")


class AnalyzeResponse(BaseModel):
    redaction: RedactionResult
    prediction: EnrichedPrediction
    cards: list[Card]
    safety_case: Optional[SafetyCase] = None


class Metrics(BaseModel):
    split: str
    composite: Optional[float] = None
    scores: dict[str, Optional[float]] = Field(default_factory=dict)
    items: int = 0
    seconds_per_item: Optional[float] = None
    cost_per_100_items_usd: Optional[float] = None
    model: str = ""
    measured_at: Optional[str] = None


def iso_week(published: Optional[str]) -> Optional[str]:
    """'2026-04-02' -> '2026-W14'. None/invalid -> None."""
    try:
        y, w, _ = date.fromisoformat(published[:10]).isocalendar()  # type: ignore[index]
        return f"{y}-W{w:02d}"
    except (TypeError, ValueError):
        return None
