import { useCallback, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "./cn.js";

/** A transient ok/err notice; null = nothing showing. */
export type Toast = { kind: "ok" | "err"; text: string } | null;

/**
 * Shared toast state + auto-dismiss. `showToast` replaces the current toast
 * and restarts the dismiss timer; `setToast` is the raw setter for the rare
 * sticky toast that should stay until replaced (e.g. an error the user must
 * read). Render the result with `ToastView`.
 */
export function useToast(dismissAfterMs = 3200): {
  toast: Toast;
  showToast: (t: Toast) => void;
  setToast: (t: Toast) => void;
} {
  const [toast, setToast] = useState<Toast>(null);
  const timer = useRef<number | null>(null);
  const showToast = useCallback(
    (t: Toast) => {
      setToast(t);
      if (timer.current != null) window.clearTimeout(timer.current);
      timer.current =
        t == null ? null : window.setTimeout(() => setToast(null), dismissAfterMs);
    },
    [dismissAfterMs],
  );
  // Drop the pending dismiss on unmount so it can't fire into a dead component.
  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    },
    [],
  );
  return { toast, showToast, setToast };
}

// The default container: a floating chip pinned to the bottom-right corner.
const FLOATING_FRAME =
  "fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-[12px] border px-3.5 py-2 text-[12.5px] shadow-2xl";

// Floating chips sit on the page and take the brighter text (-200); inline
// strips sit inside a header/section and take the softer text (-300) plus
// role="status" so screen readers announce them in-flow.
const COLORS: Record<"floating" | "inline", { ok: string; err: string }> = {
  floating: {
    ok: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    err: "border-rose-400/30 bg-rose-500/10 text-rose-200",
  },
  inline: {
    ok: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
    err: "border-rose-400/30 bg-rose-500/10 text-rose-300",
  },
};

/**
 * Renders a `useToast` toast (or nothing). `className` fully replaces the
 * container geometry - pass it when the surface needs its own placement or
 * shape; the border/background/text colors are always appended after it.
 */
export function ToastView({
  toast,
  variant = "floating",
  prefix = "icon",
  className,
  iconStrokeWidth = 2.2,
}: {
  toast: Toast;
  /** Placement family: floating bottom-right chip, or an in-flow strip. */
  variant?: "floating" | "inline";
  /** How the ok/err state is signalled before the text. */
  prefix?: "icon" | "glyph" | "word" | "none";
  /** Container geometry override; defaults to the floating chip frame. */
  className?: string;
  iconStrokeWidth?: number;
}) {
  if (!toast) return null;
  const ok = toast.kind === "ok";
  return (
    <div
      role={variant === "inline" ? "status" : undefined}
      className={cn(
        className ?? FLOATING_FRAME,
        ok ? COLORS[variant].ok : COLORS[variant].err,
      )}
    >
      {prefix === "icon" ? (
        ok ? (
          <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={iconStrokeWidth} />
        ) : (
          <X className="h-3.5 w-3.5 shrink-0" strokeWidth={iconStrokeWidth} />
        )
      ) : null}
      {prefix === "glyph" ? (ok ? "✓ " : "✗ ") : null}
      {prefix === "word" ? (ok ? "Saved " : "Error ") : null}
      {toast.text}
    </div>
  );
}
