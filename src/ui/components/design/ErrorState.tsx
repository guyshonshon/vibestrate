import type { ReactNode } from "react";
import { cn } from "./cn.js";
import { Button, type ButtonVariant } from "./Button.js";

/**
 * The canonical error / not-found / loading surface. A failed fetch, missing
 * resource, or in-progress state renders through one family instead of a bare
 * rose <div> or a loose spinner line - a designed card with a headline, the
 * fix split into readable lines, and a way FORWARD (recovery actions). Matches
 * the app's text-first state idiom (ProfilesPage empty): coal-600 card, semibold
 * title, per-sentence body, centered footer - NO decorative icon disc. See
 * docs/design/primitives-contract.md + the CLAUDE.md empty-state doctrine.
 */

export type ErrorAction = {
  label: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  iconLeft?: ReactNode;
};

// Split a hint/detail paragraph into sentences so "what happened" and "what to
// do about it" read as separate lines instead of one wrapped block.
function sentences(s: string): string[] {
  return s
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function StateCard({
  lead,
  title,
  lines,
  detail,
  footer,
  compact,
  className,
  role = "status",
}: {
  /** Optional top element (a progress bar for loading). */
  lead?: ReactNode;
  title: ReactNode;
  lines?: string[];
  detail?: ReactNode;
  footer?: ReactNode;
  compact?: boolean;
  className?: string;
  role?: "status" | "alert";
}) {
  return (
    <div
      role={role}
      className={cn(
        "rounded-[20px] border border-[color:var(--line)] bg-coal-600",
        compact ? "px-4 py-4" : "px-6 py-10 text-center",
        className,
      )}
    >
      {lead ? (
        <div className={cn(compact ? "mb-2.5" : "mb-4 flex justify-center")}>
          {lead}
        </div>
      ) : null}
      <h3
        className={cn(
          "font-semibold text-chalk-100",
          compact ? "text-[13px]" : "text-[15px]",
        )}
      >
        {title}
      </h3>
      {lines && lines.length > 0 ? (
        <div className={cn("mx-auto", compact ? "mt-1" : "mt-2 max-w-[52ch]")}>
          {lines.map((l, i) => (
            <p
              key={i}
              className={cn(
                "text-chalk-300",
                compact ? "text-[12px] leading-[1.5]" : "text-[13px] leading-[1.55]",
              )}
            >
              {l}
            </p>
          ))}
        </div>
      ) : null}
      {detail ? (
        <p
          className={cn(
            "mono mx-auto break-words text-chalk-400",
            compact ? "mt-1.5 text-[11px]" : "mt-2.5 max-w-[52ch] text-[11.5px]",
          )}
        >
          {detail}
        </p>
      ) : null}
      {footer ? (
        <div
          className={cn(
            "flex flex-wrap gap-2",
            compact ? "mt-3" : "mt-5 justify-center",
          )}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function ErrorState({
  title,
  detail,
  hint,
  actions,
  compact = false,
  className,
}: {
  title: ReactNode;
  /** Technical message (path, status line) - mono + muted, only when it adds info. */
  detail?: ReactNode;
  /** The fix. Rendered one sentence per line. */
  hint?: string;
  /** Recovery forks. First renders primary, the rest secondary. */
  actions?: ErrorAction[];
  compact?: boolean;
  className?: string;
}) {
  return (
    <StateCard
      role="alert"
      title={title}
      lines={hint ? sentences(hint) : undefined}
      detail={detail}
      compact={compact}
      className={className}
      footer={
        actions && actions.length > 0
          ? actions.map((a, i) => (
              <Button
                key={i}
                variant={a.variant ?? (i === 0 ? "primary" : "secondary")}
                size="sm"
                onClick={a.onClick}
                iconLeft={a.iconLeft}
              >
                {a.label}
              </Button>
            ))
          : undefined
      }
    />
  );
}

/**
 * An in-progress state in the same card family - a progressive `.meter` bar
 * (the app's marquee progress indicator) + a headline and description. Use for
 * "still spinning up" states so they read as a designed process, not a loose
 * spinner line.
 */
export function LoadingState({
  title,
  detail,
  actions,
  compact = false,
  className,
}: {
  title: ReactNode;
  detail?: string;
  /** Optional escape hatches (e.g. Back) if the process runs long. */
  actions?: ErrorAction[];
  compact?: boolean;
  className?: string;
}) {
  return (
    <StateCard
      lead={<div className={cn("meter", compact ? "w-20" : "w-40")} />}
      title={title}
      lines={detail ? sentences(detail) : undefined}
      compact={compact}
      className={className}
      footer={
        actions && actions.length > 0
          ? actions.map((a, i) => (
              <Button
                key={i}
                variant={a.variant ?? "secondary"}
                size="sm"
                onClick={a.onClick}
                iconLeft={a.iconLeft}
              >
                {a.label}
              </Button>
            ))
          : undefined
      }
    />
  );
}
