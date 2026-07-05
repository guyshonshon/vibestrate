import { cn } from "./cn.js";

/**
 * The app's segmented tab control - an interactive switch between top-level tabs
 * of one surface (Crew's crews/providers, the Board's board/ledger). Not a
 * status label: the active segment reads as a filled violet pill, the rest as
 * dim ghost text. Markup is the canonical idiom lifted from CrewPage's original
 * inline TabSwitch. Compose this instead of hand-rolling a second one.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-[12px] border border-[color:var(--line-strong)] bg-coal-800 p-1",
        className,
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-[10px] px-3 py-1.5 text-[13px] transition",
            value === opt.value
              ? "bg-violet-soft font-bold text-coal-900"
              : "text-chalk-300 hover:text-chalk-100",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
