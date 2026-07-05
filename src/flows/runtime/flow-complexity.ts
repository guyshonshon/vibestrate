// ── Flow-complexity warning ──────────────────────────────────────────────────
//
// A flow has a "weight class" (low/medium/high). Compared against the task's
// estimated effort, we can warn when a heavy flow is run against a light task
// ("this flow might be too much - try a simpler one"). Pure + advisory: it
// never blocks a run, it just nudges.

import { parallelGroupsOf, type FlowComplexity } from "../schemas/flow-schema.js";

const RANK: Record<FlowComplexity, number> = { low: 0, medium: 1, high: 2 };
const TURN_KINDS = new Set([
  "agent-turn",
  "review-turn",
  "response-turn",
  "summary-turn",
]);

/**
 * A flow's weight class: its declared `complexity` if set, else inferred from
 * the number of agent turns (≤2 → low, 3–4 → medium, ≥5 → high). Validation /
 * approval-gate steps don't count - only model turns drive cost.
 */
export function inferFlowComplexity(flow: {
  complexity?: FlowComplexity | null;
  steps: ReadonlyArray<{ kind: string }>;
}): FlowComplexity {
  if (flow.complexity) return flow.complexity;
  const turns = flow.steps.filter((s) => TURN_KINDS.has(s.kind)).length;
  if (turns <= 2) return "low";
  if (turns <= 4) return "medium";
  return "high";
}

export type FlowComplexityAdvice = {
  flowComplexity: FlowComplexity;
  taskEffort: FlowComplexity;
  /** flowRank − taskRank; positive ⇒ the flow is heavier than the task looks. */
  gap: number;
  level: "none" | "consider" | "overkill";
  message: string | null;
};

export type FlowFanoutAdvice = {
  /** Widest parallel group in the flow (1 = no fan-out / linear). */
  maxFanout: number;
  message: string | null;
};

/**
 * Fan-out cost warning: a graph flow that runs N agents in parallel
 * multiplies spend, and each turn is an opaque box that may itself parallelize -
 * so the real footprint can exceed the per-turn estimate. Say so loudly. Returns
 * a null message for linear flows (no fan-out). See custom-workflow-dags.md.
 */
export function flowFanoutAdvice(flow: {
  steps: ReadonlyArray<{ needs?: readonly string[] }>;
}): FlowFanoutAdvice {
  let maxFanout = 1;
  for (const group of parallelGroupsOf(flow.steps)) {
    if (group.length > maxFanout) maxFanout = group.length;
  }
  if (maxFanout < 2) return { maxFanout, message: null };
  return {
    maxFanout,
    message: `This flow fans out up to ${maxFanout} agents in parallel (~${maxFanout}x the review spend), and each is an opaque box that may itself parallelize - so real spend can exceed the estimate. For CLI providers token spend is often unmeasured, so the cap there is wall-clock/turn-count bounded.`,
  };
}

export function flowComplexityAdvice(input: {
  flowComplexity: FlowComplexity;
  taskEffort: FlowComplexity;
  flowLabel?: string;
}): FlowComplexityAdvice {
  const gap = RANK[input.flowComplexity] - RANK[input.taskEffort];
  const label = input.flowLabel ? `The "${input.flowLabel}" flow` : "This flow";
  let level: FlowComplexityAdvice["level"] = "none";
  let message: string | null = null;
  if (gap >= 2) {
    level = "overkill";
    message = `${label} is ${input.flowComplexity}-complexity but the task looks ${input.taskEffort}-effort - this flow might be too much. Try a simpler one.`;
  } else if (gap === 1) {
    level = "consider";
    message = `${label} (${input.flowComplexity}) is a bit heavier than the task looks (${input.taskEffort} effort). Fine, but a lighter flow may be quicker.`;
  }
  return {
    flowComplexity: input.flowComplexity,
    taskEffort: input.taskEffort,
    gap,
    level,
    message,
  };
}
