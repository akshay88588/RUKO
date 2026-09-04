"use client";

const ORDER = [
  { id: "triage", label: "Reading what the message wants" },
  { id: "evidence", label: "Checking its claims against reality" },
  { id: "prosecute", label: "Arguing that this is fraud" },
  { id: "defend", label: "Arguing that this is legitimate" },
  { id: "decide", label: "Weighing both arguments" },
];

export function PipelineTrace({
  current,
  completed,
  skipped,
}: {
  current: string | null;
  completed: string[];
  skipped: string[];
}) {
  return (
    <ol className="space-y-1.5">
      {ORDER.map((s) => {
        const isDone = completed.includes(s.id);
        const isNow = current === s.id;
        const isSkipped = skipped.includes(s.id);
        return (
          <li key={s.id} className="flex items-center gap-2.5 text-[13px]">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isSkipped ? "bg-[#2A303A]" : isNow ? "bg-verify dot-live" : isDone ? "bg-safe" : "bg-[#2A303A]"
              }`}
            />
            <span
              className={
                isSkipped
                  ? "text-[#4A525E] line-through"
                  : isNow
                  ? "text-[#E7EAEE]"
                  : isDone
                  ? "text-[#9DA6B2]"
                  : "text-[#4A525E]"
              }
            >
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
