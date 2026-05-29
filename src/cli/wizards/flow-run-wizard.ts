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
import { getCrew, rolesFillingSeat } from "../../crews/crew-registry.js";
import { formatArgv } from "../../scheduler/rerun-args.js";
import { color, header, indent, symbol } from "../ui/format.js";

export type FlowRunWizardInput = {
  task: string;
  flow: DiscoveredFlow;
  config: ProjectConfig;
  crewId?: string | null;
  brief?: string | null;
  contextPolicy?: FlowContextPolicy;
  /** Per-step Profile overrides (step id → profile id). */
  stepProfiles?: Record<string, string>;
  skippedOptionalSteps?: string[];
};

export type FlowRunWizardResult = {
  task: string;
  brief: string | null;
  contextPolicy: FlowContextPolicy;
  stepProfiles: Record<string, string>;
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

  const stepProfiles = await chooseStepProfiles(input);
  const skippedOptionalSteps = await chooseOptionalSteps(input);

  return {
    task,
    brief: brief.length > 0 ? brief : null,
    contextPolicy,
    stepProfiles,
    skippedOptionalSteps,
  };
}

/**
 * For each seated step, offer the Profiles the user can pick from. The default
 * is the Profile the step's Seat → Crew Role resolves to; choosing a different
 * Profile records a per-step override (same Role behavior, different runtime).
 */
async function chooseStepProfiles(
  input: FlowRunWizardInput,
): Promise<Record<string, string>> {
  const profileIds = Object.keys(input.config.profiles).sort();
  const stepProfiles: Record<string, string> = {};
  if (profileIds.length === 0) return stepProfiles;

  const { crew } = getCrew(input.config, input.crewId);

  console.log("");
  console.log(header("Step profiles"));
  for (const step of input.flow.definition.steps) {
    if (!step.seat) continue;
    const candidates = rolesFillingSeat(crew, step.seat);
    const roleProfile = candidates[0]?.role.profile;
    const defaultProfile =
      input.stepProfiles?.[step.id] ?? roleProfile ?? profileIds[0]!;
    const profileId = await select<string>({
      message: `${step.label} (seat ${step.seat}) profile:`,
      choices: profileIds.map((id) => ({ name: id, value: id })),
      default: defaultProfile,
    });
    // Only record it as an override when it differs from the role's default.
    if (profileId !== roleProfile) stepProfiles[step.id] = profileId;
  }

  return stepProfiles;
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
  for (const stepId of Object.keys(input.stepProfiles).sort()) {
    argv.push("--step-profile", `${stepId}=${input.stepProfiles[stepId]}`);
  }
  for (const stepId of [...input.skippedOptionalSteps].sort()) {
    argv.push("--flow-skip", stepId);
  }
  argv.push(input.task);
  return argv;
}

export function formatFlowRunCommand(input: FlowRunCommandInput): string {
  return formatArgv(["vibe", ...buildFlowRunArgs(input)]);
}
