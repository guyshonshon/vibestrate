import type { ProjectConfig } from "../../project/config-schema.js";
import type { CrewConfig } from "../../agents/crew-schema.js";
import { nowIso } from "../../utils/time.js";
import { REVIEW_LENS_FRAGMENTS, type ReviewLens } from "../../supervisor/review-lenses.js";
import {
  getCrew,
  getCrewRole,
  getProfile,
  roleLabel,
  rolesFillingSeat,
} from "../../agents/crew-registry.js";
import { resolveProfile } from "../../safety/permission-profiles.js";
import {
  findParamEnvCollisions,
  paramEnvVarName,
} from "../../project/project-params.js";
import {
  isGraphFlow,
  MAX_PARALLEL_FANOUT,
  parallelGroupsOf,
  resolvedFlowSnapshotSchema,
  type FlowContextPolicy,
  type FlowDefinition,
  type FlowSource,
  type FlowStepKind,
  type ResolvedFlowSeat,
  type ResolvedFlowSnapshot,
  type ResolvedFlowStep,
} from "../schemas/flow-schema.js";

export const DEFAULT_CHECKLIST_REVIEW_LENSES: ReviewLens[] = [
  "correctness",
  "security-risk",
];

/**
 * Pure. Resolve which review lenses a checklist-review band uses.
 * Precedence: crew > flow > default (`["correctness", "security-risk"]`).
 * Consumed by `expandChecklistReviewBand` during `resolveFlow`, so a flow's
 * `checklistReview.lenses` (or a crew's `checklistReviewLenses`) actually
 * changes which reviewers run per item.
 */
export function resolveChecklistReviewLenses(o: {
  flowLenses?: ReviewLens[];
  crewLenses?: ReviewLens[];
}): ReviewLens[] {
  if (o.crewLenses && o.crewLenses.length) return o.crewLenses;
  if (o.flowLenses && o.flowLenses.length) return o.flowLenses;
  return DEFAULT_CHECKLIST_REVIEW_LENSES;
}

type FlowStep = FlowDefinition["steps"][number];

/** A review lens id -> a short human label for the generated step ("security-risk" -> "security risk"). */
function lensLabel(lens: ReviewLens): string {
  return lens.replace(/-/g, " ");
}

/**
 * Pure. Expand a per-item review band's reviewer fan-out from a resolved lens
 * set: replace the flow's declared band reviewers with one generated, read-only
 * `review-turn` per lens (instruction drawn from the closed
 * `REVIEW_LENS_FRAGMENTS` vocabulary, output token `findings-<lens>`), and
 * rewire the arbiter (the segment's `to` step) to `needs` exactly those
 * generated reviewers and consume their findings tokens. Every other step
 * (writer, micro-plan, the holistic postlude) is untouched. Generated
 * `findings-<lens>` tokens are never the bare `findings`/`decision-summary`
 * ledger tokens, so the band's ARBITRATION_TOKENS guard still holds. Pure.
 */
