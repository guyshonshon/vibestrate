import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * `cn` for shadcn/ui primitives: clsx + tailwind-merge so conflicting Tailwind
 * classes resolve last-wins. This is intentionally separate from the legacy
 * `components/design/cn.ts` (a plain join, no conflict resolution) used by the
 * bespoke `design/*` layer - changing that one's behavior would alter ~34
 * existing files' class output. New `components/ui/*` primitives import THIS.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
