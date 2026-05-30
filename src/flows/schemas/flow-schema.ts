import { z } from "zod";
import { approvalRiskSchema } from "../../core/approval-types.js";

const FLOW_TOKEN_RE = /^[a-z][a-z0-9-]*$/;
const FLOW_AGENT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

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
// targets are stable across flows. Optional — a flow only needs it on steps
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

// A **Seat** is what a Flow step needs filled (e.g. an `implementer`). The Flow
// declares its required seats; it does NOT name local Role ids — the run's Crew
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
    optional: z.boolean().default(false),
    // Skipped on a read-only (investigation-only) run. Marks steps that write
    // code or only make sense once code changed — executor/fixer turns,
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
// review-turn inside the body) gates it — exit when it isn't CHANGES_REQUESTED.
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
        // The per-item band and the adaptive review loop must not overlap — the
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
        // Steps inside an adaptive loop can't also carry a fixed repeat — the
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
  },
);
export type FlowDefinition = z.infer<typeof flowDefinitionSchema>;

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
  })
  .strict();
export type ResolvedFlowSnapshot = z.infer<typeof resolvedFlowSnapshotSchema>;
