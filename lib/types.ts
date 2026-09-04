export type Verdict = "STOP" | "VERIFY" | "SAFE";

export interface ExtractedAsk {
  /** What the message demands the recipient physically do. */
  action:
    | "send_money"
    | "share_otp_or_credential"
    | "click_link"
    | "install_app"
    | "call_number"
    | "join_group"
    | "share_documents"
    | "none";
  /** Rupee amount named in the message, if any. */
  amount_inr: number | null;
  /** Who the sender claims to be. */
  claimed_identity: string | null;
  /** The literal sentence carrying the demand. Must be quoted from the input. */
  demand_quote: string | null;
  /** Deadline / consequence language, quoted. */
  pressure_quote: string | null;
  /** Does the message discourage telling anyone else? */
  isolation_requested: boolean;
}

export type EvidenceStatus = "danger" | "caution" | "reassuring" | "unavailable";

export interface EvidenceItem {
  id: string;
  label: string;
  status: EvidenceStatus;
  detail: string;
  /** true when produced by local deterministic logic (always available),
   *  false when it depended on a network lookup that may fail. */
  deterministic: boolean;
}

export interface EvidenceReport {
  items: EvidenceItem[];
  urls: string[];
  domains: string[];
  upiIds: string[];
  phoneNumbers: string[];
  networkChecksAttempted: number;
  networkChecksSucceeded: number;
}

export interface ModelTrace {
  role: string;
  modelUsed: string;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  usedFallback: boolean;
  primaryError?: string;
  rationale: string;
}

export interface ProsecutionResult {
  fraudulent: boolean;
  confidence: number;
  tactics: string[];
  reasoning: string;
  what_they_want: string;
}

export interface DefenceResult {
  can_be_legitimate: boolean;
  strength: number;
  argument: string;
  /** The single check that would settle it, if the defence is plausible. */
  decisive_check: string | null;
}

export interface Decision {
  verdict: Verdict;
  confidence: number;
  headline: string;
  what_they_want: string;
  why: string[];
  what_to_do: string;
  disagreement: boolean;
  disagreement_note: string | null;
}

export interface AnalysisResult {
  ask: ExtractedAsk;
  evidence: EvidenceReport;
  prosecution: ProsecutionResult;
  defence: DefenceResult | null;
  decision: Decision;
  trace: ModelTrace[];
  totalLatencyMs: number;
  escalatedToLargeModel: boolean;
}
