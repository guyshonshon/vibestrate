import type { ProjectConfig } from "../../project/config-schema.js";
import type { CrewConfig } from "../../crews/crew-schema.js";
import { nowIso } from "../../utils/time.js";
import {
  getCrew,
  getCrewRole,
  getProfile,
  roleLabel,
  rolesFillingSeat,
} from "../../crews/crew-registry.js";
import { resolveProfile } from "../../permissions/permission-profiles.js";
import {
  isGraphFlow,
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
  skippedOptionalSteps?: string[];
  resolvedAt?: string;
};

export function resolveFlow(input: ResolveFlowInput): ResolvedFlowSnapshot {
  const { crewId, crew } = getCrew(input.config, input.crewId);

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

  const knownStepIds = new Set(input.flow.steps.map((step) => step.id));
  const skippedOptionalSteps = new Set(input.skippedOptionalSteps ?? []);
  for (const stepId of skippedOptionalSteps) {
    const step = input.flow.steps.find((candidate) => candidate.id === stepId);
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

  const steps = input.flow.steps.flatMap((step) => {
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
      profileId =
        input.stepProfileOverrides?.[step.id] ??
        input.profileOverride ??
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
    loop: input.flow.loop ?? null,
    // Same for the per-item band: its step ids are stable, so the from/to refs
    // carry over unchanged for the runner to map onto resolved step indices.
    checklistSegment: input.flow.checklistSegment ?? null,
    complexity: input.flow.complexity ?? null,
  });
}

/**
 * Every member of a parallel group (>= 2 resolved steps sharing one `needs`
 * set) must be a seated, read-only model turn. A panel of writers is rejected
 * before the run starts - this upholds the one-writer-per-worktree invariant
 * that read-only fan-out depends on. No-op for linear (non-graph) flows.
 *
 * For a checklist + graph flow (Phase D) the DAG lives only in the per-item
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
