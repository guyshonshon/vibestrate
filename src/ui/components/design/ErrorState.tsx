import type { ReactNode } from "react";
import { cn } from "./cn.js";
import { Button, type ButtonVariant } from "./Button.js";

/**
 * The canonical error / not-found / loading surface. The FULL variant is a
 * centered focal moment (matching the app's init/onboarding idiom: centered on
 * the canvas, no card, a big headline + a clear action ladder) so a
 * whole-surface failure reads as the main event with real hierarchy. The
 * `compact` variant is a slim inline strip for banners that sit above still-
 * visible content. See docs/design/primitives-contract.md + the CLAUDE.md
 * empty-state doctrine (every error offers a way forward).
 */

export type ErrorAction = {
  label: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  iconLeft?: ReactNode;
};

// Split a hint into sentences so "what happened" and "what to do" read as
// separate lines.
function sentences(s: string): string[] {
  return s
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function Actions({
  actions,
  center,
  size = "sm",
}: {
  actions: ErrorAction[];
  center?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2.5",
        center && "justify-center",
      )}
    >
      {actions.map((a, i) => (
        <Button
          key={i}
          variant={a.variant ?? (i === 0 ? "primary" : i === 1 ? "secondary" : "ghost")}
          size={size}
          onClick={a.onClick}
          iconLeft={a.iconLeft}
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}

export function ErrorState({
  kicker,
  title,
  detail,
  hint,
  actions,
  compact = false,
  className,
}: {
  /** Small rose eyebrow above the headline (e.g. "Error 404"). Full mode only. */
  kicker?: ReactNode;
  title: ReactNode;
  /** Technical message (path, status line) - mono + muted, only when it adds info. */
  detail?: ReactNode;
  /** The fix. Rendered one sentence per line. */
  hint?: string;
  /** Recovery forks. First primary, second secondary, rest ghost. */
  actions?: ErrorAction[];
  compact?: boolean;
  className?: string;
}) {
  const lines = hint ? sentences(hint) : [];

  if (compact) {
    return (
      <div
        role="alert"
        className={cn(
          "rounded-[14px] border border-[color:var(--line)] bg-coal-600 px-4 py-3.5",
          className,
        )}
      >
        <div className="text-[13px] font-semibold text-chalk-100">{title}</div>
        {lines.map((l, i) => (
          <p key={i} className="mt-0.5 text-[12px] leading-[1.5] text-chalk-300">
            {l}
          </p>
        ))}
        {detail ? (
          <p className="mono mt-1 break-words text-[11px] text-chalk-400">{detail}</p>
        ) : null}
        {actions && actions.length > 0 ? (
          <div className="mt-2.5">
            <Actions actions={actions} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex min-h-[62vh] w-full flex-col items-center justify-center px-6 py-12 text-center",
        className,
      )}
    >
      <div className="w-full max-w-[460px]">
        {kicker ? (
          <div className="text-[12.5px] font-semibold uppercase tracking-[0.1em] text-rose-300">
            {kicker}
          </div>
        ) : null}
        <h2
          className={cn(
            "font-jakarta text-[24px] font-extrabold leading-[1.15] tracking-[-0.02em] text-chalk-100",
            kicker ? "mt-3" : null,
          )}
        >
          {title}
        </h2>
        {lines.length > 0 ? (
          <div className="mx-auto mt-3 max-w-[42ch]">
            {lines.map((l, i) => (
              <p key={i} className="text-[14px] leading-[1.55] text-chalk-300">
                {l}
              </p>
            ))}
          </div>
        ) : null}
        {detail ? (
          <p className="mono mx-auto mt-3 max-w-[42ch] break-words text-[12px] text-chalk-400">
            {detail}
          </p>
        ) : null}
        {actions && actions.length > 0 ? (
          <div className="mt-7">
            <Actions actions={actions} center size="md" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * An in-progress state in the same centered-focal family: a progressive `.meter`
 * marquee bar + a headline and description. Use for "still spinning up" states.
 */
export function LoadingState({
  title,
  detail,
  compact = false,
  className,
}: {
  title: ReactNode;
  detail?: string;
  compact?: boolean;
  className?: string;
}) {
  const lines = detail ? sentences(detail) : [];

  if (compact) {
    return (
      <div
        role="status"
        className={cn(
          "rounded-[14px] border border-[color:var(--line)] bg-coal-600 px-4 py-3.5",
          className,
        )}
      >
        <div className="meter w-20" />
        <div className="mt-2.5 text-[13px] font-semibold text-chalk-100">{title}</div>
        {lines.map((l, i) => (
          <p key={i} className="mt-0.5 text-[12px] leading-[1.5] text-chalk-300">
            {l}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div
      role="status"
      className={cn(
        "flex min-h-[62vh] w-full flex-col items-center justify-center px-6 py-12 text-center",
        className,
      )}
    >
      <div className="w-full max-w-[460px]">
        <div className="mx-auto mb-5 w-40">
          <div className="meter w-full" />
        </div>
        <h2 className="font-jakarta text-[24px] font-extrabold leading-[1.15] tracking-[-0.02em] text-chalk-100">
          {title}
        </h2>
        {lines.length > 0 ? (
          <div className="mx-auto mt-3 max-w-[42ch]">
            {lines.map((l, i) => (
              <p key={i} className="text-[14px] leading-[1.55] text-chalk-300">
                {l}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
