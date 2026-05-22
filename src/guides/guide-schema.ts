import { z } from "zod";

const GUIDE_TOKEN_RE = /^[a-z][a-z0-9-]*$/;
const GUIDE_AGENT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export const guideTokenSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(GUIDE_TOKEN_RE, "Guide tokens must use lowercase letters, digits, and dashes.");

export const guideAgentIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    GUIDE_AGENT_RE,
    "Guide agent ids must be path-safe letters, digits, dots, underscores, or dashes.",
  );

export const guideStepKindSchema = z.enum([
  "agent-turn",
  "review-turn",
  "response-turn",
  "validation",
  "approval-gate",
  "summary-turn",
]);
export type GuideStepKind = z.infer<typeof guideStepKindSchema>;

export const guideContextPolicySchema = z.enum([
  "balanced",
  "compact",
  "artifact-heavy",
]);
export type GuideContextPolicy = z.infer<typeof guideContextPolicySchema>;

export const guideSlotSchema = z
  .object({
    label: z.string().min(1).max(120),
    description: z.string().min(1).max(400).optional(),
    defaultAgent: guideAgentIdSchema,
  })
  .strict();
export type GuideSlot = z.infer<typeof guideSlotSchema>;

export const guideStepSchema = z
  .object({
    id: guideTokenSchema,
    label: z.string().min(1).max(160),
    kind: guideStepKindSchema,
    slot: guideTokenSchema.optional(),
    agentId: guideAgentIdSchema.optional(),
    inputs: z.array(guideTokenSchema).default([]),
    outputs: z.array(guideTokenSchema).default([]),
    optional: z.boolean().default(false),
  })
  .strict();
export type GuideStep = z.infer<typeof guideStepSchema>;

const guideDefinitionBaseSchema = z
  .object({
    id: guideTokenSchema,
    version: z.number().int().positive(),
    label: z.string().min(1).max(160),
    description: z.string().min(1).max(600),
    slots: z.record(guideTokenSchema, guideSlotSchema),
    steps: z.array(guideStepSchema).min(1),
  })
  .strict();

const TURN_STEP_KINDS = new Set<GuideStepKind>([
  "agent-turn",
  "review-turn",
  "response-turn",
  "summary-turn",
]);

export const guideDefinitionSchema = guideDefinitionBaseSchema.superRefine(
  (guide, ctx) => {
    const slotIds = new Set(Object.keys(guide.slots));
    if (slotIds.size === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slots"],
        message: "Guides must declare at least one participant slot.",
      });
    }

    const stepIds = new Set<string>();
    guide.steps.forEach((step, index) => {
      if (stepIds.has(step.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", index, "id"],
          message: `Duplicate Guide step id "${step.id}".`,
        });
      }
      stepIds.add(step.id);

      if (step.slot && !slotIds.has(step.slot)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", index, "slot"],
          message: `Guide step "${step.id}" references unknown slot "${step.slot}".`,
        });
      }
      if (TURN_STEP_KINDS.has(step.kind) && !step.slot) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", index, "slot"],
          message: `Guide step "${step.id}" of kind "${step.kind}" needs a slot.`,
        });
      }
    });
  },
);
export type GuideDefinition = z.infer<typeof guideDefinitionSchema>;

export const guideSourceSchema = z
  .object({
    kind: z.enum(["builtin", "project", "fixture"]),
    ref: z.string().min(1),
  })
  .strict();
export type GuideSource = z.infer<typeof guideSourceSchema>;

export const resolvedGuideSlotSchema = z
  .object({
    id: guideTokenSchema,
    label: z.string().min(1).max(120),
    description: z.string().nullable().default(null),
    defaultAgent: guideAgentIdSchema,
    providerId: z.string().min(1),
  })
  .strict();
export type ResolvedGuideSlot = z.infer<typeof resolvedGuideSlotSchema>;

export const resolvedGuideStepSchema = z
  .object({
    id: guideTokenSchema,
    label: z.string().min(1).max(160),
    kind: guideStepKindSchema,
    enabled: z.boolean(),
    optional: z.boolean(),
    slotId: guideTokenSchema.nullable(),
    agentId: guideAgentIdSchema.nullable(),
    providerId: z.string().min(1).nullable(),
    inputs: z.array(guideTokenSchema),
    outputs: z.array(guideTokenSchema),
  })
  .strict();
export type ResolvedGuideStep = z.infer<typeof resolvedGuideStepSchema>;

export const resolvedGuideSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    guideId: guideTokenSchema,
    guideVersion: z.number().int().positive(),
    label: z.string().min(1).max(160),
    description: z.string().min(1).max(600),
    source: guideSourceSchema,
    task: z.string().min(1).max(2000),
    brief: z.string().nullable().default(null),
    contextPolicy: guideContextPolicySchema,
    resolvedAt: z.string(),
    slots: z.array(resolvedGuideSlotSchema).min(1),
    steps: z.array(resolvedGuideStepSchema).min(1),
  })
  .strict();
export type ResolvedGuideSnapshot = z.infer<typeof resolvedGuideSnapshotSchema>;
