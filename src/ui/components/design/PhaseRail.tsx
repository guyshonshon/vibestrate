import { cn } from "./cn.js";

export type PhaseState = "done" | "active" | "todo";

export function PhaseRail({
  steps,
  active,
}: {
  steps: string[];
  active: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => {
        const state: PhaseState =
          i < active ? "done" : i === active ? "active" : "todo";
        return (
          <div
            key={`${s}-${i}`}
            className="flex-1 flex flex-col gap-1.5 min-w-0"
          >
            <div className={cn("phase-segment", state)} />
            {/* Step names are data (flow-defined), so they keep their case and
             * skip the eyebrow tracking - wide tracking truncated real labels
             * like "Review: correctness". */}
            <div
              title={s}
              className={cn(
                "mono text-[10.5px] truncate",
                state === "done" && "text-emerald-400/80",
                state === "active" && "text-violet-soft",
                state === "todo" && "text-chalk-400",
              )}
            >
              {s}
            </div>
          </div>
        );
      })}
    </div>
  );
}
