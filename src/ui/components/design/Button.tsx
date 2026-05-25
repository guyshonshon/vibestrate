import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.js";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "outline"
  | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-[12px] gap-1.5",
  md: "h-9 px-3.5 text-[13px] gap-2",
  lg: "h-11 px-5 text-[14px] gap-2.5",
};

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-violet-mid to-violet-deep text-white border border-violet-soft/40 hover:brightness-110 shadow-[0_8px_24px_-8px_rgba(139,124,255,0.55)] ring-1 ring-violet-soft/35",
  secondary:
    "bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-fog-100",
  ghost:
    "bg-transparent hover:bg-white/[0.04] border border-transparent text-fog-200 hover:text-fog-100",
  outline:
    "bg-transparent hover:bg-white/[0.04] border border-white/15 text-fog-100",
  danger:
    "bg-rose-500/10 hover:bg-rose-500/15 border border-rose-400/30 text-rose-300",
};

export function Button({
  children,
  variant = "ghost",
  size = "md",
  iconLeft,
  iconRight,
  className,
  ...props
}: {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium select-none whitespace-nowrap",
        "disabled:opacity-50 disabled:pointer-events-none",
        SIZE[size],
        VARIANT[variant],
        className,
      )}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
}
