/**
 * Stage 4 - DEFENCE (different vendor family, on purpose).
 *
 * This model is given one job: argue that the message is legitimate.
 *
 * It exists because the expensive failure of a scam detector is not the
 * scam it misses, it is the real bank alert it blocks. After a few false
 * alarms people stop reading the warnings, and then the tool is worse than
 * nothing.
 *
 * It must come from a different training lineage than the prosecution
 * model. Two models from one family share failure modes and will cheerfully
 * agree with each other's mistakes. See docs/DECISIONS.md #3.
 */

import { callRole, parseJson } from "../featherless";
import type { CallResult } from "../featherless";
import type { DefenceResult, EvidenceReport, ExtractedAsk } from "../types";

const SYSTEM = `You are the defence. Another model has argued this message is a scam. Your job is to argue the opposite as strongly as the facts allow.

Make the strongest honest case that this message is legitimate. Do not fabricate. If the evidence genuinely rules out legitimacy, say so plainly - a weak honest defence is more useful than a strong dishonest one.

Return ONLY a JSON object:
{
  "can_be_legitimate": true or false,
  "strength": number between 0 and 1 - how strong your case actually is,
  "argument": 2-4 sentences making the case,
  "decisive_check": one specific action the reader can take to settle it for certain, or null
}

Things that legitimately look alarming:
- Real fraud alerts from banks are urgent and mention large amounts by design.
- Real OTP messages warn you not to share the OTP.
- Real delivery and government notices contain reference numbers and deadlines.
- A message asking you to BLOCK something or IGNORE something extracts nothing from you.

Things you cannot argue around:
- A domain that imitates a real brand it does not own.
- A demand to install an app from outside the Play Store.
- A request to keep the matter secret from family or police.
- An official body contacting a citizen from a personal 10-digit mobile.`;

export async function defend(
  message: string,
  ask: ExtractedAsk,
  evidence: EvidenceReport,
  prosecutionReasoning: string
): Promise<{ result: DefenceResult; call: CallResult }> {
  const evidenceBlock = evidence.items.length
    ? evidence.items.map((i) => `- [${i.status.toUpperCase()}] ${i.label}: ${i.detail}`).join("\n")
    : "- (no technical signals found)";

  const call = await callRole(
    "DEFEND",
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

VERIFIED EVIDENCE:
${evidenceBlock}

THE PROSECUTION ARGUED:
${prosecutionReasoning}

Now argue for legitimacy.`,
      },
    ],
    { temperature: 0.3, maxTokens: 600, jsonMode: true }
  );

  const raw = parseJson<Partial<DefenceResult>>(call.content);

  const result: DefenceResult = {
    can_be_legitimate: raw.can_be_legitimate === true,
    strength: Math.max(0, Math.min(1, typeof raw.strength === "number" ? raw.strength : 0)),
    argument: typeof raw.argument === "string" ? raw.argument : "",
    decisive_check: typeof raw.decisive_check === "string" ? raw.decisive_check : null,
  };
  return { result, call };
}
