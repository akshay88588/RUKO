/**
 * Stage 5 - DECISION.
 *
 * Deliberately NOT a model call.
 *
 * Two models have already given opinions. Asking a third model to summarise
 * them would add latency, cost, and a fresh surface for hallucination, and
 * it would make the final verdict the least inspectable part of the system.
 * Instead the verdict is arithmetic we can write on a whiteboard:
 *
 *     fraudScore  = how strongly the prosecution believes it is fraud   (0..1)
 *     defence     = how strong the defence's case for legitimacy is     (0..1)
 *     net         = fraudScore - defence                                (-1..1)
 *     confidence  = |net|, minus a penalty for evidence we could not verify
 *
 *     confidence < THRESHOLD  -> VERIFY   (we refuse to call it)
 *     net > 0                 -> STOP
 *     otherwise               -> SAFE
 *
 * One override: deterministic danger evidence (a lookalike domain, an APK
 * link, an authority claim from a personal mobile) sets a floor on net.
 * Code-verified facts outrank model opinion. A model does not get to talk
 * the system out of something we checked ourselves.
 */

import { CONFIDENCE_THRESHOLD } from "../models";
import type { Decision, DefenceResult, EvidenceReport, ExtractedAsk, ProsecutionResult } from "../types";

/** Penalty applied when a network check we wanted could not be completed. */
const UNVERIFIED_EVIDENCE_PENALTY = 0.1;
/** Floor imposed by deterministic danger evidence. */
const HARD_DANGER_FLOOR = 0.5;

export function decide(
  ask: ExtractedAsk,
  evidence: EvidenceReport,
  prosecution: ProsecutionResult,
  defence: DefenceResult | null,
  escalated: boolean
): Decision {
  // Nothing was demanded and no danger signal fired: resolved on the small
  // model alone. This is the path most legitimate traffic takes.
  if (!escalated) {
    return {
      verdict: "SAFE",
      confidence: 0.9,
      headline: "Nothing here is asking you for anything.",
      what_they_want: "This message does not ask you to pay, share, install or call.",
      why: [
        "No payment, credential, link, app install or callback was requested.",
        "No lookalike domain, disposable link or app download was found.",
      ],
      what_to_do: "No action needed.",
      disagreement: false,
      disagreement_note: null,
    };
  }

  const fraudScore = prosecution.fraudulent
    ? prosecution.confidence
    : 1 - prosecution.confidence;

  const defenceStrength =
    defence && defence.can_be_legitimate ? defence.strength : 0;

  let net = fraudScore - defenceStrength;

  const hardDanger = evidence.items.filter((i) => i.status === "danger" && i.deterministic);
  if (hardDanger.length > 0 && net < HARD_DANGER_FLOOR) {
    net = HARD_DANGER_FLOOR;
  }

  const unverified = evidence.items.some((i) => i.status === "unavailable");
  const penalty = unverified ? UNVERIFIED_EVIDENCE_PENALTY : 0;
  const confidence = Math.max(0, Math.min(0.99, Math.abs(net) - penalty));

  const disagreement =
    prosecution.fraudulent && !!defence?.can_be_legitimate && (defence?.strength ?? 0) >= 0.5;

  let verdict: Decision["verdict"];
  if (confidence < CONFIDENCE_THRESHOLD) verdict = "VERIFY";
  else if (net > 0) verdict = "STOP";
  else verdict = "SAFE";

  const why = buildWhy(evidence, prosecution, defence, verdict);

  return {
    verdict,
    confidence,
    headline: buildHeadline(verdict, ask),
    what_they_want: prosecution.what_they_want,
    why,
    what_to_do: buildAdvice(verdict, ask, defence),
    disagreement,
    disagreement_note: disagreement
      ? `The two models disagreed. The prosecution model rated fraud at ${(fraudScore * 100).toFixed(0)}% and the defence model rated the case for legitimacy at ${(defenceStrength * 100).toFixed(0)}%. We are showing you both rather than picking one for you.`
      : null,
  };
}

function buildHeadline(verdict: Decision["verdict"], ask: ExtractedAsk): string {
  if (verdict === "STOP") {
    switch (ask.action) {
      case "send_money":
        return ask.amount_inr
          ? `Do not send the ₹${ask.amount_inr.toLocaleString("en-IN")}.`
          : "Do not send any money.";
      case "share_otp_or_credential":
        return "Do not share that code with anyone.";
      case "install_app":
        return "Do not install that app.";
      case "call_number":
        return "Do not call that number.";
      case "click_link":
        return "Do not open that link.";
      case "join_group":
        return "Do not join that group.";
      case "share_documents":
        return "Do not send those documents.";
      default:
        return "Do not act on this message.";
    }
  }
  if (verdict === "VERIFY") return "We are not confident enough to call this.";
  return "This looks genuine. You can act on it.";
}

function buildWhy(
  evidence: EvidenceReport,
  prosecution: ProsecutionResult,
  defence: DefenceResult | null,
  verdict: Decision["verdict"]
): string[] {
  const out: string[] = [];

  const ordered = [...evidence.items].sort((a, b) => rank(a.status) - rank(b.status));
  const relevant = verdict === "SAFE"
    ? ordered.filter((i) => i.status === "reassuring")
    : ordered.filter((i) => i.status === "danger" || i.status === "caution");

  for (const item of relevant.slice(0, 4)) out.push(`${item.label} - ${item.detail}`);

  if (prosecution.reasoning && verdict !== "SAFE") out.push(prosecution.reasoning);
  if (defence?.argument && verdict !== "STOP") out.push(`Defence: ${defence.argument}`);

  const unavailable = evidence.items.filter((i) => i.status === "unavailable");
  for (const u of unavailable.slice(0, 2)) out.push(`${u.label} - ${u.detail}`);

  return out.length ? out : ["No strong signals either way."];
}

function rank(s: string): number {
  return { danger: 0, caution: 1, reassuring: 2, unavailable: 3 }[s] ?? 4;
}

function buildAdvice(
  verdict: Decision["verdict"],
  ask: ExtractedAsk,
  defence: DefenceResult | null
): string {
  if (verdict === "STOP") {
    const base =
      "Do not reply, do not call back, and block the sender. If you have already paid, call 1930 (National Cyber Crime Helpline) immediately - money reported within the first hour is often frozen before it is withdrawn. You can also report at cybercrime.gov.in.";
    return ask.isolation_requested
      ? `${base} This message told you not to tell anyone. Tell someone.`
      : base;
  }
  if (verdict === "VERIFY") {
    return (
      defence?.decisive_check ??
      "Contact the organisation directly using a number or app you already have - never the contact details inside the message."
    );
  }
  return "Open the organisation's own app or type their website address yourself rather than tapping the link. Same result, no risk.";
}
