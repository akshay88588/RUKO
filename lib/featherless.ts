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
      messages,
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

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new FeatherlessError(
        `${model} returned HTTP ${res.status}: ${text.slice(0, 200)}`,
        res.status
      );
    }

    const json: any = await res.json();
    const content: string | undefined = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new FeatherlessError(`${model} returned no message content`);
    }

    return {
      content,
      promptTokens: json?.usage?.prompt_tokens ?? null,
      completionTokens: json?.usage?.completion_tokens ?? null,
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
    const out = await rawCall(cfg.fallback, messages, options);
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
export function parseJson<T>(raw: string): T {
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
    `Model did not return parseable JSON. First 200 chars: ${raw.slice(0, 200)}`
  );
}

/** Used by scripts/health.ts to check a single model id is actually alive. */
export async function probeModel(model: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const started = Date.now();
  try {
    await rawCall(
      model,
      [{ role: "user", content: "Reply with the single word: ok" }],
      { temperature: 0, maxTokens: 8, jsonMode: false }
    );
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - started, error: err?.message ?? String(err) };
  }
}
