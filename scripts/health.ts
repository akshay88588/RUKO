/**
 * CLI model check.  Run: npm run health
 *
 * Confirms your API key works and tells you which configured model ids are
 * actually alive on Featherless right now. Run this before you demo.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { allConfiguredModels, CONFIDENCE_THRESHOLD } from "../lib/models";
import { probeModel } from "../lib/featherless";

async function main() {
  if (!process.env.FEATHERLESS_API_KEY) {
    console.error("\n  FEATHERLESS_API_KEY is not set.");
    console.error("  Copy .env.example to .env.local and put your key in it.\n");
    process.exit(1);
  }

  console.log("\n  RUKO - model health check");
  console.log("  confidence threshold:", CONFIDENCE_THRESHOLD, "\n");

  let failures = 0;
  const cache = new Map<string, { ok: boolean; latencyMs: number; error?: string }>();
  for (const m of allConfiguredModels()) {
    process.stdout.write(`  ${m.role.padEnd(8)} ${m.tier.padEnd(9)} ${m.id.padEnd(42)}`);
    let r = cache.get(m.id);
    if (!r) {
      r = await probeModel(m.id);
      if (!r.ok && r.error?.includes("429")) {
        // Featherless free plan allows 4 model switches per rolling minute
        process.stdout.write("(waiting 60s for 4-switch/min window)... ");
        await new Promise((res) => setTimeout(res, 60000));
        r = await probeModel(m.id);
      }
      cache.set(m.id, r);
    }
    if (r.ok) {
      console.log(`OK   ${r.latencyMs}ms`);
    } else {
      if (m.tier === "primary") failures++;
      console.log(`FAIL ${r.error}`);
    }
  }

  if (failures > 0) {
    console.log(`\n  ${failures} primary model(s) failed.`);
    console.log("  Pick replacements from https://featherless.ai/models and update .env.local.");
    console.log("  Nothing in the code needs to change - the roster is config.\n");
    process.exit(1);
  }
  console.log("\n  All primary models responding.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
