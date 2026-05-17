// Pure phase rail derivation. Lifted out of MissionControlPage so the
// new ExecutionCanvas + existing RunCard share one source of truth.

import type { RunStatus } from "../../lib/types.js";

export type PhaseKey =
  | "plan"
  | "arch"
  | "exec"
  | "val"
  | "review"
  | "fix"
  | "verify"
  | "ready";

export const PHASES: { key: PhaseKey; label: string; statuses: RunStatus[] }[] =
  [
    { key: "plan", label: "Plan", statuses: ["planning", "planned"] },
    {
      key: "arch",
      label: "Architect",
      statuses: ["architecting", "architected"],
    },
    { key: "exec", label: "Execute", statuses: ["executing"] },
    { key: "val", label: "Validate", statuses: ["validating"] },
    { key: "review", label: "Review", statuses: ["reviewing"] },
    { key: "fix", label: "Fix", statuses: ["fixing"] },
    { key: "verify", label: "Verify", statuses: ["verifying"] },
    { key: "ready", label: "Ready", statuses: ["merge_ready"] },
  ];

export type PhaseState = "done" | "active" | "awaiting" | "pending" | "blocked";

export function phaseStates(input: {
  status: RunStatus;
  pausedAtStatus: RunStatus | null;
}): PhaseState[] {
  const { status, pausedAtStatus } = input;
  const offPath = status === "failed" || status === "aborted" || status === "blocked";
  const awaitingHere = status === "waiting_for_approval" || status === "paused";

  // Resolve which "in-flow" status we are visually anchored to. For
  // an off-path / awaiting state, fall back to pausedAtStatus when
  // available so the user can see how far it got.
  const anchor: RunStatus | null =
    awaitingHere && pausedAtStatus ? pausedAtStatus : awaitingHere ? null : status;

  const anchorIdx = anchor
    ? PHASES.findIndex((p) => p.statuses.includes(anchor))
    : -1;

  return PHASES.map((_, i) => {
    if (anchorIdx === -1) return offPath ? "blocked" : "pending";
    if (i < anchorIdx) return "done";
    if (i === anchorIdx) {
      if (offPath) return "blocked";
      if (awaitingHere) return "awaiting";
      return "active";
    }
    return "pending";
  });
}
