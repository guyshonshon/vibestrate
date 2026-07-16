import { z } from "zod";
import { approvalRiskSchema } from "../../core/approval-types.js";
import { skillReferenceSchema } from "../../agents/skill-schema.js";
import { reviewLensSchema } from "../../supervisor/review-lenses.js";

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

// How heavy a Flow is - its "weight class". Used to warn when a
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

// ── Flow parameters ──────────────────────────────────────────────────────────
// A Flow can declare typed `params:` the caller fills at run start (flags /
// interactive prompts / a dashboard form). They substitute into the task + step
// instructions via `{{params.<name>}}`. A `secret: true` param is recorded
// redacted and NOT inlined into prompts (the product's no-secrets-in-prompts
// posture - see prompt-params.ts). Param names are `{{...}}`-safe identifiers.
export const flowParamNameSchema = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z][a-zA-Z0-9_]*$/, "Param names must be a-z identifiers (snake/camel).");

export const flowParamTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "enum",
  "path",
]);
export type FlowParamType = z.infer<typeof flowParamTypeSchema>;

export const flowParamSchema = z
  .object({
    type: flowParamTypeSchema,
    description: z.string().min(1).max(400).optional(),
    required: z.boolean().default(false),
    /** Default value (used when the caller doesn't supply one). */
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    /** Allowed values for `type: enum`. */
    values: z.array(z.string().min(1).max(120)).min(1).optional(),
    /** Recorded redacted + never inlined into prompts. */
    secret: z.boolean().default(false),
    /**
     * Durable param memory (Profiling): how this param's stored value is keyed
     * in `.vibestrate/project-profile.json`. Default `false` -> the value is
     * **namespaced per flow** (`<flowId>.<param>`), so two flows that both
     * declare `name` never cross-contaminate. `true` -> a **project-global**
     * key (the bare param name), reused by any flow declaring a `shared` param
     * of that name ("fill `niche` once, every flow sees it"). See
     * docs/design/profiling-intake.md.
     */
    shared: z.boolean().default(false),
    /**
     * Optional, model-independent "generate a default" hint. When present, the
     * intake surfaces (CLI / Composer) offer a **user-initiated** Generate
     * affordance that calls `runAssist` with this instruction (interpolating
     * other known profile values via `{{params.x}}`) to draft a suggestion the
     * user reviews/edits/accepts. Never auto-fired, never auto-committed; works
     * on any provider, required on none. A secret param can't be generated.
     */
    generate: z
      .object({ instruction: z.string().min(1).max(600) })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.type === "enum" && (!p.values || p.values.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["values"],
        message: "An enum param must list its allowed `values`.",
      });
    }
    if (p.type === "enum" && p.default !== undefined && typeof p.default === "string" && p.values && !p.values.includes(p.default)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["default"],
        message: `The default "${p.default}" is not one of the enum values.`,
      });
    }
    if (p.secret && p.default !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["default"],
        message: "A secret param can't carry a default value in the flow file.",
      });
    }
    if (p.secret && p.generate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["generate"],
        message:
          "A secret param can't declare `generate` - a secret is collected as an env var name, never model-drafted.",
      });
    }
  });
