import { z } from "zod";
import { approvalRiskSchema } from "../../core/approval-types.js";

const FLOW_TOKEN_RE = /^[a-z][a-z0-9-]*$/;
const FLOW_AGENT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

// Hard ceiling on how many steps may share one `needs` set (a parallel group's
// width). Deliberately conservative: each concurrent turn is an opaque box that
// may itself spawn provider-internal subagents, so the real footprint is a
// multiple of this. The built-in panel uses 3; this caps any project flow.
// See custom-workflow-dags.md ("Conservative width cap", "the opaque box").
export const MAX_PARALLEL_FANOUT = 4;

export const flowTokenSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(FLOW_TOKEN_RE, "Flow tokens must use lowercase letters, digits, and dashes.");

export const flowRoleIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    FLOW_AGENT_RE,
    "Flow agent ids must be path-safe letters, digits, dots, underscores, or dashes.",
  );

export const flowStepKindSchema = z.enum([
  "agent-turn",
  "review-turn",
  "response-turn",
  "validation",
  "approval-gate",
  "summary-turn",
]);
export type FlowStepKind = z.infer<typeof flowStepKindSchema>;

// Coarse phase a step belongs to. Drives stage-based resume: `--resume-from
// <stage>` seeds the outputs of every step before the first step at that stage
// and starts the run there. The values mirror the run lifecycle so resume
// targets are stable across flows. Optional - a flow only needs it on steps
// that are valid resume boundaries (planning/architecting/executing).
export const flowStageSchema = z.enum([
  "planning",
  "architecting",
  "executing",
  "reviewing",
  "verifying",
]);
export type FlowStage = z.infer<typeof flowStageSchema>;

export const flowApprovalGateSchema = z
  .object({
    reason: z.string().min(1).max(600),
    requestedAction: z.string().min(1).max(600),
    userMessage: z.string().min(1).max(1200).optional(),
    riskLevel: approvalRiskSchema.default("medium"),
  })
  .strict();
export type FlowApprovalGate = z.infer<typeof flowApprovalGateSchema>;

export const flowStepRepeatSchema = z
  .object({
    // Bounded repeats stay explicit in the resolved snapshot. Adaptive loops
    // need a decision contract first; fixed turns keep Flow YAML honest.
    times: z.number().int().min(2).max(8),
  })
  .strict();
export type FlowStepRepeat = z.infer<typeof flowStepRepeatSchema>;

export const flowContextPolicySchema = z.enum([
  "balanced",
  "compact",
  "artifact-heavy",
]);
export type FlowContextPolicy = z.infer<typeof flowContextPolicySchema>;

// How heavy a Flow is - its "weight class" (Phase 3 C1). Used to warn when a
// heavy flow is run against a light task ("this flow might be too much"). When
// a Flow doesn't declare it, the runner infers it from the number of agent
// turns (see flow-complexity.ts).
export const flowComplexitySchema = z.enum(["low", "medium", "high"]);
export type FlowComplexity = z.infer<typeof flowComplexitySchema>;

// Selection metadata - what kind of task a Flow is good for. Deliberately small:
// it steers the orchestrator's workflow selection, it is NOT a second workflow
// language. All fields optional; a Flow without it is still fully valid.
export const flowCapabilitiesSchema = z
  .object({
    /** Task kinds this flow suits, e.g. `feature`, `bugfix`, `refactor`, `docs`. */
    taskKinds: z.array(z.string().min(1).max(40)).max(12).default([]),
    /** What it is strong at, e.g. `security`, `architecture`, `tests`, `speed`. */
    strengths: z.array(z.string().min(1).max(40)).max(16).default([]),
    /** Relative spend weight (parallel/extra-review flows are higher). */
    costClass: flowComplexitySchema.optional(),
    /** Relative wall-clock weight. */
    latencyClass: flowComplexitySchema.optional(),
    /** Hard expectations, e.g. needs validation commands configured. */
    requires: z.object({ validation: z.boolean().optional() }).strict().default({}),
    /** When this flow is a poor fit, e.g. read-only investigation runs. */
    avoids: z.object({ readOnly: z.boolean().optional() }).strict().default({}),
  })
  .strict();
