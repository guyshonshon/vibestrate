import {
  checkbox,
  input as askInput,
  select,
} from "@inquirer/prompts";
import type { DiscoveredFlow } from "../../flows/catalog/flow-discovery.js";
import type {
  FlowContextPolicy,
  FlowStep,
} from "../../flows/schemas/flow-schema.js";
import type { ProjectConfig } from "../../project/config-schema.js";
import { formatArgv } from "../../scheduler/rerun-args.js";
import { color, header, indent, symbol } from "../ui/format.js";

export type FlowRunWizardInput = {
  task: string;
  flow: DiscoveredFlow;
  config: ProjectConfig;
  brief?: string | null;
  contextPolicy?: FlowContextPolicy;
  slotProviders?: Record<string, string>;
  skippedOptionalSteps?: string[];
};

export type FlowRunWizardResult = {
  task: string;
  brief: string | null;
  contextPolicy: FlowContextPolicy;
  slotProviders: Record<string, string>;
  skippedOptionalSteps: string[];
};

export type FlowRunCommandInput = FlowRunWizardResult & {
  flowId: string;
};

const CONTEXT_POLICY_CHOICES: {
  name: string;
  value: FlowContextPolicy;
}[] = [
  { name: "balanced", value: "balanced" },
  { name: "compact", value: "compact" },
  { name: "artifact-heavy", value: "artifact-heavy" },
];

export async function runFlowRunWizard(
  input: FlowRunWizardInput,
): Promise<FlowRunWizardResult> {
  console.log(header("Flow run setup"));
  console.log(
    `${symbol.bullet()} ${color.bold(input.flow.label)} ${color.dim(`(${input.flow.id}@${input.flow.version})`)}`,
  );
  console.log(indent(input.flow.description));
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
      message: "Flow brief (optional):",
      default: input.brief ?? "",
    })
  ).trim();
  const contextPolicy = await select<FlowContextPolicy>({
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
  input: FlowRunWizardInput,
): Promise<Record<string, string>> {
  const providerIds = Object.keys(input.config.providers).sort();
  const slotProviders: Record<string, string> = {};

  console.log("");
  console.log(header("Participants"));
  for (const [slotId, slot] of Object.entries(input.flow.definition.slots)) {
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
  input: FlowRunWizardInput,
): Promise<string[]> {
  const optionalSteps = input.flow.definition.steps.filter(
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

function formatOptionalStep(step: FlowStep): string {
  return `${step.id}: ${step.label}`;
}

export function buildFlowRunArgs(input: FlowRunCommandInput): string[] {
  const argv = ["run", "--flow", input.flowId];
  if (input.brief) argv.push("--flow-brief", input.brief);
  argv.push("--flow-context", input.contextPolicy);
  for (const slotId of Object.keys(input.slotProviders).sort()) {
    argv.push("--flow-slot", `${slotId}=${input.slotProviders[slotId]}`);
  }
  for (const stepId of [...input.skippedOptionalSteps].sort()) {
    argv.push("--flow-skip", stepId);
  }
  argv.push(input.task);
  return argv;
}

export function formatFlowRunCommand(input: FlowRunCommandInput): string {
  return formatArgv(["vibestrate", ...buildFlowRunArgs(input)]);
}