export type FlowParam = z.infer<typeof flowParamSchema>;

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
    // Explicit DAG edges (custom-workflow-dags.md): the step
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
    // Continue-past-failure: a best-effort turn. If it hard-fails at
    // runtime (the provider throws - missing CLI, spawn/internal error), the run
    // is NOT aborted; the step is marked `failed`, recorded, and the graph
    // advances so a join (e.g. an arbiter) proceeds with the surviving siblings.
    // Control signals (abort / approval / spend cap / denied) always propagate.
    // Only honored by the graph scheduler, so it's restricted to graph flows and
    // to turn kinds (see validation below). A non-zero provider *exit* already
    // continues by design; this covers the hard-throw case the fan-out would
    // otherwise let take the whole run down. See custom-workflow-dags.md.
    continueOnError: z.boolean().default(false),
    // Per-step retries: extra attempts for a flaky turn. If the turn
    // fails (provider non-zero exit) or throws (non-control) on an attempt, it's
    // re-run up to `retries` more times before the outcome is final (then
    // continueOnError / abort decide). Total attempts = retries + 1. Control
    // signals (abort / approval / spend / denied) are never retried. Honored only
    // by the graph scheduler, so restricted to graph flows + turn kinds (below).
    retries: z.number().int().min(0).max(5).default(0),
    // Coarse phase, used as a resume boundary (see flowStageSchema).
    stage: flowStageSchema.optional(),
    approval: flowApprovalGateSchema.optional(),
    repeat: flowStepRepeatSchema.optional(),
    // Express (proportional-orchestration.md): deterministic review descent.
    // A review-turn marked `skipWhen:
    // "inert_diff"` is skipped at runtime ONLY when the run's ACTUAL diff is
    // strict-prose (.md/.markdown/.txt/.rst) AND touches no protected path
    // (orchestrator/protected-paths.ts) - recorded evidence, never model
    // judgment or task text. Restricted by validation below: review-turn only,
    // linear flows only, never inside an adaptive loop body (the loop's
    // decision contract needs a real decision).
    skipWhen: z.enum(["inert_diff"]).optional(),
    // Clean-room context (context-scaling.md rung 2): when true, this step's seat
    // does NOT get the producer's run-derived narrative - the run brief (the
    // "story so far") and the planner-only ledger/continuity - so a judge reasons
    // without anchoring to how the producer framed things. It KEEPS ground truth:
    // attached context sources (the spec), user annotations, and the step's
    // declared `inputs`. (A controlled eval showed dropping the spec from a
    // reviewer weakens spec-compliance review, while dropping the brief cost
    // nothing.) Opt-in per step, default off; never prunes declared `inputs`.
    cleanRoom: z.boolean().default(false),
    // Per-step skills ("flow owns skills"): skill ids attached to THIS
    // step's agent prompt, merged (deduped) with the agent's own skills and the
    // run-level runtimeSkills - scoped to this turn only. Knowledge bound to a
    // phase (e.g. a "WhatsApp integration" skill on the build step) without a new
    // top-level primitive. Validated against skillReferenceSchema so a saveable
    // value is always a well-formed id; a missing skill still hard-fails the turn
    // at loadSkills (same as a run-level skill typo). Restricted to turn kinds.
    skills: z.array(skillReferenceSchema).max(32).default([]),
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
// run is picked up from a card with a Checklist. `from`..`to` is the
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
    /** Hidden from user-facing flow listings/pickers (composer, Flows hub, `vibe
     *  flows`, suggestion). Still launchable by id (the adaptive Shape trigger,
     *  the consult-submit, `--flow <id>`). For internal phases like Shape that
     *  use the flow runner as a substrate but must NOT read as a selectable
     *  flow. NOT access control - the by-id resolvers still serve it. */
    hidden: z.boolean().optional(),
    /** Typed parameters the caller fills at run start, keyed by name. */
    params: z.record(flowParamNameSchema, flowParamSchema).optional(),
    /**
     * Checklist-review lens configuration. When set, `resolveFlow` expands the
     * per-item band's reviewer fan-out from these lenses (one read-only reviewer
     * per lens), via `resolveChecklistReviewLenses` (precedence crew > flow >
     * default `[correctness, security-risk]`). min(1) prevents a silently-empty
     * lens set; max is the parallel fan-out cap (each lens is one concurrent
     * band reviewer, so the panel can never exceed MAX_PARALLEL_FANOUT).
     */
    checklistReview: z
      .object({ lenses: z.array(reviewLensSchema).min(1).max(MAX_PARALLEL_FANOUT) })
      .strict()
      .optional(),
  })
  .strict();

const TURN_STEP_KINDS = new Set<FlowStepKind>([
  "agent-turn",
  "review-turn",
  "response-turn",
  "summary-turn",
]);

/**
 * The skipWhen (express deterministic review-descent) constraints, asserted
 * on BOTH the authored flow definition AND the resolved snapshot so a
 * hand-crafted snapshot can't bypass them if a future code path ever feeds one
 * in (defense-in-depth). skipWhen is valid only on a review-turn, in
 * a linear flow (no `needs`), never in a checklist flow, and never inside the
 * adaptive loop body - a skipped decision step would leave the loop's exit
 * contract undefined or narrow the band review to a per-item diff slice.
 */
