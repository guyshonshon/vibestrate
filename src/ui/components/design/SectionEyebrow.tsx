import type { ReactNode } from "react";
import { cn } from "./cn.js";

export function SectionEyebrow({
  children,
  right,
  className,
}: {
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between", className)}>
      <span className="eyebrow">{children}</span>
      {right ? <span className="eyebrow">{right}</span> : null}
    </div>
  );
}
