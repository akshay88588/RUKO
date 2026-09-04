"use client";

import type { ModelTrace } from "@/lib/types";

/**
 * The router panel. This is not a debug log -- it is the argument that the
 * multi-model design is a real engineering decision, so it lives in the UI
 * where a judge can see it.
 */
export function ModelRouter({
  trace,
  routing,
  totalLatencyMs,
}: {
  trace: ModelTrace[];
  routing: { escalated: boolean; reason: string } | null;
  totalLatencyMs: number | null;
}) {
  if (!trace.length && !routing) return null;

  const totalTokens = trace.reduce(
    (sum, t) => sum + (t.promptTokens ?? 0) + (t.completionTokens ?? 0),
    0
  );

  return (
    <section className="rise rounded-xl border border-edge bg-panel p-4">
      <header className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold">Model routing</h3>
        {totalLatencyMs !== null && (
          <span className="font-mono text-[11px] text-muted">
            {(totalLatencyMs / 1000).toFixed(1)}s · {totalTokens || "?"} tokens
          </span>
        )}
      </header>

      {routing && (
        <p
          className={`mt-2 rounded-lg border p-2.5 text-[12.5px] leading-relaxed ${
            routing.escalated
              ? "border-verify/30 bg-verify/[0.06] text-[#D6C08A]"
              : "border-safe/30 bg-safe/[0.06] text-[#8FCBAA]"
          }`}
        >
          {routing.reason}
        </p>
      )}

      <ul className="mt-3 space-y-2.5">
        {trace.map((t, i) => (
          <li key={i} className="rounded-lg border border-edge bg-black/25 p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-[#1B2029] px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-[#9DA6B2]">
                {t.role}
              </span>
              <span className="font-mono text-[11.5px] text-[#C8CFD8]">{t.modelUsed}</span>
              {t.usedFallback && (
                <span
                  className="rounded border border-verify/40 px-1.5 py-px font-mono text-[10px] text-verify"
                  title={t.primaryError}
                >
                  fallback
                </span>
              )}
              <span className="ml-auto font-mono text-[11px] text-muted">{t.latencyMs}ms</span>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-[#8A93A0]">{t.rationale}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
