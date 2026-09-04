"use client";

import type { EvidenceReport } from "@/lib/types";

const TONE = {
  danger: { dot: "bg-stop", label: "text-stop" },
  caution: { dot: "bg-verify", label: "text-verify" },
  reassuring: { dot: "bg-safe", label: "text-safe" },
  unavailable: { dot: "bg-muted", label: "text-muted" },
} as const;

export function EvidencePanel({ evidence }: { evidence: EvidenceReport }) {
  if (!evidence.items.length) return null;

  return (
    <section className="rise rounded-xl border border-edge bg-panel p-4">
      <header className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold">Evidence</h3>
        <span className="font-mono text-[11px] text-muted">
          {evidence.items.filter((i) => i.deterministic).length} verified by code ·{" "}
          {evidence.networkChecksSucceeded}/{evidence.networkChecksAttempted} network checks
        </span>
      </header>

      <ul className="mt-3 space-y-3">
        {evidence.items.map((item) => {
          const t = TONE[item.status];
          return (
            <li key={item.id} className="flex gap-2.5">
              <span className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium">{item.label}</span>
                  <span
                    className="rounded border border-edge px-1.5 py-px font-mono text-[10px] text-muted"
                    title={
                      item.deterministic
                        ? "Produced by local deterministic code. Cannot fail."
                        : "Depended on a live network lookup."
                    }
                  >
                    {item.deterministic ? "code" : "network"}
                  </span>
                </div>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#9DA6B2]">{item.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
