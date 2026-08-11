// The few declarations more than one run-detail component needs.
//
// Kept here rather than cross-imported between siblings: a component importing
// a constant from its neighbour makes the neighbour look like the owner, and
// the next person moves it and breaks the other. Nothing in this file renders.

import { Scale, ShieldCheck, AlertTriangle } from "lucide-react";
import type { RunAssurance } from "../../../lib/types.js";

/** Tone, card treatment and icon per assurance verdict. */
export const VERDICT_META: Record<
  RunAssurance["verdict"],
  { tone: string; card: string; icon: typeof Scale }
> = {
  verified: { tone: "text-emerald-400", card: "border-emerald-500/30 bg-emerald-500/[0.04]", icon: ShieldCheck },
  partially_verified: { tone: "text-amber-soft", card: "border-amber-soft/30 bg-amber-soft/[0.05]", icon: Scale },
  unverified: { tone: "text-amber-soft", card: "border-amber-soft/30 bg-amber-soft/[0.05]", icon: Scale },
  blocked: { tone: "text-rose-300", card: "border-rose-400/35 bg-rose-500/[0.06]", icon: AlertTriangle },
  unsafe: { tone: "text-rose-300", card: "border-rose-400/45 bg-rose-500/[0.08]", icon: AlertTriangle },
};

/** The stage a rerun starts from. */
export type StartFrom =
  | "scratch"
  | "architecting"
  | "executing"
  | "reviewing"
  | "fixing"
  | "verifying";

/** Stages that operate on existing code, so a rerun there restores the source
 *  run's worktree snapshot rather than regenerating from scratch. */
export const DOWNSTREAM_STAGES = ["reviewing", "fixing", "verifying"] as const;
