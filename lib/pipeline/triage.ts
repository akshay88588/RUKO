/**
 * Stage 1 - TRIAGE (small model).
 *
 * One job: name the action the message demands. Not "is this a scam" --
 * that question is answered later, with evidence. A message that asks for
 * nothing cannot defraud you, and that is what lets us resolve a large
 * share of traffic without ever waking a large model.
 */

import { callRole, parseJson } from "../featherless";
import type { ExtractedAsk } from "../types";
import type { CallResult } from "../featherless";

const SYSTEM = `You extract the demand from a message. You do not judge whether it is a scam.

Return ONLY a JSON object with exactly these keys:
{
  "action": one of "send_money" | "share_otp_or_credential" | "click_link" | "install_app" | "call_number" | "join_group" | "share_documents" | "none",
  "amount_inr": number or null,
  "claimed_identity": string or null,
  "demand_quote": string or null,
  "pressure_quote": string or null,
  "isolation_requested": true or false
}

Rules:
- "action" is the single most consequential thing the reader is asked to DO.
- If the message only informs and asks nothing, action is "none".
- A message telling the reader to block a card or ignore something is "none" - it extracts nothing from them.
- demand_quote and pressure_quote MUST be copied word for word from the message. If absent, use null.
- isolation_requested is true only if the message discourages telling family, friends, police or bank staff.
- Output the JSON object and nothing else.`;

export async function triage(message: string): Promise<{ ask: ExtractedAsk; call: CallResult }> {
  const call = await callRole(
    "TRIAGE",
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: message },
    ],
    { temperature: 0, maxTokens: 400, jsonMode: true }
  );

  const raw = parseJson<Partial<ExtractedAsk>>(call.content);

  const validActions = [
    "send_money", "share_otp_or_credential", "click_link", "install_app",
    "call_number", "join_group", "share_documents", "none",
  ];

  const ask: ExtractedAsk = {
    action: validActions.includes(raw.action as string) ? (raw.action as ExtractedAsk["action"]) : "none",
    amount_inr: typeof raw.amount_inr === "number" ? raw.amount_inr : null,
    claimed_identity: typeof raw.claimed_identity === "string" ? raw.claimed_identity : null,
    demand_quote: typeof raw.demand_quote === "string" ? raw.demand_quote : null,
    pressure_quote: typeof raw.pressure_quote === "string" ? raw.pressure_quote : null,
    isolation_requested: raw.isolation_requested === true,
  };

  return { ask, call };
}
