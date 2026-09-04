/**
 * Featherless client.
 *
 * Plain fetch against the OpenAI-compatible chat/completions endpoint.
 * No SDK on purpose: one less dependency to break, and the whole request
 * path stays readable enough to defend in a two-minute Q&A.
 *
 * Every call returns instrumentation (which model actually served it,
 * latency, tokens, whether the fallback fired) because that data is what
 * the router panel in the UI renders. It is not logging -- it is product.
 */

import { ROLES, type ModelRole } from "./models";

const BASE_URL =
  process.env.FEATHERLESS_BASE_URL?.trim() || "https://api.featherless.ai/v1";

/** Per-call ceiling.
 *
 *  Budget: Vercel's Hobby plan caps a serverless function at 60s. The
 *  pipeline makes up to three model calls plus the evidence lookups, so a
 *  generous per-call timeout would guarantee the whole request dies rather
 *  than any single call falling back. 20s is long enough for a large model
 *  under load and short enough that three of them still fit. */
const TIMEOUT_MS = Number(process.env.MODEL_TIMEOUT_MS ?? 20_000);

export interface CallResult {
  content: string;
  modelUsed: string;
  role: ModelRole;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  usedFallback: boolean;
  /** Populated when the primary failed; kept so the UI can be honest about it. */
  primaryError?: string;
}

export class FeatherlessError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "FeatherlessError";
  }
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Many current open-weight models (the Qwen3 family especially) emit a
 * <think> block before their answer. If we hand that straight to JSON.parse
 * it fails, and if the model runs out of tokens mid-thought we get an empty
 * string. Strip the block; keep whatever came after it.
 */
export function stripThinking(raw: string): string {
  const closeIdx = raw.lastIndexOf("</think>");
  if (closeIdx !== -1) return raw.slice(closeIdx + "</think>".length).trim();
  // Unclosed block: the model never finished thinking, so there is no answer.
  if (/<think>/i.test(raw)) return raw.replace(/<think>[\s\S]*$/i, "").trim();
  return raw.trim();
}

/**
 * Qwen3 and several others honour a literal "/no_think" token in the user
 * turn as a soft switch that disables the thinking block. Harmless text to
 * models that do not recognise it. Set DISABLE_THINKING=false to turn off.
 */
const DISABLE_THINKING = (process.env.DISABLE_THINKING ?? "true").toLowerCase() !== "false";

function applyNoThink(messages: ChatMessage[]): ChatMessage[] {
  if (!DISABLE_THINKING) return messages;
  const out = messages.map((m) => ({ ...m }));
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role === "user") {
      out[i].content = `${out[i].content}\n\n/no_think`;
      break;
    }
  }
  return out;
}