export function expandChecklistReviewBand(
  steps: FlowStep[],
  checklistSegment: { from: string; to: string } | null | undefined,
  lenses: ReviewLens[],
): FlowStep[] {
  if (!checklistSegment) {
    throw new FlowResolutionError(
      "checklistReview is set but the flow declares no checklistSegment to expand.",
    );
  }
  const arbiterId = checklistSegment.to;
  const arbiter = steps.find((s) => s.id === arbiterId);
  if (!arbiter || arbiter.kind !== "review-turn") {
    throw new FlowResolutionError(
      `checklistReview expansion expects the segment's "to" step ("${arbiterId}") to be a review-turn arbiter.`,
    );
  }
  const arbiterNeeds = new Set(arbiter.needs ?? []);
  const isBandReviewer = (s: FlowStep) =>
    s.kind === "review-turn" && arbiterNeeds.has(s.id);
  const reviewersToReplace = steps.filter(isBandReviewer);
  if (reviewersToReplace.length === 0) {
    throw new FlowResolutionError(
      `checklistReview expansion found no band reviewer steps the arbiter "${arbiterId}" depends on.`,
    );
  }
  const template = reviewersToReplace[0]!;
  const oldFindings = new Set(reviewersToReplace.flatMap((r) => r.outputs ?? []));
  const uniqueLenses = [...new Set(lenses)];
  // The generated reviewers form one parallel group (all `needs` the writer), so
  // the lens count is the band's fan-out width. A declared flow is capped at
  // MAX_PARALLEL_FANOUT at parse time; expansion runs AFTER parse, so enforce the
  // same ceiling here - refuse loudly rather than silently exceed it (the runtime
  // would wave-slice anyway, but the contract must hold and telemetry stay honest).
  if (uniqueLenses.length > MAX_PARALLEL_FANOUT) {
    throw new FlowResolutionError(
      `A per-item review panel may use at most ${MAX_PARALLEL_FANOUT} lenses (the parallel fan-out cap); got ${uniqueLenses.length}: ${uniqueLenses.join(", ")}.`,
    );
  }
  const generated: FlowStep[] = uniqueLenses.map((lens) => ({
    ...template,
    id: `review-${lens}`,
    label: `Review: ${lensLabel(lens)}`,
    outputs: [`findings-${lens}`],
    instructions: `Your lens is ${REVIEW_LENS_FRAGMENTS[lens]} Review ONLY this checklist item's diff; cite file:line, no out-of-lens nits.`,
  }));
  const generatedFindings = uniqueLenses.map((lens) => `findings-${lens}`);
  const replacedIds = new Set(reviewersToReplace.map((r) => r.id));
  const newArbiter: FlowStep = {
    ...arbiter,
    // Drop only the replaced reviewers from `needs` (mirror the inputs filter) -
    // any non-reviewer band dependency a future flow gives the arbiter survives.
    needs: [
      ...(arbiter.needs ?? []).filter((n) => !replacedIds.has(n)),
      ...generated.map((g) => g.id),
    ],
    inputs: [
      ...(arbiter.inputs ?? []).filter((i) => !oldFindings.has(i)),
      ...generatedFindings,
    ],
  };

  const out: FlowStep[] = [];
  let inserted = false;
  for (const s of steps) {
    if (isBandReviewer(s)) {
      if (!inserted) {
        out.push(...generated);
        inserted = true;
      }
      continue; // drop the flow's declared reviewer; replaced by the generated set
    }
    out.push(s.id === arbiterId ? newArbiter : s);
  }
  return out;
}

const TURN_KINDS = new Set<FlowStepKind>([
  "agent-turn",
  "review-turn",
  "response-turn",
  "summary-turn",
]);

export class FlowResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlowResolutionError";
  }
}

/**
 * The review-loop budget the runner bounds on, resolved with a clear precedence:
 *   1. an explicit per-crew override (`crew.maxReviewLoops`) wins outright;
 *   2. else an explicit GLOBAL ceiling (`config.workflow.maxReviewLoops`) lowers
 *      (never raises) the flow's budget - it is opt-in (null = no ceiling), so
 *      the default never silently changes a flow's chosen budget;
 *   3. else the flow's own `loop.maxIterations`.
 */
export function resolveLoopMaxIterations(o: {
  flowMax: number;
  crewMax?: number;
  globalCeiling?: number | null;
}): number {
  if (o.crewMax !== undefined) return o.crewMax;
  if (o.globalCeiling != null) return Math.min(o.flowMax, o.globalCeiling);
  return o.flowMax;
}

export type ResolveFlowInput = {
  flow: FlowDefinition;
  source: FlowSource;
  config: ProjectConfig;
  task: string;
  brief?: string | null;
  contextPolicy?: FlowContextPolicy;
  /** Crew to resolve against. Defaults to `project.defaultCrew`. */
  crewId?: string | null;
  /** Pin a specific Role to a Seat (overrides the fills lookup). seat → roleId. */
  seatRoleOverrides?: Record<string, string | undefined>;
  /** Run-wide Profile override applied to every seated step. */
  profileOverride?: string | null;
  /** Per-step Profile override (step id → profile id). Wins over profileOverride. */
  stepProfileOverrides?: Record<string, string | undefined>;
  /** Supervisor persona's reviewer profile: review-stage seats resolve to it
   *  unless an EXPLICIT override (per-step or run-wide) says otherwise. The
   *  cost lever: a persona can pin reviews to a cheaper - or deliberately
   *  different-vendor - profile (cross-model independence becomes real). */
  reviewerProfile?: string | null;
  skippedOptionalSteps?: string[];
  resolvedAt?: string;
};

