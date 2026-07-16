import type { ReactNode } from "react";
import {
  AlertCircle,
  Ban,
  Lock,
  RefreshCw,
  SearchX,
  ServerCrash,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { cn } from "./cn.js";
import { Button, type ButtonVariant } from "./Button.js";

/**
 * The canonical error/empty surface. Every failed fetch, missing resource, or
 * forbidden action renders through this instead of a bare rose <div>, so an
 * error is a designed state with a way FORWARD (recovery actions), never a
 * terminus. See docs/design/primitives-contract.md and the CLAUDE.md empty-state
 * doctrine ("every error offers recovery: what happened + the fix + a control").
 *
 * Presentational only: the call site owns the copy and the recovery actions
 * (it knows the resource and where "back" goes). Use `describeError()` +
 * `<ErrorView>` in lib/error-view for the common "classify an ApiError" path.
 */

export type ErrorTone = "rose" | "amber" | "sky";

const TONE: Record<ErrorTone, { icon: string; disc: string }> = {
  rose: { icon: "text-rose-300", disc: "bg-rose-500/12 border-rose-400/25" },
  amber: { icon: "text-amber-soft", disc: "bg-amber-soft/12 border-amber-soft/25" },
  sky: { icon: "text-sky-glow", disc: "bg-sky-glow/12 border-sky-glow/25" },
};

/** Named glyphs so a call site can pick a shape by intent without importing lucide. */
export type ErrorGlyph =
  | "not-found"
  | "forbidden"
  | "server"
  | "offline"
  | "validation"
  | "blocked"
  | "generic";

const GLYPH = {
  "not-found": SearchX,
  forbidden: Lock,
  server: ServerCrash,
  offline: WifiOff,
  validation: TriangleAlert,
  blocked: Ban,
  generic: AlertCircle,
} as const;

export type ErrorAction = {
  label: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  iconLeft?: ReactNode;
};

export function ErrorState({
  tone = "rose",
  glyph = "generic",
  icon,
  title,
  detail,
  hint,
  actions,
  compact = false,
  className,
}: {
  tone?: ErrorTone;
  glyph?: ErrorGlyph;
  /** Override the glyph with a custom node. */
  icon?: ReactNode;
  title: ReactNode;
  /** Technical message (path, status line) - rendered mono + muted. */
  detail?: ReactNode;
  /** The fix: one plain-language line on what to do next. */
  hint?: ReactNode;
  /** Recovery forks. First action renders primary; the rest secondary/ghost. */
  actions?: ErrorAction[];
  /** Inline/panel density (smaller, left-aligned) vs full-page centered. */
  compact?: boolean;
  className?: string;
}) {
  const t = TONE[tone];
  const Glyph = GLYPH[glyph];
  return (
    <div
      className={cn(
        "rounded-[18px] border border-[color:var(--line)] bg-coal-600",
        compact
          ? "flex items-start gap-3.5 px-4 py-3.5"
          : "flex flex-col items-center px-6 py-10 text-center",
        className,
      )}
      role="alert"
    >
      <div
        className={cn(
          "grid shrink-0 place-items-center rounded-[14px] border",
          compact ? "h-9 w-9" : "h-12 w-12",
          t.disc,
        )}
      >
        {icon ?? (
          <Glyph
            className={cn(compact ? "h-4 w-4" : "h-6 w-6", t.icon)}
            strokeWidth={1.9}
          />
        )}
      </div>

      <div className={cn("min-w-0", compact ? "flex-1" : "mt-4 max-w-[46ch]")}>
        <h3
          className={cn(
            "font-bold text-chalk-100",
            compact ? "text-[13.5px]" : "text-[17px]",
          )}
        >
          {title}
        </h3>
        {hint ? (
          <p
            className={cn(
              "text-chalk-300",
              compact ? "mt-0.5 text-[12px]" : "mt-2 text-[13px] leading-relaxed",
            )}
          >
            {hint}
          </p>
        ) : null}
        {detail ? (
          <p
            className={cn(
              "mono break-words text-chalk-400",
              compact ? "mt-0.5 text-[11px]" : "mt-2 text-[11.5px]",
            )}
          >
            {detail}
          </p>
        ) : null}

        {actions && actions.length > 0 ? (
          <div
            className={cn(
              "flex flex-wrap items-center gap-2",
              compact ? "mt-2.5" : "mt-5 justify-center",
            )}
          >
            {actions.map((a, i) => (
              <Button
                key={i}
                variant={a.variant ?? (i === 0 ? "primary" : "secondary")}
                size="sm"
                onClick={a.onClick}
                iconLeft={a.iconLeft}
              >
                {a.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