export type FlowCapabilities = z.infer<typeof flowCapabilitiesSchema>;

// A **Seat** is what a Flow step needs filled (e.g. an `implementer`). The Flow
// declares its required seats; it does NOT name local Role ids - the run's Crew
// supplies a Role whose `fills` includes the seat. Keeps Flows shareable.
export const flowSeatSchema = z
  .object({
    label: z.string().min(1).max(120),
    description: z.string().min(1).max(400).optional(),
  })
  .strict();
export type FlowSeat = z.infer<typeof flowSeatSchema>;

export const flowStepSchema = z
  .object({
    id: flowTokenSchema,
    label: z.string().min(1).max(160),
    kind: flowStepKindSchema,
    seat: flowTokenSchema.optional(),
    inputs: z.array(flowTokenSchema).default([]),
    outputs: z.array(flowTokenSchema).default([]),
    // Explicit DAG edges (Slice 4 / custom-workflow-dags.md Phase A): the step
    // ids this step depends on. Empty (the default) means today's linear flow -
    // a flow that declares ANY `needs` opts the whole flow into graph mode, and
    // validation then requires the array order to be a valid topological sort
    // (so existing linear flows are trivially valid and unchanged). Steps that
    // share the same `needs` set may run concurrently (read-only only, enforced
    // at resolve time) - a "parallel group"; a step listing them all in its
    // `needs` is the join. See `isGraphFlow` / `parallelGroupsOf`.
    needs: z.array(flowTokenSchema).default([]),
    // A short, step-specific instruction injected into this step's prompt. Lets
    // sibling steps that share one seat take distinct lenses (e.g. a review
    // panel: correctness vs tests vs risk) without inventing new roles.
    instructions: z.string().min(1).max(800).optional(),
    optional: z.boolean().default(false),
    // Skipped on a read-only (investigation-only) run. Marks steps that write
    // code or only make sense once code changed - executor/fixer turns,
    // validation, verification. A read-only run does plan/architect/review-style
    // steps only, so the runner skips these and (see runner) disables looping.
    skipWhenReadOnly: z.boolean().default(false),
    // Coarse phase, used as a resume boundary (see flowStageSchema).
    stage: flowStageSchema.optional(),
    approval: flowApprovalGateSchema.optional(),
    repeat: flowStepRepeatSchema.optional(),
  })
  .strict();
export type FlowStep = z.infer<typeof flowStepSchema>;

// Adaptive loop: re-run a contiguous body of steps while a review-turn's
// decision keeps requesting changes, up to a bound. This is the "decision
// contract" the fixed `repeat` couldn't express (e.g. the default workflow's
// review→fix loop). `from`..`to` is the loop body; `decisionStep` (a
// review-turn inside the body) gates it - exit when it isn't CHANGES_REQUESTED.
export const flowLoopSchema = z
  .object({
    from: flowTokenSchema,
    to: flowTokenSchema,
    decisionStep: flowTokenSchema,
    maxIterations: z.number().int().min(1).max(8),
  })
  .strict();
export type FlowLoop = z.infer<typeof flowLoopSchema>;

// A contiguous body of steps that repeats **once per checklist item** when a
// run is picked up from a card with a Checklist (Phase 3). `from`..`to` is the
// per-item band; steps before it run once (the holistic plan), steps after it
// run once (the holistic review/verify). The runner iterates it in order in one
// worktree, committing + carrying a compact summary forward per item. A flow
// without a checklistSegment just runs once (the instant-task / N=1 case).
export const flowChecklistSegmentSchema = z
  .object({
    from: flowTokenSchema,
    to: flowTokenSchema,
  })
  .strict();
export type FlowChecklistSegment = z.infer<typeof flowChecklistSegmentSchema>;

const flowDefinitionBaseSchema = z
  .object({
    id: flowTokenSchema,
    version: z.number().int().positive(),
    label: z.string().min(1).max(160),
    description: z.string().min(1).max(600),
    seats: z.record(flowTokenSchema, flowSeatSchema),
    steps: z.array(flowStepSchema).min(1),
    loop: flowLoopSchema.optional(),
    checklistSegment: flowChecklistSegmentSchema.optional(),
    complexity: flowComplexitySchema.optional(),
    capabilities: flowCapabilitiesSchema.optional(),
  })
  .strict();

