import type { ReactNode } from "react";
import { cn } from "./cn.js";

/**
 * A compact 24px square icon button for row-level actions where a full
 * `Button` is too heavy. Two families: "outline" (bordered chip, supports a
 * rose `danger` accent) and "plain" (borderless ghost square).
 */
export function IconBtn({
  children,
  title,
  onClick,
  disabled,
  danger,
  variant = "outline",
}: {
  children: ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  /** Rose accent for destructive actions (outline variant only). */
  danger?: boolean;
  variant?: "outline" | "plain";
}) {
  if (variant === "plain") {
    return (
      <button
        type="button"
        title={title}
        onClick={onClick}
        disabled={disabled}
        className="inline-flex h-6 w-6 items-center justify-center rounded-[8px] text-chalk-400 transition hover:bg-coal-500 hover:text-chalk-100 disabled:opacity-40"
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-6 w-6 inline-flex items-center justify-center rounded-[10px] border transition",
        disabled
          ? "border-[color:var(--line-soft)] text-chalk-400 cursor-not-allowed"
          : danger
            ? "border-rose-300/20 text-rose-300/80 hover:bg-rose-500/10 hover:text-rose-200"
            : "border-[color:var(--line-strong)] text-chalk-300 hover:bg-coal-500 hover:text-chalk-100",
      )}
    >
      {children}
    </button>
  );
}
