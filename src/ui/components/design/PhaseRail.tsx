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
            <div
              className={cn(
                "mono text-[10px] uppercase tracking-[0.14em] truncate",
                state === "done" && "text-emerald-300/80",
                state === "active" && "text-violet-soft",
                state === "todo" && "text-fog-500",
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