function addSkipWhenConstraintIssues(
  flow: {
    steps: ReadonlyArray<{
      id: string;
      kind: string;
      skipWhen?: unknown;
      needs: readonly string[];
    }>;
    checklistSegment?: { from: string; to: string } | null;
    loop?: { from: string; to: string } | null;
  },
  ctx: z.RefinementCtx,
): void {
  const anyNeeds = flow.steps.some((s) => s.needs.length > 0);
  const loop = flow.loop;
  const loopFrom = loop ? flow.steps.findIndex((s) => s.id === loop.from) : -1;
  const loopTo = loop ? flow.steps.findIndex((s) => s.id === loop.to) : -1;
  flow.steps.forEach((step, index) => {
    if (!step.skipWhen) return;
    if (step.kind !== "review-turn") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["steps", index, "skipWhen"],
        message: `Flow step "${step.id}" of kind "${step.kind}" can't use skipWhen (review-turn steps only).`,
      });
    }
    if (anyNeeds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["steps", index, "skipWhen"],
        message: `Flow step "${step.id}" uses skipWhen, which is only supported in linear flows (no \`needs\`).`,
      });
    }
    if (flow.checklistSegment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["steps", index, "skipWhen"],
        message: `Flow step "${step.id}" can't use skipWhen in a checklist flow (per-item commits make the diff a per-item slice).`,
      });
    }
    if (
      loop &&
      loopFrom >= 0 &&
      loopTo >= loopFrom &&
      index >= loopFrom &&
      index <= loopTo
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["steps", index, "skipWhen"],
        message: `Flow step "${step.id}" can't use skipWhen inside the adaptive loop body.`,
      });
    }
  });
}

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
      // continueOnError is honored only by the graph scheduler and only
      // for model turns, so reject it elsewhere rather than let it silently no-op.
      if (step.continueOnError && !TURN_STEP_KINDS.has(step.kind)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", index, "continueOnError"],
          message: `Flow step "${step.id}" of kind "${step.kind}" can't use continueOnError (turn steps only).`,
        });
      }
      if (step.continueOnError && !flow.steps.some((s) => s.needs.length > 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", index, "continueOnError"],
          message: `Flow step "${step.id}" uses continueOnError, which is only supported in graph flows (declare step \`needs\`).`,
        });
      }
      // retries mirrors continueOnError: graph scheduler + turn kinds only.
      if (step.retries > 0 && !TURN_STEP_KINDS.has(step.kind)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", index, "retries"],
          message: `Flow step "${step.id}" of kind "${step.kind}" can't use retries (turn steps only).`,
        });
      }
      // Per-step skills only attach to a model turn's prompt; a seatless
      // validation/approval-gate step has no prompt to inject them into.
      if (step.skills.length > 0 && !TURN_STEP_KINDS.has(step.kind)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", index, "skills"],
          message: `Flow step "${step.id}" of kind "${step.kind}" can't declare skills (turn steps only).`,
        });
      }
      if (step.retries > 0 && !flow.steps.some((s) => s.needs.length > 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", index, "retries"],
          message: `Flow step "${step.id}" uses retries, which is only supported in graph flows (declare step \`needs\`).`,
        });
      }
    });

    addSkipWhenConstraintIssues(flow, ctx);

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
      // No arbitration inside the per-item band. The band repeats once per
      // checklist item, reusing the same step ids; the arbitration ledger +
      // suggestion ingest are run-global and keyed by model-supplied finding id,
      // so arbitration-output tokens would silently overwrite across items.
      // summary-turns are also excluded (they write to the run-global ledger).
      // NOTE: review-turns ARE permitted in the band (pickup-review):
      // a per-item review panel (review-correctness, review-risk, arbiter) writes
      // only per-item scoped tokens (findings-correctness, findings-risk,
      // review-decision) - none of which are arbitration tokens - so there is no
      // ledger collision. The ARBITRATION_TOKENS check below catches the real risk.
      if (segFrom >= 0 && segTo >= segFrom) {
        const ARBITRATION_TOKENS = new Set([
          "findings",
          "finding-responses",
          "finding-resolutions",
          "decision-summary",
        ]);
        for (let i = segFrom; i <= segTo; i += 1) {
          const step = flow.steps[i]!;
          if (step.kind === "summary-turn") {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["steps", i, "kind"],
              message: `Flow step "${step.id}" is a summary-turn inside the per-item band; summary steps write to the run-global arbitration ledger which would collide across items. Move it to the postlude, after the band.`,
            });
          }
          const arb = step.outputs.find((o) => ARBITRATION_TOKENS.has(o));
          if (arb) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["steps", i, "outputs"],
              message: `Flow step "${step.id}" writes the arbitration token "${arb}" inside the per-item band; that ledger is run-global and would collide across items. Emit it from a postlude step instead.`,
            });
          }
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

    // ── Graph (DAG) validation (custom-workflow-dags.md) ──
    // A flow is in "graph mode" iff any step declares `needs`. The linear path
    // is preserved byte-for-byte for non-graph flows, so this whole block is a
    // no-op for them. For graph flows we validate structure only (acyclicity,
    // topological order, distinct concurrent outputs, width cap) - who *writes*
    // is crew-dependent and so is enforced at resolve time, not here.
    const graphMode = flow.steps.some((s) => s.needs.length > 0);
    if (graphMode) {
      // Loop x graph is still deferred (the adaptive review loop crossed with a
      // DAG). The checklist x graph cross IS supported: a DAG inside
      // the per-item band, repeated once per checklist item - see below.
      if (flow.loop) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["loop"],
          message:
            "A flow that declares step `needs` (graph mode) can't also use an adaptive `loop` yet - that combination is deferred.",
        });
      }

      const indexById = new Map<string, number>();
      flow.steps.forEach((s, i) => indexById.set(s.id, i));

      // Checklist DAGs (graph x per-item band): when a graph flow also
      // declares a `checklistSegment`, the DAG must be CONFINED to the band. The
      // band [from..to] repeats once per checklist item and runs through the
      // frontier scheduler; the prelude (before `from`) and postlude (after `to`)
      // stay on the untouched linear path, so they must remain linear (no
      // `needs`). Confining edges to the band also keeps the needs-signature
      // grouping honest: empty-`needs` prelude/postlude steps must not be
      // conflated with the band's parallel roots. (The from/to existence + order
      // is already validated in the checklistSegment block above.)
      const bandFrom =
        flow.checklistSegment
          ? flow.steps.findIndex((s) => s.id === flow.checklistSegment!.from)
          : -1;
      const bandTo =
        flow.checklistSegment
          ? flow.steps.findIndex((s) => s.id === flow.checklistSegment!.to)
          : -1;
      const bandResolved = bandFrom >= 0 && bandTo >= bandFrom;
      if (flow.checklistSegment && bandResolved) {
        flow.steps.forEach((step, index) => {
          const inBand = index >= bandFrom && index <= bandTo;
          if (step.needs.length > 0 && !inBand) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["steps", index, "needs"],
              message: `Flow step "${step.id}" declares \`needs\` outside the per-item band (${flow.checklistSegment!.from}..${flow.checklistSegment!.to}). In a checklist + graph flow only band steps may fan out; the prelude and postlude run linearly.`,
            });
          }
          for (const need of step.needs) {
            const t = indexById.get(need);
            if (t !== undefined && (t < bandFrom || t > bandTo)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["steps", index, "needs"],
                message: `Flow step "${step.id}" needs "${need}", which is outside the per-item band. Band steps may only depend on other band steps (prelude artifacts are carried via \`inputs\`, not \`needs\`).`,
              });
            }
          }
        });
      }

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
      // write the same output token (the join consumes each by name). For a
      // checklist + graph flow the DAG lives only in the band, so group
      // over the band steps - else empty-`needs` prelude/postlude steps (linear,
      // not concurrent) would be miscounted as one giant parallel group and
      // falsely trip the width cap / distinct-output checks.
      const groupSteps =
        flow.checklistSegment && bandResolved
          ? flow.steps.slice(bandFrom, bandTo + 1)
          : flow.steps;
      const groups = new Map<string, FlowStep[]>();
      for (const step of groupSteps) {
        const key = [...step.needs].sort().join("\0");
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
    const key = [...(step.needs ?? [])].sort().join("\0");
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
    // Clean-room context (see flowStepSchema.cleanRoom): drop run-level grounding
    // for this seat, keeping only its declared inputs + task/rules/role.
    cleanRoom: z.boolean().default(false),
    // Per-step skills (see flowStepSchema.skills): merged into this turn's prompt.
    skills: z.array(skillReferenceSchema).max(32).default([]),
    // Express deterministic review descent (see flowStepSchema.skipWhen).
    skipWhen: z.enum(["inert_diff"]).nullable().default(null),
    // Best-effort turn: a hard runtime failure is tolerated by the
    // graph scheduler (mark failed + continue) instead of aborting the run.
    continueOnError: z.boolean().default(false),
    // Extra attempts for a flaky turn; total attempts = retries + 1.
    retries: z.number().int().min(0).max(5).default(0),
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
    // DAG dependencies. Source step ids - graph flows reject `repeat`
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
    // The per-item band (checklist pick-up execution). Carried through from the
    // definition; the runner repeats from..to once per checklist item. null
    // when the flow isn't checklist-aware (then every run is the N=1 case).
    checklistSegment: flowChecklistSegmentSchema.nullable().default(null),
    // Declared weight class. null ⇒ infer from agent-turn count.
    complexity: flowComplexitySchema.nullable().default(null),
    // The flow's declared param schema, carried through for the dashboard
    // form + re-resolution. null when the flow declares no params.
    params: z.record(flowParamNameSchema, flowParamSchema).nullable().default(null),
  })
  .strict()
  // Re-assert the skipWhen constraints on the resolved snapshot too.
  // Every path into a running snapshot is gated by the source schema today, so
  // this is defense-in-depth: a hand-crafted snapshot fed in by a future code
  // path can't bypass the review-turn-only / linear-only / no-checklist /
  // no-loop-body rules that live on the definition schema.
  .superRefine(addSkipWhenConstraintIssues);
export type ResolvedFlowSnapshot = z.infer<typeof resolvedFlowSnapshotSchema>;
