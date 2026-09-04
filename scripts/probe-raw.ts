/**
 * Raw response probe.  Run: npm run probe
 *
 * Prints the untouched response from the TRIAGE model for the real triage
 * prompt: finish_reason, token usage, whether a <think> block came back, and
 * the first 800 characters of content. Use this when a stage fails to parse -
 * it tells you whether the model is thinking, truncating, or refusing,
 * instead of leaving you to guess.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { ROLES } from "../lib/models";

const BASE_URL = process.env.FEATHERLESS_BASE_URL?.trim() || "https://api.featherless.ai/v1";

const SAMPLE = `Dear Customer, your parcel from FedEx containing 400g MDMA has been seized by Mumbai Customs. Case No. MUM/NCB/2026/8841. Contact Officer Rajesh Sharma immediately on 9876543210 or an arrest warrant will be issued within 4 hours. Do not discuss this with family as this is a confidential investigation.`;

const SYSTEM = `You extract the demand from a message. Return ONLY a JSON object with keys: action, amount_inr, claimed_identity, demand_quote, pressure_quote, isolation_requested. Output the JSON object and nothing else.`;

async function probe(model: string, noThink: boolean) {
  const user = noThink ? `${SAMPLE}\n\n/no_think` : SAMPLE;
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FEATHERLESS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      temperature: 0,
      max_tokens: 1200,
      response_format: { type: "json_object" },
    }),
  });

  console.log(`\n─── ${model}   ${noThink ? "(with /no_think)" : "(plain)"}`);
  console.log(`HTTP ${res.status}`);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { console.log("body:", text.slice(0, 600)); return; }

  if (json.error) { console.log("error:", JSON.stringify(json.error).slice(0, 400)); return; }

  const choice = json?.choices?.[0];
  const content: string = choice?.message?.content ?? "";
  const reasoning: string = choice?.message?.reasoning_content ?? "";

  console.log("finish_reason :", choice?.finish_reason);
  console.log("usage         :", JSON.stringify(json?.usage));
  console.log("content length:", content.length);
  console.log("has <think>   :", /<think>/i.test(content) || /<think>/i.test(reasoning));
  console.log("reasoning_content length:", reasoning.length);
  console.log("--- content (first 800) ---");
  console.log(content.slice(0, 800) || "(EMPTY)");
  if (!content.trim() && reasoning) {
    console.log("--- reasoning_content (first 400) ---");
    console.log(reasoning.slice(0, 400));
  }
}

async function main() {
  if (!process.env.FEATHERLESS_API_KEY) {
    console.error("FEATHERLESS_API_KEY not set. Check .env.local");
    process.exit(1);
  }
  for (const model of [ROLES.TRIAGE.primary, ROLES.TRIAGE.fallback]) {
    await probe(model, false);
    await probe(model, true);
  }
  console.log("\nIf content is EMPTY with finish_reason=length, the model is a thinking");
  console.log("model that ran out of budget. If /no_think fixes it, keep DISABLE_THINKING=true.");
  console.log("If neither works, swap MODEL_TRIAGE in .env.local for a non-thinking instruct model.\n");
}
main().catch((e) => { console.error(e); process.exit(1); });
