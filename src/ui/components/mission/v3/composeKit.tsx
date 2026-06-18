import { cn } from "../../design/cn.js";
import type { FlowStepDefinition } from "../../../lib/types.js";

// Shared run-composition primitives, used by both the dedicated New-run page
// (#/compose, RunComposePage) and the dashboard's RunComposerCard. Keeping the
// atoms here means the two surfaces can't drift on the "new run" look - a tweak
// to a Toggle or a SectionLabel lands in both at once.

export function SectionLabel({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-fog-500">
      {icon}
      {children}
    </div>
  );
}

export function ConfigRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3">
      <div className="w-[88px] shrink-0 text-[10.5px] font-medium uppercase tracking-[0.14em] text-fog-500">
        {label}
      </div>
      {children}
    </div>
  );
}

export function Toggle({
  on,
  onClick,
  label,
  icon,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1.5 border px-2.5 text-[11.5px] transition",
        on
          ? "border-violet-soft/45 bg-violet-mid/[0.12] text-fog-100"
          : "border-[color:var(--line)] text-fog-300 hover:text-fog-100",
      )}
    >
      {icon}
      {label}
      <span className={cn("font-mono", on ? "text-violet-soft" : "text-fog-500")}>
        {on ? "on" : "off"}
      </span>
    </button>
  );
}

// The little per-flow step bar-chart shown on each flow card.
export function StepPips({
  steps,
  active,
}: {
  steps: FlowStepDefinition[];
  active: boolean;
}) {
  const shown = steps.slice(0, 12);
  const tone = (kind: string): string => {
    if (kind === "review-turn") return active ? "bg-violet-soft" : "bg-fog-300";
    if (kind === "validation") return "bg-fog-500";
    if (kind === "approval-gate") return active ? "bg-violet-soft" : "bg-fog-400";
    return active ? "bg-violet-mid" : "bg-fog-200";
  };
  return (
    <div className="flex h-6 items-end gap-[2px]" aria-hidden>
      {shown.map((s, i) => (
        <span
          key={i}
          className={cn("w-[3px]", tone(s.kind))}
          style={{ height: `${7 + ((i * 5) % 10)}px` }}
        />
      ))}
    </div>
  );
}
