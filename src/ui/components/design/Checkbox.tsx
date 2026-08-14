import { Check, Minus } from "lucide-react";
import { cn } from "./cn.js";

/**
 * A checkbox that looks like the rest of the design layer.
 *
 * The bare `<input type="checkbox">` used elsewhere is fine for a single opt-in
 * toggle, but a bulk-selection list renders hundreds of them, and the native
 * control ignores the token palette entirely: it renders at the OS accent
 * colour in both themes.
 *
 * The real input stays in the tree (`sr-only`) rather than being replaced by a
 * div, so keyboard focus, space-to-toggle, form semantics, and screen readers
 * all keep working. The visible box is decoration driven off peer state.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  indeterminate = false,
  disabled = false,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name. Rendered visually only when `showLabel` reads it. */
  label: string;
  /** Some-but-not-all selected, for a group header. */
  indeterminate?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "group inline-flex cursor-pointer items-center",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        // `indeterminate` is a DOM property with no HTML attribute, so it has to
        // be set on the node itself rather than passed as a prop.
        ref={(el) => {
          if (el) el.indeterminate = indeterminate && !checked;
        }}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={cn(
          "flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[5px] border transition",
          "border-[color:var(--line-strong)] bg-coal-800",
          "peer-hover:border-violet-soft/50",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-violet-soft/50",
          (checked || indeterminate) && "border-violet-soft bg-violet-soft",
        )}
      >
        {checked ? (
          <Check className="h-3 w-3 text-coal-900" strokeWidth={3} />
        ) : indeterminate ? (
          <Minus className="h-3 w-3 text-coal-900" strokeWidth={3} />
        ) : null}
      </span>
    </label>
  );
}
