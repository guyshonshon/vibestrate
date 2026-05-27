import {
  checkbox,
  input as askInput,
  select,
} from "@inquirer/prompts";
import type { DiscoveredGuide } from "../../guides/catalog/guide-discovery.js";
import type {
  GuideContextPolicy,
  GuideStep,
} from "../../guides/schemas/guide-schema.js";
import type { ProjectConfig } from "../../project/config-schema.js";
import { formatArgv } from "../../scheduler/rerun-args.js";
import { color, header, indent, symbol } from "../ui/format.js";

export type GuideRunWizardInput = {
  task: string;
  guide: DiscoveredGuide;
  config: ProjectConfig;
  brief?: string | null;
  contextPolicy?: GuideContextPolicy;
  slotProviders?: Record<string, string>;
  skippedOptionalSteps?: string[];
};

export type GuideRunWizardResult = {
  task: string;
  brief: string | null;
  contextPolicy: GuideContextPolicy;
  slotProviders: Record<string, string>;
  skippedOptionalSteps: string[];
};

export type GuideRunCommandInput = GuideRunWizardResult & {
  guideId: string;
};

const CONTEXT_POLICY_CHOICES: {
  name: string;
  value: GuideContextPolicy;
}[] = [
  { name: "balanced", value: "balanced" },
  { name: "compact", value: "compact" },
  { name: "artifact-heavy", value: "artifact-heavy" },
];

export async function runGuideRunWizard(
  input: GuideRunWizardInput,
): Promise<GuideRunWizardResult> {
  console.log(header("Guide run setup"));
  console.log(
    `${symbol.bullet()} ${color.bold(input.guide.label)} ${color.dim(`(${input.guide.id}@${input.guide.version})`)}`,
  );
  console.log(indent(input.guide.description));
  console.log("");

  const task = (
    await askInput({
      message: "Task:",
      default: input.task,
      validate: (value) =>
        value.trim().length > 0 ? true : "A task description is required.",
    })
  ).trim();
  const brief = (
    await askInput({
      message: "Guide brief (optional):",
      default: input.brief ?? "",
    })
  ).trim();
  const contextPolicy = await select<GuideContextPolicy>({
    message: "Context policy:",
    choices: CONTEXT_POLICY_CHOICES,
    default: input.contextPolicy ?? "balanced",
  });

  const slotProviders = await chooseSlotProviders(input);
  const skippedOptionalSteps = await chooseOptionalSteps(input);

  return {
    task,
    brief: brief.length > 0 ? brief : null,
    contextPolicy,
    slotProviders,
    skippedOptionalSteps,
  };
}

async function chooseSlotProviders(
  input: GuideRunWizardInput,
): Promise<Record<string, string>> {
  const providerIds = Object.keys(input.config.providers).sort();
  const slotProviders: Record<string, string> = {};

  console.log("");
  console.log(header("Participants"));
  for (const [slotId, slot] of Object.entries(input.guide.definition.slots)) {
    const defaultProvider =
      input.slotProviders?.[slotId] ??
      input.config.roles[slot.defaultRole]?.provider ??
      providerIds[0];
    const providerId = await select<string>({
      message: `${slot.label} (${slotId}) provider:`,
      choices: providerIds.map((id) => ({ name: id, value: id })),
      default: defaultProvider,
    });
    slotProviders[slotId] = providerId;
  }

  return slotProviders;
}

async function chooseOptionalSteps(
  input: GuideRunWizardInput,
): Promise<string[]> {
  const optionalSteps = input.guide.definition.steps.filter(
    (step) => step.optional,
  );
  if (optionalSteps.length === 0) {
    return [...(input.skippedOptionalSteps ?? [])];
  }

  const optionalStepIds = new Set(optionalSteps.map((step) => step.id));
  const alreadySkipped = new Set(input.skippedOptionalSteps ?? []);
  const enabled = await checkbox<string>({
    message: "Optional steps to include:",
    choices: optionalSteps.map((step) => ({
      name: formatOptionalStep(step),
      value: step.id,
      checked: !alreadySkipped.has(step.id),
    })),
  });
  const enabledIds = new Set(enabled);
  const preservedSkips = (input.skippedOptionalSteps ?? []).filter(
    (stepId) => !optionalStepIds.has(stepId),
  );

  return [
    ...preservedSkips,
    ...optionalSteps
      .filter((step) => !enabledIds.has(step.id))
      .map((step) => step.id),
  ];
}

function formatOptionalStep(step: GuideStep): string {
  return `${step.id}: ${step.label}`;
}

export function buildGuideRunArgs(input: GuideRunCommandInput): string[] {
  const argv = ["run", "--guide", input.guideId];
  if (input.brief) argv.push("--guide-brief", input.brief);
  argv.push("--guide-context", input.contextPolicy);
  for (const slotId of Object.keys(input.slotProviders).sort()) {
    argv.push("--guide-slot", `${slotId}=${input.slotProviders[slotId]}`);
  }
  for (const stepId of [...input.skippedOptionalSteps].sort()) {
    argv.push("--guide-skip", stepId);
  }
  argv.push(input.task);
  return argv;
}

export function formatGuideRunCommand(input: GuideRunCommandInput): string {
  return formatArgv(["amaco", ...buildGuideRunArgs(input)]);
}
