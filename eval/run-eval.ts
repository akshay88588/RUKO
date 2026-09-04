/**
 * Evaluation harness.  Run: npm run eval
 *
 * Reports two numbers that matter and are usually reported as one:
 *
 *   DETECTION     - of the scams, how many did we stop?
 *   FALSE ALARMS  - of the genuine messages, how many did we wrongly stop?
 *
 * The second number is the one that decides whether a tool like this is
 * usable. A filter that blocks real bank alerts gets switched off, and then
 * its detection rate is irrelevant.
 *
 * VERIFY is counted separately from both. It is the system refusing to call
 * it, which is a legitimate outcome, not a hidden failure.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { analyseOnce } from "../lib/pipeline";

interface Case { id: string; label: "scam" | "genuine"; kind: string; text: string }

async function main() {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "eval/dataset.json"), "utf8"));
  const cases: Case[] = raw.cases;

  console.log(`\n  Running ${cases.length} cases…\n`);

  const rows: any[] = [];
  for (const c of cases) {
    process.stdout.write(`  ${c.id} ${c.label.padEnd(8)} ${c.kind.padEnd(20)}`);
    try {
      const r = await analyseOnce(c.text);
      const correct =
        (c.label === "scam" && r.decision.verdict === "STOP") ||
        (c.label === "genuine" && r.decision.verdict === "SAFE");
      rows.push({
        id: c.id, label: c.label, kind: c.kind,
        verdict: r.decision.verdict,
        confidence: r.decision.confidence,
        escalated: r.escalatedToLargeModel,
        disagreement: r.decision.disagreement,
        latencyMs: r.totalLatencyMs,
        correct,
      });
      console.log(`${r.decision.verdict.padEnd(7)} ${(r.decision.confidence * 100).toFixed(0)}%  ${r.totalLatencyMs}ms ${correct ? "" : "  <-- MISS"}`);
    } catch (err: any) {
      rows.push({ id: c.id, label: c.label, kind: c.kind, verdict: "ERROR", error: err?.message });
      console.log(`ERROR  ${err?.message}`);
    }
  }

  const scams = rows.filter((r) => r.label === "scam");
  const genuine = rows.filter((r) => r.label === "genuine");

  const stopped = scams.filter((r) => r.verdict === "STOP").length;
  const scamVerify = scams.filter((r) => r.verdict === "VERIFY").length;
  const scamMissed = scams.filter((r) => r.verdict === "SAFE").length;

  const falseAlarms = genuine.filter((r) => r.verdict === "STOP").length;
  const genuineVerify = genuine.filter((r) => r.verdict === "VERIFY").length;
  const cleared = genuine.filter((r) => r.verdict === "SAFE").length;

  const ok = rows.filter((r) => r.verdict !== "ERROR");
  const smallModelOnly = ok.filter((r) => !r.escalated).length;
  const avgLatency = ok.length ? Math.round(ok.reduce((s, r) => s + (r.latencyMs ?? 0), 0) / ok.length) : 0;
  const disagreements = ok.filter((r) => r.disagreement).length;

  const md = `# Evaluation results

Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ${cases.length} messages

## The two numbers that matter

| | Stopped | Asked to verify | Cleared |
|---|---|---|---|
| **Scam messages (${scams.length})** | **${stopped}** | ${scamVerify} | ${scamMissed} ${scamMissed ? "← missed" : ""} |
| **Genuine messages (${genuine.length})** | **${falseAlarms}** ${falseAlarms === 0 ? "← no false alarms" : "← false alarms"} | ${genuineVerify} | ${cleared} |

- Detection rate (scams stopped): **${scams.length ? ((stopped / scams.length) * 100).toFixed(0) : 0}%**
- False alarm rate (genuine wrongly stopped): **${genuine.length ? ((falseAlarms / genuine.length) * 100).toFixed(0) : 0}%**

## Routing

- Resolved on the small model alone, no large model used: **${smallModelOnly}/${ok.length}**
- Average end-to-end latency: **${avgLatency}ms**
- Cases where the two models disagreed: **${disagreements}**

## Per-case

| id | expected | verdict | confidence | escalated | latency |
|---|---|---|---|---|---|
${rows.map((r) => `| ${r.id} | ${r.label} | ${r.verdict} | ${r.confidence !== undefined ? (r.confidence * 100).toFixed(0) + "%" : "-"} | ${r.escalated ? "yes" : "no"} | ${r.latencyMs ?? "-"}ms |`).join("\n")}
`;

  mkdirSync(join(process.cwd(), "eval/results"), { recursive: true });
  writeFileSync(join(process.cwd(), "eval/results/RESULTS.md"), md);
  writeFileSync(join(process.cwd(), "eval/results/raw.json"), JSON.stringify(rows, null, 2));

  console.log(`\n  Detection ${stopped}/${scams.length}   False alarms ${falseAlarms}/${genuine.length}`);
  console.log(`  Small model only: ${smallModelOnly}/${ok.length}   Avg ${avgLatency}ms`);
  console.log(`\n  Written to eval/results/RESULTS.md — paste that table into the README.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
