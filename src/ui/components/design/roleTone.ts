// Visual mapping for the five canonical Crew roles. Used by Mission
// Control's Composer + Run Detail's Crew strip.
import {
  Bolt,
  Check,
  Cpu,
  Eye,
  Layers,
  Scale,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Role = "Planner" | "Executor" | "Reviewer" | "Verifier" | "Arbiter";

export const ROLE_ICON: Record<string, LucideIcon> = {
  Planner: Layers,
  Executor: Bolt,
  Reviewer: Eye,
  Verifier: Check,
  Arbiter: Scale,
};

export type RoleTone = {
  ring: string;
  grad: string;
  text: string;
};

export const ROLE_TONE: Record<string, RoleTone> = {
  Planner: {
    ring: "ring-violet-soft/35",
    grad: "from-violet-soft/30 to-violet-deep/15",
    text: "text-violet-soft",
  },
  Executor: {
    ring: "ring-violet-soft/35",
    grad: "from-violet-soft/30 to-violet-deep/15",
    text: "text-violet-soft",
  },
  Reviewer: {
    ring: "ring-sky-glow/35",
    grad: "from-sky-400/30 to-sky-500/15",
    text: "text-sky-glow",
  },
  Verifier: {
    ring: "ring-emerald-400/35",
    grad: "from-emerald-400/30 to-emerald-600/15",
    text: "text-emerald-300",
  },
  Arbiter: {
    ring: "ring-amber-300/35",
    grad: "from-amber-300/30 to-amber-500/15",
    text: "text-amber-300",
  },
};

export function iconForRole(role: string): LucideIcon {
  return ROLE_ICON[role] ?? Cpu;
}

export function toneForRole(role: string): RoleTone {
  return ROLE_TONE[role] ?? ROLE_TONE.Executor!;
}

/**
 * Many flow slot labels carry useful semantics — "planner" inside a
 * label means we should treat it as the Planner role visually. Falls
 * back to "Executor" when nothing matches.
 */
export function classifyRole(label: string | null | undefined): Role {
  const l = (label ?? "").toLowerCase();
  if (l.includes("plan")) return "Planner";
  if (l.includes("arbiter") || l.includes("arbitrate")) return "Arbiter";
  if (l.includes("review") || l.includes("challeng") || l.includes("critic"))
    return "Reviewer";
  if (l.includes("verif") || l.includes("validat")) return "Verifier";
  return "Executor";
}