async function rawCall(
  model: string,
  messages: ChatMessage[],
  opts: { temperature: number; maxTokens: number; jsonMode: boolean }
): Promise<{ content: string; promptTokens: number | null; completionTokens: number | null }> {
  const apiKey = process.env.FEATHERLESS_API_KEY;
  if (!apiKey) {
    throw new FeatherlessError(
      "FEATHERLESS_API_KEY is not set. Copy .env.example to .env.local and add your key."
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body: Record<string, unknown> = {
      model,
      messages: applyNoThink(messages),
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
    };
    // Ask for JSON when the stage needs structured output. Not every model
    // honours this field, which is why parseJson() below is defensive.
    if (opts.jsonMode) body.response_format = { type: "json_object" };

    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new FeatherlessError(
        `${model} returned HTTP ${res.status}: ${text.slice(0, 200)}`,
        res.status
      );
    }

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new FeatherlessError(`${model}: Invalid JSON from API: ${text.slice(0, 200)}`);
    }

    const choice = json?.choices?.[0];
    const finishReason: string = choice?.finish_reason ?? "unknown";
    const completionTokens: number | null = json?.usage?.completion_tokens ?? null;

    // Some open-weight reasoning models return their chain of thought in a
    // separate field and leave `content` empty. Fall back to it rather than
    // treating the call as a failure.
    let content: string = typeof choice?.message?.content === "string" ? choice.message.content : "";
    if (!content.trim() && typeof choice?.message?.reasoning_content === "string") {
      content = choice.message.reasoning_content;
    }

    if (!content.trim()) {
      throw new FeatherlessError(
        `${model} returned empty content (finish_reason=${finishReason}, completion_tokens=${completionTokens}). ` +
          (finishReason === "length"
            ? "It hit the token limit before producing an answer - this is what happens when a thinking model spends its whole budget inside <think>. Raise max_tokens or disable thinking."
            : "")
      );
    }

    return {
      content,
      promptTokens: json?.usage?.prompt_tokens ?? null,
      completionTokens,
    };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new FeatherlessError(`${model} timed out after ${TIMEOUT_MS}ms`);
    }
    throw err instanceof FeatherlessError
      ? err
      : new FeatherlessError(`${model}: ${err?.message ?? String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call the model configured for a role, falling back to the secondary model
 * if the primary fails or times out. The fallback is a real product
 * behaviour, not error handling: the demo must survive one dead model.
 */
export async function callRole(
  role: ModelRole,
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number; jsonMode?: boolean }
): Promise<CallResult> {
  const cfg = ROLES[role];
  const options = {
    temperature: opts?.temperature ?? 0.2,
    maxTokens: opts?.maxTokens ?? 900,
    jsonMode: opts?.jsonMode ?? false,
  };

  const started = Date.now();
  try {
    const out = await rawCall(cfg.primary, messages, options);
    return {
      content: out.content,
      modelUsed: cfg.primary,
      role,
      latencyMs: Date.now() - started,
      promptTokens: out.promptTokens,
      completionTokens: out.completionTokens,
      usedFallback: false,
    };
  } catch (primaryErr: any) {
    const fallbackStart = Date.now();
    let out;
    try {
      out = await rawCall(cfg.fallback, messages, options);
    } catch (fallbackErr: any) {
      // Both models for this role are down. Surface BOTH errors - seeing only
      // the fallback's failure hides the reason the primary was skipped.
      throw new FeatherlessError(
        `Role ${role} has no working model.\n` +
          `  primary  ${cfg.primary}: ${primaryErr?.message ?? primaryErr}\n` +
          `  fallback ${cfg.fallback}: ${fallbackErr?.message ?? fallbackErr}\n` +
          `Run "npm run models" to find model ids your account can actually call.`
      );
    }
    return {
      content: out.content,
      modelUsed: cfg.fallback,
      role,
      latencyMs: Date.now() - fallbackStart,
      promptTokens: out.promptTokens,
      completionTokens: out.completionTokens,
      usedFallback: true,
      primaryError: primaryErr?.message ?? String(primaryErr),
    };
  }
}

/**
 * Pull JSON out of a model response.
 *
 * Open-weight models wrap JSON in prose or fences often enough that this
 * cannot be a plain JSON.parse. Order: parse as-is, strip code fences,
 * then take the outermost balanced braces. If all three fail we throw,
 * and the caller escalates rather than inventing a result.
 */
export function parseJson<T>(rawInput: string): T {
  const raw = stripThinking(rawInput);
  const attempts: string[] = [];

  attempts.push(raw.trim());

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) attempts.push(fenced[1].trim());

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last > first) attempts.push(raw.slice(first, last + 1));

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // try the next strategy
    }
  }

  throw new FeatherlessError(
    `Model did not return parseable JSON. ` +
      `Length after stripping <think>: ${raw.length}. ` +
      `First 300 chars of the raw reply: ${JSON.stringify(rawInput.slice(0, 300))}`
  );
}

/**
 * Call a role and parse JSON, with exactly one repair attempt.
 *
 * Open-weight models drop out of JSON often enough that a single retry is
 * worth the latency. The retry drops `response_format` (not every model
 * honours it) and states the requirement in the plainest possible terms.
 * If the second attempt also fails we throw, and the pipeline surfaces the
 * error rather than inventing a verdict.
 */
export async function callRoleJson<T>(
  role: ModelRole,
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number }
): Promise<{ data: T; call: CallResult }> {
  const call = await callRole(role, messages, { ...opts, jsonMode: true });
  try {
    return { data: parseJson<T>(call.content), call };
  } catch (firstErr) {
    const repair = await callRole(
      role,
      [
        ...messages,
        { role: "assistant", content: stripThinking(call.content).slice(0, 500) },
        {
          role: "user",
          content:
            "That was not valid JSON. Reply again with ONLY the JSON object. " +
            "No explanation, no markdown fences, no <think> block. Start your reply with { and end it with }.",
        },
      ],
      { ...opts, jsonMode: false, temperature: 0 }
    );
    return { data: parseJson<T>(repair.content), call: repair };
  }
}

/** Used by scripts/health.ts to check a single model id is actually alive. */
export async function probeModel(model: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const started = Date.now();
  try {
    await rawCall(
      model,
      [{ role: "user", content: "Reply with the single word: ok" }],
      { temperature: 0, maxTokens: 100, jsonMode: false }
    );
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - started, error: err?.message ?? String(err) };
  }
}
