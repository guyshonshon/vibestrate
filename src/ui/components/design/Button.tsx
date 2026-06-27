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
  sm: "h-7 px-2.5 text-[12px] gap-1.5 rounded-[10px]",
  md: "h-9 px-3.5 text-[13px] gap-2 rounded-[12px]",
  lg: "h-11 px-5 text-[14px] gap-2.5 rounded-[12px]",
};

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-violet-soft text-coal-900 border border-transparent hover:bg-violet-soft/90",
  secondary:
    "bg-coal-500 hover:bg-coal-400 border border-[color:var(--line-strong)] text-chalk-100",
  ghost:
    "bg-transparent hover:bg-coal-500 border border-transparent text-chalk-300 hover:text-chalk-100",
  outline:
    "bg-transparent hover:text-chalk-100 border border-[color:var(--line-strong)] text-chalk-300",
  danger:
    "bg-rose-500/10 hover:bg-rose-500/10 border border-rose-400/30 text-rose-300",
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
        "inline-flex items-center justify-center font-medium select-none whitespace-nowrap",
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
