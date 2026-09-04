/**
 * Stage 3 - PROSECUTION (reasoning model).
 *
 * Given the extracted demand and the deterministic evidence, argue that the
 * message is fraudulent. This model is told the evidence rather than asked
 * to imagine it, so it reasons over facts instead of vibes.
 */

import { callRoleJson } from "../featherless";
import type { CallResult } from "../featherless";
import type { EvidenceReport, ExtractedAsk, ProsecutionResult } from "../types";

const SYSTEM = `You are a fraud analyst in India. You are shown a message, the demand extracted from it, and verified technical evidence gathered by deterministic code.

Argue whether this message is fraudulent. Reason from the evidence you were given. Do not invent facts about domains, phone numbers or companies.

Return ONLY a JSON object:
{
  "fraudulent": true or false,
  "confidence": number between 0 and 1,
  "tactics": array of short strings naming the manipulation used (e.g. "fake authority", "artificial deadline", "isolation", "fear of arrest", "greed", "impersonation"),
  "what_they_want": one plain sentence naming what the sender is actually trying to obtain,
  "reasoning": 2-4 sentences citing the specific evidence items that drove your conclusion
}

Calibration:
- confidence above 0.8 requires concrete evidence, not just tone.
- A message that is alarming but demands nothing extractable is usually NOT fraud.
- Evidence marked "unavailable" must not be treated as either good or bad news.
- Write for a frightened person, in plain English. No jargon.`;

export async function prosecute(
  message: string,
  ask: ExtractedAsk,
  evidence: EvidenceReport
): Promise<{ result: ProsecutionResult; call: CallResult }> {
  const evidenceBlock = evidence.items.length
    ? evidence.items.map((i) => `- [${i.status.toUpperCase()}] ${i.label}: ${i.detail}`).join("\n")
    : "- (no technical signals found)";

  const { data: raw, call } = await callRoleJson<Partial<ProsecutionResult>>(
    "REASON",
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `MESSAGE:
"""
${message}
"""

EXTRACTED DEMAND:
${JSON.stringify(ask, null, 2)}

VERIFIED EVIDENCE (gathered by code, not by a model):
${evidenceBlock}`,
      },
    ],
    { temperature: 0.2, maxTokens: 1600 }
  );

  const result: ProsecutionResult = {
    fraudulent: raw.fraudulent === true,
    confidence: clamp01(typeof raw.confidence === "number" ? raw.confidence : 0.5),
    tactics: Array.isArray(raw.tactics) ? raw.tactics.filter((t) => typeof t === "string").slice(0, 6) : [],
    what_they_want: typeof raw.what_they_want === "string" ? raw.what_they_want : "Unclear.",
    reasoning: typeof raw.reasoning === "string" ? raw.reasoning : "",
  };
  return { result, call };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
