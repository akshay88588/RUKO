"use client";

import { useRef, useState } from "react";
import { ExampleChips } from "@/components/Examples";
import { VerdictCard } from "@/components/VerdictCard";
import { EvidencePanel } from "@/components/EvidencePanel";
import { ModelRouter } from "@/components/ModelRouter";
import { PipelineTrace } from "@/components/PipelineTrace";
import type { AnalysisResult, Decision, EvidenceReport, ModelTrace } from "@/lib/types";

const STAGE_ORDER = ["triage", "evidence", "prosecute", "defend", "decide"];

export default function Home() {
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stage, setStage] = useState<string | null>(null);
  const [completed, setCompleted] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [trace, setTrace] = useState<ModelTrace[]>([]);
  const [routing, setRouting] = useState<{ escalated: boolean; reason: string } | null>(null);
  const [evidence, setEvidence] = useState<EvidenceReport | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  function reset() {
    setStage(null); setCompleted([]); setSkipped([]); setTrace([]);
    setRouting(null); setEvidence(null); setDecision(null); setResult(null); setError(null);
  }

  async function run(text?: string) {
    const input = (text ?? message).trim();
    if (!input || running) return;
    if (text) setMessage(text);

    reset();
    setRunning(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Request failed (HTTP ${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let ev: any;
          try { ev = JSON.parse(line.slice(6)); } catch { continue; }

          switch (ev.type) {
            case "stage": {
              // Every stage before this one is finished. Whether a stage was
              // skipped is tracked separately and wins when rendering, so we
              // must not read `skipped` from the render scope here.
              const idx = STAGE_ORDER.indexOf(ev.stage);
              setStage(ev.stage);
              setCompleted(STAGE_ORDER.slice(0, Math.max(0, idx)));
              break;
            }
            case "trace":
              setTrace((t) => [...t, ev.data]);
              break;
            case "evidence":
              setEvidence(ev.data);
              break;
            case "routing":
              setRouting({ escalated: ev.escalated, reason: ev.reason });
              if (!ev.escalated) setSkipped(["prosecute", "defend"]);
              break;
            case "done":
              setResult(ev.data);
              setDecision(ev.data.decision);
              setEvidence(ev.data.evidence);
              setStage(null);
              setCompleted(STAGE_ORDER);
              break;
            case "error":
              setError(ev.message);
              setStage(null);
              break;
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") setError(err?.message ?? String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <header className="mb-8">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-verify" />
          <span className="font-mono text-[12px] tracking-[0.22em] text-muted">RUKO</span>
          <span className="text-[12px] text-[#4A525E]">रुको · wait</span>
        </div>
        <h1 className="mt-3 max-w-2xl text-[28px] font-semibold leading-[1.2] sm:text-[34px]">
          Should you act on a message that is asking you for money?
        </h1>
        <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-[#9DA6B2]">
          RUKO is not a spam filter. It extracts what a message wants you to do, tests that story
          against live evidence, and then a second model from a different family argues the message
          is legitimate. If that defence wins, we do not raise an alarm.{" "}
          <span className="text-[#C8CFD8]">
            The hard problem is not catching scams. It is not blocking the real bank alert.
          </span>
        </p>
        <p className="mt-3 font-mono text-[12px] text-muted">
          India lost ₹22,495 crore to cyber fraud in 2025 across 28.15 lakh reported cases — about ₹61 crore a day.
        </p>
      </header>

      <section className="rounded-xl border border-edge bg-panel p-4">
        <label htmlFor="msg" className="text-[13px] font-medium">
          Paste the message
        </label>
        <textarea
          id="msg"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(); }}
          rows={5}
          placeholder="Paste an SMS, WhatsApp message or email here…"
          className="mt-2 w-full resize-y rounded-lg border border-edge bg-black/30 p-3 text-[14px] leading-relaxed outline-none placeholder:text-[#4A525E] focus:border-[#39424F]"
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => run()}
            disabled={running || !message.trim()}
            className="rounded-lg bg-[#E7EAEE] px-4 py-2 text-[13.5px] font-semibold text-ink transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            {running ? "Analysing…" : "Analyse"}
          </button>
          <span className="font-mono text-[11px] text-muted">Ctrl/⌘ + Enter</span>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-[11px] font-semibold tracking-wide text-muted">OR TRY ONE</div>
          <ExampleChips onPick={(t) => run(t)} disabled={running} />
        </div>
      </section>

      {(running || decision || error) && (
        <section className="mt-4 rounded-xl border border-edge bg-panel p-4">
          <h3 className="mb-3 text-[13px] font-semibold">Pipeline</h3>
          <PipelineTrace current={stage} completed={completed} skipped={skipped} />
        </section>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-stop/50 bg-stop/10 p-4">
          <div className="text-[12px] font-semibold tracking-wide text-stop">SOMETHING BROKE</div>
          <p className="mt-1 text-[13px] leading-relaxed text-[#C8CFD8]">{error}</p>
          <p className="mt-2 text-[12px] text-muted">
            Check <code className="font-mono">/api/health</code> to see which models are responding.
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-4">
          {decision && <VerdictCard decision={decision} />}
          {evidence && <EvidencePanel evidence={evidence} />}
        </div>
        <div className="space-y-4">
          <ModelRouter trace={trace} routing={routing} totalLatencyMs={result?.totalLatencyMs ?? null} />
          {result?.prosecution && result.escalatedToLargeModel && (
            <section className="rise rounded-xl border border-edge bg-panel p-4">
              <h3 className="text-[13px] font-semibold">Both arguments</h3>
              <div className="mt-3 space-y-3">
                <div className="rounded-lg border border-edge bg-black/25 p-3">
                  <div className="text-[11px] font-semibold tracking-wide text-stop">PROSECUTION</div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[#C8CFD8]">
                    {result.prosecution.reasoning}
                  </p>
                  {result.prosecution.tactics.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {result.prosecution.tactics.map((t) => (
                        <span key={t} className="rounded border border-edge px-1.5 py-0.5 text-[11px] text-muted">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {result.defence && (
                  <div className="rounded-lg border border-edge bg-black/25 p-3">
                    <div className="text-[11px] font-semibold tracking-wide text-safe">
                      DEFENCE · strength {(result.defence.strength * 100).toFixed(0)}%
                    </div>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[#C8CFD8]">
                      {result.defence.argument}
                    </p>
                    {result.defence.decisive_check && (
                      <p className="mt-2 text-[12px] text-muted">
                        Settle it: {result.defence.decisive_check}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      <footer className="mt-10 border-t border-edge pt-5 text-[12px] leading-relaxed text-muted">
        RUKO is a decision-support tool, not legal or financial advice. It can be wrong. If you have
        already lost money, call <span className="text-[#C8CFD8]">1930</span> or report at{" "}
        <span className="text-[#C8CFD8]">cybercrime.gov.in</span> — money reported within the first
        hour is often frozen before it is withdrawn.
      </footer>
    </main>
  );
}
