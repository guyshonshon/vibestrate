import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "./cn.js";

export type SelectOption = {
  value: string;
  label: string;
  /** Optional right-aligned hint (e.g. a model name or "missing"). */
  hint?: string;
};

/**
 * A flat, slab-styled replacement for the native `<select>`. Native selects
 * can't be styled consistently across browsers (the open list is OS-drawn), so
 * this is a custom listbox: a button trigger + an absolutely-positioned option
 * list. Keyboard-accessible (Up/Down/Home/End/Enter/Esc), closes on
 * click-outside, and marks the selected option with a check. Rounded coal
 * field + hairline border, no native chrome - matches the dashboard's
 * coal/chalk input language.
 */
export function Select({
  value,
  onChange,
  options,
  disabled,
  placeholder,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value) ?? null;

  // Close on a click outside the component.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Highlight the current value whenever the list opens.
  useEffect(() => {
    if (!open) return;
    const i = options.findIndex((o) => o.value === value);
    setActive(i >= 0 ? i : 0);
  }, [open, value, options]);

  const choose = (i: number) => {
    const o = options[i];
    if (!o) return;
    onChange(o.value);
    setOpen(false);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => Math.min(a + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-[12px] border bg-coal-800 px-2.5 py-1.5 text-[12.5px] text-chalk-100 outline-none transition",
          "hover:border-violet-soft/50 disabled:opacity-50",
          open ? "border-violet-soft/50" : "border-[color:var(--line-strong)]",
        )}
      >
        <span className={cn("truncate", !selected && "text-chalk-400")}>
          {selected ? selected.label : (placeholder ?? "Select…")}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-chalk-400 transition",
            open && "rotate-180",
          )}
          strokeWidth={1.7}
        />
      </button>
      {open ? (
        <div
          role="listbox"
          id={listId}
          className="absolute left-0 z-30 mt-1 max-h-[260px] min-w-full overflow-auto rounded-[12px] border border-[color:var(--line)] bg-coal-800 py-1 shadow-2xl"
        >
          {options.map((o, i) => {
            const isSel = o.value === value;
            return (
              <div
                key={o.value}
                role="option"
                aria-selected={isSel}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[12.5px]",
                  i === active ? "bg-coal-500 text-chalk-100" : "text-chalk-300",
                )}
              >
                <Check
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isSel ? "text-violet-soft" : "opacity-0",
                  )}
                  strokeWidth={2}
                />
                <span className="truncate">{o.label}</span>
                {o.hint ? (
                  <span className="ml-auto shrink-0 truncate pl-3 text-[11px] text-chalk-400">
                    {o.hint}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
