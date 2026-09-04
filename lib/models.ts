/**
 * Model registry.
 *
 * Every model is read from the environment, never hardcoded, because the
 * Featherless catalogue changes and a model that exists today may be gone
 * tomorrow. `npm run health` probes each configured id and tells you which
 * ones actually answer, so the roster is verified rather than assumed.
 *
 * Each role has a primary and a fallback. DEFEND is deliberately from a
 * different vendor family than REASON -- see docs/DECISIONS.md, decision #3.
 *
 * meta-llama/* ids are avoided on purpose: Featherless gates them behind a
 * linked HuggingFace licence and they return HTTP 403 without it.
 * Run `npm run models` to discover what your own account can call.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

export type ModelRole = "TRIAGE" | "REASON" | "DEFEND";

export interface RoleConfig {
  role: ModelRole;
  primary: string;
  fallback: string;
  /** Why this size/class of model is used for this job. Rendered in the UI. */
  rationale: string;
  family: string;
}

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : fallback;
}

export const ROLES: Record<ModelRole, RoleConfig> = {
  TRIAGE: {
    role: "TRIAGE",
    primary: env("MODEL_TRIAGE", "Qwen/Qwen3-8B"),
    fallback: env("MODEL_TRIAGE_FALLBACK", "google/gemma-4-E4B-it"),
    rationale:
      "Small model. Its only job is to name the action the message demands. Cheap enough to run on every message, including the ones that never need a large model.",
    family: "Qwen",
  },
  REASON: {
    role: "REASON",
    primary: env("MODEL_REASON", "deepseek-ai/DeepSeek-V4-Flash"),
    fallback: env("MODEL_REASON_FALLBACK", "Qwen/Qwen3.8-27B"),
    rationale:
      "Reasoning model. Weighs the extracted ask against the deterministic evidence and argues that the message is fraudulent.",
    family: "DeepSeek",
  },
  DEFEND: {
    role: "DEFEND",
    primary: env("MODEL_DEFEND", "zai-org/GLM-5.3"),
    fallback: env("MODEL_DEFEND_FALLBACK", "google/gemma-4-31B-it"),
    rationale:
      "Different vendor family from REASON, on purpose. Its only job is to argue the message is legitimate. Models from one lineage share failure modes and agree with each other's mistakes.",
    family: "Zhipu (GLM)",
  },
};

export const CONFIDENCE_THRESHOLD = Number(
  env("CONFIDENCE_THRESHOLD", "0.60")
);

export function allConfiguredModels(): { role: ModelRole; id: string; tier: "primary" | "fallback" }[] {
  return Object.values(ROLES).flatMap((r) => [
    { role: r.role, id: r.primary, tier: "primary" as const },
    { role: r.role, id: r.fallback, tier: "fallback" as const },
  ]);
}