export function resolveFlow(input: ResolveFlowInput): ResolvedFlowSnapshot {
  // Durable param memory (authoring check, crew-independent): two params that map
  // to the same `VIBESTRATE_PARAM_*` env var (e.g. `colorTokens` + `color_tokens`)
  // would leave one silently un-seedable from the environment. Fail loud here, not
  // at runtime.
  const envCollisions = findParamEnvCollisions(input.flow.params);
  if (envCollisions.length > 0) {
    const groups = envCollisions
      .map((names) => `${names.join(" / ")} -> ${paramEnvVarName(names[0]!)}`)
      .join("; ");
    throw new FlowResolutionError(
      `Flow "${input.flow.id}" has params that collide on one env var: ${groups}. Rename one so each maps to a distinct VIBESTRATE_PARAM_* name.`,
    );
  }

  const { crewId, crew } = getCrew(input.config, input.crewId);

  // Per-item review band: when the flow declares `checklistReview`, generate its
  // reviewer fan-out from the resolved lens set (crew > flow > default) so the
  // configured lenses actually decide which reviewers run per item. Everything
  // downstream (resolution map, parallel-group check, snapshot) sees the
  // expanded steps; non-review-band flows are untouched.
  const flowSteps: FlowStep[] = input.flow.checklistReview
    ? expandChecklistReviewBand(
        input.flow.steps,
        input.flow.checklistSegment,
        resolveChecklistReviewLenses({
          flowLenses: input.flow.checklistReview.lenses,
          crewLenses: crew.checklistReviewLenses,
        }),
      )
    : input.flow.steps;

  // Seats the Flow declares. A Seat is just a contract - no provider here; the
  // Role (resolved per step) supplies the Profile/Provider.
  const seats: ResolvedFlowSeat[] = Object.entries(input.flow.seats).map(
    ([id, seat]) => ({
      id,
      label: seat.label,
      description: seat.description ?? null,
    }),
  );
  const knownSeatIds = new Set(seats.map((s) => s.id));

  for (const seatId of Object.keys(input.seatRoleOverrides ?? {})) {
    if (!knownSeatIds.has(seatId)) {
      throw new FlowResolutionError(
        `Role override references unknown Flow seat "${seatId}".`,
      );
    }
  }

  const knownStepIds = new Set(flowSteps.map((step) => step.id));
  const skippedOptionalSteps = new Set(input.skippedOptionalSteps ?? []);
  for (const stepId of skippedOptionalSteps) {
    const step = flowSteps.find((candidate) => candidate.id === stepId);
    if (!step) {
      throw new FlowResolutionError(`Cannot skip unknown Flow step "${stepId}".`);
    }
    if (!step.optional) {
      throw new FlowResolutionError(`Cannot skip required Flow step "${stepId}".`);
    }
  }
  for (const stepId of Object.keys(input.stepProfileOverrides ?? {})) {
    if (!knownStepIds.has(stepId)) {
      throw new FlowResolutionError(
        `Profile override references unknown Flow step "${stepId}".`,
      );
    }
  }

  const steps = flowSteps.flatMap((step) => {
    // Seatless steps (validation / approval-gate) resolve no role/profile.
    let resolvedRoleId: string | null = null;
    let resolvedRoleLabel: string | null = null;
    let profileId: string | null = null;
    let providerId: string | null = null;

    if (step.seat) {
      const override = input.seatRoleOverrides?.[step.seat];
      const candidates = rolesFillingSeat(crew, step.seat);
      let chosen: { roleId: string; role: (typeof candidates)[number]["role"] };
      if (override) {
        const match = candidates.find((c) => c.roleId === override);
        if (!match) {
          throw new FlowResolutionError(
            `Role override "${override}" for seat "${step.seat}" is not a role in crew "${crewId}" that fills that seat.`,
          );
        }
        chosen = match;
      } else if (candidates.length === 0) {
        throw new FlowResolutionError(
          `This Flow needs the "${step.seat}" seat, but crew "${crewId}" has no role that fills it. Open Crew and add "${step.seat}" to a role's Seats.`,
        );
      } else if (candidates.length > 1) {
        throw new FlowResolutionError(
          `Crew "${crewId}" has more than one role filling the "${step.seat}" seat (${candidates
            .map((c) => c.roleId)
            .join(", ")}). Pick one with a role override.`,
        );
      } else {
        chosen = candidates[0]!;
      }

      resolvedRoleId = chosen.roleId;
      resolvedRoleLabel = roleLabel(chosen.roleId, chosen.role);
      // Precedence: explicit step override > explicit run-wide override >
      // persona reviewerProfile (review steps only) > the role's default.
      // Explicit user choices always beat persona configuration.
      // Arbiter-shaped steps are NOT pinned (adversarial review): the seat
      // that weighs the reviewers and renders the binding verdict must keep
      // the crew author's chosen profile - pinning the verdict to a cheap
      // reviewer model would partly undo the very upgrade that picked the
      // panel. Arbiter-shaped = the "arbiter" seat, or a join step reading
      // two or more upstream outputs.
      const isArbiterShaped =
        step.seat === "arbiter" || (step.needs?.length ?? 0) >= 2;
      const isReviewStep =
        (step.kind === "review-turn" || step.stage === "reviewing") &&
        !isArbiterShaped;
      profileId =
        input.stepProfileOverrides?.[step.id] ??
        input.profileOverride ??
        (isReviewStep ? input.reviewerProfile ?? null : null) ??
        chosen.role.profile;
      const profile = getProfile(input.config, profileId);
      providerId = profile.provider;
      // Defense in depth: config schema already validates provider exists.
      if (!input.config.providers[providerId]) {
        throw new FlowResolutionError(
          `Profile "${profileId}" (seat "${step.seat}") resolves to missing provider "${providerId}".`,
        );
      }
    }

    const repeatCount = step.repeat?.times ?? 1;
    return Array.from({ length: repeatCount }, (_, offset) => {
      const repeatIteration = offset + 1;
      return {
        id:
          repeatIteration === 1
            ? step.id
            : `${step.id}-repeat-${repeatIteration}`,
        label: step.label,
        kind: step.kind,
        enabled: !skippedOptionalSteps.has(step.id),
        optional: step.optional,
        skipWhenReadOnly: step.skipWhenReadOnly,
        cleanRoom: step.cleanRoom,
        skills: step.skills,
        skipWhen: step.skipWhen ?? null,
        continueOnError: step.continueOnError,
        retries: step.retries,
        stage: step.stage ?? null,
        seat: step.seat ?? null,
        resolvedRoleId,
        resolvedRoleLabel,
        profileId,
        providerId,
        inputs: step.inputs,
        outputs: step.outputs,
        needs: step.needs,
        instructions: step.instructions ?? null,
        approval: step.approval ?? null,
        sourceStepId: step.id,
        repeatIteration,
        repeatCount,
      };
    });
  });
  assertResolvedStepIds(steps);
  // Read-only guarantee (custom-workflow-dags.md): the schema can't know who
  // writes (flows are crew-agnostic), so the parallel-group read-only invariant
  // is enforced HERE, once seats are bound to roles -> permission profiles.
  assertParallelGroupsAreReadOnly({
    steps,
    crew,
    config: input.config,
    crewId,
    checklistSegment: input.flow.checklistSegment ?? null,
  });

  return resolvedFlowSnapshotSchema.parse({
    schemaVersion: 1,
    flowId: input.flow.id,
    flowVersion: input.flow.version,
    label: input.flow.label,
    description: input.flow.description,
    source: input.source,
    task: input.task,
    brief: input.brief ?? null,
    contextPolicy: input.contextPolicy ?? "balanced",
    resolvedAt: input.resolvedAt ?? nowIso(),
    crewId,
    seats,
    steps,
    // Loop-body steps can't carry a fixed repeat (schema-enforced), so their
    // resolved ids equal their source ids - the loop refs carry over as-is.
    // Bake the resolved review-pass budget onto the immutable snapshot's
    // `loop.maxIterations` - the value the runner actually bounds on - so it
    // fires AND a resume reproduces it (no live config re-read). Precedence:
    // explicit crew override > explicit global ceiling > the flow's own budget.
    loop: input.flow.loop
      ? {
          ...input.flow.loop,
          maxIterations: resolveLoopMaxIterations({
            flowMax: input.flow.loop.maxIterations,
            crewMax: crew.maxReviewLoops,
            globalCeiling: input.config.workflow.maxReviewLoops,
          }),
        }
      : null,
    // Same for the per-item band: its step ids are stable, so the from/to refs
    // carry over unchanged for the runner to map onto resolved step indices.
    checklistSegment: input.flow.checklistSegment ?? null,
    complexity: input.flow.complexity ?? null,
    // Declared flow params carry through for resolution + the dashboard
    // form. null when the flow declares none.
    params: input.flow.params ?? null,
  });
}

