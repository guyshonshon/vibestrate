import type { ProjectConfig } from "../../project/config-schema.js";
import { nowIso } from "../../utils/time.js";
import {
  resolvedGuideSnapshotSchema,
  type GuideContextPolicy,
  type GuideDefinition,
  type GuideSource,
  type ResolvedGuideSlot,
  type ResolvedGuideSnapshot,
} from "../schemas/guide-schema.js";

export class GuideResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuideResolutionError";
  }
}

export type ResolveGuideInput = {
  guide: GuideDefinition;
  source: GuideSource;
  config: ProjectConfig;
  task: string;
  brief?: string | null;
  contextPolicy?: GuideContextPolicy;
  slotProviders?: Record<string, string | undefined>;
  stepProviders?: Record<string, string | undefined>;
  skippedOptionalSteps?: string[];
  resolvedAt?: string;
};

export function resolveGuide(input: ResolveGuideInput): ResolvedGuideSnapshot {
  const slotEntries = Object.entries(input.guide.slots);
  const knownSlotIds = new Set(slotEntries.map(([id]) => id));
  for (const slotId of Object.keys(input.slotProviders ?? {})) {
    if (!knownSlotIds.has(slotId)) {
      throw new GuideResolutionError(
        `Provider override references unknown Guide slot "${slotId}".`,
      );
    }
  }

  const slots = slotEntries.map(([id, slot]) => {
    const defaultRole = input.config.roles[slot.defaultRole];
    if (!defaultRole) {
      throw new GuideResolutionError(
        `Guide slot "${id}" references missing default agent "${slot.defaultRole}".`,
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
    } satisfies ResolvedGuideSlot;
  });

  const resolvedSlots = new Map(slots.map((slot) => [slot.id, slot]));
  const knownStepIds = new Set(input.guide.steps.map((step) => step.id));
  const skippedOptionalSteps = new Set(input.skippedOptionalSteps ?? []);
  for (const stepId of skippedOptionalSteps) {
    const step = input.guide.steps.find((candidate) => candidate.id === stepId);
    if (!step) {
      throw new GuideResolutionError(
        `Cannot skip unknown Guide step "${stepId}".`,
      );
    }
    if (!step.optional) {
      throw new GuideResolutionError(
        `Cannot skip required Guide step "${stepId}".`,
      );
    }
  }
  for (const stepId of Object.keys(input.stepProviders ?? {})) {
    if (!knownStepIds.has(stepId)) {
      throw new GuideResolutionError(
        `Provider override references unknown Guide step "${stepId}".`,
      );
    }
  }

  const steps = input.guide.steps.flatMap((step) => {
    const slot = step.slot ? resolvedSlots.get(step.slot) : null;
    const roleId = step.roleId ?? slot?.defaultRole ?? null;
    if (roleId && !input.config.roles[roleId]) {
      throw new GuideResolutionError(
        `Guide step "${step.id}" references missing agent "${roleId}".`,
      );
    }

    const providerOverride = input.stepProviders?.[step.id];
    if (providerOverride) {
      if (!slot) {
        throw new GuideResolutionError(
          `Provider override for Guide step "${step.id}" requires a participant slot.`,
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

  return resolvedGuideSnapshotSchema.parse({
    schemaVersion: 1,
    guideId: input.guide.id,
    guideVersion: input.guide.version,
    label: input.guide.label,
    description: input.guide.description,
    source: input.source,
    task: input.task,
    brief: input.brief ?? null,
    contextPolicy: input.contextPolicy ?? "balanced",
    resolvedAt: input.resolvedAt ?? nowIso(),
    slots,
    steps,
  });
}

function assertResolvedStepIds(
  steps: ResolvedGuideSnapshot["steps"],
): void {
  const ids = new Set<string>();
  for (const step of steps) {
    if (ids.has(step.id)) {
      throw new GuideResolutionError(
        `Bounded repeat for Guide step "${step.sourceStepId}" creates duplicate resolved step id "${step.id}".`,
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
    throw new GuideResolutionError(
      `Guide ${owner} resolves to missing provider "${providerId}".`,
    );
  }
}
