/**
 * Model discovery.  Run: npm run models
 *
 * Featherless serves thousands of models, some are gated behind a linked
 * HuggingFace licence (every meta-llama/* id is), and the catalogue moves.
 * Rather than guessing ids, this probes a candidate list with your own key
 * and prints a roster your account can actually call.
 *
 * It enforces one rule that matters: DEFEND must come from a different
 * vendor family than REASON. That separation is the safety argument of the
 * whole system - see docs/DECISIONS.md #3.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

const BASE_URL = process.env.FEATHERLESS_BASE_URL?.trim() || "https://api.featherless.ai/v1";
const KEY = process.env.FEATHERLESS_API_KEY;

/** Vendor family, derived from the HuggingFace org prefix. */
function family(id: string): string {
  return id.split("/")[0].toLowerCase();
}

/** Candidates per role, best first. meta-llama is excluded: gated by default. */
const CANDIDATES: Record<"TRIAGE" | "REASON" | "DEFEND", string[]> = {
  TRIAGE: [
    "Qwen/Qwen3-8B",
    "Qwen/Qwen3.5-4B",
    "google/gemma-4-E4B-it",
    "Qwen/Qwen2.5-7B-Instruct",
    "mistralai/Mistral-7B-Instruct-v0.3",
    "google/gemma-3-1b-it",
    "Qwen/Qwen3-0.6B",
    "Qwen/Qwen2.5-0.5B-Instruct",
  ],
  REASON: [
    "deepseek-ai/DeepSeek-V4-Flash",
    "deepseek-ai/DeepSeek-V4-Flash-0731",
    "zai-org/GLM-5.3",
    "zai-org/GLM-5.2",
    "openai/gpt-oss-120b",
    "Qwen/Qwen3.8-27B",
    "Qwen/Qwen3.6-35B-A3B",
    "google/gemma-4-31B-it",
  ],
  DEFEND: [
    "zai-org/GLM-5.3",
    "google/gemma-4-31B-it",
    "openai/gpt-oss-120b",
    "moonshotai/Kimi-K3",
    "Qwen/Qwen3.8-27B",
    "zai-org/GLM-5.2",
    "deepseek-ai/DeepSeek-V4-Flash",
    "google/gemma-4-26B-A4B-it",
  ],
};

async function probe(model: string): Promise<{ ok: boolean; ms: number; why?: string }> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: 'Reply with exactly: {"ok":true}\n\n/no_think' }],
        temperature: 0,
        max_tokens: 300,
      }),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let why = `HTTP ${res.status}`;
      if (res.status === 403 && /gated/i.test(body)) why = "GATED (needs a linked HuggingFace licence)";
      else if (res.status === 404) why = "not found on this account";
      else if (body) why = `HTTP ${res.status} ${body.slice(0, 90)}`;
      return { ok: false, ms, why };
    }
    const j: any = await res.json();
    const c = j?.choices?.[0];
    const text: string = c?.message?.content ?? c?.message?.reasoning_content ?? "";
    if (!text.trim()) return { ok: false, ms, why: `empty content (finish_reason=${c?.finish_reason})` };
    return { ok: true, ms };
  } catch (e: any) {
    return { ok: false, ms: Date.now() - t0, why: e?.message ?? String(e) };
  }
}

async function main() {
  if (!KEY) {
    console.error("\n  FEATHERLESS_API_KEY not set. Check .env.local\n");
    process.exit(1);
  }

  console.log("\n  RUKO — finding models your account can call");
  console.log("  (meta-llama/* is excluded: gated behind a HuggingFace licence)\n");

  const working: Record<string, string[]> = { TRIAGE: [], REASON: [], DEFEND: [] };
  const seen = new Map<string, boolean>();

  for (const role of ["TRIAGE", "REASON", "DEFEND"] as const) {
    console.log(`  ${role}`);
    for (const id of CANDIDATES[role]) {
      if (working[role].length >= 2) break;
      if (seen.has(id)) {
        if (seen.get(id)) { working[role].push(id); console.log(`    ${id.padEnd(40)} OK (cached)`); }
        continue;
      }
      process.stdout.write(`    ${id.padEnd(40)} `);
      const r = await probe(id);
      seen.set(id, r.ok);
      if (r.ok) { console.log(`OK   ${r.ms}ms`); working[role].push(id); }
      else console.log(`--   ${r.why}`);
    }
    console.log("");
  }

  // DEFEND must not share a family with REASON.
  const reasonFamily = working.REASON[0] ? family(working.REASON[0]) : "";
  const defendPool = working.DEFEND.filter((m) => family(m) !== reasonFamily);
  if (defendPool.length === 0 && working.DEFEND.length > 0) {
    console.log("  WARNING: every working DEFEND candidate shares a family with REASON.");
    console.log("  The adversarial check is much weaker this way. Try more candidates.\n");
  }
  const defend = defendPool.length ? defendPool : working.DEFEND;

  const missing = (["TRIAGE", "REASON"] as const).filter((r) => working[r].length === 0);
  if (missing.length || defend.length === 0) {
    console.log(`  No working model found for: ${[...missing, ...(defend.length ? [] : ["DEFEND"])].join(", ")}`);
    console.log("  Open https://featherless.ai/models, pick ids, and add them to the");
    console.log("  CANDIDATES list at the top of scripts/find-models.ts, then re-run.\n");
    process.exit(1);
  }

  const line = (k: string, v?: string) => (v ? `${k}=${v}` : `# ${k}= (no second option found)`);
  const block = [
    line("MODEL_TRIAGE", working.TRIAGE[0]),
    line("MODEL_TRIAGE_FALLBACK", working.TRIAGE[1] ?? working.TRIAGE[0]),
    line("MODEL_REASON", working.REASON[0]),
    line("MODEL_REASON_FALLBACK", working.REASON[1] ?? working.REASON[0]),
    line("MODEL_DEFEND", defend[0]),
    line("MODEL_DEFEND_FALLBACK", defend[1] ?? defend[0]),
  ].join("\n");

  console.log("  ─────────────────────────────────────────────────────");
  console.log("  Paste this into .env.local, replacing the MODEL_ lines:\n");
  console.log(block.split("\n").map((l) => "  " + l).join("\n"));
  console.log("\n  ─────────────────────────────────────────────────────");
  console.log(`  Families in use — REASON: ${family(working.REASON[0])}   DEFEND: ${family(defend[0])}`);
  console.log(family(working.REASON[0]) === family(defend[0])
    ? "  ^ SAME FAMILY. Fix this before you demo; it undermines your main claim."
    : "  ^ Different families. This is what makes the adversarial check meaningful.");
  console.log("\n  Then restart the dev server (env changes do not hot-reload).\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