/**
 * Every member of a parallel group (>= 2 resolved steps sharing one `needs`
 * set) must be a seated, read-only model turn. A panel of writers is rejected
 * before the run starts - this upholds the one-writer-per-worktree invariant
 * that read-only fan-out depends on. No-op for linear (non-graph) flows.
 *
 * For a checklist + graph flow the DAG lives only in the per-item
 * band, so the grouping is scoped to the band - else the empty-`needs` prelude
 * and band root would share the "" signature and the prelude (often a writer)
 * would be wrongly flagged as a parallel writer, falsely rejecting the flow.
 */
function assertParallelGroupsAreReadOnly(input: {
  steps: ResolvedFlowStep[];
  crew: CrewConfig;
  config: ProjectConfig;
  crewId: string;
  checklistSegment: { from: string; to: string } | null;
}): void {
  if (!isGraphFlow({ steps: input.steps })) return;
  let groupSteps = input.steps;
  if (input.checklistSegment) {
    const from = input.steps.findIndex(
      (s) => s.sourceStepId === input.checklistSegment!.from,
    );
    const to = input.steps.findIndex(
      (s) => s.sourceStepId === input.checklistSegment!.to,
    );
    if (from >= 0 && to >= from) groupSteps = input.steps.slice(from, to + 1);
  }
  const groups = parallelGroupsOf(groupSteps).filter((g) => g.length >= 2);
  for (const group of groups) {
    for (const step of group) {
      if (!step.resolvedRoleId || !TURN_KINDS.has(step.kind)) {
        throw new FlowResolutionError(
          `Flow step "${step.id}" runs concurrently with its siblings but isn't a seated model turn (kind "${step.kind}"). Only read-only review/analysis turns may fan out in parallel; move validation/approval/write steps onto their own dependency.`,
        );
      }
      const role = getCrewRole(input.crew, step.resolvedRoleId);
      const permission = resolveProfile(
        input.config.permissions.profiles,
        role.permissions,
      );
      if (permission.allowWrite) {
        throw new FlowResolutionError(
          `Flow step "${step.id}" runs in a parallel group, but role "${step.resolvedRoleId}" (crew "${input.crewId}") can write (permission profile "${role.permissions}"). Parallel-group steps must be read-only - one writer per worktree.`,
        );
      }
    }
  }
}

function assertResolvedStepIds(steps: ResolvedFlowSnapshot["steps"]): void {
  const ids = new Set<string>();
  for (const step of steps) {
    if (ids.has(step.id)) {
      throw new FlowResolutionError(
        `Bounded repeat for Flow step "${step.sourceStepId}" creates duplicate resolved step id "${step.id}".`,
      );
    }
    ids.add(step.id);
  }
}