const TURN_STEP_KINDS = new Set<FlowStepKind>([
  "agent-turn",
  "review-turn",
  "response-turn",
  "summary-turn",
]);

export const flowDefinitionSchema = flowDefinitionBaseSchema.superRefine(
  (flow, ctx) => {
    const seatIds = new Set(Object.keys(flow.seats));
    if (seatIds.size === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["seats"],
        message: "Flows must declare at least one participant seat.",
      });
    }

    const stepIds = new Set<string>();
    flow.steps.forEach((step, index) => {
      if (stepIds.has(step.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", index, "id"],
          message: `Duplicate Flow step id "${step.id}".`,
        });
      }
      stepIds.add(step.id);

      if (step.seat && !seatIds.has(step.seat)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", index, "seat"],
          message: `Flow step "${step.id}" references unknown seat "${step.seat}".`,
        });
      }
      if (TURN_STEP_KINDS.has(step.kind) && !step.seat) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", index, "seat"],
          message: `Flow step "${step.id}" of kind "${step.kind}" needs a seat.`,
        });
      }
      if (step.kind === "approval-gate" && !step.approval) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", index, "approval"],
          message: `Flow approval gate "${step.id}" needs approval metadata.`,
        });
      }
      if (step.kind !== "approval-gate" && step.approval) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", index, "approval"],
          message: `Flow step "${step.id}" can only declare approval metadata when kind is "approval-gate".`,
        });
      }
      if (step.kind === "approval-gate" && step.repeat) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", index, "repeat"],
          message: `Flow approval gate "${step.id}" cannot repeat.`,
        });
      }
    });

    if (flow.checklistSegment) {
      const idx = (id: string) => flow.steps.findIndex((s) => s.id === id);
      const segFrom = idx(flow.checklistSegment.from);
      const segTo = idx(flow.checklistSegment.to);
      if (segFrom < 0 || segTo < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["checklistSegment"],
          message:
            "Flow checklistSegment from/to must reference existing step ids.",
        });
      } else if (segFrom > segTo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["checklistSegment"],
          message: "Flow checklistSegment `from` must come at or before `to`.",
        });
      } else if (flow.loop) {
        // The per-item band and the adaptive review loop must not overlap - the
        // design puts review/verify/fix in the postlude, *after* the segment.
        const loopFromI = flow.steps.findIndex((s) => s.id === flow.loop!.from);
        if (loopFromI >= 0 && loopFromI <= segTo) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["checklistSegment"],
            message:
              "Flow checklistSegment must end before the adaptive loop begins (review/verify run once, after the per-item band).",
          });
        }
      }
    }

    if (flow.loop) {
      const idx = (id: string) => flow.steps.findIndex((s) => s.id === id);
      const fromI = idx(flow.loop.from);
      const toI = idx(flow.loop.to);
      const decI = idx(flow.loop.decisionStep);
      if (fromI < 0 || toI < 0 || decI < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["loop"],
          message: "Flow loop from/to/decisionStep must reference existing step ids.",
        });
      } else {
        if (fromI > toI) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["loop"],
            message: "Flow loop `from` must come at or before `to`.",
          });
        }
        if (decI < fromI || decI > toI) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["loop"],
            message: "Flow loop `decisionStep` must be inside the from..to body.",
          });
        }
        if (flow.steps[decI] && flow.steps[decI]!.kind !== "review-turn") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["loop"],
            message: "Flow loop `decisionStep` must be a review-turn (it gates the loop).",
          });
        }
        // Steps inside an adaptive loop can't also carry a fixed repeat - the
        // loop owns their iteration.
        for (let i = fromI; i <= toI; i += 1) {
          if (flow.steps[i]!.repeat) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["steps", i, "repeat"],
              message: `Flow step "${flow.steps[i]!.id}" is inside an adaptive loop and can't also use fixed repeat.`,
            });
          }
        }
      }
    }

    // ── Graph (DAG) validation (Slice 4, custom-workflow-dags.md Phase A) ──
    // A flow is in "graph mode" iff any step declares `needs`. The linear path
    // is preserved byte-for-byte for non-graph flows, so this whole block is a
    // no-op for them. For graph flows we validate structure only (acyclicity,
    // topological order, distinct concurrent outputs, width cap) - who *writes*
    // is crew-dependent and so is enforced at resolve time, not here.
    const graphMode = flow.steps.some((s) => s.needs.length > 0);
    if (graphMode) {
      // First-slice restriction: a DAG may not also use the adaptive loop or the
      // per-item band. Those crossings (a graph x the review loop / checklist)
      // are Phase D - reject the combination now with a clear message.
      if (flow.loop) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["loop"],
          message:
            "A flow that declares step `needs` (graph mode) can't also use an adaptive `loop` yet - that combination is deferred.",
        });
      }
      if (flow.checklistSegment) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["checklistSegment"],
          message:
            "A flow that declares step `needs` (graph mode) can't also use a `checklistSegment` yet - that combination is deferred.",
        });
      }

      const indexById = new Map<string, number>();
      flow.steps.forEach((s, i) => indexById.set(s.id, i));

      flow.steps.forEach((step, index) => {
        // Fixed repeat expands a step into new ids (`<id>-repeat-N`), which can't
        // be DAG targets cleanly; keep graph steps un-repeated for the first slice.
        if (step.repeat) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["steps", index, "repeat"],
            message: `Flow step "${step.id}" declares \`needs\` (graph mode) and can't also use a fixed \`repeat\`.`,
          });
        }
        const seen = new Set<string>();
        for (const need of step.needs) {
          if (need === step.id) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["steps", index, "needs"],
              message: `Flow step "${step.id}" can't depend on itself.`,
            });
            continue;
          }
          if (seen.has(need)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["steps", index, "needs"],
              message: `Flow step "${step.id}" lists "${need}" in \`needs\` more than once.`,
            });
          }
          seen.add(need);
          const target = indexById.get(need);
          if (target === undefined) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["steps", index, "needs"],
              message: `Flow step "${step.id}" needs unknown step "${need}".`,
            });
            continue;
          }
          // A valid topological order means every dependency appears earlier in
          // the array. This both keeps the YAML readable and makes the graph
          // acyclic by construction (all edges point backwards).
          if (target >= index) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["steps", index, "needs"],
              message: `Flow step "${step.id}" needs "${need}", which must be declared earlier (steps must be in topological order; this would form a cycle).`,
            });
          }
        }
      });

      // Parallel groups = steps sharing an identical `needs` set. Members may run
      // concurrently, so they must (a) stay within the width cap and (b) never
      // write the same output token (the join consumes each by name).
      const groups = new Map<string, FlowStep[]>();
      for (const step of flow.steps) {
        const key = [...step.needs].sort().join(" ");
        const bucket = groups.get(key);
        if (bucket) bucket.push(step);
        else groups.set(key, [step]);
      }
      for (const [, members] of groups) {
        if (members.length < 2) continue;
        if (members.length > MAX_PARALLEL_FANOUT) {
          const memberIdx = flow.steps.findIndex((s) => s.id === members[0]!.id);
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["steps", memberIdx, "needs"],
            message: `Parallel group ${members
              .map((m) => `"${m.id}"`)
              .join(", ")} has ${members.length} steps, over the max fan-out of ${MAX_PARALLEL_FANOUT}.`,
          });
        }
        const outputOwner = new Map<string, string>();
        for (const member of members) {
          for (const out of member.outputs) {
            const owner = outputOwner.get(out);
            if (owner) {
              const memberIdx = flow.steps.findIndex((s) => s.id === member.id);
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["steps", memberIdx, "outputs"],
                message: `Concurrent steps "${owner}" and "${member.id}" both write output "${out}"; parallel-group steps must write distinct outputs.`,
              });
            } else {
              outputOwner.set(out, member.id);
            }
          }
        }
      }
    }
  },
);
export type FlowDefinition = z.infer<typeof flowDefinitionSchema>;

