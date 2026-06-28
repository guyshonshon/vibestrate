import {
  STEP_GROUP_DESC,
  STEP_GROUP_LABEL,
  type StepKindGroup,
} from "./stepKind.js";
import { cn } from "./cn.js";

// What the step colours mean, by function. Shared so the Flow Builder and the
// Flows catalog (whose cards carry the FlowBars meter) read the same legend.
const DOT_CLASS: Record<StepKindGroup, string> = {
  build: "bg-violet-soft",
  review: "bg-sky-glow",
  check: "bg-emerald-400",
  gate: "bg-amber-soft",
};

const GROUPS: StepKindGroup[] = ["build", "review", "check", "gate"];

export function StepKindLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
      {GROUPS.map((g) => (
        <span
          key={g}
          className="inline-flex items-center gap-1.5 text-[10.5px] text-chalk-400"
          title={STEP_GROUP_DESC[g]}
        >
          <span className={cn("h-2 w-2 rounded-full", DOT_CLASS[g])} aria-hidden />
          {STEP_GROUP_LABEL[g]}
        </span>
      ))}
    </div>
  );
}
