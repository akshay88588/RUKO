"use client";

import type { Decision } from "@/lib/types";

const STYLES = {
  STOP: { ring: "border-stop/50", bg: "bg-stop/10", dot: "bg-stop", text: "text-stop", word: "STOP" },
  VERIFY: { ring: "border-verify/50", bg: "bg-verify/10", dot: "bg-verify", text: "text-verify", word: "VERIFY FIRST" },
  SAFE: { ring: "border-safe/50", bg: "bg-safe/10", dot: "bg-safe", text: "text-safe", word: "THIS IS FINE" },
} as const;

export function VerdictCard({ decision }: { decision: Decision }) {
  const s = STYLES[decision.verdict];

  return (
    <div className={`rise rounded-xl border ${s.ring} ${s.bg} p-5`}>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
        <span className={`text-[11px] font-semibold tracking-[0.14em] ${s.text}`}>{s.word}</span>
        <span className="ml-auto font-mono text-[11px] text-muted">
          confidence {(decision.confidence * 100).toFixed(0)}%
        </span>
      </div>

      <h2 className="mt-3 text-[22px] font-semibold leading-tight">{decision.headline}</h2>

      {decision.what_they_want && decision.verdict !== "SAFE" && (
        <p className="mt-2 text-[14px] text-[#B9C0CA]">
          <span className="text-muted">What they want: </span>
          {decision.what_they_want}
        </p>
      )}

      {decision.disagreement && decision.disagreement_note && (
        <div className="mt-4 rounded-lg border border-verify/40 bg-verify/[0.07] p-3">
          <div className="text-[11px] font-semibold tracking-wide text-verify">MODELS DISAGREED</div>
          <p className="mt-1 text-[13px] leading-relaxed text-[#C8CFD8]">{decision.disagreement_note}</p>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {decision.why.map((w, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-[#C8CFD8]">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted" />
            <span>{w}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-lg border border-edge bg-black/25 p-3">
        <div className="text-[11px] font-semibold tracking-wide text-muted">WHAT TO DO</div>
        <p className="mt-1 text-[13px] leading-relaxed">{decision.what_to_do}</p>
      </div>
    </div>
  );
}