/** True iff the flow opts into graph scheduling (any step declares `needs`). */
export function isGraphFlow(flow: {
  steps: ReadonlyArray<{ needs?: readonly string[] }>;
}): boolean {
  return flow.steps.some((s) => (s.needs?.length ?? 0) > 0);
}

/**
 * Steps grouped by their identical `needs` set, keyed by a stable signature.
 * Only groups with >= 2 members can actually run concurrently; callers filter.
 */
export function parallelGroupsOf<T extends { needs?: readonly string[] }>(
  steps: readonly T[],
): T[][] {
  const groups = new Map<string, T[]>();
  for (const step of steps) {
    const key = [...(step.needs ?? [])].sort().join(" ");
    const bucket = groups.get(key);
    if (bucket) bucket.push(step);
    else groups.set(key, [step]);
  }
  return [...groups.values()];
}

export const flowSourceSchema = z
  .object({
    kind: z.enum(["builtin", "project", "fixture"]),
    ref: z.string().min(1),
  })
  .strict();
export type FlowSource = z.infer<typeof flowSourceSchema>;

export const resolvedFlowSeatSchema = z
  .object({
    id: flowTokenSchema,
    label: z.string().min(1).max(120),
    description: z.string().nullable().default(null),
  })
  .strict();
export type ResolvedFlowSeat = z.infer<typeof resolvedFlowSeatSchema>;

