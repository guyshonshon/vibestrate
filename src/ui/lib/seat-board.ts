// ── Seat board derivation (Control Center) ───────────────────────────────
// Pure helpers folding a run's live flow state + role metrics into the seat
// cards the Control Center renders. No React/browser imports (node-tested,
// same pattern as run-outcome.ts).

import type { FlowRunState, FlowRunStepState, RuntimeMetrics } from "./types.js";

export type SeatCardState =
  | "waiting"
  | "working"
  | "done"
  | "failed"
  | "blocked"
  | "skipped";

export type SeatCard = {
  stepId: string;
  label: string;
  kind: string;
  stage: string | null;
  seat: string | null;
  roleLabel: string | null;
  profileId: string | null;
  providerId: string | null;
  state: SeatCardState;
  startedAt: string | null;
  endedAt: string | null;
  error: string | null;
  /** Token rollup for this step's turns (input+output), when metrics carry it. */
  tokens: number | null;
  promptArtifactPath: string | null;
  outputArtifactPath: string | null;
  /** Live stream name for this step (`flows/<id>/prompt`), for the transcript. */
  streamName: string | null;
  /** Steps sharing a `needs` set render side by side (parallel group key). */
  groupKey: string;
};

function cardState(s: FlowRunStepState): SeatCardState {
  switch (s.status) {
    case "running":
      return "working";
    case "passed":
      return "done";
    case "failed":
      return "failed";
    case "blocked":
      return "blocked";
    case "skipped":
      return "skipped";
    default:
      return "waiting";
  }
}

/** Sum a step's turn tokens from the metrics roles (matched by stageId). */
function stepTokens(stepId: string, metrics: RuntimeMetrics | null): number | null {
  const roles = metrics?.roles ?? [];
  let total = 0;
  let any = false;
  for (const r of roles) {
    if (r.stageId !== stepId) continue;
    const t = (r.tokenUsage?.input ?? 0) + (r.tokenUsage?.output ?? 0);
    if (t > 0) {
      total += t;
      any = true;
    }
  }
  return any ? total : null;
}

/**
 * Fold the live flow state into ordered seat cards. Parallel fan-out members
 * (same `needs` set, graph flows) share a groupKey so the board renders them
 * side by side; linear steps each get their own group.
 */
export function deriveSeatBoard(
  flow: FlowRunState | null | undefined,
  metrics: RuntimeMetrics | null,
): SeatCard[] {
  const steps = flow?.steps ?? [];
  const isGraph = steps.some((s) => (s.needs?.length ?? 0) > 0);
  return steps.map((s, i) => ({
    stepId: s.id,
    label: s.label,
    kind: s.kind,
    stage: s.stage,
    seat: s.seat,
    roleLabel: s.resolvedRoleLabel ?? s.resolvedRoleId,
    profileId: s.profileId,
    providerId: s.providerId,
    state: cardState(s),
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    error: s.error,
    tokens: stepTokens(s.id, metrics),
    promptArtifactPath: s.promptArtifactPath,
    outputArtifactPath: s.outputArtifactPath,
    // Stream names mirror the prompt artifact name without extension - the
    // stream store records `flows/<stepId>/prompt` (see
    // provider-stream-store.streamFilePath). The stamped artifact path is
    // RUN-dir-relative ("artifacts/flows/<id>/prompt.md"), so the prefix must
    // go too - with it the seat transcript matched no stream, ever.
    streamName: s.promptArtifactPath
      ? s.promptArtifactPath
          .replace(/^artifacts\//, "")
          .replace(/\.[^./]+$/, "")
      : `flows/${s.id}/prompt`,
    groupKey: isGraph ? [...(s.needs ?? [])].sort().join(" ") || `solo-${i}` : `lin-${i}`,
  }));
}

/** The card the board should auto-focus: the working step, else the last
 *  finished one, else the first. */
export function activeSeatCard(cards: SeatCard[]): SeatCard | null {
  return (
    cards.find((c) => c.state === "working") ??
    [...cards].reverse().find((c) => c.state === "done" || c.state === "failed") ??
    cards[0] ??
    null
  );
}
