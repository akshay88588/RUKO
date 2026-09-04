/**
 * Orchestrator.
 *
 * Emits an event per stage so the UI can show the system thinking instead of
 * a spinner. The routing decision at line "escalated" is the consequential
 * one: a message that demands nothing and trips no deterministic danger
 * signal never reaches a large model.
 */

import { gatherEvidence } from "../evidence";
import { ROLES } from "../models";
import type { AnalysisResult, ModelTrace } from "../types";
import { triage } from "./triage";
import { prosecute } from "./prosecute";
import { defend } from "./defend";
import { decide } from "./decide";
import type { CallResult } from "../featherless";

export type PipelineEvent =
  | { type: "stage"; stage: string; label: string }
  | { type: "ask"; data: any }
  | { type: "evidence"; data: any }
  | { type: "routing"; escalated: boolean; reason: string }
  | { type: "prosecution"; data: any }
  | { type: "defence"; data: any }
  | { type: "trace"; data: ModelTrace }
  | { type: "done"; data: AnalysisResult }
  | { type: "error"; message: string };

function toTrace(call: CallResult): ModelTrace {
  return {
    role: call.role,
    modelUsed: call.modelUsed,
    latencyMs: call.latencyMs,
    promptTokens: call.promptTokens,
    completionTokens: call.completionTokens,
    usedFallback: call.usedFallback,
    primaryError: call.primaryError,
    rationale: ROLES[call.role].rationale,
  };
}

export async function* analyse(message: string): AsyncGenerator<PipelineEvent> {
  const started = Date.now();
  const trace: ModelTrace[] = [];

  try {
    /* ---- 1. what is this message asking for? ---- */
    yield { type: "stage", stage: "triage", label: "Reading what the message wants" };
    const { ask, call: triageCall } = await triage(message);
    trace.push(toTrace(triageCall));
    yield { type: "trace", data: trace[trace.length - 1] };
    yield { type: "ask", data: ask };

    /* ---- 2. check its claims against reality ---- */
    yield { type: "stage", stage: "evidence", label: "Checking its claims against reality" };
    const evidence = await gatherEvidence(message);
    yield { type: "evidence", data: evidence };

    /* ---- 3. the routing decision ---- */
    const dangerous = evidence.items.some((i) => i.status === "danger");
    const suspicious = evidence.items.some((i) => i.status === "caution");
    const demandsSomething = ask.action !== "none";
    const escalated = demandsSomething || dangerous || suspicious || ask.isolation_requested;

    yield {
      type: "routing",
      escalated,
      reason: escalated
        ? `Escalating to ${ROLES.REASON.primary}: ${[
            demandsSomething ? `the message demands "${ask.action}"` : null,
            dangerous ? "deterministic danger evidence was found" : null,
            suspicious && !dangerous ? "suspicious technical signals were found" : null,
            ask.isolation_requested ? "the message discourages telling anyone" : null,
          ]
            .filter(Boolean)
            .join("; ")}.`
        : `Resolved on ${ROLES.TRIAGE.primary} alone in ${triageCall.latencyMs}ms. The message demands nothing and no danger signal fired, so no large model was used.`,
    };

    if (!escalated) {
      const decision = decide(ask, evidence, { fraudulent: false, confidence: 0.9, tactics: [], reasoning: "", what_they_want: "" }, null, false);
      yield {
        type: "done",
        data: { ask, evidence, prosecution: { fraudulent: false, confidence: 0.9, tactics: [], reasoning: "", what_they_want: "Nothing." }, defence: null, decision, trace, totalLatencyMs: Date.now() - started, escalatedToLargeModel: false },
      };
      return;
    }

    /* ---- 4. prosecution ---- */
    yield { type: "stage", stage: "prosecute", label: "Arguing that this is fraud" };
    const { result: prosecution, call: prosCall } = await prosecute(message, ask, evidence);
    trace.push(toTrace(prosCall));
    yield { type: "trace", data: trace[trace.length - 1] };
    yield { type: "prosecution", data: prosecution };

    /* ---- 5. defence, from a different model family ---- */
    yield { type: "stage", stage: "defend", label: "Arguing that this is legitimate" };
    const { result: defence, call: defCall } = await defend(message, ask, evidence, prosecution.reasoning);
    trace.push(toTrace(defCall));
    yield { type: "trace", data: trace[trace.length - 1] };
    yield { type: "defence", data: defence };

    /* ---- 6. verdict ---- */
    yield { type: "stage", stage: "decide", label: "Weighing both arguments" };
    const decision = decide(ask, evidence, prosecution, defence, true);

    yield {
      type: "done",
      data: { ask, evidence, prosecution, defence, decision, trace, totalLatencyMs: Date.now() - started, escalatedToLargeModel: true },
    };
  } catch (err: any) {
    yield { type: "error", message: err?.message ?? String(err) };
  }
}

/** Non-streaming variant, used by the eval harness. */
export async function analyseOnce(message: string): Promise<AnalysisResult> {
  for await (const ev of analyse(message)) {
    if (ev.type === "done") return ev.data;
    if (ev.type === "error") throw new Error(ev.message);
  }
  throw new Error("Pipeline finished without producing a result");
}