export const resolvedFlowStepSchema = z
  .object({
    id: flowTokenSchema,
    label: z.string().min(1).max(160),
    kind: flowStepKindSchema,
    enabled: z.boolean(),
    optional: z.boolean(),
    skipWhenReadOnly: z.boolean(),
    stage: flowStageSchema.nullable(),
    // The Seat this step needs (null for validation / approval-gate steps).
    seat: flowTokenSchema.nullable(),
    // Resolved from the run's Crew: the Role that fills the Seat, its Profile,
    // and the Provider behind that Profile. All null for seatless steps.
    resolvedRoleId: flowRoleIdSchema.nullable(),
    resolvedRoleLabel: z.string().min(1).max(160).nullable(),
    profileId: z.string().min(1).nullable(),
    providerId: z.string().min(1).nullable(),
    inputs: z.array(flowTokenSchema),
    outputs: z.array(flowTokenSchema),
    // DAG dependencies (Slice 4). Source step ids - graph flows reject `repeat`
    // and loop/checklist, so resolved ids equal source ids and these carry over
    // unchanged. Empty for linear flows (the runner then uses the linear path).
    needs: z.array(flowTokenSchema).default([]),
    // Step-specific prompt instruction (e.g. a reviewer's lens). null when none.
    instructions: z.string().min(1).max(800).nullable().default(null),
    approval: flowApprovalGateSchema.nullable(),
    sourceStepId: flowTokenSchema,
    repeatIteration: z.number().int().positive(),
    repeatCount: z.number().int().positive(),
  })
  .strict();
export type ResolvedFlowStep = z.infer<typeof resolvedFlowStepSchema>;

export const resolvedFlowSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    flowId: flowTokenSchema,
    flowVersion: z.number().int().positive(),
    label: z.string().min(1).max(160),
    description: z.string().min(1).max(600),
    source: flowSourceSchema,
    task: z.string().min(1).max(2000),
    brief: z.string().nullable().default(null),
    contextPolicy: flowContextPolicySchema,
    resolvedAt: z.string(),
    // The Crew this snapshot was resolved against (Seats → Roles came from it).
    crewId: z.string().min(1),
    seats: z.array(resolvedFlowSeatSchema).min(1),
    steps: z.array(resolvedFlowStepSchema).min(1),
    // Carried through unchanged when the flow declares an adaptive loop; the
    // runner (not the resolver) iterates it. null for linear flows.
    loop: flowLoopSchema.nullable().default(null),
    // The per-item band (Phase 3 pick-up execution). Carried through from the
    // definition; the runner repeats from..to once per checklist item. null
    // when the flow isn't checklist-aware (then every run is the N=1 case).
    checklistSegment: flowChecklistSegmentSchema.nullable().default(null),
    // Declared weight class (Phase 3 C1). null ⇒ infer from agent-turn count.
    complexity: flowComplexitySchema.nullable().default(null),
  })
  .strict();
export type ResolvedFlowSnapshot = z.infer<typeof resolvedFlowSnapshotSchema>;
