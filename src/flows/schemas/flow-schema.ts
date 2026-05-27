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

export const flowSlotSchema = z
  .object({
    label: z.string().min(1).max(120),
    description: z.string().min(1).max(400).optional(),
    defaultRole: flowRoleIdSchema,
  })
  .strict();
export type FlowSlot = z.infer<typeof flowSlotSchema>;

export const flowStepSchema = z
  .object({
    id: flowTokenSchema,
    label: z.string().min(1).max(160),
    kind: flowStepKindSchema,
    slot: flowTokenSchema.optional(),
    roleId: flowRoleIdSchema.optional(),
    inputs: z.array(flowTokenSchema).default([]),
    outputs: z.array(flowTokenSchema).default([]),
    optional: z.boolean().default(false),
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

const flowDefinitionBaseSchema = z
  .object({
    id: flowTokenSchema,
    version: z.number().int().positive(),
    label: z.string().min(1).max(160),
    description: z.string().min(1).max(600),
    slots: z.record(flowTokenSchema, flowSlotSchema),
    steps: z.array(flowStepSchema).min(1),
    loop: flowLoopSchema.optional(),
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
    const slotIds = new Set(Object.keys(flow.slots));
    if (slotIds.size === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slots"],
        message: "Flows must declare at least one participant slot.",
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

      if (step.slot && !slotIds.has(step.slot)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", index, "slot"],
          message: `Flow step "${step.id}" references unknown slot "${step.slot}".`,
        });
      }
      if (TURN_STEP_KINDS.has(step.kind) && !step.slot) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", index, "slot"],
          message: `Flow step "${step.id}" of kind "${step.kind}" needs a slot.`,
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

export const resolvedFlowSlotSchema = z
  .object({
    id: flowTokenSchema,
    label: z.string().min(1).max(120),
    description: z.string().nullable().default(null),
    defaultRole: flowRoleIdSchema,
    providerId: z.string().min(1),
  })
  .strict();
export type ResolvedFlowSlot = z.infer<typeof resolvedFlowSlotSchema>;

export const resolvedFlowStepSchema = z
  .object({
    id: flowTokenSchema,
    label: z.string().min(1).max(160),
    kind: flowStepKindSchema,
    enabled: z.boolean(),
    optional: z.boolean(),
    slotId: flowTokenSchema.nullable(),
    roleId: flowRoleIdSchema.nullable(),
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
    slots: z.array(resolvedFlowSlotSchema).min(1),
    steps: z.array(resolvedFlowStepSchema).min(1),
  })
  .strict();
export type ResolvedFlowSnapshot = z.infer<typeof resolvedFlowSnapshotSchema>;
