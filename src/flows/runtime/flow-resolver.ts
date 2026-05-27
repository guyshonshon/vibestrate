import type { ProjectConfig } from "../../project/config-schema.js";
import { nowIso } from "../../utils/time.js";
import {
  resolvedFlowSnapshotSchema,
  type FlowContextPolicy,
  type FlowDefinition,
  type FlowSource,
  type ResolvedFlowSlot,
  type ResolvedFlowSnapshot,
} from "../schemas/flow-schema.js";

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
  slotProviders?: Record<string, string | undefined>;
  stepProviders?: Record<string, string | undefined>;
  skippedOptionalSteps?: string[];
  resolvedAt?: string;
};

export function resolveFlow(input: ResolveFlowInput): ResolvedFlowSnapshot {
  const slotEntries = Object.entries(input.flow.slots);
  const knownSlotIds = new Set(slotEntries.map(([id]) => id));
  for (const slotId of Object.keys(input.slotProviders ?? {})) {
    if (!knownSlotIds.has(slotId)) {
      throw new FlowResolutionError(
        `Provider override references unknown Flow slot "${slotId}".`,
      );
    }
  }

  const slots = slotEntries.map(([id, slot]) => {
    const defaultRole = input.config.roles[slot.defaultRole];
    if (!defaultRole) {
      throw new FlowResolutionError(
        `Flow slot "${id}" references missing default agent "${slot.defaultRole}".`,
      );
    }
    const providerId = input.slotProviders?.[id] ?? defaultRole.provider;
    assertProviderConfigured(input.config, providerId, `slot "${id}"`);
    return {
      id,
      label: slot.label,
      description: slot.description ?? null,
      defaultRole: slot.defaultRole,
      providerId,
    } satisfies ResolvedFlowSlot;
  });

  const resolvedSlots = new Map(slots.map((slot) => [slot.id, slot]));
  const knownStepIds = new Set(input.flow.steps.map((step) => step.id));
  const skippedOptionalSteps = new Set(input.skippedOptionalSteps ?? []);
  for (const stepId of skippedOptionalSteps) {
    const step = input.flow.steps.find((candidate) => candidate.id === stepId);
    if (!step) {
      throw new FlowResolutionError(
        `Cannot skip unknown Flow step "${stepId}".`,
      );
    }
    if (!step.optional) {
      throw new FlowResolutionError(
        `Cannot skip required Flow step "${stepId}".`,
      );
    }
  }
  for (const stepId of Object.keys(input.stepProviders ?? {})) {
    if (!knownStepIds.has(stepId)) {
      throw new FlowResolutionError(
        `Provider override references unknown Flow step "${stepId}".`,
      );
    }
  }

  const steps = input.flow.steps.flatMap((step) => {
    const slot = step.slot ? resolvedSlots.get(step.slot) : null;
    const roleId = step.roleId ?? slot?.defaultRole ?? null;
    if (roleId && !input.config.roles[roleId]) {
      throw new FlowResolutionError(
        `Flow step "${step.id}" references missing agent "${roleId}".`,
      );
    }

    const providerOverride = input.stepProviders?.[step.id];
    if (providerOverride) {
      if (!slot) {
        throw new FlowResolutionError(
          `Provider override for Flow step "${step.id}" requires a participant slot.`,
        );
      }
      assertProviderConfigured(
        input.config,
        providerOverride,
        `step "${step.id}"`,
      );
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
        slotId: slot?.id ?? null,
        roleId,
        providerId: providerOverride ?? slot?.providerId ?? null,
        inputs: step.inputs,
        outputs: step.outputs,
        approval: step.approval ?? null,
        sourceStepId: step.id,
        repeatIteration,
        repeatCount,
      };
    });
  });
  assertResolvedStepIds(steps);

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
    slots,
    steps,
    // Loop-body steps can't carry a fixed repeat (schema-enforced), so their
    // resolved ids equal their source ids — the loop refs carry over as-is.
    loop: input.flow.loop ?? null,
  });
}

function assertResolvedStepIds(
  steps: ResolvedFlowSnapshot["steps"],
): void {
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

function assertProviderConfigured(
  config: ProjectConfig,
  providerId: string,
  owner: string,
): void {
  if (!config.providers[providerId]) {
    throw new FlowResolutionError(
      `Flow ${owner} resolves to missing provider "${providerId}".`,
    );
  }
}
